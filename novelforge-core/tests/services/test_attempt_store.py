"""Tests for AttemptRecord and AttemptStore."""

import asyncio

import pytest

from novelforge.services.attempt_store import ATTEMPT_KEY_PREFIX, AttemptRecord, AttemptStore


class MemoryStorage:
    """Minimal in-memory storage for unit tests."""

    def __init__(self):
        self.data = {}

    async def save(self, key, value, storage_type=None):  # noqa: ANN001
        self.data[key] = value
        return True

    async def load(self, key, storage_type=None):  # noqa: ANN001
        return self.data.get(key)

    async def list_keys(self, storage_type=None):  # noqa: ANN001
        return list(self.data.keys())


def _make_record(**overrides) -> AttemptRecord:
    """Helper to create a valid AttemptRecord with defaults."""
    defaults = {
        "id": "attempt-001",
        "session_id": "session-a",
        "chapter_id": "chapter-1",
        "chapter_title": "第一章",
        "chapter_order": 1,
        "attempt_number": 1,
        "status": "success",
        "model_used": "test-model",
        "timeout": 180.0,
        "max_tokens": 2500,
        "latency_ms": 2400,
        "error_type": None,
        "error_message": None,
        "raw_response_hash": "abc123",
        "raw_response_chars": 500,
        "parsed_candidate_counts": {"characters": 3, "interactions": 2},
        "retry_count": 0,
        "needs_retry": False,
        "deadline_remaining_ms": 5000,
        "created_at": "2026-06-03T12:00:00",
    }
    defaults.update(overrides)
    return AttemptRecord(**defaults)


# === AttemptRecord Tests ===


def test_attempt_record_has_required_fields():
    """AttemptRecord 必须包含所有必需字段。"""
    record = _make_record()

    # 核心标识字段
    assert record.id == "attempt-001"
    assert record.session_id == "session-a"
    assert record.chapter_id == "chapter-1"
    assert record.chapter_title == "第一章"
    assert record.chapter_order == 1

    # 尝试状态字段
    assert record.attempt_number == 1
    assert record.status == "success"
    assert record.model_used == "test-model"

    # 配置字段
    assert record.timeout == 180.0
    assert record.max_tokens == 2500

    # 性能字段
    assert record.latency_ms == 2400

    # 错误字段
    assert record.error_type is None
    assert record.error_message is None

    # 响应字段
    assert record.raw_response_hash == "abc123"
    assert record.raw_response_chars == 500
    assert record.parsed_candidate_counts == {"characters": 3, "interactions": 2}

    # 重试字段
    assert record.retry_count == 0
    assert record.needs_retry is False

    # Deadline 字段
    assert record.deadline_remaining_ms == 5000

    # 时间戳
    assert record.created_at == "2026-06-03T12:00:00"


def test_attempt_record_status_values():
    """AttemptRecord.status 必须支持所有合法值。"""
    valid_statuses = ["pending", "running", "success", "failed", "deadline_exceeded", "skipped"]

    for status in valid_statuses:
        record = _make_record(status=status)
        assert record.status == status


def test_attempt_record_error_fields_for_failed_attempt():
    """失败的 AttemptRecord 必须包含 error_type 和 error_message。"""
    record = _make_record(
        status="failed",
        error_type="timeout",
        error_message="Request timed out after 180s",
    )

    assert record.status == "failed"
    assert record.error_type == "timeout"
    assert record.error_message == "Request timed out after 180s"


def test_attempt_record_serializes_to_dict():
    """AttemptRecord 必须能序列化为字典。"""
    record = _make_record()
    data = record.model_dump()

    assert isinstance(data, dict)
    assert data["id"] == "attempt-001"
    assert data["status"] == "success"
    assert data["latency_ms"] == 2400


def test_attempt_record_deserializes_from_dict():
    """AttemptRecord 必须能从字典反序列化。"""
    data = {
        "id": "attempt-002",
        "session_id": "session-b",
        "chapter_id": "chapter-2",
        "chapter_title": "第二章",
        "chapter_order": 2,
        "attempt_number": 1,
        "status": "failed",
        "model_used": "test-model",
        "timeout": 180.0,
        "max_tokens": 2500,
        "latency_ms": 3000,
        "error_type": "gateway_timeout",
        "error_message": "504 Gateway Timeout",
        "raw_response_hash": None,
        "raw_response_chars": 0,
        "parsed_candidate_counts": {},
        "retry_count": 0,
        "needs_retry": True,
        "deadline_remaining_ms": None,
        "created_at": "2026-06-03T12:00:00",
    }
    record = AttemptRecord(**data)

    assert record.id == "attempt-002"
    assert record.status == "failed"
    assert record.error_type == "gateway_timeout"
    assert record.needs_retry is True


# === AttemptStore Tests ===


@pytest.mark.asyncio
async def test_attempt_store_save_and_load():
    """AttemptStore 必须能保存和加载 AttemptRecord。"""
    storage = MemoryStorage()
    store = AttemptStore(storage_manager=storage)

    record = _make_record()
    await store.record(record)

    loaded = await store.get("attempt-001")
    assert loaded is not None
    assert loaded.id == "attempt-001"
    assert loaded.status == "success"


@pytest.mark.asyncio
async def test_attempt_store_key_prefix():
    """AttemptStore 必须使用 attempt_ 前缀。"""
    storage = MemoryStorage()
    store = AttemptStore(storage_manager=storage)

    record = _make_record()
    await store.record(record)

    keys = list(storage.data.keys())
    assert len(keys) == 1
    assert keys[0].startswith(ATTEMPT_KEY_PREFIX)


@pytest.mark.asyncio
async def test_attempt_store_list_by_session():
    """AttemptStore 必须能按 session_id 查询。"""
    storage = MemoryStorage()
    store = AttemptStore(storage_manager=storage)

    # 保存不同 session 的记录
    await store.record(_make_record(id="a1", session_id="session-a", chapter_id="ch-1"))
    await store.record(_make_record(id="a2", session_id="session-a", chapter_id="ch-2"))
    await store.record(_make_record(id="a3", session_id="session-b", chapter_id="ch-3"))

    results = await store.list_by_session("session-a")
    assert len(results) == 2
    assert all(r.session_id == "session-a" for r in results)


@pytest.mark.asyncio
async def test_attempt_store_list_by_session_filters_task_type_and_paginates():
    storage = MemoryStorage()
    store = AttemptStore(storage_manager=storage)

    await store.record(_make_record(id="a1", task_type="chapter_index", chapter_order=1))
    await store.record(_make_record(id="a2", task_type="deep_synthesis_apply", chapter_order=2))
    await store.record(_make_record(id="a3", task_type="deep_synthesis_apply", chapter_order=3))
    await store.record(_make_record(id="a4", task_type="deep_synthesis_apply", chapter_order=4))

    items, total = await store.list_by_session(
        "session-a",
        task_type="deep_synthesis_apply",
        limit=2,
        offset=1,
    )

    assert total == 3
    assert [record.id for record in items] == ["a3", "a4"]
    assert all(record.task_type == "deep_synthesis_apply" for record in items)


@pytest.mark.asyncio
async def test_attempt_store_list_by_chapter():
    """AttemptStore 必须能按 chapter_id 查询。"""
    storage = MemoryStorage()
    store = AttemptStore(storage_manager=storage)

    await store.record(_make_record(id="a1", chapter_id="ch-1", attempt_number=1))
    await store.record(_make_record(id="a2", chapter_id="ch-1", attempt_number=2))
    await store.record(_make_record(id="a3", chapter_id="ch-2", attempt_number=1))

    results = await store.list_by_chapter("ch-1")
    assert len(results) == 2
    assert all(r.chapter_id == "ch-1" for r in results)


@pytest.mark.asyncio
async def test_attempt_store_concurrent_writes():
    """AttemptStore 必须支持并发写入。"""
    storage = MemoryStorage()
    store = AttemptStore(storage_manager=storage)

    async def write_record(i: int):
        await store.record(_make_record(id=f"a{i}", session_id="session-a", chapter_id=f"ch-{i}"))

    # 并发写入 10 条记录
    await asyncio.gather(*[write_record(i) for i in range(10)])

    results = await store.list_by_session("session-a")
    assert len(results) == 10


@pytest.mark.asyncio
async def test_attempt_store_stats():
    """AttemptStore 必须能计算统计信息。"""
    storage = MemoryStorage()
    store = AttemptStore(storage_manager=storage)

    # 保存成功和失败的记录
    await store.record(_make_record(id="a1", status="success", latency_ms=1000))
    await store.record(_make_record(id="a2", status="success", latency_ms=2000))
    await store.record(_make_record(id="a3", status="failed", error_type="timeout", latency_ms=3000))
    await store.record(_make_record(id="a4", status="deadline_exceeded", latency_ms=5000))

    stats = await store.stats(session_id="session-a")

    assert stats.total_attempts == 4
    assert stats.success_count == 2
    assert stats.failed_count == 1
    assert stats.deadline_exceeded_count == 1
    assert stats.avg_latency_ms == 2750.0  # (1000+2000+3000+5000)/4
