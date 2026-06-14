"""PerformanceProfile for extraction model performance aggregation.

Aggregates model performance metrics from AttemptStore and RetryQueue data.
Does NOT implement ModelRouter or change model selection logic.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field


PERF_PROFILE_KEY_PREFIX = "perf_profile_"


def _now_iso() -> str:
    return datetime.now().isoformat()


# ============================================================================
# Token Bucket Classification
# ============================================================================


TOKEN_BUCKET_THRESHOLDS = {
    "small": (0, 3000),
    "medium": (3000, 8001),
    "large": (8001, float("inf")),
}


def token_bucket(estimated_tokens: int) -> str:
    """Classify estimated_tokens into fixed bands: small/medium/large."""
    if estimated_tokens < 3000:
        return "small"
    elif estimated_tokens <= 8000:
        return "medium"
    else:
        return "large"


# ============================================================================
# Confidence Level
# ============================================================================


def confidence_level(total_attempts: int) -> str:
    """Return confidence level based on sample size: low/medium/high."""
    if total_attempts < 5:
        return "low"
    elif total_attempts < 30:
        return "medium"
    else:
        return "high"


# ============================================================================
# Percentile Calculation
# ============================================================================


def percentile(values: List[float], p: int, filter_zeros: bool = False) -> float:
    """Calculate percentile from a list of values.

    Uses nearest-rank method. Returns 0.0 for empty lists.
    """
    if not values:
        return 0.0

    if filter_zeros:
        values = [v for v in values if v > 0]
        if not values:
            return 0.0

    sorted_values = sorted(values)
    n = len(sorted_values)
    k = int(n * p / 100)
    k = min(k, n - 1)
    return sorted_values[k]


# ============================================================================
# Task Role Derivation
# ============================================================================


def derive_task_role(record: Dict[str, Any], model_pools: Dict[str, List[str]]) -> str:
    """Derive task_role from record's model_used and repair_layer.

    Priority:
    1. If repair_layer == "model" -> "schema_repair"
    2. Match model_used against config model_pools
    3. Fallback to "unknown"
    """
    repair_layer = record.get("repair_layer")
    model_used = record.get("model_used", "")

    if repair_layer == "model":
        return "schema_repair"

    if not model_used:
        return "unknown"

    for role, models in model_pools.items():
        if model_used in models:
            return role

    return "unknown"


# ============================================================================
# Recommendation Hints
# ============================================================================


ROLE_LATENCY_TOLERANCE_MS = {
    "extractor_fast": 20_000,
    "writer_fast": 20_000,
    "extractor_repair": 45_000,
    "judge": 45_000,
    "extractor_deep": 90_000,
    "writer_pro": 90_000,
    "schema_repair": 30_000,
}


def recommendation_hints(
    metrics: "PerformanceProfileMetrics", task_role: str
) -> str:
    """Generate recommendation hint from metrics and task role."""
    if metrics.total_attempts < 5:
        return "insufficient_data"

    hints: List[str] = []

    if metrics.success_rate >= 0.9 and metrics.p95_latency_ms < 20000:
        if task_role in ("extractor_fast", "writer_fast"):
            hints.append("good_for_extractor_fast")

    if metrics.timeout_rate > 0.1:
        hints.append("high_timeout_risk")

    if metrics.json_invalid_rate > 0.2:
        hints.append("unstable_format")

    tolerance = ROLE_LATENCY_TOLERANCE_MS.get(task_role, 30000)
    if metrics.p95_latency_ms > tolerance:
        hints.append("high_latency")

    if metrics.repair_salvage_rate > 0:
        hints.append("needs_schema_repair")

    if metrics.success_rate < 0.7 and getattr(metrics, "estimated_tokens_avg", 0) > 8000:
        hints.append("avoid_for_long_context")

    return ",".join(hints) if hints else "ok"


# ============================================================================
# Data Models
# ============================================================================


class PerformanceProfileKey(BaseModel):
    """Grouping dimensions for a performance profile."""

    scope: str  # "session" | "global"
    session_id: str
    model_used: str
    task_role: str
    token_bucket: str  # "small" | "medium" | "large"


class PerformanceProfileMetrics(BaseModel):
    """Aggregated performance metrics for a profile."""

    total_attempts: int = 0
    success_count: int = 0
    failed_count: int = 0
    timeout_count: int = 0
    rate_limited_count: int = 0
    gateway_timeout_count: int = 0
    empty_content_count: int = 0
    json_invalid_count: int = 0
    schema_error_count: int = 0
    no_candidates_count: int = 0

    success_rate: float = 0.0
    timeout_rate: float = 0.0
    json_invalid_rate: float = 0.0

    avg_latency_ms: float = 0.0
    p50_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0

    error_breakdown: Dict[str, int] = Field(default_factory=dict)

    raw_response_present_failure_count: int = 0
    clean_parse_success_count: int = 0
    local_repair_success_count: int = 0
    model_repair_success_count: int = 0
    repair_failed_count: int = 0
    repair_salvage_rate: float = 0.0

    retry_queued_count: int = 0
    retry_success_count: int = 0
    retry_failed_count: int = 0
    retry_exhausted_count: int = 0
    retry_salvage_rate: float = 0.0

    budget_deferred_count: int = 0
    budget_exhausted_count: int = 0
    estimated_tokens_total: int = 0
    estimated_tokens_avg: int = 0
    estimated_model_calls_total: int = 0

    confidence_level: str = "low"
    recommendation_hint: str = "insufficient_data"

    def model_post_init(self, __context: Any) -> None:
        """Compute derived fields after initialization."""
        if self.total_attempts > 0:
            self.success_rate = self.success_count / self.total_attempts
            self.timeout_rate = self.timeout_count / self.total_attempts
            self.json_invalid_rate = self.json_invalid_count / self.total_attempts

        repair_eligible = (
            self.local_repair_success_count
            + self.model_repair_success_count
            + self.repair_failed_count
        )
        if repair_eligible > 0:
            self.repair_salvage_rate = (
                self.local_repair_success_count + self.model_repair_success_count
            ) / repair_eligible

        if self.retry_queued_count > 0:
            self.retry_salvage_rate = self.retry_success_count / self.retry_queued_count

        self.confidence_level = confidence_level(self.total_attempts)


class PerformanceProfile(BaseModel):
    """Complete performance profile with key, metrics, and metadata."""

    key: PerformanceProfileKey
    metrics: PerformanceProfileMetrics
    generated_at: str = Field(default_factory=_now_iso)
    source_attempt_count: int = 0


# ============================================================================
# Performance Profile Store
# ============================================================================


class PerformanceProfileStore:
    """Storage for performance profiles using StorageManager."""

    def __init__(self, storage_manager: Any):
        self._storage = storage_manager
        self._lock = asyncio.Lock()

    def _make_key(
        self, scope: str, session_id: str, model: str, role: str, bucket: str
    ) -> str:
        """Generate storage key for a profile."""
        if scope == "session":
            return f"{PERF_PROFILE_KEY_PREFIX}session_{session_id}_{model}_{role}_{bucket}"
        return f"{PERF_PROFILE_KEY_PREFIX}global_{model}_{role}_{bucket}"

    async def save(self, profile: PerformanceProfile) -> str:
        """Persist a performance profile. Returns the storage key."""
        key = self._make_key(
            profile.key.scope,
            profile.key.session_id,
            profile.key.model_used,
            profile.key.task_role,
            profile.key.token_bucket,
        )
        data = profile.model_dump(mode="json")
        async with self._lock:
            await self._storage.save(key, data)
        return key

    async def get(
        self, scope: str, session_id: str, key: PerformanceProfileKey
    ) -> Optional[PerformanceProfile]:
        """Load a profile by its key components."""
        storage_key = self._make_key(
            scope, session_id, key.model_used, key.task_role, key.token_bucket
        )
        data = await self._storage.load(storage_key)
        if data is None:
            return None
        return PerformanceProfile(**data)

    async def list_by_scope(
        self, scope: str, session_id: str = ""
    ) -> List[PerformanceProfile]:
        """List all profiles for a given scope."""
        all_keys = await self._storage.list_keys()
        prefix = f"{PERF_PROFILE_KEY_PREFIX}{scope}_"
        if scope == "session":
            prefix = f"{PERF_PROFILE_KEY_PREFIX}session_{session_id}_"
        profile_keys = [k for k in all_keys if k.startswith(prefix)]

        results: List[PerformanceProfile] = []
        for key in profile_keys:
            data = await self._storage.load(key)
            if data:
                results.append(PerformanceProfile(**data))
        return results

    async def rebuild(
        self, scope: str, session_id: str, profiles: List[PerformanceProfile]
    ) -> int:
        """Rebuild profiles for a scope. Overwrites existing. Returns count."""
        count = 0
        for profile in profiles:
            await self.save(profile)
            count += 1
        return count


class PerformanceProfileService:
    """Aggregates performance profiles from AttemptStore and RetryQueue."""

    def __init__(
        self,
        attempt_store: Any,
        retry_queue: Any,
        model_pools: Dict[str, List[str]],
        profile_store: Optional[PerformanceProfileStore] = None,
    ):
        self._attempt_store = attempt_store
        self._retry_queue = retry_queue
        self._model_pools = model_pools
        self._profile_store = profile_store

    async def compute_profiles(
        self,
        session_id: str,
        scope: str = "session",
        model_used: Optional[str] = None,
        task_role: Optional[str] = None,
        token_bucket: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Compute performance profiles on demand.

        Returns dict with profiles, generated_at, source_attempt_count, warnings.
        """
        warnings: List[str] = []

        if scope == "session":
            attempts = await self._attempt_store.list_by_session(session_id=session_id)
            retry_jobs = await self._retry_queue.list_by_session(session_id=session_id)
        else:
            all_keys = await self._attempt_store._storage.list_keys()
            attempt_keys = [k for k in all_keys if k.startswith("attempt_")]
            attempts = []
            for key in attempt_keys:
                data = await self._attempt_store._storage.load(key)
                if data:
                    from .attempt_store import AttemptRecord
                    attempts.append(AttemptRecord(**data))

            all_retry_keys = await self._retry_queue._storage.list_keys()
            retry_keys = [k for k in all_retry_keys if k.startswith("retry_job_")]
            retry_jobs = []
            for key in retry_keys:
                data = await self._retry_queue._storage.load(key)
                if data:
                    from .retry_queue import RetryJob
                    retry_jobs.append(RetryJob(**data))

        if not attempts:
            warnings.append("no_attempts_found")
            return {
                "profiles": [],
                "generated_at": _now_iso(),
                "source_attempt_count": 0,
                "warnings": warnings,
            }

        groups: Dict[Tuple[str, str, str, str], List[Dict[str, Any]]] = {}
        for attempt in attempts:
            record = attempt.model_dump()
            role = derive_task_role(record, self._model_pools)
            bucket = token_bucket(record.get("estimated_tokens", 0))
            model = record.get("model_used", "unknown")
            key = (model, role, bucket, session_id if scope == "session" else "")

            if key not in groups:
                groups[key] = []
            groups[key].append(record)

        retry_by_chapter: Dict[str, List[Dict[str, Any]]] = {}
        for job in retry_jobs:
            chapter_id = job.chapter_id
            if chapter_id not in retry_by_chapter:
                retry_by_chapter[chapter_id] = []
            retry_by_chapter[chapter_id].append(job.model_dump())

        profiles: List[PerformanceProfile] = []
        for (model, role, bucket, sess_id), records in groups.items():
            if model_used and model != model_used:
                continue
            if task_role and role != task_role:
                continue
            if token_bucket and bucket != token_bucket:
                continue

            metrics = self._aggregate_metrics(records, retry_by_chapter)
            key = PerformanceProfileKey(
                scope=scope,
                session_id=sess_id,
                model_used=model,
                task_role=role,
                token_bucket=bucket,
            )
            profile = PerformanceProfile(
                key=key,
                metrics=metrics,
                source_attempt_count=len(records),
            )
            profiles.append(profile)

        return {
            "profiles": [p.model_dump(mode="json") for p in profiles],
            "generated_at": _now_iso(),
            "source_attempt_count": len(attempts),
            "warnings": warnings,
        }

    def _aggregate_metrics(
        self,
        records: List[Dict[str, Any]],
        retry_by_chapter: Dict[str, List[Dict[str, Any]]],
    ) -> PerformanceProfileMetrics:
        total = len(records)
        success = sum(1 for r in records if r.get("status") == "success")
        failed = sum(1 for r in records if r.get("status") == "failed")
        timeout = sum(1 for r in records if r.get("error_type") in ("timeout", "gateway_timeout"))
        rate_limited = sum(1 for r in records if r.get("error_type") == "rate_limited")
        gateway_timeout = sum(1 for r in records if r.get("error_type") == "gateway_timeout")
        empty_content = sum(1 for r in records if r.get("error_type") == "empty_content")
        json_invalid = sum(1 for r in records if r.get("error_type") == "json_invalid")
        schema_error = sum(1 for r in records if r.get("error_type") == "schema_error")
        no_candidates = sum(1 for r in records if r.get("error_type") == "no_candidates")

        latencies = [r.get("latency_ms", 0) for r in records if r.get("latency_ms", 0) > 0]
        avg_latency = sum(latencies) / len(latencies) if latencies else 0.0
        p50_latency = percentile(latencies, 50) if latencies else 0.0
        p95_latency = percentile(latencies, 95) if latencies else 0.0

        error_breakdown: Dict[str, int] = {}
        for r in records:
            err = r.get("error_type")
            if err:
                error_breakdown[err] = error_breakdown.get(err, 0) + 1

        raw_present_fail = sum(
            1 for r in records
            if r.get("raw_response_chars", 0) > 0 and r.get("status") == "failed"
        )
        clean_parse = sum(
            1 for r in records
            if r.get("status") == "success" and not r.get("repair_layer")
        )
        local_repair = sum(1 for r in records if r.get("repair_layer") == "local" and r.get("status") == "success")
        model_repair = sum(1 for r in records if r.get("repair_layer") == "model" and r.get("status") == "success")
        repair_failed = sum(1 for r in records if r.get("repair_layer") and r.get("status") == "failed")

        chapter_ids = set(r.get("chapter_id") for r in records)
        retry_queued = 0
        retry_success = 0
        retry_failed = 0
        retry_exhausted = 0
        for chapter_id in chapter_ids:
            jobs = retry_by_chapter.get(chapter_id, [])
            for job in jobs:
                retry_queued += 1
                if job.get("status") == "success":
                    retry_success += 1
                elif job.get("status") == "failed":
                    retry_failed += 1
                elif job.get("status") == "exhausted":
                    retry_exhausted += 1

        budget_deferred = sum(1 for r in records if r.get("budget_status") == "deferred")
        budget_exhausted = sum(
            1 for r in records
            if r.get("budget_deferred_reason") == "budget_exhausted"
        )
        est_tokens_total = sum(r.get("estimated_tokens", 0) for r in records)
        est_tokens_avg = est_tokens_total // total if total > 0 else 0
        est_calls_total = sum(r.get("estimated_model_calls", 0) for r in records)

        metrics = PerformanceProfileMetrics(
            total_attempts=total,
            success_count=success,
            failed_count=failed,
            timeout_count=timeout,
            rate_limited_count=rate_limited,
            gateway_timeout_count=gateway_timeout,
            empty_content_count=empty_content,
            json_invalid_count=json_invalid,
            schema_error_count=schema_error,
            no_candidates_count=no_candidates,
            avg_latency_ms=avg_latency,
            p50_latency_ms=p50_latency,
            p95_latency_ms=p95_latency,
            error_breakdown=error_breakdown,
            raw_response_present_failure_count=raw_present_fail,
            clean_parse_success_count=clean_parse,
            local_repair_success_count=local_repair,
            model_repair_success_count=model_repair,
            repair_failed_count=repair_failed,
            retry_queued_count=retry_queued,
            retry_success_count=retry_success,
            retry_failed_count=retry_failed,
            retry_exhausted_count=retry_exhausted,
            budget_deferred_count=budget_deferred,
            budget_exhausted_count=budget_exhausted,
            estimated_tokens_total=est_tokens_total,
            estimated_tokens_avg=est_tokens_avg,
            estimated_model_calls_total=est_calls_total,
        )
        metrics.recommendation_hint = recommendation_hints(
            metrics, metrics.confidence_level
        )
        return metrics
