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


def make_request_with_conflicts(**overrides):
    payload = make_request(**overrides).model_dump(mode="json")
    payload["conflicts"] = [
        {
            "conflict_id": "conflict-1",
            "asset_type": "character",
            "asset_ids": ["char-1", "char-2"],
            "conflict_type": "inconsistent_description",
            "description": "描述冲突",
            "resolution": "合并",
            "confidence": 0.8,
        }
    ]
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


def test_compute_quality_trace_uses_quality_summary_score():
    service = DeepSynthesisService(model_router=FakeRouter())
    trace = service.compute_quality_trace(make_request(), service.sanitize_preview(service._build_preview_from_structured_assets(make_request())))

    assert trace.quality_before == 0.7


def test_quality_delta_increases_with_high_confidence_changes():
    service = DeepSynthesisService(model_router=FakeRouter())
    request = make_request()
    preview = service.sanitize_preview(service._build_preview_from_structured_assets(request))

    trace = service.compute_quality_trace(request, preview)

    assert trace.quality_delta > 0


def test_high_confidence_change_count_counts_confidence_threshold():
    service = DeepSynthesisService(model_router=FakeRouter())
    request = make_request()
    preview = service.sanitize_preview(service._build_preview_from_structured_assets(request))

    trace = service.compute_quality_trace(request, preview)

    assert trace.high_confidence_change_count == 1


def test_unresolved_conflict_count_is_non_negative():
    service = DeepSynthesisService(model_router=FakeRouter())
    request = make_request_with_conflicts()
    preview = service.sanitize_preview(service._build_preview_from_structured_assets(request))

    trace = service.compute_quality_trace(request, preview)

    assert trace.unresolved_conflict_count >= 0


def test_should_stop_when_max_rounds_reached():
    service = DeepSynthesisService(model_router=FakeRouter())
    request = make_request()
    policy = service.estimate_budget(request)
    budget_summary = service._budget_summary(request.budget_tier, policy, BudgetedScheduler(policy))

    should_stop, reason = service.should_stop_synthesis(
        round_index=1,
        max_rounds=1,
        quality_delta=0.1,
        proposed_change_count=1,
        high_confidence_change_count=1,
        unresolved_conflict_count=0,
        previous_unresolved_conflict_count=1,
        user_acceptance_rate=None,
        budget_summary=budget_summary,
    )

    assert should_stop is True
    assert reason == "round_limit"


def test_should_stop_when_quality_delta_below_threshold():
    service = DeepSynthesisService(model_router=FakeRouter())
    request = make_request()
    policy = service.estimate_budget(request)
    budget_summary = service._budget_summary(request.budget_tier, policy, BudgetedScheduler(policy))

    should_stop, reason = service.should_stop_synthesis(
        round_index=0,
        max_rounds=2,
        quality_delta=0.01,
        proposed_change_count=1,
        high_confidence_change_count=1,
        unresolved_conflict_count=0,
        previous_unresolved_conflict_count=None,
        user_acceptance_rate=None,
        budget_summary=budget_summary,
    )

    assert should_stop is True
    assert reason == "quality_plateau"


def test_should_stop_when_no_proposed_changes():
    service = DeepSynthesisService(model_router=FakeRouter())
    request = make_request()
    policy = service.estimate_budget(request)
    budget_summary = service._budget_summary(request.budget_tier, policy, BudgetedScheduler(policy))

    should_stop, reason = service.should_stop_synthesis(
        round_index=0,
        max_rounds=2,
        quality_delta=0.2,
        proposed_change_count=0,
        high_confidence_change_count=0,
        unresolved_conflict_count=0,
        previous_unresolved_conflict_count=None,
        user_acceptance_rate=None,
        budget_summary=budget_summary,
    )

    assert should_stop is True
    assert reason == "no_actionable_changes"


def test_should_stop_when_no_high_confidence_changes():
    service = DeepSynthesisService(model_router=FakeRouter())
    request = make_request()
    policy = service.estimate_budget(request)
    budget_summary = service._budget_summary(request.budget_tier, policy, BudgetedScheduler(policy))

    should_stop, reason = service.should_stop_synthesis(
        round_index=0,
        max_rounds=2,
        quality_delta=0.2,
        proposed_change_count=1,
        high_confidence_change_count=0,
        unresolved_conflict_count=0,
        previous_unresolved_conflict_count=None,
        user_acceptance_rate=None,
        budget_summary=budget_summary,
    )

    assert should_stop is True
    assert reason == "no_high_confidence_changes"


def test_should_stop_when_unresolved_conflicts_do_not_decrease():
    service = DeepSynthesisService(model_router=FakeRouter())
    request = make_request_with_conflicts()
    policy = service.estimate_budget(request)
    budget_summary = service._budget_summary(request.budget_tier, policy, BudgetedScheduler(policy))

    should_stop, reason = service.should_stop_synthesis(
        round_index=1,
        max_rounds=3,
        quality_delta=0.2,
        proposed_change_count=1,
        high_confidence_change_count=1,
        unresolved_conflict_count=1,
        previous_unresolved_conflict_count=1,
        user_acceptance_rate=None,
        budget_summary=budget_summary,
    )

    assert should_stop is True
    assert reason == "unresolved_conflicts_not_decreasing"


def test_should_stop_when_user_acceptance_rate_low():
    service = DeepSynthesisService(model_router=FakeRouter())
    request = make_request()
    policy = service.estimate_budget(request)
    budget_summary = service._budget_summary(request.budget_tier, policy, BudgetedScheduler(policy))

    should_stop, reason = service.should_stop_synthesis(
        round_index=1,
        max_rounds=3,
        quality_delta=0.2,
        proposed_change_count=1,
        high_confidence_change_count=1,
        unresolved_conflict_count=0,
        previous_unresolved_conflict_count=1,
        user_acceptance_rate=0.1,
        budget_summary=budget_summary,
    )

    assert should_stop is True
    assert reason == "low_user_acceptance"


def test_budget_tier_controls_max_rounds():
    service = DeepSynthesisService(model_router=FakeRouter())

    assert service._max_rounds_for_tier("low") == 1
    assert service._max_rounds_for_tier("medium") == 2
    assert service._max_rounds_for_tier("high") == 3


@pytest.mark.asyncio
async def test_round_summaries_exist_in_result():
    service = DeepSynthesisService(model_router=FakeRouter())

    result = await service.create_preview(make_request())

    assert result.round_summaries


@pytest.mark.asyncio
async def test_convergence_summary_exists_in_result():
    service = DeepSynthesisService(model_router=FakeRouter())

    result = await service.create_preview(make_request())

    assert result.convergence_summary is not None


def test_user_acceptance_rate_computed_from_ids():
    rate = DeepSynthesisService.compute_user_acceptance_rate(["a", "b"], ["c", "d", "e", "f"])

    assert rate == 0.3333333333333333


@pytest.mark.asyncio
async def test_empty_assets_convergence_reason_no_actionable_changes():
    service = DeepSynthesisService(model_router=FakeRouter())

    result = await service.create_preview(make_request(assets=[]))

    assert result.convergence_summary.reason == "no_actionable_changes"


@pytest.mark.asyncio
async def test_budget_exhausted_convergence_reason_budget_exhausted():
    router = FakeRouter()
    service = DeepSynthesisService(
        model_router=router,
        budgeted_scheduler_factory=lambda policy: BudgetedScheduler(BudgetPolicy(max_model_calls=0, max_estimated_tokens=0)),
    )

    result = await service.create_preview(make_request())

    assert result.convergence_summary.reason == "budget_exhausted"


@pytest.mark.asyncio
async def test_attempt_store_records_convergence_reason_and_quality_metrics():
    storage = MemoryStorage()
    store = AttemptStore(storage)
    service = DeepSynthesisService(attempt_store=store, model_router=FakeRouter())

    result = await service.create_preview(make_request())
    record = await store.get(result.attempt_id)

    assert record is not None
    assert record.convergence_reason == result.convergence_summary.reason
    assert record.high_confidence_change_count == result.quality_trace.high_confidence_change_count
    assert record.unresolved_conflict_count == result.quality_trace.unresolved_conflict_count


@pytest.mark.asyncio
async def test_result_serialization_does_not_contain_forbidden_fields():
    service = DeepSynthesisService(model_router=FakeRouter())

    result = await service.create_preview(make_request())
    serialized = json.dumps(result.model_dump(mode="json"), ensure_ascii=False)

    assert "chapter_content" not in serialized
    assert "raw_response_text" not in serialized
    assert "raw_response_preview" not in serialized
