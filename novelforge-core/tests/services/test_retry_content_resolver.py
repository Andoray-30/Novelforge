"""Tests for RetryContentResolver — loads chapter content from ContentManager by source_ref."""

import pytest

from novelforge.services.retry_queue import RetryJob, RetrySourceRef


class FakeContentItem:
    def __init__(self, content_id, content, session_id, parent_id=None, content_type="chapter"):
        self.metadata = type("Metadata", (), {
            "id": content_id,
            "session_id": session_id,
            "parent_id": parent_id,
            "type": content_type,
        })()
        self.content = content


class FakeContentManager:
    def __init__(self, items=None):
        self._items = {item.metadata.id: item for item in (items or [])}

    async def get_content(self, content_id):
        return self._items.get(content_id)


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


@pytest.mark.asyncio
async def test_resolver_loads_chapter_content_from_content_item_ref():
    from novelforge.services.retry_content_resolver import RetryContentResolver

    item = FakeContentItem(
        content_id="chapter-1",
        content="这是第一章的正文内容",
        session_id="session-a",
    )
    manager = FakeContentManager([item])
    resolver = RetryContentResolver(content_manager=manager)

    job = _make_job()
    result = await resolver.resolve(job)

    assert result["id"] == "chapter-1"
    assert result["content"] == "这是第一章的正文内容"
    assert result["title"] == "第一章"


@pytest.mark.asyncio
async def test_resolver_rejects_missing_source_ref():
    from novelforge.services.retry_content_resolver import RetryContentResolver

    manager = FakeContentManager()
    resolver = RetryContentResolver(content_manager=manager)

    job = _make_job(source_ref=None)
    with pytest.raises(ValueError, match="retry_source_ref_missing"):
        await resolver.resolve(job)


@pytest.mark.asyncio
async def test_resolver_rejects_missing_content_item():
    from novelforge.services.retry_content_resolver import RetryContentResolver

    manager = FakeContentManager()
    resolver = RetryContentResolver(content_manager=manager)

    job = _make_job()
    with pytest.raises(ValueError, match="retry_source_not_found"):
        await resolver.resolve(job)


@pytest.mark.asyncio
async def test_resolver_rejects_session_mismatch():
    from novelforge.services.retry_content_resolver import RetryContentResolver

    item = FakeContentItem(
        content_id="chapter-1",
        content="正文内容",
        session_id="session-b",
    )
    manager = FakeContentManager([item])
    resolver = RetryContentResolver(content_manager=manager)

    job = _make_job()
    with pytest.raises(ValueError, match="retry_source_session_mismatch"):
        await resolver.resolve(job)


@pytest.mark.asyncio
async def test_resolver_rejects_non_chapter_content_type():
    from novelforge.services.retry_content_resolver import RetryContentResolver

    item = FakeContentItem(
        content_id="chapter-1",
        content="正文内容",
        session_id="session-a",
        content_type="character",
    )
    manager = FakeContentManager([item])
    resolver = RetryContentResolver(content_manager=manager)

    job = _make_job()
    with pytest.raises(ValueError, match="retry_source_not_chapter"):
        await resolver.resolve(job)


@pytest.mark.asyncio
async def test_resolver_rejects_empty_content():
    from novelforge.services.retry_content_resolver import RetryContentResolver

    item = FakeContentItem(
        content_id="chapter-1",
        content="",
        session_id="session-a",
    )
    manager = FakeContentManager([item])
    resolver = RetryContentResolver(content_manager=manager)

    job = _make_job()
    with pytest.raises(ValueError, match="retry_source_content_empty"):
        await resolver.resolve(job)


@pytest.mark.asyncio
async def test_resolver_rejects_parent_mismatch_when_source_parent_present():
    from novelforge.services.retry_content_resolver import RetryContentResolver

    item = FakeContentItem(
        content_id="chapter-1",
        content="正文内容",
        session_id="session-a",
        parent_id="parent-1",
    )
    manager = FakeContentManager([item])
    resolver = RetryContentResolver(content_manager=manager)

    job = _make_job(source_ref=RetrySourceRef(
        kind="content_item",
        content_id="chapter-1",
        session_id="session-a",
        parent_id="parent-2",
    ))
    with pytest.raises(ValueError, match="retry_source_parent_mismatch"):
        await resolver.resolve(job)
