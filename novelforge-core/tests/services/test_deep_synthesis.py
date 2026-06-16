import json
import copy
from types import SimpleNamespace

import pytest

from novelforge.services.attempt_store import AttemptStore
from novelforge.services.budgeted_scheduler import BudgetedScheduler, BudgetPolicy
from novelforge.services.deep_synthesis import (
    DeepSynthesisService,
    DeepSynthesisValidationError,
    apply_field_patch,
    get_field_value,
    parse_field_path,
)
from novelforge.services.deep_synthesis_models import DeepSynthesisApplyRequest, DeepSynthesisRequest
from novelforge.content.models import ContentItem, ContentMetadata, ContentStatus, ContentType


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


def make_content_item(*, content_id="char-1", version=1, extracted_data=None):
    return ContentItem(
        metadata=ContentMetadata(
            id=content_id,
            title="林墨",
            type=ContentType.CHARACTER,
            status=ContentStatus.DRAFT,
            version=version,
        ),
        content="",
        extracted_data=copy.deepcopy(extracted_data or {"profile": {"summary": "旧摘要", "traits": ["沉默"]}}),
    )


class FakeContentManager:
    def __init__(self, items=None):
        self.items = {item.metadata.id: item for item in (items or [])}
        self.write_calls = []

    async def get_content(self, content_id):
        return self.items.get(content_id)

    async def update_content(self, content_id, content_item):
        existing = self.items.get(content_id)
        if existing is None:
            return False
        content_item.metadata.version = existing.metadata.version + 1
        self.items[content_id] = content_item
        self.write_calls.append((content_id, content_item))
        return True


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


def make_apply_request(**overrides):
    preview = DeepSynthesisService(model_router=FakeRouter()).sanitize_preview(
        DeepSynthesisService(model_router=FakeRouter())._build_preview_from_structured_assets(make_request())
    ).model_dump(mode="json")
    preview["proposed_changes"][0]["field_path"] = "profile.summary"
    preview["proposed_changes"][0]["current_value"] = "旧摘要"
    preview["proposed_changes"][0]["proposed_value"] = "新摘要"
    payload = {
        "session_id": "session-deep",
        "preview": preview,
        "accepted_change_ids": ["char-1:1"],
        "rejected_change_ids": [],
        "expected_asset_versions": {"char-1": "v1"},
        "dry_run": False,
    }
    payload.update(overrides)
    return DeepSynthesisApplyRequest.model_validate(payload)


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


def test_parse_field_path_blocks_forbidden_segments():
    with pytest.raises(Exception):
        parse_field_path("profile.__proto__")


def test_apply_field_patch_returns_new_dict():
    data = {"profile": {"summary": "旧摘要"}}

    patched = apply_field_patch(data, "profile.summary", "新摘要")

    assert patched["profile"]["summary"] == "新摘要"
    assert data["profile"]["summary"] == "旧摘要"


def test_get_field_value_reads_nested_value():
    assert get_field_value({"profile": {"traits": ["沉默"]}}, "profile.traits") == ["沉默"]


@pytest.mark.asyncio
async def test_apply_preview_applies_accepted_change():
    manager = FakeContentManager([make_content_item()])
    service = DeepSynthesisService(content_manager=manager)

    result = await service.apply_preview(make_apply_request())

    assert result.status == "success"
    assert result.summary.applied_count == 1
    assert manager.write_calls
    assert manager.items["char-1"].extracted_data["profile"]["summary"] == "新摘要"


@pytest.mark.asyncio
async def test_apply_preview_skips_rejected_and_undecided_changes():
    manager = FakeContentManager([make_content_item()])
    service = DeepSynthesisService(content_manager=manager)
    request = make_apply_request(
        accepted_change_ids=[],
        rejected_change_ids=["char-1:1"],
    )

    result = await service.apply_preview(request)

    assert result.summary.skipped_count == 1
    assert result.skipped_changes[0].reason == "rejected_by_user"
    assert manager.write_calls == []


@pytest.mark.asyncio
async def test_apply_preview_skips_duplicate_change_id():
    manager = FakeContentManager([make_content_item()])
    service = DeepSynthesisService(content_manager=manager)
    request = make_apply_request()
    request.preview.proposed_changes.append(request.preview.proposed_changes[0].model_copy(deep=True))

    result = await service.apply_preview(request)

    assert any(item.reason == "duplicate_change_id" for item in result.skipped_changes)


@pytest.mark.asyncio
async def test_apply_preview_rejects_forbidden_field_path():
    manager = FakeContentManager([make_content_item()])
    service = DeepSynthesisService(content_manager=manager)
    request = make_apply_request()
    request.preview.proposed_changes[0].field_path = "profile.raw_response_text"

    result = await service.apply_preview(request)

    assert result.conflicts[0].reason == "forbidden_field_path"
    assert manager.write_calls == []


@pytest.mark.asyncio
async def test_apply_preview_invalid_field_path_is_conflict():
    manager = FakeContentManager([make_content_item()])
    service = DeepSynthesisService(content_manager=manager)
    request = make_apply_request()
    request.preview.proposed_changes[0].field_path = "profile..summary"

    result = await service.apply_preview(request)

    assert result.conflicts[0].reason == "invalid_field_path"
    assert manager.write_calls == []


@pytest.mark.asyncio
async def test_apply_preview_version_mismatch_returns_conflict_and_does_not_write():
    manager = FakeContentManager([make_content_item(version=2)])
    service = DeepSynthesisService(content_manager=manager)

    result = await service.apply_preview(make_apply_request(expected_asset_versions={"char-1": "v1"}))

    assert result.conflicts[0].reason == "version_mismatch"
    assert manager.write_calls == []


@pytest.mark.asyncio
async def test_apply_preview_current_value_mismatch_returns_conflict_and_does_not_write():
    manager = FakeContentManager([make_content_item()])
    service = DeepSynthesisService(content_manager=manager)
    request = make_apply_request()
    request.preview.proposed_changes[0].current_value = "不同值"

    result = await service.apply_preview(request)

    assert result.conflicts[0].reason == "current_value_mismatch"
    assert manager.write_calls == []


@pytest.mark.asyncio
async def test_apply_preview_current_value_none_only_writes_missing_field():
    manager = FakeContentManager([make_content_item(extracted_data={"profile": {}})])
    service = DeepSynthesisService(content_manager=manager)
    request = make_apply_request()
    request.preview.proposed_changes[0].current_value = None

    result = await service.apply_preview(request)

    assert result.status == "success"
    assert manager.items["char-1"].extracted_data["profile"]["summary"] == "新摘要"


@pytest.mark.asyncio
async def test_apply_preview_dry_run_does_not_write():
    manager = FakeContentManager([make_content_item()])
    service = DeepSynthesisService(content_manager=manager)

    result = await service.apply_preview(make_apply_request(dry_run=True))

    assert result.status == "dry_run"
    assert result.summary.dry_run is True
    assert result.skipped_changes[0].reason == "dry_run"
    assert manager.write_calls == []


@pytest.mark.asyncio
async def test_apply_preview_nested_field_path_patch_works():
    manager = FakeContentManager([make_content_item(extracted_data={"profile": {"traits": ["沉默"]}})])
    service = DeepSynthesisService(content_manager=manager)
    request = make_apply_request()
    request.preview.proposed_changes[0].field_path = "profile.traits"
    request.preview.proposed_changes[0].current_value = ["沉默"]
    request.preview.proposed_changes[0].proposed_value = ["沉默", "警觉"]

    result = await service.apply_preview(request)

    assert result.applied_changes[0].field_path == "profile.traits"
    assert manager.items["char-1"].extracted_data["profile"]["traits"] == ["沉默", "警觉"]


@pytest.mark.asyncio
async def test_apply_preview_multiple_accepted_changes_updates_only_accepted_fields():
    manager = FakeContentManager([make_content_item(extracted_data={"profile": {"summary": "旧摘要", "traits": ["沉默"]}, "status": "初始"})])
    service = DeepSynthesisService(content_manager=manager)
    request = make_apply_request()
    request.preview.proposed_changes[0].proposed_value = "新摘要"
    request.preview.proposed_changes.append(request.preview.proposed_changes[0].model_copy(deep=True))
    request.preview.proposed_changes[1].change_id = "char-1:2"
    request.preview.proposed_changes[1].field_path = "status"
    request.preview.proposed_changes[1].current_value = "初始"
    request.preview.proposed_changes[1].proposed_value = "更新"
    request.accepted_change_ids = ["char-1:1", "char-1:2"]

    result = await service.apply_preview(request)

    assert result.summary.applied_count == 2
    assert manager.items["char-1"].extracted_data["profile"]["summary"] == "新摘要"
    assert manager.items["char-1"].extracted_data["status"] == "更新"


@pytest.mark.asyncio
async def test_apply_preview_conflict_plus_applied_gives_partial_status():
    manager = FakeContentManager([make_content_item()])
    service = DeepSynthesisService(content_manager=manager)
    request = make_apply_request()
    request.preview.proposed_changes.append(request.preview.proposed_changes[0].model_copy(deep=True))
    request.preview.proposed_changes[1].change_id = "char-1:2"
    request.preview.proposed_changes[1].current_value = "不匹配"
    request.accepted_change_ids = ["char-1:1", "char-1:2"]

    result = await service.apply_preview(request)

    assert result.status == "partial"


@pytest.mark.asyncio
async def test_apply_preview_no_accepted_changes_returns_success_no_op():
    manager = FakeContentManager([make_content_item()])
    service = DeepSynthesisService(content_manager=manager)

    result = await service.apply_preview(make_apply_request(accepted_change_ids=[]))

    assert result.status == "success"
    assert result.summary.applied_count == 0
    assert manager.write_calls == []


@pytest.mark.asyncio
async def test_apply_preview_result_serialization_contains_no_forbidden_fields():
    manager = FakeContentManager([make_content_item()])
    service = DeepSynthesisService(content_manager=manager)

    result = await service.apply_preview(make_apply_request())
    serialized = json.dumps(result.model_dump(mode="json"), ensure_ascii=False)

    assert "chapter_content" not in serialized
    assert "raw_response_text" not in serialized
    assert "raw_response_preview" not in serialized


@pytest.mark.asyncio
async def test_apply_attempt_metadata_does_not_store_raw_text():
    storage = MemoryStorage()
    store = AttemptStore(storage)
    manager = FakeContentManager([make_content_item()])
    service = DeepSynthesisService(attempt_store=store, content_manager=manager)

    result = await service.apply_preview(make_apply_request())
    persisted = next(iter(storage.data.values()))
    serialized = json.dumps(persisted, ensure_ascii=False)

    assert result.attempt_id
    assert persisted["task_type"] == "deep_synthesis_apply"
    assert "raw_response_text" not in serialized
    assert "raw_response_preview" not in serialized
    assert "chapter_content" not in serialized


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
