"""Tests for RetryQueue — controlled retry mechanism for failed extraction attempts."""

import asyncio
from datetime import datetime, timedelta

import pytest

from novelforge.services.attempt_store import AttemptRecord, AttemptStore
from novelforge.services.retry_queue import RetryJob, RetryQueue, RetryQueueStats, RetrySourceRef


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


def _make_job(**overrides) -> RetryJob:
    defaults = {
        "job_id": "job-001",
        "session_id": "session-a",
        "chapter_id": "chapter-1",
        "chapter_title": "第一章",
        "chapter_order": 1,
        "error_type": "rate_limited",
        "error_message": "429 Too Many Requests",
        "original_attempt_id": "chapter-1-attempt-1",
        "model_used": "test-model",
        "source_ref": RetrySourceRef(
            kind="content_item",
            content_id="chapter-1",
            session_id="session-a",
        ),
    }
    defaults.update(overrides)
    return RetryJob(**defaults)


def _make_attempt(chapter_id: str = "chapter-1", status: str = "failed", **overrides) -> AttemptRecord:
    defaults = {
        "id": f"{chapter_id}-attempt-1",
        "session_id": "session-a",
        "chapter_id": chapter_id,
        "chapter_title": "第一章",
        "chapter_order": 1,
        "attempt_number": 1,
        "status": status,
        "model_used": "test-model",
        "timeout": 180.0,
        "max_tokens": 2500,
        "latency_ms": 2400,
    }
    defaults.update(overrides)
    return AttemptRecord(**defaults)


# === RetryJob Tests ===


def test_retry_job_has_required_fields():
    job = _make_job()
    assert job.job_id == "job-001"
    assert job.session_id == "session-a"
    assert job.chapter_id == "chapter-1"
    assert job.chapter_title == "第一章"
    assert job.chapter_order == 1
    assert job.error_type == "rate_limited"
    assert job.error_message == "429 Too Many Requests"
    assert job.original_attempt_id == "chapter-1-attempt-1"
    assert job.model_used == "test-model"


def test_retry_job_default_values():
    job = _make_job()
    assert job.status == "pending"
    assert job.retry_count == 0
    assert job.max_retries == 3
    assert job.next_retry_at is None
    assert job.base_delay_seconds == 30.0
    assert job.backoff_multiplier == 2.0
    assert job.max_delay_seconds == 300.0
    assert job.jitter_factor == 0.3
    assert job.last_error_type is None
    assert job.last_error_message is None
    assert job.result_attempt_id is None
    assert job.completed_at is None


def test_retry_job_serializes_to_dict():
    job = _make_job()
    data = job.model_dump()
    assert isinstance(data, dict)
    assert data["job_id"] == "job-001"
    assert data["status"] == "pending"


def test_retry_job_deserializes_from_dict():
    data = {
        "job_id": "job-002",
        "session_id": "session-b",
        "chapter_id": "chapter-2",
        "chapter_title": "第二章",
        "chapter_order": 2,
        "error_type": "timeout",
        "error_message": "Request timed out",
        "original_attempt_id": "chapter-2-attempt-1",
        "model_used": "test-model",
        "status": "exhausted",
        "retry_count": 3,
        "max_retries": 3,
    }
    job = RetryJob(**data)
    assert job.job_id == "job-002"
    assert job.status == "exhausted"
    assert job.retry_count == 3


# === RetryQueue Tests ===


@pytest.mark.asyncio
async def test_enqueue_persists_to_storage():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    job = _make_job()
    job_id = await queue.enqueue(job)
    loaded = await queue.get(job_id)
    assert loaded is not None
    assert loaded.chapter_id == "chapter-1"


@pytest.mark.asyncio
async def test_get_nonexistent_job_returns_none():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    loaded = await queue.get("nonexistent")
    assert loaded is None


@pytest.mark.asyncio
async def test_list_pending_filters_by_time():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    now = datetime.now()
    past = (now - timedelta(seconds=10)).isoformat()
    future = (now + timedelta(seconds=10)).isoformat()
    await queue.enqueue(_make_job(job_id="job-1", next_retry_at=past))
    await queue.enqueue(_make_job(job_id="job-2", next_retry_at=future))
    await queue.enqueue(_make_job(job_id="job-3", next_retry_at=None))
    pending = await queue.list_pending()
    assert len(pending) == 2
    assert any(j.job_id == "job-1" for j in pending)
    assert any(j.job_id == "job-3" for j in pending)


@pytest.mark.asyncio
async def test_list_pending_filters_by_session():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    await queue.enqueue(_make_job(job_id="job-1", session_id="session-a"))
    await queue.enqueue(_make_job(job_id="job-2", session_id="session-b"))
    pending = await queue.list_pending(session_id="session-a")
    assert len(pending) == 1
    assert pending[0].session_id == "session-a"


@pytest.mark.asyncio
async def test_list_by_session():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    await queue.enqueue(_make_job(job_id="job-1", session_id="session-a"))
    await queue.enqueue(_make_job(job_id="job-2", session_id="session-a"))
    await queue.enqueue(_make_job(job_id="job-3", session_id="session-b"))
    jobs = await queue.list_by_session("session-a")
    assert len(jobs) == 2


@pytest.mark.asyncio
async def test_list_by_chapter():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    await queue.enqueue(_make_job(job_id="job-1", chapter_id="ch-1"))
    await queue.enqueue(_make_job(job_id="job-2", chapter_id="ch-1"))
    await queue.enqueue(_make_job(job_id="job-3", chapter_id="ch-2"))
    jobs = await queue.list_by_chapter("ch-1")
    assert len(jobs) == 2


@pytest.mark.asyncio
async def test_mark_running_updates_status():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    await queue.enqueue(_make_job())
    await queue.mark_running("job-001")
    loaded = await queue.get("job-001")
    assert loaded.status == "running"


@pytest.mark.asyncio
async def test_mark_success_updates_status_and_timestamp():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    await queue.enqueue(_make_job())
    await queue.mark_success("job-001", "result-attempt-1")
    loaded = await queue.get("job-001")
    assert loaded.status == "success"
    assert loaded.result_attempt_id == "result-attempt-1"
    assert loaded.completed_at is not None


@pytest.mark.asyncio
async def test_mark_failed_increments_retry_count():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    await queue.enqueue(_make_job())
    await queue.mark_failed("job-001", "timeout", "Request timed out")
    loaded = await queue.get("job-001")
    assert loaded.retry_count == 1
    assert loaded.last_error_type == "timeout"
    assert loaded.last_error_message == "Request timed out"


@pytest.mark.asyncio
async def test_mark_failed_sets_exhausted_when_max_retries():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    await queue.enqueue(_make_job(max_retries=2, retry_count=1))
    await queue.mark_failed("job-001", "timeout", "Request timed out")
    loaded = await queue.get("job-001")
    assert loaded.status == "exhausted"
    assert loaded.retry_count == 2
    assert loaded.completed_at is not None


@pytest.mark.asyncio
async def test_mark_failed_computes_next_retry_at():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    await queue.enqueue(_make_job())
    await queue.mark_failed("job-001", "timeout", "Request timed out")
    loaded = await queue.get("job-001")
    assert loaded.next_retry_at is not None
    assert loaded.status == "pending"


@pytest.mark.asyncio
async def test_mark_cancelled():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    await queue.enqueue(_make_job())
    await queue.mark_cancelled("job-001")
    loaded = await queue.get("job-001")
    assert loaded.status == "cancelled"
    assert loaded.completed_at is not None


def test_compute_next_delay_exponential():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    job = _make_job(base_delay_seconds=30.0, backoff_multiplier=2.0, max_delay_seconds=300.0, jitter_factor=0.0)
    delay0 = queue.compute_next_delay(0, job)
    delay1 = queue.compute_next_delay(1, job)
    delay2 = queue.compute_next_delay(2, job)
    assert delay0 == 30.0
    assert delay1 == 60.0
    assert delay2 == 120.0


def test_compute_next_delay_capped_at_max():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    job = _make_job(base_delay_seconds=30.0, backoff_multiplier=2.0, max_delay_seconds=100.0, jitter_factor=0.0)
    delay = queue.compute_next_delay(10, job)
    assert delay == 100.0


def test_compute_next_delay_with_jitter():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    job = _make_job(base_delay_seconds=100.0, backoff_multiplier=1.0, max_delay_seconds=300.0, jitter_factor=0.3)
    delays = [queue.compute_next_delay(0, job) for _ in range(100)]
    assert all(70.0 <= d <= 130.0 for d in delays)
    assert len(set(delays)) > 1


@pytest.mark.asyncio
async def test_should_skip_chapter_returns_true_for_success():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    await attempt_store.record(_make_attempt(status="success"))
    assert await queue.should_skip_chapter("chapter-1") is True


@pytest.mark.asyncio
async def test_should_skip_chapter_returns_false_for_failure():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    await attempt_store.record(_make_attempt(status="failed"))
    assert await queue.should_skip_chapter("chapter-1") is False


@pytest.mark.asyncio
async def test_stats_counts_by_status():
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)
    await queue.enqueue(_make_job(job_id="j1", status="pending"))
    await queue.enqueue(_make_job(job_id="j2", status="success"))
    await queue.enqueue(_make_job(job_id="j3", status="exhausted"))
    await queue.enqueue(_make_job(job_id="j4", status="pending", error_type="timeout"))
    stats = await queue.stats()
    assert stats.total_jobs == 4
    assert stats.pending_count == 2
    assert stats.success_count == 1
    assert stats.exhausted_count == 1
    assert stats.error_breakdown["rate_limited"] == 3
    assert stats.error_breakdown["timeout"] == 1


# === RetrySourceRef Tests ===


def test_retry_job_uses_source_ref_not_chapter_content():
    """RetryJob 必须使用 source_ref 而不是 chapter_content。"""
    from novelforge.services.retry_queue import RetrySourceRef

    source_ref = RetrySourceRef(
        kind="content_item",
        content_id="chapter-1",
        session_id="session-a",
    )
    job = _make_job(source_ref=source_ref)
    assert job.source_ref is not None
    assert job.source_ref.kind == "content_item"
    assert job.source_ref.content_id == "chapter-1"
    assert job.source_ref.session_id == "session-a"


def test_retry_job_serializes_without_chapter_content():
    """RetryJob 序列化时不能包含 chapter_content。"""
    from novelforge.services.retry_queue import RetrySourceRef

    source_ref = RetrySourceRef(
        kind="content_item",
        content_id="chapter-1",
        session_id="session-a",
    )
    job = _make_job(source_ref=source_ref)
    data = job.model_dump()
    assert "chapter_content" not in data
    assert "source_ref" in data
    assert data["source_ref"]["kind"] == "content_item"


def test_retry_job_ignores_legacy_chapter_content_on_load():
    """RetryJob 必须忽略旧的 chapter_content 字段。"""
    legacy_data = {
        "job_id": "job-legacy",
        "session_id": "session-a",
        "chapter_id": "chapter-1",
        "chapter_title": "第一章",
        "chapter_order": 1,
        "error_type": "timeout",
        "error_message": "Request timed out",
        "original_attempt_id": "chapter-1-attempt-1",
        "model_used": "test-model",
        "chapter_content": "这是旧的章节内容，不应该被保留",
    }
    job = RetryJob(**legacy_data)
    data = job.model_dump()
    assert "chapter_content" not in data


@pytest.mark.asyncio
async def test_enqueue_does_not_persist_chapter_content():
    """enqueue 不能持久化 chapter_content。"""
    from novelforge.services.retry_queue import RetrySourceRef

    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    queue = RetryQueue(storage_manager=storage, attempt_store=attempt_store)

    source_ref = RetrySourceRef(
        kind="content_item",
        content_id="chapter-1",
        session_id="session-a",
    )
    job = _make_job(source_ref=source_ref)
    await queue.enqueue(job)

    stored_data = storage.data.get("retry_job_job-001")
    assert stored_data is not None
    assert "chapter_content" not in stored_data
    assert "source_ref" in stored_data
