"""Tests for Deadline and AttemptStore integration into ChapterIndexExtractor."""

import asyncio
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock

import pytest

from novelforge.extractors.base_extractor import ExtractionConfig
from novelforge.extractors.chapter_index_extractor import ChapterIndexExtractor, ChapterSource
from novelforge.services.attempt_store import AttemptRecord, AttemptStore
from novelforge.services.deadline import Deadline, DeadlineExceeded


class MemoryStorage:
    def __init__(self):
        self.data = {}

    async def save(self, key, value, storage_type=None):  # noqa: ANN001
        self.data[key] = value
        return True

    async def load(self, key, storage_type=None):  # noqa: ANN001
        return self.data.get(key)

    async def list_keys(self, storage_type=None):  # noqa: ANN001
        return list(self.data.keys())


class FakeAIService:
    """Fake AI service that returns valid JSON for testing."""

    def __init__(self, *, delay: float = 0.0, should_fail: bool = False):
        self.delay = delay
        self.should_fail = should_fail
        self.call_count = 0

    async def chat(self, prompt: str, *, max_tokens: int = 2500, timeout: float = 180.0) -> str:
        self.call_count += 1
        if self.delay > 0:
            await asyncio.sleep(self.delay)
        if self.should_fail:
            raise TimeoutError("Simulated timeout")
        return '{"chapter_characters": [], "chapter_interactions": [], "chapter_events": [], "chapter_world_facts": []}'


def _make_chapter(chapter_id: str = "ch-1", title: str = "第一章") -> Dict[str, Any]:
    return {"id": chapter_id, "title": title, "order": 1, "content": "测试内容"}


@pytest.mark.asyncio
async def test_extractor_records_attempts_to_store():
    """ChapterIndexExtractor 必须将尝试记录保存到 AttemptStore。"""
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    ai_service = FakeAIService()
    config = ExtractionConfig(timeout=180.0, max_retries=1)

    extractor = ChapterIndexExtractor(
        ai_service=ai_service,
        config=config,
        attempt_store=attempt_store,
    )

    result = await extractor.extract_and_merge([_make_chapter()])

    # 验证 AttemptStore 中有记录
    records = await attempt_store.list_by_chapter("ch-1")
    assert len(records) == 1
    assert records[0].status == "success"
    assert records[0].chapter_id == "ch-1"


@pytest.mark.asyncio
async def test_extractor_records_failed_attempt_to_store():
    """ChapterIndexExtractor 必须将失败尝试记录保存到 AttemptStore。"""
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    ai_service = FakeAIService(should_fail=True)
    config = ExtractionConfig(timeout=180.0, max_retries=1)

    extractor = ChapterIndexExtractor(
        ai_service=ai_service,
        config=config,
        attempt_store=attempt_store,
    )

    result = await extractor.extract_and_merge([_make_chapter()])

    # 验证 AttemptStore 中有失败记录（超时标记为 deadline_exceeded）
    records = await attempt_store.list_by_chapter("ch-1")
    assert len(records) == 1
    assert records[0].status == "deadline_exceeded"
    assert records[0].error_type == "timeout"


@pytest.mark.asyncio
async def test_extractor_injects_deadline():
    """ChapterIndexExtractor 必须在提取前创建 Deadline。"""
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    ai_service = FakeAIService()
    config = ExtractionConfig(timeout=180.0, max_retries=1)

    extractor = ChapterIndexExtractor(
        ai_service=ai_service,
        config=config,
        attempt_store=attempt_store,
    )

    result = await extractor.extract_and_merge([_make_chapter()])

    # 验证尝试记录中有 deadline_remaining_ms
    records = await attempt_store.list_by_chapter("ch-1")
    assert len(records) == 1
    assert records[0].deadline_remaining_ms is not None
    assert records[0].deadline_remaining_ms > 0


@pytest.mark.asyncio
async def test_extractor_deadline_exceeded():
    """ChapterIndexExtractor 必须在 Deadline 超时时标记 deadline_exceeded。"""
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    ai_service = FakeAIService(delay=0.1)  # 100ms 延迟
    config = ExtractionConfig(timeout=180.0, max_retries=1)

    extractor = ChapterIndexExtractor(
        ai_service=ai_service,
        config=config,
        attempt_store=attempt_store,
        deadline_seconds=0.05,  # 50ms deadline
    )

    result = await extractor.extract_and_merge([_make_chapter()])

    # 验证尝试记录中有 deadline_exceeded 状态
    records = await attempt_store.list_by_chapter("ch-1")
    assert len(records) == 1
    assert records[0].status == "deadline_exceeded"


@pytest.mark.asyncio
async def test_extractor_backward_compatible_without_store():
    """ChapterIndexExtractor 在没有 AttemptStore 时必须向后兼容。"""
    ai_service = FakeAIService()
    config = ExtractionConfig(timeout=180.0, max_retries=1)

    # 不传 attempt_store
    extractor = ChapterIndexExtractor(
        ai_service=ai_service,
        config=config,
    )

    result = await extractor.extract_and_merge([_make_chapter()])

    # 应该正常工作，没有异常
    assert result is not None


@pytest.mark.asyncio
async def test_extractor_multiple_chapters_recorded():
    """ChapterIndexExtractor 必须为每个章节创建独立的尝试记录。"""
    storage = MemoryStorage()
    attempt_store = AttemptStore(storage_manager=storage)
    ai_service = FakeAIService()
    config = ExtractionConfig(timeout=180.0, max_retries=1)

    extractor = ChapterIndexExtractor(
        ai_service=ai_service,
        config=config,
        attempt_store=attempt_store,
    )

    chapters = [
        _make_chapter("ch-1", "第一章"),
        _make_chapter("ch-2", "第二章"),
        _make_chapter("ch-3", "第三章"),
    ]

    result = await extractor.extract_and_merge(chapters)

    # 验证每个章节都有记录
    for chapter_id in ["ch-1", "ch-2", "ch-3"]:
        records = await attempt_store.list_by_chapter(chapter_id)
        assert len(records) == 1
        assert records[0].status == "success"
