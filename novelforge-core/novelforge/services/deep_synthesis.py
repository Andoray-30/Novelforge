from __future__ import annotations

import hashlib
import copy
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from .attempt_store import AttemptRecord
from .budgeted_scheduler import BudgetedScheduler, BudgetedWorkItem, BudgetPolicy
from .deep_synthesis_models import (
    ApplyPlan,
    DeepSynthesisAppliedChange,
    DeepSynthesisApplyConflict,
    DeepSynthesisApplyRequest,
    DeepSynthesisApplyResult,
    DeepSynthesisApplySkipReason,
    DeepSynthesisApplySummary,
    DeepSynthesisBudgetSummary,
    DeepSynthesisBudgetTier,
    DeepSynthesisConvergenceSummary,
    DeepSynthesisPreview,
    DeepSynthesisQualityTrace,
    DeepSynthesisRequest,
    DeepSynthesisRequestAsset,
    DeepSynthesisResult,
    DeepSynthesisRoundSummary,
    DeepSynthesisUserFeedback,
    DeepSynthesisWarning,
    EvidenceRef,
    ProposedChange,
    RiskLevel,
)


FORBIDDEN_INPUT_FIELDS = {
    "chapter_content",
    "raw_response_text",
    "raw_response_preview",
    "provider_error_body",
    "full_text",
    "original_text",
}

SYNTHESIS_MODEL_ROLE = "extractor_deep"
QUALITY_DELTA_THRESHOLD = 0.05
ROUND_PHASES = ("first_pass", "repair", "retry")
ROUND_PASS_TYPES = ("generation", "validation", "conflict_resolution")


class DeepSynthesisValidationError(ValueError):
    pass


class DeepSynthesisConflictError(ValueError):
    pass


class FieldPatchError(ValueError):
    def __init__(self, reason: DeepSynthesisApplySkipReason, message: str):
        super().__init__(message)
        self.reason = reason


MISSING = object()


FORBIDDEN_FIELD_PATH_SEGMENTS = FORBIDDEN_INPUT_FIELDS | {"__proto__", "constructor", "prototype"}


def parse_field_path(field_path: str) -> List[str]:
    if not isinstance(field_path, str) or not field_path.strip():
        raise FieldPatchError(DeepSynthesisApplySkipReason.invalid_field_path, "字段路径不能为空。")
    segments = field_path.strip().split(".")
    if any(not segment.strip() for segment in segments):
        raise FieldPatchError(DeepSynthesisApplySkipReason.invalid_field_path, "字段路径包含空 segment。")
    normalized = [segment.strip() for segment in segments]
    for segment in normalized:
        if segment in FORBIDDEN_FIELD_PATH_SEGMENTS:
            raise FieldPatchError(DeepSynthesisApplySkipReason.forbidden_field_path, f"字段路径包含禁止字段: {segment}")
    return normalized


def get_field_value(asset_data: Dict[str, Any], field_path: str) -> Any:
    current: Any = asset_data
    for segment in parse_field_path(field_path):
        if not isinstance(current, dict):
            raise FieldPatchError(DeepSynthesisApplySkipReason.invalid_field_path, "字段路径中间节点不是对象。")
        if segment not in current:
            return MISSING
        current = current[segment]
    return current


def apply_field_patch(asset_data: Dict[str, Any], field_path: str, proposed_value: Any) -> Dict[str, Any]:
    patched = copy.deepcopy(asset_data)
    current: Any = patched
    segments = parse_field_path(field_path)
    for segment in segments[:-1]:
        if segment not in current:
            current[segment] = {}
        if not isinstance(current[segment], dict):
            raise FieldPatchError(DeepSynthesisApplySkipReason.invalid_field_path, "字段路径中间节点不是对象。")
        current = current[segment]
    current[segments[-1]] = copy.deepcopy(proposed_value)
    return patched


class DeepSynthesisService:
    def __init__(
        self,
        *,
        attempt_store: Optional[Any] = None,
        budgeted_scheduler_factory: Optional[Callable[[BudgetPolicy], BudgetedScheduler]] = None,
        model_router: Optional[Any] = None,
        schema_repairer: Optional[Any] = None,
        content_manager: Optional[Any] = None,
        clock: Optional[Callable[[], float]] = None,
    ):
        self.attempt_store = attempt_store
        self.budgeted_scheduler_factory = budgeted_scheduler_factory or (lambda policy: BudgetedScheduler(policy=policy))
        self.model_router = model_router
        self.schema_repairer = schema_repairer
        self.content_manager = content_manager
        self.clock = clock or time.perf_counter

    async def apply_preview(self, request: DeepSynthesisApplyRequest) -> DeepSynthesisApplyResult:
        started = self.clock()
        self._validate_apply_request(request)
        accepted = set(request.accepted_change_ids)
        rejected = set(request.rejected_change_ids)
        applied: List[DeepSynthesisAppliedChange] = []
        skipped = []
        conflicts: List[DeepSynthesisApplyConflict] = []
        seen_change_ids: set[str] = set()
        processed_content: Dict[str, Any] = {}
        base_versions: Dict[str, str] = {}

        for change in request.preview.proposed_changes:
            if change.change_id in seen_change_ids:
                skipped.append(self._skipped(change, DeepSynthesisApplySkipReason.duplicate_change_id, "重复 change_id 已跳过。"))
                continue
            seen_change_ids.add(change.change_id)
            if change.change_id in rejected:
                skipped.append(self._skipped(change, DeepSynthesisApplySkipReason.rejected_by_user, "用户已拒绝该变更。"))
                continue
            if change.change_id not in accepted:
                skipped.append(self._skipped(change, DeepSynthesisApplySkipReason.undecided, "用户未确认该变更。"))
                continue
            if self.content_manager is None:
                conflicts.append(self._conflict(change, DeepSynthesisApplySkipReason.missing_asset, None, None, "ContentManager 未配置。"))
                continue
            try:
                parse_field_path(change.field_path)
            except FieldPatchError as exc:
                conflicts.append(self._conflict(change, exc.reason, None, None, str(exc)))
                continue

            content_item = processed_content.get(change.asset_id)
            if content_item is None:
                content_item = await self.content_manager.get_content(change.asset_id)
                if content_item is None:
                    conflicts.append(self._conflict(change, DeepSynthesisApplySkipReason.missing_asset, change.asset_id, None, "资产不存在。"))
                    continue
                processed_content[change.asset_id] = content_item

            current_version = base_versions.setdefault(change.asset_id, self._asset_version(content_item))
            expected_version = request.expected_asset_versions.get(change.asset_id)
            if expected_version is not None and not self._version_matches(expected_version, current_version):
                conflicts.append(self._conflict(change, DeepSynthesisApplySkipReason.version_mismatch, expected_version, current_version, "expected_asset_versions 与当前资产版本不一致。"))
                continue
            if not self._version_matches(change.asset_version, current_version):
                conflicts.append(self._conflict(change, DeepSynthesisApplySkipReason.version_mismatch, change.asset_version, current_version, "ProposedChange asset_version 与当前资产版本不一致。"))
                continue

            asset_data = copy.deepcopy(content_item.extracted_data or {})
            try:
                current_value = get_field_value(asset_data, change.field_path)
            except FieldPatchError as exc:
                conflicts.append(self._conflict(change, exc.reason, change.current_value, None, str(exc)))
                continue
            if change.current_value is None:
                if current_value is not MISSING and current_value is not None:
                    conflicts.append(self._conflict(change, DeepSynthesisApplySkipReason.current_value_mismatch, None, current_value, "当前字段已有非空值。"))
                    continue
                previous_value = None
            elif current_value is MISSING or current_value != change.current_value:
                conflicts.append(self._conflict(change, DeepSynthesisApplySkipReason.current_value_mismatch, change.current_value, None if current_value is MISSING else current_value, "当前字段值与 preview 不一致。"))
                continue
            else:
                previous_value = current_value

            if request.dry_run:
                skipped.append(self._skipped(change, DeepSynthesisApplySkipReason.dry_run, "dry_run=True，未写入资产。"))
                applied.append(DeepSynthesisAppliedChange(
                    change_id=change.change_id,
                    asset_type=change.asset_type,
                    asset_id=change.asset_id,
                    asset_version_before=current_version,
                    asset_version_after=current_version,
                    field_path=change.field_path,
                    previous_value=previous_value,
                    applied_value=change.proposed_value,
                ))
                continue

            try:
                patched_data = apply_field_patch(asset_data, change.field_path, change.proposed_value)
            except FieldPatchError as exc:
                conflicts.append(self._conflict(change, exc.reason, change.current_value, current_value, str(exc)))
                continue
            patched_item = content_item.model_copy(deep=True)
            patched_item.extracted_data = patched_data
            updated = await self.content_manager.update_content(change.asset_id, patched_item)
            if not updated:
                conflicts.append(self._conflict(change, DeepSynthesisApplySkipReason.missing_asset, change.asset_id, None, "资产写入失败或不存在。"))
                continue
            refreshed = await self.content_manager.get_content(change.asset_id)
            if refreshed is not None:
                processed_content[change.asset_id] = refreshed
                asset_version_after = self._asset_version(refreshed)
            else:
                asset_version_after = self._next_asset_version(current_version)
            applied.append(DeepSynthesisAppliedChange(
                change_id=change.change_id,
                asset_type=change.asset_type,
                asset_id=change.asset_id,
                asset_version_before=current_version,
                asset_version_after=asset_version_after,
                field_path=change.field_path,
                previous_value=previous_value,
                applied_value=change.proposed_value,
            ))

        summary = DeepSynthesisApplySummary(
            accepted_count=len(accepted),
            rejected_count=len(rejected),
            undecided_count=sum(1 for change in request.preview.proposed_changes if change.change_id not in accepted and change.change_id not in rejected),
            applied_count=len(applied),
            skipped_count=len(skipped),
            conflict_count=len(conflicts),
            failed_count=0,
            dry_run=request.dry_run,
            all_or_nothing=False,
        )
        status = self._apply_status(summary)
        result = DeepSynthesisApplyResult(
            status=status,
            summary=summary,
            applied_changes=applied,
            skipped_changes=skipped,
            conflicts=conflicts,
            warnings=[],
            attempt_id=None,
        )
        result.attempt_id = await self.record_apply_attempt(request, result, self._latency_ms(started), None if status in {"success", "dry_run"} else status)
        return result

    def _validate_apply_request(self, request: DeepSynthesisApplyRequest) -> None:
        found = sorted(self._find_forbidden_fields(request.model_dump(mode="json")))
        if found:
            raise DeepSynthesisValidationError(f"Deep Synthesis apply input contains forbidden fields: {', '.join(found)}")

    async def create_preview(self, request: DeepSynthesisRequest) -> DeepSynthesisResult:
        started = self.clock()
        self.validate_structured_input(request)

        budget_policy = self.estimate_budget(request)
        scheduler = self.budgeted_scheduler_factory(budget_policy)
        first_round_plan = scheduler.plan([self._round_work_item(request, 0)])
        budget_summary = self._budget_summary(request.budget_tier, budget_policy, scheduler)
        warnings: List[DeepSynthesisWarning] = []
        model_route = None
        status = "success"

        if first_round_plan.deferred and not first_round_plan.accepted:
            status = "failed"
            budget_summary.exhausted = True
            budget_summary.reason = "budget_exhausted"
            warnings.append(self._warning("budget_exhausted", "预算不足，未生成 Deep Synthesis preview。"))
            preview = self._empty_preview("预算不足，未生成建议变更。")
            quality_trace = self.compute_quality_trace(request, preview)
            user_feedback = self._user_feedback(request)
            round_summaries = [self._round_summary(
                round_index=0,
                status="failed",
                quality_trace=quality_trace,
                budget_summary=budget_summary,
                stop_reason="budget_exhausted",
                warnings=warnings,
            )]
            convergence_summary = self.build_convergence_summary(round_summaries, quality_trace, user_feedback)
            attempt_id = await self.record_attempt(
                request=request,
                result_status=status,
                preview=preview,
                budget_summary=budget_summary,
                model_route=model_route,
                latency_ms=self._latency_ms(started),
                error_type="budget_exhausted",
                quality_trace=quality_trace,
                user_feedback=user_feedback,
                convergence_summary=convergence_summary,
                round_summaries=round_summaries,
            )
            return DeepSynthesisResult(
                status=status,
                preview=preview,
                budget_summary=budget_summary,
                model_route=model_route,
                warnings=warnings,
                attempt_id=attempt_id,
                round_summaries=round_summaries,
                convergence_summary=convergence_summary,
                quality_trace=quality_trace,
                user_feedback=user_feedback,
            )

        if not request.assets:
            status = "no_actionable_assets"
            warnings.append(self._warning("no_actionable_assets", "未提供可综合的结构化资产。"))
            preview = self._empty_preview("未提供可综合的结构化资产。")
        else:
            model_route, route_warning = await self._select_model_route(request)
            if route_warning is not None:
                warnings.append(route_warning)
            preview = self.sanitize_preview(self._build_preview_from_structured_assets(request))

        quality_trace = self.compute_quality_trace(request, preview)
        user_feedback = self._user_feedback(request)
        round_summaries = self._build_round_summaries(
            request=request,
            scheduler=scheduler,
            budget_policy=budget_policy,
            first_round_accepted=bool(first_round_plan.accepted),
            quality_trace=quality_trace,
            user_feedback=user_feedback,
            warnings=warnings,
        )
        budget_summary = self._budget_summary(request.budget_tier, budget_policy, scheduler)
        convergence_summary = self.build_convergence_summary(round_summaries, quality_trace, user_feedback)

        attempt_id = await self.record_attempt(
            request=request,
            result_status=status,
            preview=preview,
            budget_summary=budget_summary,
            model_route=model_route,
            latency_ms=self._latency_ms(started),
            error_type=None if status in {"success", "no_actionable_assets"} else status,
            quality_trace=quality_trace,
            user_feedback=user_feedback,
            convergence_summary=convergence_summary,
            round_summaries=round_summaries,
        )
        return DeepSynthesisResult(
            status=status,
            preview=preview,
            budget_summary=budget_summary,
            model_route=model_route,
            warnings=warnings,
            attempt_id=attempt_id,
            round_summaries=round_summaries,
            convergence_summary=convergence_summary,
            quality_trace=quality_trace,
            user_feedback=user_feedback,
        )

    def validate_structured_input(self, request: DeepSynthesisRequest) -> None:
        found = sorted(self._find_forbidden_fields(request.model_dump(mode="json")))
        if found:
            raise DeepSynthesisValidationError(f"Deep Synthesis input contains forbidden fields: {', '.join(found)}")

    def estimate_budget(self, request: DeepSynthesisRequest) -> BudgetPolicy:
        mapping = {
            DeepSynthesisBudgetTier.low: (5, 20000, 1),
            DeepSynthesisBudgetTier.medium: (10, 50000, 2),
            DeepSynthesisBudgetTier.high: (20, 100000, 3),
        }
        max_model_calls, max_estimated_tokens, _ = mapping[request.budget_tier]
        return BudgetPolicy(
            max_model_calls=max_model_calls,
            max_retry_attempts=1,
            max_repair_attempts=1,
            max_wall_clock_seconds=600.0,
            max_estimated_tokens=max_estimated_tokens,
            enabled=True,
        )

    def build_work_items(self, request: DeepSynthesisRequest) -> List[BudgetedWorkItem]:
        return [self._round_work_item(request, round_index) for round_index in range(self._max_rounds_for_tier(request.budget_tier))]

    def _round_work_item(self, request: DeepSynthesisRequest, round_index: int) -> BudgetedWorkItem:
        phases = list(ROUND_PHASES)
        phase = phases[min(round_index, len(phases) - 1)]
        if round_index == 0:
            estimated_model_calls = 1 if request.assets else 0
            estimated_tokens = min(self._budget_limit_for_tier(request.budget_tier), max(0, len(request.assets) * 1000))
        else:
            estimated_model_calls = 1
            estimated_tokens = min(self._budget_limit_for_tier(request.budget_tier), max(500, len(request.assets) * 500))
        return BudgetedWorkItem(
            chapter_id=f"{self._scope_ids_hash(request)}:{round_index}",
            chapter_title=f"deep_synthesis:{request.scope.scope_type.value}:{round_index}",
            chapter_order=round_index,
            phase=phase,
            estimated_model_calls=estimated_model_calls,
            estimated_tokens=estimated_tokens,
        )

    async def record_attempt(
        self,
        *,
        request: DeepSynthesisRequest,
        result_status: str,
        preview: DeepSynthesisPreview,
        budget_summary: DeepSynthesisBudgetSummary,
        model_route: Optional[Dict[str, Any]],
        latency_ms: int,
        error_type: Optional[str],
        quality_trace: DeepSynthesisQualityTrace,
        user_feedback: DeepSynthesisUserFeedback,
        convergence_summary: DeepSynthesisConvergenceSummary,
        round_summaries: List[DeepSynthesisRoundSummary],
    ) -> Optional[str]:
        if self.attempt_store is None:
            return None
        attempt_id = str(uuid.uuid4())[:20]
        selected_model = ""
        if isinstance(model_route, dict):
            selected_model = str(model_route.get("selected_model") or "")
        first_round = round_summaries[0] if round_summaries else None
        record = AttemptRecord(
            id=attempt_id,
            task_type="deep_synthesis",
            session_id=request.session_id,
            chapter_id=self._scope_ids_hash(request),
            chapter_title=f"deep_synthesis:{request.scope.scope_type.value}",
            chapter_order=0,
            attempt_number=1,
            status="success" if result_status in {"success", "no_actionable_assets"} else "failed",
            model_used=selected_model,
            timeout=600.0,
            max_tokens=budget_summary.max_estimated_tokens,
            latency_ms=latency_ms,
            error_type=error_type,
            error_message=None,
            raw_response_hash=None,
            raw_response_chars=0,
            parsed_candidate_counts={"proposed_changes": len(preview.proposed_changes)},
            retry_count=0,
            needs_retry=False,
            deadline_remaining_ms=None,
            budget_phase="first_pass",
            budget_status="accepted" if not budget_summary.exhausted else "deferred",
            budget_deferred_reason=budget_summary.reason,
            estimated_tokens=budget_summary.estimated_tokens_used,
            estimated_model_calls=budget_summary.model_calls_used,
            scope_type=request.scope.scope_type.value,
            scope_ids_hash=self._scope_ids_hash(request),
            round_index=0,
            model_role=SYNTHESIS_MODEL_ROLE,
            proposed_change_count=quality_trace.proposed_change_count,
            high_confidence_change_count=quality_trace.high_confidence_change_count,
            unresolved_conflict_count=quality_trace.unresolved_conflict_count,
            convergence_reason=convergence_summary.reason,
            quality_before=quality_trace.quality_before,
            quality_after_preview=quality_trace.quality_after_preview,
            user_acceptance_rate=user_feedback.user_acceptance_rate,
            pass_type=first_round.pass_type if first_round else "generation",
            budget_summary=budget_summary.model_dump(mode="json"),
        )
        await self.attempt_store.record(record)
        return attempt_id

    async def record_apply_attempt(
        self,
        request: DeepSynthesisApplyRequest,
        result: DeepSynthesisApplyResult,
        latency_ms: int,
        error_type: Optional[str],
    ) -> Optional[str]:
        if self.attempt_store is None:
            return None
        attempt_id = str(uuid.uuid4())[:20]
        record = AttemptRecord(
            id=attempt_id,
            task_type="deep_synthesis_apply",
            session_id=request.session_id,
            chapter_id=hashlib.sha256(request.session_id.encode("utf-8")).hexdigest()[:20],
            chapter_title="deep_synthesis_apply",
            chapter_order=0,
            attempt_number=1,
            status="success" if result.status in {"success", "dry_run"} else "failed",
            model_used="",
            timeout=0.0,
            max_tokens=0,
            latency_ms=latency_ms,
            error_type=error_type,
            error_message=None,
            raw_response_hash=None,
            raw_response_chars=0,
            parsed_candidate_counts={
                "accepted_count": result.summary.accepted_count,
                "rejected_count": result.summary.rejected_count,
                "applied_count": result.summary.applied_count,
                "skipped_count": result.summary.skipped_count,
                "conflict_count": result.summary.conflict_count,
                "dry_run": int(result.summary.dry_run),
            },
            retry_count=0,
            needs_retry=False,
            deadline_remaining_ms=None,
            budget_phase="apply",
            budget_status="skipped" if request.dry_run else "accepted",
            budget_deferred_reason=None,
            estimated_tokens=0,
            estimated_model_calls=0,
            scope_type="apply",
            scope_ids_hash=hashlib.sha256(request.session_id.encode("utf-8")).hexdigest()[:20],
            round_index=0,
            model_role=None,
            proposed_change_count=len(request.preview.proposed_changes),
            high_confidence_change_count=0,
            unresolved_conflict_count=result.summary.conflict_count,
            convergence_reason=result.status,
            quality_before=None,
            quality_after_preview=None,
            user_acceptance_rate=self.compute_user_acceptance_rate(request.accepted_change_ids, request.rejected_change_ids),
            pass_type="generation",
            budget_summary={
                "task_type": "deep_synthesis_apply",
                "applied_count": result.summary.applied_count,
                "skipped_count": result.summary.skipped_count,
                "conflict_count": result.summary.conflict_count,
                "dry_run": result.summary.dry_run,
                "accepted_count": result.summary.accepted_count,
                "rejected_count": result.summary.rejected_count,
                "user_acceptance_rate": self.compute_user_acceptance_rate(request.accepted_change_ids, request.rejected_change_ids),
                "status": result.status,
                "error_type": error_type,
            },
        )
        await self.attempt_store.record(record)
        return attempt_id

    def sanitize_preview(self, preview: DeepSynthesisPreview) -> DeepSynthesisPreview:
        return DeepSynthesisPreview.model_validate(preview.model_dump(mode="json"))

    def compute_quality_trace(
        self,
        request: DeepSynthesisRequest,
        preview: DeepSynthesisPreview,
    ) -> DeepSynthesisQualityTrace:
        quality_before = self._quality_score(request.quality_summary)
        proposed_change_count = len(preview.proposed_changes)
        high_confidence_change_count = sum(1 for change in preview.proposed_changes if change.confidence >= 0.75)
        unresolved_conflict_count = max(0, len(request.conflicts) - len(preview.conflicts_resolved))
        quality_after = None
        if quality_before is not None:
            estimated_delta = min(0.3, high_confidence_change_count * 0.06 + len(preview.conflicts_resolved) * 0.04)
            quality_after = min(1.0, quality_before + estimated_delta)
        quality_delta = round(quality_after - quality_before, 6) if quality_before is not None and quality_after is not None else 0.0
        return DeepSynthesisQualityTrace(
            quality_before=quality_before,
            quality_after_preview=quality_after,
            quality_delta=quality_delta,
            proposed_change_count=proposed_change_count,
            high_confidence_change_count=high_confidence_change_count,
            unresolved_conflict_count=unresolved_conflict_count,
        )

    @staticmethod
    def compute_user_acceptance_rate(accepted_change_ids: List[str], rejected_change_ids: List[str]) -> Optional[float]:
        total = len(accepted_change_ids) + len(rejected_change_ids)
        if total == 0:
            return None
        return len(accepted_change_ids) / total

    def should_stop_synthesis(
        self,
        *,
        round_index: int,
        max_rounds: int,
        quality_delta: float,
        proposed_change_count: int,
        high_confidence_change_count: int,
        unresolved_conflict_count: int,
        previous_unresolved_conflict_count: Optional[int],
        user_acceptance_rate: Optional[float],
        budget_summary: DeepSynthesisBudgetSummary,
        quality_delta_threshold: float = QUALITY_DELTA_THRESHOLD,
    ) -> tuple[bool, str]:
        if round_index >= max_rounds:
            return True, "round_limit"
        if budget_summary.exhausted or budget_summary.remaining_model_calls <= 0:
            return True, "budget_exhausted"
        if proposed_change_count == 0:
            return True, "no_actionable_changes"
        if high_confidence_change_count == 0:
            return True, "no_high_confidence_changes"
        if quality_delta < quality_delta_threshold:
            return True, "quality_plateau"
        if previous_unresolved_conflict_count is not None and previous_unresolved_conflict_count > 0 and unresolved_conflict_count >= previous_unresolved_conflict_count:
            return True, "unresolved_conflicts_not_decreasing"
        if user_acceptance_rate is not None and user_acceptance_rate < 0.2:
            return True, "low_user_acceptance"
        return False, "continue"

    def build_convergence_summary(
        self,
        round_summaries: List[DeepSynthesisRoundSummary],
        quality_trace: DeepSynthesisQualityTrace,
        user_feedback: DeepSynthesisUserFeedback,
    ) -> DeepSynthesisConvergenceSummary:
        last_round = round_summaries[-1] if round_summaries else None
        reason = last_round.stop_reason if last_round and last_round.stop_reason else "continue"
        should_continue = reason == "continue"
        return DeepSynthesisConvergenceSummary(
            converged=not should_continue,
            reason=reason,
            rounds_completed=len([round_summary for round_summary in round_summaries if round_summary.status in {"success", "stopped"}]),
            quality_before=quality_trace.quality_before,
            quality_after=quality_trace.quality_after_preview,
            total_quality_delta=quality_trace.quality_delta,
            total_proposed_change_count=sum(round_summary.proposed_change_count for round_summary in round_summaries),
            total_high_confidence_change_count=sum(round_summary.high_confidence_change_count for round_summary in round_summaries),
            unresolved_conflict_count=quality_trace.unresolved_conflict_count,
            user_acceptance_rate=user_feedback.user_acceptance_rate,
            should_continue=should_continue,
        )

    def _build_round_summaries(
        self,
        *,
        request: DeepSynthesisRequest,
        scheduler: BudgetedScheduler,
        budget_policy: BudgetPolicy,
        first_round_accepted: bool,
        quality_trace: DeepSynthesisQualityTrace,
        user_feedback: DeepSynthesisUserFeedback,
        warnings: List[DeepSynthesisWarning],
    ) -> List[DeepSynthesisRoundSummary]:
        round_summaries: List[DeepSynthesisRoundSummary] = []
        max_rounds = self._max_rounds_for_tier(request.budget_tier)
        previous_unresolved_conflict_count: Optional[int] = None
        if not first_round_accepted:
            return round_summaries

        for round_index in range(max_rounds):
            if round_index > 0:
                if not self._previous_round_allows_next(round_summaries[-1]):
                    break
                plan = scheduler.plan([self._round_work_item(request, round_index)])
                if plan.deferred and not plan.accepted:
                    budget_summary = self._budget_summary(request.budget_tier, budget_policy, scheduler)
                    budget_summary.exhausted = True
                    budget_summary.reason = "budget_exhausted"
                    round_summaries.append(self._round_summary(
                        round_index=round_index,
                        status="failed",
                        quality_trace=quality_trace,
                        budget_summary=budget_summary,
                        stop_reason="budget_exhausted",
                        warnings=[],
                    ))
                    break

            budget_summary = self._budget_summary(request.budget_tier, budget_policy, scheduler)
            should_stop, stop_reason = self.should_stop_synthesis(
                round_index=round_index + 1,
                max_rounds=max_rounds,
                quality_delta=quality_trace.quality_delta,
                proposed_change_count=quality_trace.proposed_change_count,
                high_confidence_change_count=quality_trace.high_confidence_change_count,
                unresolved_conflict_count=quality_trace.unresolved_conflict_count,
                previous_unresolved_conflict_count=previous_unresolved_conflict_count,
                user_acceptance_rate=user_feedback.user_acceptance_rate,
                budget_summary=budget_summary,
            )
            round_summaries.append(self._round_summary(
                round_index=round_index,
                status="success",
                quality_trace=quality_trace,
                budget_summary=budget_summary,
                stop_reason=stop_reason if should_stop else None,
                warnings=warnings if round_index == 0 else [],
            ))
            if should_stop:
                break
            previous_unresolved_conflict_count = quality_trace.unresolved_conflict_count
        return round_summaries

    def _round_summary(
        self,
        *,
        round_index: int,
        status: str,
        quality_trace: DeepSynthesisQualityTrace,
        budget_summary: DeepSynthesisBudgetSummary,
        stop_reason: Optional[str],
        warnings: List[DeepSynthesisWarning],
    ) -> DeepSynthesisRoundSummary:
        return DeepSynthesisRoundSummary(
            round_index=round_index,
            pass_type=ROUND_PASS_TYPES[min(round_index, len(ROUND_PASS_TYPES) - 1)],
            status=status,
            proposed_change_count=quality_trace.proposed_change_count,
            high_confidence_change_count=quality_trace.high_confidence_change_count,
            unresolved_conflict_count=quality_trace.unresolved_conflict_count,
            quality_before=quality_trace.quality_before,
            quality_after=quality_trace.quality_after_preview,
            quality_delta=quality_trace.quality_delta,
            model_calls_used=budget_summary.model_calls_used,
            estimated_tokens_used=budget_summary.estimated_tokens_used,
            stop_reason=stop_reason,
            warnings=warnings,
        )

    @staticmethod
    def _previous_round_allows_next(round_summary: DeepSynthesisRoundSummary) -> bool:
        return (
            round_summary.status == "success"
            and round_summary.proposed_change_count > 0
            and round_summary.high_confidence_change_count > 0
            and round_summary.quality_delta >= QUALITY_DELTA_THRESHOLD
            and round_summary.stop_reason is None
        )

    def _user_feedback(self, request: DeepSynthesisRequest) -> DeepSynthesisUserFeedback:
        accepted_change_ids = list(request.accepted_change_ids)
        rejected_change_ids = list(request.rejected_change_ids)
        return DeepSynthesisUserFeedback(
            accepted_change_ids=accepted_change_ids,
            rejected_change_ids=rejected_change_ids,
            user_acceptance_rate=self.compute_user_acceptance_rate(accepted_change_ids, rejected_change_ids),
        )

    async def _select_model_route(self, request: DeepSynthesisRequest) -> tuple[Optional[Dict[str, Any]], Optional[DeepSynthesisWarning]]:
        if self.model_router is None:
            return None, self._warning("model_router_unavailable", "ModelRouter 未配置，preview 使用确定性路径生成。")
        try:
            decision = await self.model_router.select_model(
                SYNTHESIS_MODEL_ROLE,
                probe=False,
                session_id=request.session_id,
            )
            route = decision.to_dict() if hasattr(decision, "to_dict") else dict(decision)
            route["role"] = route.get("role") or SYNTHESIS_MODEL_ROLE
            return self._sanitize_model_route(route), None
        except Exception:
            return None, self._warning("model_router_failed", "ModelRouter 选择失败，preview 使用确定性路径生成。")

    def _build_preview_from_structured_assets(self, request: DeepSynthesisRequest) -> DeepSynthesisPreview:
        proposed_changes: List[ProposedChange] = []
        evidence_refs: List[EvidenceRef] = []
        for asset in request.assets:
            for index, raw_change in enumerate(self._suggested_changes(asset), start=1):
                field_path = raw_change.get("field_path")
                if not isinstance(field_path, str) or not field_path.strip():
                    continue
                change_evidence = self._evidence_refs(asset, raw_change.get("evidence_refs"))
                evidence_refs.extend(change_evidence)
                proposed_changes.append(ProposedChange(
                    change_id=str(raw_change.get("change_id") or f"{asset.asset_id}:{index}"),
                    asset_type=asset.asset_type,
                    asset_id=asset.asset_id,
                    asset_version=asset.asset_version,
                    field_path=field_path.strip(),
                    current_value=raw_change.get("current_value"),
                    proposed_value=raw_change.get("proposed_value"),
                    confidence=float(raw_change.get("confidence", 0.5)),
                    reason=str(raw_change.get("reason") or "基于结构化资产生成字段级 preview patch。")[:500],
                    evidence_refs=change_evidence,
                    risk_level=RiskLevel(str(raw_change.get("risk_level") or "low")),
                ))
        summary = "已生成 Deep Synthesis preview patch。" if proposed_changes else "结构化资产已接收，本轮没有生成字段级建议变更。"
        return DeepSynthesisPreview(
            summary=summary,
            proposed_changes=proposed_changes,
            conflicts_resolved=[],
            new_links=[],
            risk_flags=[],
            confidence_delta=0.0,
            evidence_refs=evidence_refs,
            apply_plan=ApplyPlan(),
            requires_user_confirmation=True,
        )

    @staticmethod
    def _suggested_changes(asset: DeepSynthesisRequestAsset) -> List[Dict[str, Any]]:
        value = asset.data.get("suggested_changes")
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        return []

    @staticmethod
    def _evidence_refs(asset: DeepSynthesisRequestAsset, value: Any) -> List[EvidenceRef]:
        refs = value if isinstance(value, list) else []
        result: List[EvidenceRef] = []
        for index, item in enumerate(refs[:8], start=1):
            if isinstance(item, str):
                result.append(EvidenceRef(
                    evidence_id=f"{asset.asset_id}:evidence:{index}",
                    source_type="truncated_summary",
                    asset_type=asset.asset_type,
                    asset_id=asset.asset_id,
                    asset_version=asset.asset_version,
                    summary=item[:200],
                ))
            elif isinstance(item, dict):
                result.append(EvidenceRef(
                    evidence_id=str(item.get("evidence_id") or f"{asset.asset_id}:evidence:{index}"),
                    source_type=str(item.get("source_type") or "structured_ref"),
                    asset_type=asset.asset_type,
                    asset_id=asset.asset_id,
                    asset_version=asset.asset_version,
                    field_path=item.get("field_path") if isinstance(item.get("field_path"), str) else None,
                    summary=str(item.get("summary") or "")[:200] or None,
                ))
        return result

    @staticmethod
    def _find_forbidden_fields(value: Any) -> set[str]:
        found: set[str] = set()
        if isinstance(value, dict):
            for key, child in value.items():
                if key in FORBIDDEN_INPUT_FIELDS:
                    found.add(key)
                found.update(DeepSynthesisService._find_forbidden_fields(child))
        elif isinstance(value, list):
            for item in value:
                found.update(DeepSynthesisService._find_forbidden_fields(item))
        return found

    @staticmethod
    def _asset_version(content_item: Any) -> str:
        return f"v{content_item.metadata.version}"

    @staticmethod
    def _version_matches(expected: str, actual: str) -> bool:
        return str(expected) == actual or str(expected).lstrip("v") == actual.lstrip("v")

    @staticmethod
    def _next_asset_version(version: str) -> str:
        try:
            return f"v{int(version.lstrip('v')) + 1}"
        except ValueError:
            return version

    @staticmethod
    def _skipped(change: ProposedChange, reason: DeepSynthesisApplySkipReason, message: str):
        from .deep_synthesis_models import DeepSynthesisSkippedChange
        return DeepSynthesisSkippedChange(
            change_id=change.change_id,
            asset_type=change.asset_type,
            asset_id=change.asset_id,
            field_path=change.field_path,
            reason=reason,
            message=message,
        )

    @staticmethod
    def _conflict(change: ProposedChange, reason: DeepSynthesisApplySkipReason, expected: Any, actual: Any, message: str) -> DeepSynthesisApplyConflict:
        return DeepSynthesisApplyConflict(
            change_id=change.change_id,
            asset_type=change.asset_type,
            asset_id=change.asset_id,
            field_path=change.field_path,
            reason=reason,
            expected=expected,
            actual=actual,
            message=message,
        )

    @staticmethod
    def _apply_status(summary: DeepSynthesisApplySummary) -> str:
        if summary.dry_run:
            return "dry_run"
        if summary.conflict_count > 0 and summary.applied_count == 0:
            return "failed"
        if summary.applied_count > 0 and summary.conflict_count > 0:
            return "partial"
        return "success"

    @staticmethod
    def _empty_preview(summary: str) -> DeepSynthesisPreview:
        return DeepSynthesisPreview(summary=summary, apply_plan=ApplyPlan(), requires_user_confirmation=True)

    @staticmethod
    def _warning(code: str, message: str) -> DeepSynthesisWarning:
        return DeepSynthesisWarning(warning_id=str(uuid.uuid4())[:12], code=code, message=message)

    @staticmethod
    def _scope_ids_hash(request: DeepSynthesisRequest) -> str:
        payload = "|".join(sorted(request.scope.scope_ids)) or request.scope.scope_type.value
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:20]

    @staticmethod
    def _quality_score(value: Optional[Dict[str, Any]]) -> Optional[float]:
        if not isinstance(value, dict):
            return None
        for key in ("quality_score", "overall_score", "score"):
            try:
                return float(value[key])
            except (KeyError, TypeError, ValueError):
                continue
        return None

    @staticmethod
    def _budget_limit_for_tier(tier: DeepSynthesisBudgetTier) -> int:
        return {
            DeepSynthesisBudgetTier.low: 20000,
            DeepSynthesisBudgetTier.medium: 50000,
            DeepSynthesisBudgetTier.high: 100000,
        }[tier]

    @staticmethod
    def _max_rounds_for_tier(tier: DeepSynthesisBudgetTier) -> int:
        return {
            DeepSynthesisBudgetTier.low: 1,
            DeepSynthesisBudgetTier.medium: 2,
            DeepSynthesisBudgetTier.high: 3,
        }[tier]

    def _budget_summary(
        self,
        tier: DeepSynthesisBudgetTier,
        policy: BudgetPolicy,
        scheduler: BudgetedScheduler,
    ) -> DeepSynthesisBudgetSummary:
        summary = scheduler.summary()
        return DeepSynthesisBudgetSummary(
            budget_tier=tier,
            max_model_calls=policy.max_model_calls,
            max_estimated_tokens=policy.max_estimated_tokens,
            max_rounds=self._max_rounds_for_tier(tier),
            model_calls_used=summary.model_calls_used,
            estimated_tokens_used=max(0, policy.max_estimated_tokens - summary.tokens_remaining),
            remaining_model_calls=summary.model_calls_remaining,
            remaining_estimated_tokens=summary.tokens_remaining,
            exhausted=summary.total_deferred > 0 and summary.total_accepted == 0,
            reason="budget_exhausted" if summary.total_deferred > 0 and summary.total_accepted == 0 else None,
        )

    @staticmethod
    def _sanitize_model_route(route: Dict[str, Any]) -> Dict[str, Any]:
        blocked = FORBIDDEN_INPUT_FIELDS | {"error", "error_message", "provider_body"}
        return {key: value for key, value in route.items() if key not in blocked}

    def _latency_ms(self, started: float) -> int:
        return max(0, int((self.clock() - started) * 1000))
