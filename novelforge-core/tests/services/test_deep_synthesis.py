import json
from types import SimpleNamespace

import pytest

from novelforge.services.attempt_store import AttemptStore
from novelforge.services.budgeted_scheduler import BudgetedScheduler, BudgetPolicy
from novelforge.services.deep_synthesis import DeepSynthesisService, DeepSynthesisValidationError
from novelforge.services.deep_synthesis_models import DeepSynthesisRequest


class MemoryStorage:
    def __init__(self):
        self.data = {}

    async def save(self, key, value, storage_type=None):
        self.data[key] = value
        return True

    async def load(self, key, storage_type=None):
        return self.data.get(key)

    async def list_keys(self, storage_type=None):
        return list(self.data.keys())


class FakeRouter:
    def __init__(self, *, fail=False):
        self.fail = fail
        self.calls = []

    async def select_model(self, role, *, probe=True, session_id=None, parent_id=None, token_bucket=None):
        self.calls.append({"role": role, "probe": probe, "session_id": session_id})
        if self.fail:
            raise RuntimeError("provider_error_body: secret upstream details")
        return SimpleNamespace(
            to_dict=lambda: {
                "role": role,
                "selected_model": "deep-model",
                "reason": "probe_skipped",
                "candidates": ["deep-model"],
            }
        )


def make_request(**overrides):
    payload = {
        "session_id": "session-deep",
        "scope_type": "character",
        "scope_ids": ["char-1"],
        "budget_tier": "medium",
        "quality_summary": {"quality_score": 0.7},
        "assets": [
            {
                "asset_type": "character",
                "asset_id": "char-1",
                "asset_version": "v1",
                "data": {
                    "name": "林墨",
                    "suggested_changes": [
                        {
                            "field_path": "personality.traits",
                            "current_value": ["沉默"],
                            "proposed_value": ["沉默", "警觉"],
                            "confidence": 0.8,
                            "reason": "结构化证据显示角色持续保持警觉。",
                            "evidence_refs": ["雨夜行动摘要"],
                            "risk_level": "low",
                        }
                    ],
                },
            }
        ],
    }
    payload.update(overrides)
    return DeepSynthesisRequest.model_validate(payload)


@pytest.mark.asyncio
async def test_create_preview_accepts_structured_assets():
    service = DeepSynthesisService(model_router=FakeRouter())

    result = await service.create_preview(make_request())

    assert result.status == "success"
    assert result.preview.proposed_changes[0].asset_id == "char-1"


@pytest.mark.asyncio
async def test_create_preview_rejects_chapter_content_at_top_level():
    service = DeepSynthesisService(model_router=FakeRouter())
    request = make_request(chapter_content="forbidden")

    with pytest.raises(DeepSynthesisValidationError):
        await service.create_preview(request)


@pytest.mark.asyncio
async def test_create_preview_rejects_nested_raw_response_text():
    service = DeepSynthesisService(model_router=FakeRouter())
    request = make_request(assets=[{
        "asset_type": "character",
        "asset_id": "char-1",
        "asset_version": "v1",
        "data": {"nested": {"raw_response_text": "forbidden"}},
    }])

    with pytest.raises(DeepSynthesisValidationError):
        await service.create_preview(request)


@pytest.mark.asyncio
async def test_create_preview_returns_preview_patch_structure():
    service = DeepSynthesisService(model_router=FakeRouter())

    result = await service.create_preview(make_request())

    assert result.preview.apply_plan.apply_mode == "preview_patch"
    assert result.preview.apply_plan.patch_strategy == "field_level"


@pytest.mark.asyncio
async def test_create_preview_requires_user_confirmation():
    service = DeepSynthesisService(model_router=FakeRouter())

    result = await service.create_preview(make_request())

    assert result.preview.requires_user_confirmation is True
    assert result.preview.apply_plan.requires_user_confirmation is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tier", "calls", "tokens", "rounds"),
    [("low", 5, 20000, 1), ("medium", 10, 50000, 2), ("high", 20, 100000, 3)],
)
async def test_budget_tier_mapping(tier, calls, tokens, rounds):
    service = DeepSynthesisService(model_router=FakeRouter())

    result = await service.create_preview(make_request(budget_tier=tier))

    assert result.budget_summary.max_model_calls == calls
    assert result.budget_summary.max_estimated_tokens == tokens
    assert result.budget_summary.max_rounds == rounds


@pytest.mark.asyncio
async def test_budget_summary_exists():
    service = DeepSynthesisService(model_router=FakeRouter())

    result = await service.create_preview(make_request(budget_tier="low"))
    assert result.budget_summary.budget_tier == "low"


@pytest.mark.asyncio
async def test_fake_model_router_called_with_extractor_deep_role():
    router = FakeRouter()
    service = DeepSynthesisService(model_router=router)

    await service.create_preview(make_request())

    assert router.calls == [{"role": "extractor_deep", "probe": False, "session_id": "session-deep"}]


@pytest.mark.asyncio
async def test_router_failure_returns_warning_without_provider_body():
    service = DeepSynthesisService(model_router=FakeRouter(fail=True))

    result = await service.create_preview(make_request())

    serialized = json.dumps(result.model_dump(mode="json"), ensure_ascii=False)
    assert any(warning.code == "model_router_failed" for warning in result.warnings)
    assert "provider_error_body" not in serialized


@pytest.mark.asyncio
async def test_attempt_store_records_deep_synthesis_attempt():
    storage = MemoryStorage()
    store = AttemptStore(storage)
    service = DeepSynthesisService(attempt_store=store, model_router=FakeRouter())

    result = await service.create_preview(make_request())
    record = await store.get(result.attempt_id)

    assert record is not None
    assert record.task_type == "deep_synthesis"
    assert record.model_role == "extractor_deep"
    assert record.proposed_change_count == 1


@pytest.mark.asyncio
async def test_attempt_does_not_contain_forbidden_fields():
    storage = MemoryStorage()
    store = AttemptStore(storage)
    service = DeepSynthesisService(attempt_store=store, model_router=FakeRouter())

    result = await service.create_preview(make_request())
    persisted = next(iter(storage.data.values()))
    serialized = json.dumps(persisted, ensure_ascii=False)

    assert "chapter_content" not in serialized
    assert "raw_response_text" not in serialized
    assert "raw_response_preview" not in serialized


@pytest.mark.asyncio
async def test_empty_assets_returns_stable_warning():
    service = DeepSynthesisService(model_router=FakeRouter())

    result = await service.create_preview(make_request(assets=[]))

    assert result.status == "no_actionable_assets"
    assert any(warning.code == "no_actionable_assets" for warning in result.warnings)


@pytest.mark.asyncio
async def test_proposed_changes_are_field_level_asset_patches():
    service = DeepSynthesisService(model_router=FakeRouter())

    result = await service.create_preview(make_request())
    change = result.preview.proposed_changes[0]

    assert change.asset_id == "char-1"
    assert change.asset_version == "v1"
    assert change.field_path == "personality.traits"
    assert change.field_path != "data"


@pytest.mark.asyncio
async def test_schema_serializes_to_json_dump():
    service = DeepSynthesisService(model_router=FakeRouter())
    result = await service.create_preview(make_request())

    dumped = json.dumps(result.model_dump(mode="json"), ensure_ascii=False)

    assert "preview" in dumped


@pytest.mark.asyncio
async def test_budget_exhausted_returns_warning_and_skips_router():
    router = FakeRouter()
    service = DeepSynthesisService(
        model_router=router,
        budgeted_scheduler_factory=lambda policy: BudgetedScheduler(BudgetPolicy(max_model_calls=0, max_estimated_tokens=0)),
    )

    result = await service.create_preview(make_request())

    assert result.status == "failed"
    assert result.budget_summary.exhausted is True
    assert any(warning.code == "budget_exhausted" for warning in result.warnings)
    assert router.calls == []
