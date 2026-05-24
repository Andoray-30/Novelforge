import asyncio
from datetime import datetime
from pathlib import Path

from novelforge.core.models import Character, CharacterRole, NetworkEdge, RelationshipType, TimelineEvent, WorldSetting
from novelforge.content.models import ContentItem, ContentMetadata, ContentType
from novelforge.services.ai_scheduler import AITaskScheduler, Task, TaskPriority, TaskStatus


class DummyAIService:
    pass


class MemoryStorageManager:
    def __init__(self):
        self.saved = {}

    async def save(self, key, data, storage_type=None):
        self.saved[key] = data
        return True

    async def load(self, key, storage_type=None):
        return self.saved.get(key)

    async def list_keys(self, storage_type=None):
        return list(self.saved.keys())


class DummyConfig:
    pass


class RecordingContentManager:
    def __init__(self):
        self.items = []
        self.by_id = {}

    async def get_content(self, content_id):
        return self.by_id.get(content_id)

    async def create_content(self, item):
        self.items.append(item)
        self.by_id[item.metadata.id] = item
        return item.metadata.id

    async def delete_content(self, content_id):
        if content_id not in self.by_id:
            return False
        self.items = [item for item in self.items if item.metadata.id != content_id]
        del self.by_id[content_id]
        return True

    async def search_content(self, request):
        results = []
        content_types = set(request.content_types or [])
        for item in self.items:
            if request.session_id and item.metadata.session_id != request.session_id:
                continue
            if request.parent_id and item.metadata.parent_id != request.parent_id:
                continue
            if request.content_type and item.metadata.type != request.content_type:
                continue
            if content_types and item.metadata.type not in content_types:
                continue
            results.append(item)

        class Result:
            def __init__(self, items):
                self.items = items
                self.total = len(items)

        return Result(results[: request.limit])


def build_scheduler(content_manager=None, storage_manager=None) -> AITaskScheduler:
    return AITaskScheduler(
        DummyAIService(),
        storage_manager or MemoryStorageManager(),
        DummyConfig(),
        content_manager,
    )


def test_active_task_recovery_hides_stale_completed_import():
    storage = MemoryStorageManager()
    content_manager = RecordingContentManager()
    now = datetime.now()
    session_id = "session-imported"
    storage.saved["task_import-1"] = {
        "id": "import-1",
        "type": "novel_import",
        "status": "running",
        "priority": 3,
        "parameters": {"session_id": session_id},
        "created_at": now.isoformat(),
        "started_at": None,
        "completed_at": None,
        "result": None,
        "error": None,
        "progress": 0.78,
        "message": "saving",
        "user_id": None,
    }

    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="novel-imported",
            title="Imported novel",
            type=ContentType.NOVEL,
            session_id=session_id,
        ),
        content="root",
    )))
    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="chapter-imported",
            title="Imported chapter",
            type=ContentType.CHAPTER,
            parent_id="novel-imported",
            session_id=session_id,
        ),
        content="chapter",
    )))
    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="char-imported",
            title="Imported character",
            type=ContentType.CHARACTER,
            parent_id="novel-imported",
            session_id=session_id,
        ),
        content="character",
    )))

    scheduler = build_scheduler(content_manager=content_manager, storage_manager=storage)

    active = asyncio.run(scheduler.get_active_tasks_by_session(session_id))

    assert active == []
    recovered = storage.saved["task_import-1"]
    assert recovered["status"] == "completed"
    assert recovered["progress"] == 1.0
    assert recovered["result"]["chapters_count"] == 1
    assert recovered["result"]["characters_count"] == 1


def test_find_existing_import_by_upload_hash_returns_asset_counts():
    content_manager = RecordingContentManager()
    scheduler = build_scheduler(content_manager)
    raw_hash = "hash-existing-book"

    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="novel-existing",
            title="Existing book",
            type=ContentType.NOVEL,
            session_id="session-existing",
        ),
        content="root",
        extracted_data={"raw_upload_sha256": raw_hash},
    )))
    for content_id, content_type in [
        ("chapter-existing", ContentType.CHAPTER),
        ("char-existing", ContentType.CHARACTER),
        ("rel-existing", ContentType.RELATIONSHIP),
        ("timeline-existing", ContentType.TIMELINE),
        ("world-existing", ContentType.WORLD),
    ]:
        asyncio.run(content_manager.create_content(ContentItem(
            metadata=ContentMetadata(
                id=content_id,
                title=content_id,
                type=content_type,
                session_id="session-existing",
                parent_id="novel-existing",
            ),
            content="asset",
        )))

    duplicate = asyncio.run(scheduler.find_existing_import_by_upload_hash(
        raw_hash,
        exclude_session_id="session-new",
    ))

    assert duplicate is not None
    assert duplicate["duplicate_import"] is True
    assert duplicate["session_id"] == "session-existing"
    assert duplicate["parent_id"] == "novel-existing"
    assert duplicate["chapters_count"] == 1
    assert duplicate["characters_count"] == 1
    assert duplicate["relationships_count"] == 1
    assert duplicate["timeline_count"] == 1
    assert duplicate["world_count"] == 1


def test_completed_duplicate_import_task_is_persisted():
    storage = MemoryStorageManager()
    scheduler = build_scheduler(storage_manager=storage)
    duplicate_result = {
        "duplicate_import": True,
        "session_id": "session-existing",
        "parent_id": "novel-existing",
        "chapters_count": 8,
    }

    task = asyncio.run(scheduler.create_completed_duplicate_import_task(
        requested_session_id="session-new",
        duplicate_result=duplicate_result,
        source_file_name="book.txt",
    ))

    assert task.status == TaskStatus.COMPLETED
    assert task.progress == 1.0
    assert task.result == duplicate_result
    saved = storage.saved[f"task_{task.id}"]
    assert saved["status"] == "completed"
    assert saved["parameters"]["duplicate_import"] is True


def test_delete_previous_import_assets_keeps_user_created_chapters():
    content_manager = RecordingContentManager()
    imported_chapter = ContentItem(
        metadata=ContentMetadata(
            id="chapter-imported",
            title="Imported chapter",
            type=ContentType.CHAPTER,
            parent_id="novel-reimport",
            session_id="session-reimport",
            tags=["imported", "import-run-old"],
        ),
        content="old import",
    )
    extracted_character = ContentItem(
        metadata=ContentMetadata(
            id="char-imported",
            title="Imported character",
            type=ContentType.CHARACTER,
            parent_id="novel-reimport",
            session_id="session-reimport",
            tags=["extracted", "import-run-old"],
        ),
        content="old character",
    )
    user_chapter = ContentItem(
        metadata=ContentMetadata(
            id="chapter-user",
            title="User chapter",
            type=ContentType.CHAPTER,
            parent_id="novel-reimport",
            session_id="session-reimport",
            tags=["chapter"],
        ),
        content="keep me",
    )
    asyncio.run(content_manager.create_content(imported_chapter))
    asyncio.run(content_manager.create_content(extracted_character))
    asyncio.run(content_manager.create_content(user_chapter))
    scheduler = build_scheduler(content_manager=content_manager)

    deleted = asyncio.run(scheduler._delete_previous_import_assets(
        session_id="session-reimport",
        parent_id="novel-reimport",
    ))

    assert deleted == 2
    assert "chapter-imported" not in content_manager.by_id
    assert "char-imported" not in content_manager.by_id
    assert "chapter-user" in content_manager.by_id


def test_import_analysis_sample_keeps_short_text_unchanged():
    scheduler = build_scheduler()
    text = "短文本"

    assert scheduler._build_import_analysis_sample(text, max_chars=100) == text


def test_import_analysis_sample_bounds_long_text_and_samples_across_book():
    scheduler = build_scheduler()
    text = "A" * 10000 + "B" * 10000 + "C" * 10000 + "D" * 10000

    sample = scheduler._build_import_analysis_sample(text, max_chars=4000)

    assert len(sample) > 4000
    assert "导入分析采样 1/4" in sample
    assert "导入分析采样 4/4" in sample
    assert "A" * 100 in sample
    assert "D" * 100 in sample
    assert len(sample) < len(text)


def test_update_import_conversation_title_uses_book_title():
    storage = MemoryStorageManager()
    storage.saved["conversation_session-a"] = {
        "id": "session-a",
        "title": "新创作对话",
        "messages": [],
        "metadata": {"type": "novel_creation"},
        "updated_at": "2026-05-01T00:00:00",
    }
    scheduler = build_scheduler(storage_manager=storage)

    asyncio.run(scheduler._update_import_conversation_title(
        session_id="session-a",
        book_title="超时空辉夜姬",
        source_file_name="ignored.txt",
    ))

    updated = storage.saved["conversation_session-a"]
    assert updated["title"] == "超时空辉夜姬"
    assert updated["metadata"]["imported_book_title"] == "超时空辉夜姬"
    assert updated["updated_at"] != "2026-05-01T00:00:00"


def test_novel_import_preserves_chapter_content_when_detector_returns_empty_content(monkeypatch, tmp_path):
    from novelforge.services import ai_scheduler as scheduler_module
    from novelforge.types.text_processing import Chapter, ProcessedText, TextMetadata

    class FakeTextProcessingService:
        def process_file(self, file_path, config):
            content = Path(file_path).read_text(encoding="utf-8")
            return ProcessedText(
                content=content,
                metadata=TextMetadata(title="测试小说"),
                chapters=[Chapter(title="序章", content="", start_position=0, end_position=len(content), index=1)],
            )

    class FakeExtractionService:
        async def extract_characters(self, text):
            return []

        async def extract_world_setting(self, text):
            return None

        async def extract_timeline(self, text):
            return []

        async def extract_relationships(self, text):
            return []

    monkeypatch.setattr(scheduler_module, "text_processing_service", FakeTextProcessingService(), raising=False)

    import novelforge.services.extraction_service as extraction_module
    monkeypatch.setattr(extraction_module, "get_extraction_service", lambda *args, **kwargs: FakeExtractionService())

    source_path = tmp_path / "novel.txt"
    source_path.write_text("这是应该被保存的正文。" * 20, encoding="utf-8")
    content_manager = RecordingContentManager()
    scheduler = build_scheduler(content_manager=content_manager)
    task = Task(
        id="task-1",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={
            "file_path": str(source_path),
            "book_title": "测试小说",
            "session_id": "session-a",
            "config": {},
            "source_file_name": "novel.txt",
        },
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._process_novel_import_task(task))

    chapters = [item for item in content_manager.items if item.metadata.type == "chapter"]
    assert result["chapters_count"] == 1
    assert len(chapters) == 1
    assert chapters[0].content == "这是应该被保存的正文。" * 20
    chapter_payload = chapters[0].extracted_data
    assert chapter_payload["display_title"] == "序章"
    assert chapter_payload["original_title"] == "序章"
    assert chapter_payload["source_type"] == "imported"
    assert chapter_payload["chapter_role"] == "序章"
    assert chapter_payload["volume_index"] == 1
    assert chapter_payload["chapter_index"] == 1
    assert chapter_payload["segment_index"] == 0
    assert chapter_payload["is_decorative"] is False
    assert chapter_payload["word_count"] > 0
    assert chapter_payload["quality_flags"] == []


def test_novel_import_uses_chapter_index_analysis_and_returns_diagnostics(monkeypatch, tmp_path):
    from novelforge.services import ai_scheduler as scheduler_module
    from novelforge.types.text_processing import Chapter, ProcessedText, TextMetadata

    class FakeTextProcessingService:
        def process_file(self, file_path, config):
            content = Path(file_path).read_text(encoding="utf-8")
            return ProcessedText(
                content=content,
                metadata=TextMetadata(title="测试小说"),
                chapters=[
                    Chapter(title="第一章", content="林墨遇见周岚。", start_position=0, end_position=8, index=1),
                    Chapter(title="第二章", content="雨城下起了雨。", start_position=8, end_position=len(content), index=2),
                ],
            )

    class FakeExtractionService:
        def __init__(self):
            self.received_chapters = None

        async def extract_chapter_index_assets(self, chapters):
            self.received_chapters = chapters
            return {
                "characters": [
                    Character(name="林墨", role=CharacterRole.PROTAGONIST, description="主角", source_contexts=["林墨遇见周岚。"]),
                    Character(name="周岚", role=CharacterRole.SUPPORTING, description="配角", source_contexts=["林墨遇见周岚。"]),
                ],
                "relationships": [
                    NetworkEdge(source="林墨", target="周岚", relationship_type=RelationshipType.FRIEND, description="旧友", evidence=["林墨遇见周岚。"]),
                ],
                "timeline_events": [
                    TimelineEvent(title="雨夜相遇", description="雨夜相遇时林墨遇见周岚。", characters=["林墨", "周岚"], evidence=["林墨遇见周岚。"], chapter_reference="第一章")
                ],
                "world_setting": WorldSetting(history="雨城的故事"),
                "analysis_diagnostics": {
                    "candidate_counts": {"chapter_character_candidates": 2},
                    "failed_chapters": [{"chapter_id": "chapter-x", "chapter_title": "坏章", "error": "timeout"}],
                    "relationship_unresolved_endpoints": ["陌生人"],
                    "timeline_mismatch_events": [],
                },
                "candidate_counts": {"chapter_character_candidates": 2},
                "failed_chapters": [{"chapter_id": "chapter-x", "chapter_title": "坏章", "error": "timeout"}],
                "relationship_unresolved_endpoints": ["陌生人"],
                "timeline_mismatch_events": [],
            }

    service = FakeExtractionService()
    monkeypatch.setattr(scheduler_module, "text_processing_service", FakeTextProcessingService(), raising=False)
    import novelforge.services.extraction_service as extraction_module
    monkeypatch.setattr(extraction_module, "get_extraction_service", lambda *args, **kwargs: service)

    source_path = tmp_path / "novel.txt"
    source_path.write_text("林墨遇见周岚。雨城下起了雨。", encoding="utf-8")
    content_manager = RecordingContentManager()
    scheduler = build_scheduler(content_manager=content_manager)
    task = Task(
        id="task-chapter-index",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={
            "file_path": str(source_path),
            "book_title": "测试小说",
            "session_id": "session-index",
            "config": {},
            "source_file_name": "novel.txt",
        },
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._process_novel_import_task(task))

    assert service.received_chapters[0]["content"].startswith("林墨遇见周岚。")
    assert result["analysis_stage_results"]["chapter_index"] == "completed"
    assert result["analysis_diagnostics"]["failed_chapters"][0]["chapter_id"] == "chapter-x"
    assert result["candidate_counts"]["chapter_character_candidates"] == 2
    assert result["relationship_unresolved_endpoints"] == ["陌生人"]


def test_import_expands_overlong_chapters_on_sentence_boundaries():
    from novelforge.types.text_processing import Chapter

    scheduler = build_scheduler()
    long_content = ("第一段内容。" * 800) + "\n\n" + ("第二段内容。" * 800)
    chapter = Chapter(
        title="第一卷 第三章",
        content=long_content,
        start_position=100,
        end_position=100 + len(long_content),
        index=3,
    )

    parts = scheduler._expand_long_import_chapters([chapter], max_chars=5000)

    assert len(parts) > 1
    assert all(part.content for part in parts)
    assert all(len(part.content) <= 5000 for part in parts)
    assert parts[0].title == "第一卷 第三章 · 片段 01"
    assert parts[1].title == "第一卷 第三章 · 片段 02"
    assert parts[0].index == 1
    assert parts[1].index == 2
    assert parts[0].metadata["source_type"] == "system_split"
    assert parts[0].metadata["split_from_title"] == "第一卷 第三章"
    assert parts[0].metadata["original_title"] == "第一卷 第三章"
    assert parts[0].metadata["display_title"] == "第一卷 第三章 · 片段 01"
    assert parts[0].metadata["split_total"] == len(parts)


def test_import_chapter_metadata_marks_system_split_segments():
    from novelforge.types.text_processing import Chapter

    scheduler = build_scheduler()
    chapter = Chapter(
        title="第一卷 第三章",
        content="他在雨里醒来。" * 900,
        start_position=10,
        end_position=10 + len("他在雨里醒来。" * 900),
        index=3,
    )

    parts = scheduler._expand_long_import_chapters([chapter], max_chars=2000)
    metadata = scheduler._build_import_chapter_metadata(
        chapter=parts[0],
        chapter_number=parts[0].index,
        chapter_title=parts[0].title,
        chapter_content=parts[0].content,
    )

    assert metadata["display_title"] == "第一卷 第三章 · 片段 01"
    assert metadata["original_title"] == "第一卷 第三章"
    assert metadata["source_type"] == "system_split"
    assert metadata["chapter_role"] == "正文"
    assert metadata["volume_index"] == 1
    assert metadata["chapter_index"] == 1
    assert metadata["segment_index"] == 1
    assert metadata["is_decorative"] is False
    assert metadata["word_count"] > 0
    assert "system_split" in metadata["quality_flags"]


def test_import_keeps_short_chapters_unchanged_when_expanding():
    from novelforge.types.text_processing import Chapter

    scheduler = build_scheduler()
    chapter = Chapter(title="序章", content="短章节正文。", start_position=0, end_position=6, index=1)

    parts = scheduler._expand_long_import_chapters([chapter], max_chars=5000)

    assert parts == [chapter]
    assert parts[0].title == "序章"


def test_import_deep_analysis_uses_full_text_for_primary_extractors_and_sample_for_secondary():
    class FakeExtractionService:
        def __init__(self):
            self.calls = []

        async def extract_characters(self, text):
            self.calls.append(("characters", len(text)))
            return [Character(name="主角", description="测试角色")]

        async def extract_timeline(self, text):
            self.calls.append(("timeline", len(text)))
            return [TimelineEvent(title="开端", description="故事开始")]

        async def extract_world_setting(self, text):
            self.calls.append(("world", len(text)))
            return WorldSetting(history="测试世界")

        async def extract_relationships(self, text):
            self.calls.append(("relationships", len(text)))
            return [
                NetworkEdge(
                    source="主角",
                    target="配角",
                    relationship_type=RelationshipType.FRIEND,
                    description="应保留的全文关系",
                )
            ]

    text = "A" * 90000
    scheduler = build_scheduler(storage_manager=MemoryStorageManager())
    extraction_service = FakeExtractionService()
    task = Task(
        id="task-analysis",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={},
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._run_import_deep_analysis(extraction_service, text, task))

    call_lengths = dict(extraction_service.calls)
    assert call_lengths["characters"] == len(text)
    assert call_lengths["timeline"] == len(text)
    assert call_lengths["world"] < len(text)
    assert call_lengths["relationships"] == len(text)
    assert result["stage_results"] == {
        "characters": "completed",
        "timeline_events": "completed",
        "world_setting": "completed",
        "relationships": "completed",
    }
    assert len(result["relationships"]) == 1


def test_import_deep_analysis_prefers_chapter_index_assets_when_chapters_available():
    class ChapterIndexService:
        def __init__(self):
            self.received_chapters = None
            self.legacy_called = False

        async def extract_chapter_index_assets(self, chapters):
            self.received_chapters = chapters
            characters = [
                Character(name=f"角色{i}", role=CharacterRole.MINOR, description="角色", source_contexts=[f"证据{i}"])
                for i in range(9)
            ]
            relationships = [
                NetworkEdge(source="角色0", target=f"角色{i}", relationship_type=RelationshipType.FRIEND, description="关系", evidence=["证据"])
                for i in range(1, 9)
            ]
            timeline = [
                TimelineEvent(title=f"事件{i}", description=f"事件{i}发生", characters=["角色0"], evidence=["证据"], chapter_reference="第一章")
                for i in range(6)
            ]
            return {
                "characters": characters,
                "relationships": relationships,
                "timeline_events": timeline,
                "world_setting": WorldSetting(history="世界事实", rules=["规则"]),
                "analysis_diagnostics": {
                    "candidate_counts": {"chapter_character_candidates": 9},
                    "failed_chapters": [],
                    "relationship_unresolved_endpoints": [],
                    "timeline_mismatch_events": [],
                },
                "candidate_counts": {"chapter_character_candidates": 9},
                "failed_chapters": [],
                "relationship_unresolved_endpoints": [],
                "timeline_mismatch_events": [],
            }

        async def extract_characters(self, text):
            self.legacy_called = True
            return []

    service = ChapterIndexService()
    scheduler = build_scheduler(storage_manager=MemoryStorageManager())
    task = Task(
        id="task-chapter-index",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={},
        created_at=datetime.now(),
    )

    result = asyncio.run(
        scheduler._run_import_deep_analysis(
            service,
            "全文不会被旧链路使用",
            task,
            chapters=[{"id": "chapter-1", "title": "第一章", "chapter_index": 1, "content": "正文"}],
        )
    )

    assert service.received_chapters[0]["id"] == "chapter-1"
    assert service.legacy_called is False
    assert result["stage_results"]["chapter_index"] == "completed"
    assert result["analysis_status"] == "completed"
    assert result["candidate_counts"]["chapter_character_candidates"] == 9


def test_import_deep_analysis_marks_empty_chapter_index_result_failed():
    class EmptyChapterIndexService:
        async def extract_chapter_index_assets(self, chapters):
            return {
                "characters": [],
                "relationships": [],
                "timeline_events": [],
                "world_setting": WorldSetting(),
                "analysis_diagnostics": {
                    "candidate_counts": {
                        "chapters_total": 2,
                        "chapters_indexed": 0,
                        "chapter_character_candidates": 0,
                    },
                    "failed_chapters": [
                        {"chapter_id": "chapter-1", "title": "第一章", "error": "ConnectError"},
                        {"chapter_id": "chapter-2", "title": "第二章", "error": "ConnectError"},
                    ],
                    "relationship_unresolved_endpoints": [],
                    "timeline_mismatch_events": [],
                },
            }

    scheduler = build_scheduler(storage_manager=MemoryStorageManager())
    task = Task(
        id="task-empty-chapter-index",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={},
        created_at=datetime.now(),
    )

    result = asyncio.run(
        scheduler._run_import_deep_analysis(
            EmptyChapterIndexService(),
            "正文",
            task,
            chapters=[
                {"id": "chapter-1", "title": "第一章", "chapter_index": 1, "content": "正文"},
                {"id": "chapter-2", "title": "第二章", "chapter_index": 2, "content": "正文"},
            ],
        )
    )

    assert result["analysis_status"] == "failed"
    assert result["failed_chapters"][0]["error"] == "ConnectError"
    assert any("failed_chapters: 2" == error for error in result["errors"])


def test_import_deep_analysis_marks_relationship_coverage_low_quality():
    class SparseRelationshipService:
        async def extract_characters(self, text):
            return [Character(name=f"角色{i}", description="测试角色") for i in range(8)]

        async def extract_timeline(self, text):
            return [TimelineEvent(title="开端", description="故事开始")]

        async def extract_world_setting(self, text):
            return WorldSetting(history="测试世界")

        async def extract_relationships(self, text):
            return [
                NetworkEdge(
                    source="角色1",
                    target="角色2",
                    relationship_type=RelationshipType.FRIEND,
                    description="关系过少",
                )
            ]

    scheduler = build_scheduler(storage_manager=MemoryStorageManager())
    task = Task(
        id="task-relationship-low-quality",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={},
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._run_import_deep_analysis(SparseRelationshipService(), "测试正文", task))

    assert result["analysis_status"] == "low_quality"
    assert any("关系网覆盖不足" in issue for issue in result["quality_issues"])


def test_import_repair_task_loads_saved_chapters_and_returns_preview(monkeypatch):
    import novelforge.services.extraction_service as extraction_module

    class FakeExtractionService:
        def __init__(self):
            self.received_chapters = None

        async def extract_chapter_index_assets(self, chapters):
            self.received_chapters = chapters
            return {
                "characters": [Character(name="林墨", role=CharacterRole.PROTAGONIST, description="主角")],
                "relationships": [
                    NetworkEdge(
                        source="林墨",
                        target="周岚",
                        relationship_type=RelationshipType.FRIEND,
                        description="互相支撑",
                        evidence=["林墨与周岚并肩"],
                    )
                ],
                "timeline_events": [
                    TimelineEvent(
                        title="并肩前行",
                        description="林墨与周岚决定并肩前行。",
                        characters=["林墨", "周岚"],
                        evidence=["林墨与周岚并肩"],
                    )
                ],
                "world_setting": WorldSetting(history="雨城旧事"),
                "analysis_diagnostics": {
                    "candidate_counts": {"chapter_character_candidates": 2},
                    "failed_chapters": [],
                    "relationship_unresolved_endpoints": [],
                    "timeline_mismatch_events": [],
                },
            }

    service = FakeExtractionService()
    monkeypatch.setattr(extraction_module, "get_extraction_service", lambda *args, **kwargs: service)

    content_manager = RecordingContentManager()
    chapter = ContentItem(
        metadata=ContentMetadata(
            id="chapter-1",
            title="第一章",
            type=ContentType.CHAPTER,
            parent_id="novel-1",
            session_id="session-rerun",
        ),
        content="林墨与周岚并肩。",
        extracted_data={"chapter_index": 1},
    )
    asyncio.run(content_manager.create_content(chapter))
    scheduler = build_scheduler(content_manager=content_manager, storage_manager=MemoryStorageManager())
    task = Task(
        id="task-repair",
        type="relationship_backfill",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.MEDIUM,
        parameters={"session_id": "session-rerun", "parent_id": "novel-1"},
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._process_import_repair_task(task))

    assert service.received_chapters[0]["id"] == "chapter-1"
    assert result["write_mode"] == "preview"
    assert result["repair_type"] == "relationships"
    assert result["relationships_count"] == 1
    assert result["repair_diff"]["relationships"]["new"] == 1
    assert result["relationships"][0]["source"] == "林墨"


def test_import_repair_task_reports_preview_diff_against_existing_assets(monkeypatch):
    import novelforge.services.extraction_service as extraction_module

    class FakeExtractionService:
        async def extract_chapter_index_assets(self, chapters):
            return {
                "characters": [],
                "relationships": [
                    NetworkEdge(
                        source="周岚",
                        target="林墨",
                        relationship_type=RelationshipType.FRIEND,
                        description="重复关系",
                    )
                ],
                "timeline_events": [
                    TimelineEvent(
                        title="并肩前行",
                        description="林墨与周岚决定并肩前行。",
                    )
                ],
                "world_setting": None,
                "analysis_diagnostics": {},
            }

    monkeypatch.setattr(extraction_module, "get_extraction_service", lambda *args, **kwargs: FakeExtractionService())

    content_manager = RecordingContentManager()
    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="chapter-1",
            title="第一章",
            type=ContentType.CHAPTER,
            parent_id="novel-diff",
            session_id="session-diff",
        ),
        content="林墨与周岚并肩。",
        extracted_data={"chapter_index": 1},
    )))
    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="rel-existing",
            title="林墨 -> 周岚 (friendship)",
            type=ContentType.RELATIONSHIP,
            parent_id="novel-diff",
            session_id="session-diff",
        ),
        content="互相支撑",
        extracted_data={"source": "林墨", "target": "周岚", "relationship_type": "friendship"},
    )))
    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="timeline-existing",
            title="并肩前行",
            type=ContentType.TIMELINE,
            parent_id="novel-diff",
            session_id="session-diff",
        ),
        content="并肩前行",
        extracted_data={"title": "并肩前行", "description": "林墨与周岚决定并肩前行。"},
    )))
    scheduler = build_scheduler(content_manager=content_manager, storage_manager=MemoryStorageManager())
    task = Task(
        id="task-repair-diff",
        type="relationship_backfill",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.MEDIUM,
        parameters={"session_id": "session-diff", "parent_id": "novel-diff"},
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._process_import_repair_task(task))

    assert result["repair_diff"]["relationships"] == {"new": 0, "duplicates": 1, "total": 1}
    assert result["repair_diff"]["timeline"] == {"new": 0, "duplicates": 1, "total": 1}


def test_import_repair_apply_task_writes_confirmed_preview_assets():
    content_manager = RecordingContentManager()
    scheduler = build_scheduler(content_manager=content_manager, storage_manager=MemoryStorageManager())
    task = Task(
        id="task-repair-apply",
        type="import_repair_apply",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.MEDIUM,
        parameters={
            "session_id": "session-apply",
            "parent_id": "novel-apply",
            "preview_task_id": "preview-1",
            "preview_result": {
                "repair_type": "relationships",
                "relationships": [
                    {
                        "source": "林墨",
                        "target": "周岚",
                        "relationship_type": "friendship",
                        "description": "互相支撑",
                        "evidence": ["林墨与周岚并肩"],
                    }
                ],
                "timeline_events": [
                    {
                        "title": "并肩前行",
                        "description": "林墨与周岚决定并肩前行。",
                        "characters": ["林墨", "周岚"],
                        "locations": ["雨城"],
                    }
                ],
            },
            "apply_types": ["relationships", "timeline"],
        },
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._process_import_repair_apply_task(task))

    relationship_items = [item for item in content_manager.items if item.metadata.type == ContentType.RELATIONSHIP]
    timeline_items = [item for item in content_manager.items if item.metadata.type == ContentType.TIMELINE]
    assert result["write_mode"] == "confirmed"
    assert result["relationships_count"] == 1
    assert result["timeline_count"] == 1
    assert relationship_items[0].metadata.tags[0] == "repair-preview"
    assert relationship_items[0].relations == {"source": ["林墨"], "target": ["周岚"]}
    assert timeline_items[0].relations == {"characters": ["林墨", "周岚"], "locations": ["雨城"]}


def test_import_repair_apply_task_skips_duplicate_relationship_and_timeline_assets():
    content_manager = RecordingContentManager()
    existing_relationship = ContentItem(
        metadata=ContentMetadata(
            id="rel-existing",
            title="林墨 -> 周岚 (friendship)",
            type=ContentType.RELATIONSHIP,
            parent_id="novel-apply",
            session_id="session-apply",
        ),
        content="互相支撑",
        extracted_data={"source": "林墨", "target": "周岚", "relationship_type": "friendship"},
    )
    existing_timeline = ContentItem(
        metadata=ContentMetadata(
            id="timeline-existing",
            title="并肩前行",
            type=ContentType.TIMELINE,
            parent_id="novel-apply",
            session_id="session-apply",
        ),
        content="并肩前行",
        extracted_data={"title": "并肩前行", "description": "林墨与周岚决定并肩前行。"},
    )
    asyncio.run(content_manager.create_content(existing_relationship))
    asyncio.run(content_manager.create_content(existing_timeline))
    scheduler = build_scheduler(content_manager=content_manager, storage_manager=MemoryStorageManager())
    task = Task(
        id="task-repair-apply-dedupe",
        type="import_repair_apply",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.MEDIUM,
        parameters={
            "session_id": "session-apply",
            "parent_id": "novel-apply",
            "preview_result": {
                "relationships": [
                    {
                        "source": "周岚",
                        "target": "林墨",
                        "relationship_type": "friendship",
                        "description": "重复关系",
                    }
                ],
                "timeline_events": [
                    {
                        "title": "并肩前行",
                        "description": "林墨与周岚决定并肩前行。",
                    }
                ],
            },
            "apply_types": ["relationships", "timeline"],
        },
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._process_import_repair_apply_task(task))

    assert result["relationships_count"] == 0
    assert result["timeline_count"] == 0
    assert len([item for item in content_manager.items if item.metadata.type == ContentType.RELATIONSHIP]) == 1
    assert len([item for item in content_manager.items if item.metadata.type == ContentType.TIMELINE]) == 1








def test_import_deep_analysis_uses_guided_relationship_extraction_when_available():
    class GuidedRelationshipService:
        def __init__(self):
            self.guided_characters = None

        async def extract_characters(self, text):
            return [
                Character(name=f"角色{i}", role=CharacterRole.MINOR, description="角色", source_contexts=[f"角色{i}出现"])
                for i in range(8)
            ]

        async def extract_timeline(self, text):
            return [TimelineEvent(title="事件", description="角色0与角色1行动", characters=["角色0"], evidence=["证据"], chapter_reference="第一章")]

        async def extract_world_setting(self, text):
            return WorldSetting(history="测试世界")

        async def extract_relationships_guided(self, text, characters=None):
            self.guided_characters = characters
            return [
                NetworkEdge(source="角色0", target=f"角色{i}", relationship_type=RelationshipType.FRIEND, description="关系", evidence=["证据"])
                for i in range(1, 6)
            ]

    service = GuidedRelationshipService()
    scheduler = build_scheduler(storage_manager=MemoryStorageManager())
    task = Task(
        id="task-guided-relationships",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={},
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._run_import_deep_analysis(service, "测试正文", task))

    assert service.guided_characters is result["characters"]
    assert len(result["relationships"]) == 5

    class WeakTimelineService:
        async def extract_characters(self, text):
            return [
                Character(name=f"角色{i}", role=CharacterRole.MINOR, description="角色", source_contexts=[f"角色{i}出现"])
                for i in range(8)
            ]

        async def extract_timeline(self, text):
            return [TimelineEvent(title=f"事件{i}", description=f"事件{i}发生") for i in range(5)]

        async def extract_world_setting(self, text):
            return WorldSetting(history="测试世界")

        async def extract_relationships(self, text):
            return [
                NetworkEdge(source="角色0", target=f"角色{i}", relationship_type=RelationshipType.FRIEND, description="关系", evidence=["证据"])
                for i in range(1, 6)
            ]

    scheduler = build_scheduler(storage_manager=MemoryStorageManager())
    task = Task(
        id="task-weak-timeline",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={},
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._run_import_deep_analysis(WeakTimelineService(), "测试正文", task))

    assert result["analysis_status"] == "low_quality"
    assert any("时间线证据不足" in issue for issue in result["quality_issues"])

    class LowConfidenceCharacterService:
        async def extract_characters(self, text):
            return [Character(name=f"角色{i}", role=CharacterRole.MINOR) for i in range(8)]

        async def extract_timeline(self, text):
            return [TimelineEvent(title="开端", description="故事开始")]

        async def extract_world_setting(self, text):
            return WorldSetting(history="测试世界")

        async def extract_relationships(self, text):
            return [
                NetworkEdge(source="角色0", target="角色1", relationship_type=RelationshipType.FRIEND, description="关系")
                for _ in range(6)
            ]

    scheduler = build_scheduler(storage_manager=MemoryStorageManager())
    task = Task(
        id="task-low-confidence-characters",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={},
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._run_import_deep_analysis(LowConfidenceCharacterService(), "测试正文", task))

    assert result["analysis_status"] == "low_quality"
    assert any("低置信角色占比过高" in issue for issue in result["quality_issues"])




def test_import_deep_analysis_prefers_guided_relationship_extraction_when_available():
    class GuidedRelationshipService:
        def __init__(self):
            self.guided_characters = None
            self.unguided_called = False

        async def extract_characters(self, text):
            return [
                Character(name="主角", role=CharacterRole.PROTAGONIST, description="主角", source_contexts=["主角出现", "主角行动"]),
                Character(name="配角", role=CharacterRole.SUPPORTING, description="配角", source_contexts=["配角出现", "配角行动"]),
                *[Character(name=f"角色{i}", role=CharacterRole.MINOR, description="角色", source_contexts=[f"角色{i}出现"]) for i in range(6)],
            ]

        async def extract_timeline(self, text):
            return [TimelineEvent(title="开端", description="故事开始")]

        async def extract_world_setting(self, text):
            return WorldSetting(history="测试世界")

        async def extract_relationships(self, text):
            self.unguided_called = True
            return []

        async def extract_relationships_guided(self, text, characters=None):
            self.guided_characters = characters
            return [NetworkEdge(source="主角", target="配角", relationship_type=RelationshipType.FRIEND, description="候选池驱动关系", evidence=["主角和配角同行"])]

    service = GuidedRelationshipService()
    scheduler = build_scheduler(storage_manager=MemoryStorageManager())
    task = Task(
        id="task-guided-relationship",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={},
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._run_import_deep_analysis(service, "测试正文", task))

    assert service.guided_characters is result["characters"]
    assert service.unguided_called is False
    assert result["relationships"][0].description == "候选池驱动关系"

    class AliasRelationshipService:
        async def extract_characters(self, text):
            return [
                Character(name="林墨", role=CharacterRole.PROTAGONIST, tags=["墨哥"], description="主角", source_contexts=["林墨出现", "墨哥出现"]),
                Character(name="周岚", role=CharacterRole.SUPPORTING, tags=["岚姐"], description="配角", source_contexts=["周岚出现", "岚姐出现"]),
                *[Character(name=f"角色{i}", role=CharacterRole.MINOR, description="角色", source_contexts=[f"角色{i}出现"]) for i in range(6)],
            ]

        async def extract_timeline(self, text):
            return [TimelineEvent(title="开端", description="故事开始")]

        async def extract_world_setting(self, text):
            return WorldSetting(history="测试世界")

        async def extract_relationships(self, text):
            return [
                NetworkEdge(source="墨哥", target="岚姐", relationship_type=RelationshipType.FRIEND, description="别名关系", evidence=["墨哥看向岚姐"]),
                NetworkEdge(source="林墨", target="周岚", relationship_type=RelationshipType.FRIEND, description="标准名关系", evidence=[]),
                NetworkEdge(source="陌生人", target="周岚", relationship_type=RelationshipType.FRIEND, description="无法映射关系", evidence=["陌生人出现"]),
            ]

    scheduler = build_scheduler(storage_manager=MemoryStorageManager())
    task = Task(
        id="task-alias-relationship",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={},
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._run_import_deep_analysis(AliasRelationshipService(), "测试正文", task))

    relationships = result["relationships"]
    assert any(rel.source == "林墨" and rel.target == "周岚" for rel in relationships)
    assert len([rel for rel in relationships if {rel.source, rel.target} == {"林墨", "周岚"}]) == 1
    assert "陌生人" in result["relationship_unresolved_endpoints"]
    assert any("关系端点无法映射到角色池" in issue for issue in result["quality_issues"])
