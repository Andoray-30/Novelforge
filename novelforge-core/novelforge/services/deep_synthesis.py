from __future__ import annotations

import hashlib
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from .attempt_store import AttemptRecord
from .budgeted_scheduler import BudgetedScheduler, BudgetedWorkItem, BudgetPolicy
from .deep_synthesis_models import (
    ApplyPlan,
    DeepSynthesisBudgetSummary,
    DeepSynthesisBudgetTier,
    DeepSynthesisPreview,
    DeepSynthesisRequest,
    DeepSynthesisRequestAsset,
    DeepSynthesisResult,
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


class DeepSynthesisValidationError(ValueError):
    pass


class DeepSynthesisService:
    def __init__(
        self,
        *,
        attempt_store: Optional[Any] = None,
        budgeted_scheduler_factory: Optional[Callable[[BudgetPolicy], BudgetedScheduler]] = None,
        model_router: Optional[Any] = None,
        schema_repairer: Optional[Any] = None,
        clock: Optional[Callable[[], float]] = None,
    ):
        self.attempt_store = attempt_store
        self.budgeted_scheduler_factory = budgeted_scheduler_factory or (lambda policy: BudgetedScheduler(policy=policy))
        self.model_router = model_router
        self.schema_repairer = schema_repairer
        self.clock = clock or time.perf_counter

    async def create_preview(self, request: DeepSynthesisRequest) -> DeepSynthesisResult:
        started = self.clock()
        self.validate_structured_input(request)

        budget_policy = self.estimate_budget(request)
        scheduler = self.budgeted_scheduler_factory(budget_policy)
        work_items = self.build_work_items(request)
        plan = scheduler.plan(work_items)
        budget_summary = self._budget_summary(request.budget_tier, budget_policy, scheduler)
        warnings: List[DeepSynthesisWarning] = []
        model_route = None
        status = "success"

        if plan.deferred and not plan.accepted:
            status = "failed"
            budget_summary.exhausted = True
            budget_summary.reason = "budget_exhausted"
            warnings.append(self._warning("budget_exhausted", "预算不足，未生成 Deep Synthesis preview。"))
            preview = self._empty_preview("预算不足，未生成建议变更。")
            attempt_id = await self.record_attempt(
                request=request,
                result_status=status,
                preview=preview,
                budget_summary=budget_summary,
                model_route=model_route,
                latency_ms=self._latency_ms(started),
                error_type="budget_exhausted",
            )
            return DeepSynthesisResult(
                status=status,
                preview=preview,
                budget_summary=budget_summary,
                model_route=model_route,
                warnings=warnings,
                attempt_id=attempt_id,
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

        attempt_id = await self.record_attempt(
            request=request,
            result_status=status,
            preview=preview,
            budget_summary=budget_summary,
            model_route=model_route,
            latency_ms=self._latency_ms(started),
            error_type=None if status in {"success", "no_actionable_assets"} else status,
        )
        return DeepSynthesisResult(
            status=status,
            preview=preview,
            budget_summary=budget_summary,
            model_route=model_route,
            warnings=warnings,
            attempt_id=attempt_id,
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
            max_retry_attempts=0,
            max_repair_attempts=0,
            max_wall_clock_seconds=600.0,
            max_estimated_tokens=max_estimated_tokens,
            enabled=True,
        )

    def build_work_items(self, request: DeepSynthesisRequest) -> List[BudgetedWorkItem]:
        return [
            BudgetedWorkItem(
                chapter_id=self._scope_ids_hash(request),
                chapter_title=f"deep_synthesis:{request.scope.scope_type.value}",
                chapter_order=0,
                phase="first_pass",
                estimated_model_calls=1 if request.assets else 0,
                estimated_tokens=min(self._budget_limit_for_tier(request.budget_tier), max(0, len(request.assets) * 1000)),
            )
        ]

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
    ) -> Optional[str]:
        if self.attempt_store is None:
            return None
        attempt_id = str(uuid.uuid4())[:20]
        selected_model = ""
        if isinstance(model_route, dict):
            selected_model = str(model_route.get("selected_model") or "")
        quality_before = self._quality_score(request.quality_summary)
        quality_after = quality_before if quality_before is not None else None
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
            pass_type="generation",
            model_role=SYNTHESIS_MODEL_ROLE,
            proposed_change_count=len(preview.proposed_changes),
            quality_before=quality_before,
            quality_after_preview=quality_after,
            budget_summary=budget_summary.model_dump(mode="json"),
        )
        await self.attempt_store.record(record)
        return attempt_id

    def sanitize_preview(self, preview: DeepSynthesisPreview) -> DeepSynthesisPreview:
        return DeepSynthesisPreview.model_validate(preview.model_dump(mode="json"))

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
