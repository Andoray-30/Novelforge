"""Centralized attempt tracking for long-form extraction reliability."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


ATTEMPT_KEY_PREFIX = "attempt_"


def _now_iso() -> str:
    return datetime.now().isoformat()


def _generate_id() -> str:
    return str(uuid.uuid4())[:20]


class AttemptRecord(BaseModel):
    """Persistent record of a single extraction attempt.

    Follows the key pattern: attempt_{uuid}
    Compatible with diagnostics_recorder contract.
    """

    id: str
    session_id: str
    chapter_id: str
    chapter_title: str
    chapter_order: int
    attempt_number: int
    status: str  # pending | running | success | failed | deadline_exceeded | skipped
    model_used: str
    timeout: float
    max_tokens: int
    latency_ms: int
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    raw_response_hash: Optional[str] = None
    raw_response_chars: int = 0
    parsed_candidate_counts: Dict[str, int] = Field(default_factory=dict)
    retry_count: int = 0
    needs_retry: bool = False
    deadline_remaining_ms: Optional[int] = None
    created_at: str = Field(default_factory=_now_iso)

    # Schema repair tracking fields
    raw_response_text: Optional[str] = None  # Truncated to 2000 chars on failure
    repair_layer: Optional[str] = None  # "local" | "model" | None
    repair_fixes: List[str] = Field(default_factory=list)
    repair_model_used: Optional[str] = None
    repair_latency_ms: int = 0


class AttemptStats(BaseModel):
    """Aggregated statistics for attempt records."""

    total_attempts: int = 0
    success_count: int = 0
    failed_count: int = 0
    deadline_exceeded_count: int = 0
    skipped_count: int = 0
    avg_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    error_breakdown: Dict[str, int] = Field(default_factory=dict)
    chapters_with_attempts: int = 0
    chapters_needing_retry: int = 0

    # Schema repair statistics
    repair_local_count: int = 0
    repair_model_count: int = 0
    repair_failed_count: int = 0
    repair_success_rate: float = 0.0


class AttemptStore:
    """Centralized store for extraction attempt records.

    Uses StorageManager for persistence with attempt_ key prefix.
    Thread-safe for concurrent chapter extraction.
    """

    def __init__(self, storage_manager: Any):
        self._storage = storage_manager
        self._lock = asyncio.Lock()

    async def record(self, record: AttemptRecord) -> str:
        """Persist an attempt record. Returns the record id."""
        key = f"{ATTEMPT_KEY_PREFIX}{record.id}"
        data = record.model_dump(mode="json")
        async with self._lock:
            await self._storage.save(key, data)
        return record.id

    async def get(self, attempt_id: str) -> Optional[AttemptRecord]:
        """Load an attempt record by id."""
        key = f"{ATTEMPT_KEY_PREFIX}{attempt_id}"
        data = await self._storage.load(key)
        if data is None:
            return None
        return AttemptRecord(**data)

    async def list_by_session(self, session_id: str) -> List[AttemptRecord]:
        """List all attempts for a given session."""
        all_keys = await self._storage.list_keys()
        attempt_keys = [k for k in all_keys if k.startswith(ATTEMPT_KEY_PREFIX)]

        results: List[AttemptRecord] = []
        for key in attempt_keys:
            data = await self._storage.load(key)
            if data and data.get("session_id") == session_id:
                results.append(AttemptRecord(**data))

        results.sort(key=lambda r: (r.chapter_order, r.attempt_number))
        return results

    async def list_by_chapter(self, chapter_id: str) -> List[AttemptRecord]:
        """List all attempts for a given chapter."""
        all_keys = await self._storage.list_keys()
        attempt_keys = [k for k in all_keys if k.startswith(ATTEMPT_KEY_PREFIX)]

        results: List[AttemptRecord] = []
        for key in attempt_keys:
            data = await self._storage.load(key)
            if data and data.get("chapter_id") == chapter_id:
                results.append(AttemptRecord(**data))

        results.sort(key=lambda r: r.attempt_number)
        return results

    async def stats(self, session_id: Optional[str] = None) -> AttemptStats:
        """Compute aggregate statistics for attempts."""
        if session_id:
            records = await self.list_by_session(session_id)
        else:
            all_keys = await self._storage.list_keys()
            attempt_keys = [k for k in all_keys if k.startswith(ATTEMPT_KEY_PREFIX)]
            records = []
            for key in attempt_keys:
                data = await self._storage.load(key)
                if data:
                    records.append(AttemptRecord(**data))

        if not records:
            return AttemptStats()

        total = len(records)
        success = sum(1 for r in records if r.status == "success")
        failed = sum(1 for r in records if r.status == "failed")
        deadline_exceeded = sum(1 for r in records if r.status == "deadline_exceeded")
        skipped = sum(1 for r in records if r.status == "skipped")

        latencies = [r.latency_ms for r in records if r.latency_ms > 0]
        avg_latency = sum(latencies) / len(latencies) if latencies else 0.0
        p95_latency = sorted(latencies)[int(len(latencies) * 0.95)] if latencies else 0.0

        error_breakdown: Dict[str, int] = {}
        for r in records:
            if r.error_type:
                error_breakdown[r.error_type] = error_breakdown.get(r.error_type, 0) + 1

        chapters = set(r.chapter_id for r in records)
        chapters_needing_retry = set(r.chapter_id for r in records if r.needs_retry)

        # Schema repair statistics
        repair_local = sum(1 for r in records if r.repair_layer == "local")
        repair_model = sum(1 for r in records if r.repair_layer == "model")
        repair_failed = sum(1 for r in records if r.repair_layer is not None and r.status == "failed")
        repair_total = repair_local + repair_model + repair_failed
        repair_success_rate = (repair_local + repair_model) / repair_total if repair_total > 0 else 0.0

        return AttemptStats(
            total_attempts=total,
            success_count=success,
            failed_count=failed,
            deadline_exceeded_count=deadline_exceeded,
            skipped_count=skipped,
            avg_latency_ms=avg_latency,
            p95_latency_ms=p95_latency,
            error_breakdown=error_breakdown,
            chapters_with_attempts=len(chapters),
            chapters_needing_retry=len(chapters_needing_retry),
            repair_local_count=repair_local,
            repair_model_count=repair_model,
            repair_failed_count=repair_failed,
            repair_success_rate=repair_success_rate,
        )
