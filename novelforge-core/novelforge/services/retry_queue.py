"""Retry Queue for failed extraction attempts.

Provides controlled retry mechanism for provider failures (429, 504, timeout, etc.).
Does not retry successful chapters. Uses exponential backoff with jitter.
"""

from __future__ import annotations

import asyncio
import random
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .attempt_store import AttemptStore
from .error_classifier import classify_error, is_retryable


RETRY_JOB_KEY_PREFIX = "retry_job_"


def _now_iso() -> str:
    return datetime.now().isoformat()


def _generate_id() -> str:
    return str(uuid.uuid4())[:20]


class RetrySourceRef(BaseModel):
    kind: str = "content_item"
    content_id: str
    session_id: str
    parent_id: Optional[str] = None
    import_task_id: Optional[str] = None


class RetryJob(BaseModel):
    job_id: str
    session_id: str
    chapter_id: str
    chapter_title: str
    chapter_order: int
    error_type: str
    error_message: str
    original_attempt_id: str
    model_used: str
    source_ref: Optional[RetrySourceRef] = None
    status: str = "pending"
    retry_count: int = 0
    max_retries: int = 3
    next_retry_at: Optional[str] = None
    base_delay_seconds: float = 30.0
    backoff_multiplier: float = 2.0
    max_delay_seconds: float = 300.0
    jitter_factor: float = 0.3
    last_error_type: Optional[str] = None
    last_error_message: Optional[str] = None
    result_attempt_id: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)
    completed_at: Optional[str] = None

    model_config = {"extra": "ignore"}


class RetryQueueStats(BaseModel):
    total_jobs: int = 0
    pending_count: int = 0
    waiting_count: int = 0
    running_count: int = 0
    success_count: int = 0
    failed_count: int = 0
    exhausted_count: int = 0
    cancelled_count: int = 0
    error_breakdown: Dict[str, int] = Field(default_factory=dict)
    avg_retries_to_success: float = 0.0


class RetryQueue:
    def __init__(self, storage_manager: Any, attempt_store: AttemptStore):
        self._storage = storage_manager
        self._attempt_store = attempt_store
        self._lock = asyncio.Lock()

    async def enqueue(self, job: RetryJob) -> str:
        key = f"{RETRY_JOB_KEY_PREFIX}{job.job_id}"
        data = job.model_dump(mode="json")
        async with self._lock:
            await self._storage.save(key, data)
        return job.job_id

    async def get(self, job_id: str) -> Optional[RetryJob]:
        key = f"{RETRY_JOB_KEY_PREFIX}{job_id}"
        data = await self._storage.load(key)
        if data is None:
            return None
        return RetryJob(**data)

    async def list_pending(self, session_id: Optional[str] = None) -> List[RetryJob]:
        all_keys = await self._storage.list_keys()
        job_keys = [k for k in all_keys if k.startswith(RETRY_JOB_KEY_PREFIX)]
        now = datetime.now()
        results: List[RetryJob] = []
        for key in job_keys:
            data = await self._storage.load(key)
            if data is None:
                continue
            job = RetryJob(**data)
            if session_id and job.session_id != session_id:
                continue
            if job.status == "pending":
                if job.next_retry_at is None:
                    results.append(job)
                else:
                    next_at = datetime.fromisoformat(job.next_retry_at)
                    if now >= next_at:
                        results.append(job)
        results.sort(key=lambda j: (j.chapter_order, j.retry_count))
        return results

    async def list_by_session(self, session_id: str) -> List[RetryJob]:
        all_keys = await self._storage.list_keys()
        job_keys = [k for k in all_keys if k.startswith(RETRY_JOB_KEY_PREFIX)]
        results: List[RetryJob] = []
        for key in job_keys:
            data = await self._storage.load(key)
            if data and data.get("session_id") == session_id:
                results.append(RetryJob(**data))
        results.sort(key=lambda j: (j.chapter_order, j.retry_count))
        return results

    async def list_by_chapter(self, chapter_id: str, session_id: Optional[str] = None) -> List[RetryJob]:
        all_keys = await self._storage.list_keys()
        job_keys = [k for k in all_keys if k.startswith(RETRY_JOB_KEY_PREFIX)]
        results: List[RetryJob] = []
        for key in job_keys:
            data = await self._storage.load(key)
            if data and data.get("chapter_id") == chapter_id:
                if session_id and data.get("session_id") != session_id:
                    continue
                results.append(RetryJob(**data))
        results.sort(key=lambda j: j.retry_count)
        return results

    async def mark_running(self, job_id: str) -> None:
        job = await self.get(job_id)
        if job is None:
            return
        job.status = "running"
        job.updated_at = _now_iso()
        await self.enqueue(job)

    async def mark_success(self, job_id: str, result_attempt_id: str) -> None:
        job = await self.get(job_id)
        if job is None:
            return
        job.status = "success"
        job.result_attempt_id = result_attempt_id
        job.completed_at = _now_iso()
        job.updated_at = _now_iso()
        await self.enqueue(job)

    async def mark_failed(self, job_id: str, error_type: str, error_message: str) -> None:
        job = await self.get(job_id)
        if job is None:
            return
        job.retry_count += 1
        job.last_error_type = error_type
        job.last_error_message = error_message
        job.updated_at = _now_iso()
        if job.retry_count >= job.max_retries:
            job.status = "exhausted"
            job.completed_at = _now_iso()
        else:
            delay = self.compute_next_delay(job.retry_count, job)
            next_at = datetime.now() + timedelta(seconds=delay)
            job.next_retry_at = next_at.isoformat()
            job.status = "pending"
        await self.enqueue(job)

    async def mark_cancelled(self, job_id: str) -> None:
        job = await self.get(job_id)
        if job is None:
            return
        job.status = "cancelled"
        job.completed_at = _now_iso()
        job.updated_at = _now_iso()
        await self.enqueue(job)

    async def mark_deferred(self, job_id: str, reason: str, delay_seconds: Optional[float] = None) -> None:
        job = await self.get(job_id)
        if job is None:
            return
        job.status = "waiting"
        job.last_error_type = reason
        job.last_error_message = f"Deferred: {reason}"
        job.updated_at = _now_iso()
        if delay_seconds is not None:
            next_at = datetime.now() + timedelta(seconds=delay_seconds)
            job.next_retry_at = next_at.isoformat()
        await self.enqueue(job)

    def compute_next_delay(self, retry_count: int, job: Optional[RetryJob] = None) -> float:
        base = job.base_delay_seconds if job else 30.0
        multiplier = job.backoff_multiplier if job else 2.0
        max_delay = job.max_delay_seconds if job else 300.0
        jitter = job.jitter_factor if job else 0.3
        delay = base * (multiplier ** retry_count)
        delay = min(delay, max_delay)
        jitter_range = delay * jitter
        delay += random.uniform(-jitter_range, jitter_range)
        return max(0, delay)

    async def should_skip_chapter(self, chapter_id: str, session_id: Optional[str] = None) -> bool:
        records = await self._attempt_store.list_by_chapter(chapter_id, session_id=session_id)
        return any(r.status == "success" for r in records)

    async def stats(self, session_id: Optional[str] = None) -> RetryQueueStats:
        if session_id:
            jobs = await self.list_by_session(session_id)
        else:
            all_keys = await self._storage.list_keys()
            job_keys = [k for k in all_keys if k.startswith(RETRY_JOB_KEY_PREFIX)]
            jobs = []
            for key in job_keys:
                data = await self._storage.load(key)
                if data:
                    jobs.append(RetryJob(**data))

        if not jobs:
            return RetryQueueStats()

        total = len(jobs)
        pending = sum(1 for j in jobs if j.status == "pending")
        waiting = sum(1 for j in jobs if j.status == "waiting")
        running = sum(1 for j in jobs if j.status == "running")
        success = sum(1 for j in jobs if j.status == "success")
        failed = sum(1 for j in jobs if j.status == "failed")
        exhausted = sum(1 for j in jobs if j.status == "exhausted")
        cancelled = sum(1 for j in jobs if j.status == "cancelled")

        error_breakdown: Dict[str, int] = {}
        for j in jobs:
            if j.error_type:
                error_breakdown[j.error_type] = error_breakdown.get(j.error_type, 0) + 1

        success_jobs = [j for j in jobs if j.status == "success"]
        avg_retries = sum(j.retry_count for j in success_jobs) / len(success_jobs) if success_jobs else 0.0

        return RetryQueueStats(
            total_jobs=total,
            pending_count=pending,
            waiting_count=waiting,
            running_count=running,
            success_count=success,
            failed_count=failed,
            exhausted_count=exhausted,
            cancelled_count=cancelled,
            error_breakdown=error_breakdown,
            avg_retries_to_success=avg_retries,
        )
