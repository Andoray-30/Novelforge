"""RetryContentResolver — loads chapter content from ContentManager by source_ref."""

from __future__ import annotations

from typing import Any, Dict


class RetryContentResolver:
    def __init__(self, content_manager: Any):
        self._content_manager = content_manager

    async def resolve(self, job: Any) -> Dict[str, Any]:
        if job.source_ref is None:
            raise ValueError("retry_source_ref_missing")

        if self._content_manager is None:
            raise ValueError("retry_content_manager_not_configured")

        item = await self._content_manager.get_content(job.source_ref.content_id)
        if item is None:
            raise ValueError("retry_source_not_found")

        metadata = getattr(item, "metadata", None)
        if metadata is None:
            raise ValueError("retry_source_not_found")

        if hasattr(metadata, "session_id") and metadata.session_id:
            if metadata.session_id != job.source_ref.session_id:
                raise ValueError("retry_source_session_mismatch")

        if job.source_ref.parent_id and hasattr(metadata, "parent_id"):
            if metadata.parent_id and metadata.parent_id != job.source_ref.parent_id:
                raise ValueError("retry_source_parent_mismatch")

        content_type = getattr(metadata, "type", None)
        if content_type and content_type != "chapter":
            raise ValueError("retry_source_not_chapter")

        content = getattr(item, "content", None)
        if not content or not content.strip():
            raise ValueError("retry_source_content_empty")

        return {
            "id": metadata.id,
            "title": job.chapter_title,
            "chapter_index": job.chapter_order,
            "content": content,
        }
