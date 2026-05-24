import asyncio

from novelforge.content.models import ContentItem, ContentMetadata, ContentType
from novelforge.storage.content_database_storage import ContentDatabaseStorage


def run(coro):
    return asyncio.run(coro)


def build_item(item_id: str, *, session_id: str = "session-a", tags: list[str] | None = None) -> ContentItem:
    return ContentItem(
        metadata=ContentMetadata(
            id=item_id,
            title=f"Item {item_id}",
            type=ContentType.CHAPTER,
            tags=tags or ["project-session-a", "chapter"],
            session_id=session_id,
        ),
        content="content",
    )


def test_delete_content_removes_tags_from_stats(tmp_path) -> None:
    storage = ContentDatabaseStorage(str(tmp_path / "content.db"))
    run(storage.save_content(build_item("chapter-1")))

    assert run(storage.get_content_stats())["tag_counts"]["project-session-a"] == 1

    assert run(storage.delete_content("chapter-1")) is True

    stats = run(storage.get_content_stats())
    assert stats["total_contents"] == 0
    assert stats["tag_counts"] == {}


def test_delete_content_by_session_removes_tags_from_stats(tmp_path) -> None:
    storage = ContentDatabaseStorage(str(tmp_path / "content.db"))
    run(storage.save_content(build_item("chapter-1", session_id="session-a", tags=["project-session-a"])))
    run(storage.save_content(build_item("chapter-2", session_id="session-a", tags=["project-session-a"])))
    run(storage.save_content(build_item("chapter-3", session_id="session-b", tags=["project-session-b"])))

    assert run(storage.delete_content_by_session("session-a")) == 2

    stats = run(storage.get_content_stats())
    assert stats["total_contents"] == 1
    assert stats["tag_counts"] == {"project-session-b": 1}
