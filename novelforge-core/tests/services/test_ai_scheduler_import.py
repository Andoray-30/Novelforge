import asyncio
from datetime import datetime
from pathlib import Path

from novelforge.core.models import Character, CharacterRole, NetworkEdge, RelationshipType, TimelineEvent, WorldSetting
from novelforge.content.models import ContentItem, ContentMetadata, ContentType
from novelforge.extractors.chapter_index_extractor import (
    ChapterCharacterCandidate,
    ChapterIndex,
    ChapterInteractionCandidate,
)
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
    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="rel-imported",
            title="Imported relationship",
            type=ContentType.RELATIONSHIP,
            parent_id="novel-imported",
            session_id=session_id,
        ),
        content="relationship",
    )))

    scheduler = build_scheduler(content_manager=content_manager, storage_manager=storage)

    active = asyncio.run(scheduler.get_active_tasks_by_session(session_id))

    assert active == []
    recovered = storage.saved["task_import-1"]
    assert recovered["status"] == "completed"
    assert recovered["progress"] == 1.0
    assert recovered["result"]["chapters_count"] == 1
    assert recovered["result"]["characters_count"] == 1
    assert recovered["result"]["relationships_count"] == 1
    assert recovered["result"]["analysis_status"] == "low_quality"
    assert recovered["result"]["recovered_from_assets"] is True
    assert "未证明本轮 AI 深度分析完整完成" in recovered["result"]["analysis_quality_issues"][0]
    assert recovered["result"]["analysis_diagnostics"]["fallback_quality_boundary"]["ready_state_allowed"] is False


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

    monkeypatch.setattr("novelforge.services.text_processing_service.text_processing_service", FakeTextProcessingService())

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
    monkeypatch.setattr("novelforge.services.text_processing_service.text_processing_service", FakeTextProcessingService())
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
    assert result["model_stage_plan"]["next_recommended_stage"] == "extractor_repair"
    assert result["analysis_diagnostics"]["model_stage_plan"]["next_recommended_stage"] == "extractor_repair"
    for key in ("status", "retryable", "provider_health_summary", "failed_routes", "recommended_action"):
        assert key not in result


def test_novel_import_marks_low_information_character_assets_for_repair(monkeypatch, tmp_path):
    from novelforge.services import ai_scheduler as scheduler_module
    from novelforge.types.text_processing import Chapter, ProcessedText, TextMetadata

    class FakeTextProcessingService:
        def process_file(self, file_path, config):
            content = Path(file_path).read_text(encoding="utf-8")
            return ProcessedText(
                content=content,
                metadata=TextMetadata(title="Test Novel"),
                chapters=[Chapter(title="Chapter 1", content=content, start_position=0, end_position=len(content), index=1)],
            )

    class FakeExtractionService:
        async def extract_chapter_index_assets(self, chapters):
            character = Character(name="Seed", role=CharacterRole.MINOR, description="seed", source_contexts=["Seed appeared"])
            setattr(
                character,
                "extraction_quality",
                {
                    "profile_score": 1,
                    "confidence": "medium",
                    "profile_type": "minimal_profile",
                    "backfilled_from_relationship": True,
                },
            )
            return {
                "characters": [character],
                "relationships": [],
                "timeline_events": [],
                "world_setting": WorldSetting(),
                "analysis_diagnostics": {
                    "candidate_counts": {"chapter_character_candidates": 1},
                    "failed_chapters": [],
                    "relationship_unresolved_endpoints": [],
                    "timeline_mismatch_events": [],
                },
            }

    monkeypatch.setattr("novelforge.services.text_processing_service.text_processing_service", FakeTextProcessingService())
    import novelforge.services.extraction_service as extraction_module
    monkeypatch.setattr(extraction_module, "get_extraction_service", lambda *args, **kwargs: FakeExtractionService())

    source_path = tmp_path / "novel.txt"
    source_path.write_text("Seed appeared in the rain.", encoding="utf-8")
    content_manager = RecordingContentManager()
    scheduler = build_scheduler(content_manager=content_manager)
    task = Task(
        id="task-low-info-character-save",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={
            "file_path": str(source_path),
            "book_title": "Test Novel",
            "session_id": "session-repair-flags",
            "config": {},
            "source_file_name": "novel.txt",
        },
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._process_novel_import_task(task))
    characters = [item for item in content_manager.items if item.metadata.type == "character"]

    assert result["analysis_status"] == "low_quality"
    assert len(characters) == 1
    character_item = characters[0]
    assert "high-quality" not in character_item.metadata.tags
    assert "diagnostic_seed" in character_item.metadata.tags
    assert "needs_ai_repair" in character_item.metadata.tags
    assert character_item.extracted_data["diagnostic_seed"] is True
    assert character_item.extracted_data["needs_ai_repair"] is True
    assert character_item.extracted_data["source_type"] == "diagnostic_seed"


def test_novel_import_propagates_provider_unavailable_to_final_result(monkeypatch, tmp_path):
    from novelforge.services import ai_scheduler as scheduler_module
    from novelforge.types.text_processing import Chapter, ProcessedText, TextMetadata

    class FakeTextProcessingService:
        def process_file(self, file_path, config):
            content = Path(file_path).read_text(encoding="utf-8")
            return ProcessedText(
                content=content,
                metadata=TextMetadata(title="Test Novel"),
                chapters=[Chapter(title="Chapter 1", content=content, start_position=0, end_position=len(content), index=1)],
            )

    class FakeExtractionService:
        async def extract_chapter_index_assets(self, chapters):
            return {
                "characters": [],
                "relationships": [],
                "timeline_events": [],
                "world_setting": None,
                "analysis_diagnostics": {
                    "provider_unavailable": True,
                    "provider_health_summary": {
                        "all_candidates_failed": True,
                        "failed_routes": ["model-a", "model-b"],
                        "recommended_action": "check_provider_status_or_wait",
                    },
                    "model_route": {
                        "role": "extractor_fast",
                        "selected_model": "model-a",
                        "reason": "no_probe_passed_using_best_score",
                        "candidates": ["model-a", "model-b"],
                    },
                },
                "model_route": {
                    "role": "extractor_fast",
                    "selected_model": "model-a",
                    "reason": "no_probe_passed_using_best_score",
                    "candidates": ["model-a", "model-b"],
                },
            }

    monkeypatch.setattr("novelforge.services.text_processing_service.text_processing_service", FakeTextProcessingService())
    import novelforge.services.extraction_service as extraction_module
    monkeypatch.setattr(extraction_module, "get_extraction_service", lambda *args, **kwargs: FakeExtractionService())

    source_path = tmp_path / "novel.txt"
    source_path.write_text("Synthetic test content.", encoding="utf-8")
    content_manager = RecordingContentManager()
    scheduler = build_scheduler(content_manager=content_manager)
    task = Task(
        id="task-provider-unavailable",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={
            "file_path": str(source_path),
            "book_title": "Test Novel",
            "session_id": "session-pu",
            "config": {},
            "source_file_name": "novel.txt",
        },
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._process_novel_import_task(task))

    assert result["status"] == "provider_unavailable"
    assert result["retryable"] is True
    assert result["provider_health_summary"]["all_candidates_failed"] is True
    assert result["failed_routes"] == ["model-a", "model-b"]
    assert result["recommended_action"] == "check_provider_status_or_wait"
    assert result["analysis_status"] == "failed"
    assert result["analysis_stage_results"]["chapter_index"] == "failed"
    assert result["characters_count"] == 0
    assert result["world_count"] == 0
    assert result["relationships_count"] == 0
    assert result["timeline_count"] == 0
    assert result["analysis_diagnostics"]["provider_unavailable"] is True
    assert result.get("chapter_index_attempts") is None or result.get("chapter_index_attempts") == []
    assert "Synthetic test content" not in str(result.get("analysis_diagnostics", {}))


def test_character_quality_metadata_marks_backfilled_seed():
    metadata = AITaskScheduler._character_asset_quality_metadata(
        {
            "name": "Seed",
            "extraction_quality": {
                "profile_score": 1,
                "confidence": "medium",
                "profile_type": "minimal_profile",
                "backfilled_from_relationship": True,
            },
        }
    )

    assert metadata["diagnostic_seed"] is True
    assert metadata["needs_ai_repair"] is True
    assert metadata["source_type"] == "diagnostic_seed"
    assert "relationship_endpoint_backfill" in metadata["quality_flags"]


def test_chapter_index_analysis_rejects_all_diagnostic_seed_characters():
    class DiagnosticSeedService:
        async def extract_chapter_index_assets(self, chapters):
            characters = []
            for index in range(9):
                character = Character(
                    name=f"Char{index}",
                    role=CharacterRole.MINOR,
                    description="seed",
                    source_contexts=[f"Char{index} evidence"],
                )
                setattr(
                    character,
                    "extraction_quality",
                    {
                        "profile_score": 1,
                        "confidence": "medium",
                        "profile_type": "minimal_profile",
                        "backfilled_from_relationship": True,
                    },
                )
                characters.append(character)

            return {
                "characters": characters,
                "relationships": [
                    NetworkEdge(
                        source="Char0",
                        target=f"Char{index}",
                        relationship_type=RelationshipType.FRIEND,
                        description="relationship",
                        evidence=["evidence"],
                    )
                    for index in range(1, 9)
                ],
                "timeline_events": [
                    TimelineEvent(
                        title=f"Event{index}",
                        description=f"Event{index} happens",
                        characters=["Char0"],
                        evidence=["evidence"],
                        chapter_reference="Chapter 1",
                    )
                    for index in range(6)
                ],
                "world_setting": WorldSetting(history="world", rules=["rule"]),
                "analysis_diagnostics": {
                    "candidate_counts": {"chapter_character_candidates": 9},
                    "failed_chapters": [],
                    "relationship_unresolved_endpoints": [],
                    "timeline_mismatch_events": [],
                },
            }

    scheduler = build_scheduler(storage_manager=MemoryStorageManager())
    task = Task(
        id="task-diagnostic-seeds",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={},
        created_at=datetime.now(),
    )

    result = asyncio.run(
        scheduler._run_import_deep_analysis(
            DiagnosticSeedService(),
            "text",
            task,
            chapters=[{"id": "chapter-1", "title": "Chapter 1", "chapter_index": 1, "content": "text"}],
        )
    )

    assert result["analysis_status"] == "low_quality"
    assert result["candidate_counts"]["diagnostic_seed_characters"] == 9
    assert result["candidate_counts"]["needs_ai_repair_characters"] == 9
    assert any("diagnostic seeds" in issue for issue in result["quality_issues"])
    assert result["candidate_counts"]["model_stage_deep_recommended"] is True
    assert result["model_stage_plan"]["next_recommended_stage"] == "extractor_deep"
    stages = {stage["model_role"]: stage for stage in result["model_stage_plan"]["stages"]}
    assert stages["extractor_repair"]["status"] == "skipped"
    assert stages["extractor_deep"]["status"] == "recommended"


def test_import_model_stage_plan_repairs_empty_foundation_before_deep():
    scheduler = build_scheduler(storage_manager=MemoryStorageManager())

    plan = scheduler._build_import_model_stage_plan(
        diagnostics={},
        candidate_counts={},
        failed_chapters=[],
        quality_issues=["角色提取为空"],
        errors=[],
        analysis_status="failed",
        model_route=None,
    )

    stages = {stage["model_role"]: stage for stage in plan["stages"]}
    assert plan["next_recommended_stage"] == "extractor_repair"
    assert stages["extractor_repair"]["status"] == "recommended"
    assert stages["extractor_repair"]["evidence"]["foundational_retry_needed"] is True
    assert stages["extractor_deep"]["status"] == "blocked"


def test_import_chapter_index_analysis_persists_attempt_run_state():
    class RecorderExtractionService:
        async def extract_chapter_index_assets(self, chapters, diagnostics_recorder=None, model_role=None):
            assert diagnostics_recorder is not None
            assert model_role == "extractor_fast"
            await diagnostics_recorder({
                "event_type": "attempt",
                "record": {
                    "chapter_id": "chapter-1",
                    "chapter_title": "第一章",
                    "chapter_order": 1,
                    "attempt_number": 1,
                    "status": "success",
                    "model_used": "route-model",
                    "latency_ms": 123,
                    "error_type": None,
                    "raw_response_hash": "abc123",
                    "parsed_candidate_counts": {"characters": 8},
                    "retry_count": 0,
                    "needs_retry": False,
                },
            })
            await diagnostics_recorder({
                "event_type": "status",
                "record": {
                    "chapter_id": "chapter-1",
                    "chapter_title": "第一章",
                    "chapter_order": 1,
                    "status": "success",
                    "model_used": "route-model",
                    "attempt_count": 1,
                    "latency_ms": 123,
                    "error_type": None,
                    "error": None,
                    "parsed_candidate_counts": {"characters": 8},
                    "needs_retry": False,
                },
            })
            characters = [
                Character(
                    name=f"角色{i}",
                    role=CharacterRole.PROTAGONIST if i == 1 else CharacterRole.SUPPORTING,
                    description="可用于创作的人物",
                )
                for i in range(1, 9)
            ]
            relationships = [
                NetworkEdge(
                    source=f"角色{i}",
                    target=f"角色{(i % 8) + 1}",
                    relationship_type=RelationshipType.FRIEND,
                    description="互相牵引",
                )
                for i in range(1, 9)
            ]
            timeline_events = [
                TimelineEvent(
                    title=f"事件{i}",
                    description=f"角色{i}经历了关键转折。",
                    characters=[f"角色{i}"],
                )
                for i in range(1, 7)
            ]
            return {
                "characters": characters,
                "relationships": relationships,
                "timeline_events": timeline_events,
                "world_setting": WorldSetting(history="旧时代留下未解的约定"),
                "analysis_diagnostics": {
                    "candidate_counts": {},
                    "failed_chapters": [],
                    "relationship_unresolved_endpoints": [],
                    "timeline_mismatch_events": [],
                    "model_route": {
                        "role": "extractor_fast",
                        "selected_model": "route-model",
                        "reason": "probe_passed",
                        "candidates": ["route-model"],
                    },
                },
                "model_route": {
                    "role": "extractor_fast",
                    "selected_model": "route-model",
                    "reason": "probe_passed",
                    "candidates": ["route-model"],
                },
            }

    storage = MemoryStorageManager()
    scheduler = build_scheduler(storage_manager=storage)
    task = Task(
        id="import-attempt-persist",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={"session_id": "session-attempt", "parent_id": "novel-attempt"},
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._run_import_chapter_index_analysis(
        RecorderExtractionService(),
        [{"id": "chapter-1", "title": "第一章", "chapter_index": 1, "content": "正文"}],
        task,
    ))

    run_key = "chapter_index_run_import-attempt-persist"
    persisted = storage.saved[run_key]
    assert persisted["total_chapters"] == 1
    assert persisted["model_role"] == "extractor_fast"
    assert persisted["chapter_index_attempts"][0]["model_used"] == "route-model"
    assert persisted["chapter_index_status"][0]["status"] == "success"
    assert persisted["model_route"]["selected_model"] == "route-model"
    assert result["analysis_diagnostics"]["chapter_index_run_key"] == run_key
    assert result["analysis_diagnostics"]["chapter_index_attempts"][0]["raw_response_hash"] == "abc123"
    assert result["candidate_counts"]["chapter_index_attempts"] == 1
    assert result["candidate_counts"]["chapter_index_needs_retry"] == 0


def test_chapter_index_analysis_records_model_health_events():
    class RecorderExtractionService:
        async def extract_chapter_index_assets(self, chapters, diagnostics_recorder=None, model_role=None, repair_strategy=None):
            if diagnostics_recorder:
                await diagnostics_recorder({
                    "event_type": "attempt",
                    "record": {
                        "chapter_id": "chapter-1",
                        "chapter_title": "chapter",
                        "chapter_order": 1,
                        "attempt_number": 1,
                        "status": "success",
                        "model_used": "route-model",
                        "latency_ms": 1200,
                        "raw_response_hash": "abc123",
                        "needs_retry": False,
                    },
                })
                await diagnostics_recorder({
                    "event_type": "status",
                    "record": {
                        "chapter_id": "chapter-1",
                        "chapter_title": "chapter",
                        "chapter_order": 1,
                        "status": "success",
                        "model_used": "route-model",
                        "needs_retry": False,
                    },
                })
            return {
                "characters": [],
                "relationships": [],
                "timeline_events": [],
                "world_setting": None,
                "analysis_diagnostics": {
                    "candidate_counts": {},
                    "model_route": {
                        "role": model_role,
                        "selected_model": "route-model",
                        "reason": "probe_skipped",
                        "candidates": ["route-model"],
                    },
                },
                "model_route": {
                    "role": model_role,
                    "selected_model": "route-model",
                    "reason": "probe_skipped",
                    "candidates": ["route-model"],
                },
            }

    storage = MemoryStorageManager()
    scheduler = build_scheduler(storage_manager=storage)
    task = Task(
        id="model-health",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={"session_id": "session-health", "parent_id": "novel-health"},
        created_at=datetime.now(),
    )

    asyncio.run(scheduler._extract_chapter_index_assets_with_persisted_diagnostics(
        RecorderExtractionService(),
        [{"id": "chapter-1", "title": "chapter", "chapter_index": 1, "content": "text"}],
        task,
    ))

    health_events = [
        item
        for key, item in storage.saved.items()
        if key.startswith("model_health_event_")
    ]
    assert len(health_events) == 2
    assert {event["source"] for event in health_events} == {"model_route_selected", "chapter_index_attempt"}
    assert all(event["session_id"] == "session-health" for event in health_events)
    assert all(event["parent_id"] == "novel-health" for event in health_events)


def test_chapter_index_rerun_uses_repair_model_role():
    captured = {}

    class RecorderExtractionService:
        async def extract_chapter_index_assets(self, chapters, diagnostics_recorder=None, model_role=None, repair_strategy=None):
            captured["model_role"] = model_role
            captured["repair_strategy"] = repair_strategy
            return {
                "characters": [],
                "relationships": [],
                "timeline_events": [],
                "world_setting": None,
                "analysis_diagnostics": {
                    "candidate_counts": {},
                    "model_route": {
                        "role": model_role,
                        "selected_model": "repair-model",
                        "reason": "probe_skipped",
                        "candidates": ["repair-model"],
                    },
                },
                "candidate_counts": {},
                "failed_chapters": [],
                "chapter_index_attempts": [],
                "chapter_index_status": [],
                "model_route": {
                    "role": model_role,
                    "selected_model": "repair-model",
                    "reason": "probe_skipped",
                    "candidates": ["repair-model"],
                },
            }

    storage = MemoryStorageManager()
    scheduler = build_scheduler(storage_manager=storage)
    task = Task(
        id="repair-role",
        type="chapter_index_rerun",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={
            "session_id": "session-repair",
            "parent_id": "novel-repair",
            "chapter_index_status": [
                {"chapter_id": "chapter-1", "status": "failed", "needs_retry": True, "error_type": "gateway_timeout"}
            ],
        },
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._extract_chapter_index_assets_with_persisted_diagnostics(
        RecorderExtractionService(),
        [{"id": "chapter-1", "title": "第一章", "chapter_index": 1, "content": "正文"}],
        task,
    ))

    assert captured["model_role"] == "extractor_repair"
    assert captured["repair_strategy"]["error_types"] == ["gateway_timeout"]
    assert captured["repair_strategy"]["actions"] == ["shrink_chunk_and_extend_timeout"]
    assert captured["repair_strategy"]["runtime_settings_overrides"]["concurrency"] == 1
    assert captured["repair_strategy"]["runtime_settings_overrides"]["chunk_size"] == 1200
    assert storage.saved["chapter_index_run_repair-role"]["model_role"] == "extractor_repair"
    assert storage.saved["chapter_index_run_repair-role"]["repair_strategy"]["actions"] == ["shrink_chunk_and_extend_timeout"]
    assert result["model_route"]["role"] == "extractor_repair"
    assert result["analysis_diagnostics"]["repair_strategy"]["error_types"] == ["gateway_timeout"]


def test_chapter_index_repair_strategy_combines_error_type_actions():
    class RepairConfig(DummyConfig):
        def get_model_role_settings(self, role):
            if role == "extractor_repair":
                return {"timeout": 240.0, "concurrency": 3, "chunk_size": 2200, "max_tokens": 2600}
            return {}

    scheduler = AITaskScheduler(DummyAIService(), MemoryStorageManager(), RepairConfig())
    task = Task(
        id="repair-strategy",
        type="chapter_index_rerun",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={
            "chapter_index_status": [
                {"chapter_id": "a", "status": "failed", "error_type": "json_invalid"},
                {"chapter_id": "b", "status": "failed", "error_type": "rate_limited"},
            ],
            "analysis_diagnostics": {
                "failed_chapters": [{"chapter_id": "c", "error_type": "empty_content"}],
            },
        },
        created_at=datetime.now(),
    )

    strategy = scheduler._chapter_index_repair_strategy_for_task(task, "extractor_repair")

    assert strategy["error_types"] == ["empty_content", "json_invalid", "rate_limited"]
    assert strategy["actions"] == [
        "cooldown_and_lower_concurrency",
        "prefer_json_repair",
        "schema_repair_first",
        "switch_model_after_empty_content",
    ]
    assert strategy["runtime_settings_overrides"]["concurrency"] == 1
    assert strategy["runtime_settings_overrides"]["max_tokens"] == 4000
    assert strategy["runtime_settings_overrides"]["timeout"] == 300.0


def test_chapter_index_rerun_splits_batches_by_error_type():
    calls = []

    class SplitRecorderExtractionService:
        async def extract_chapter_index_assets(self, chapters, diagnostics_recorder=None, model_role=None, repair_strategy=None):
            calls.append({
                "chapter_ids": [chapter["id"] for chapter in chapters],
                "repair_strategy": repair_strategy,
                "model_role": model_role,
            })
            return {
                "characters": [],
                "relationships": [],
                "timeline_events": [],
                "world_setting": None,
                "chapter_indices": [
                    {
                        "chapter_id": chapter["id"],
                        "chapter_title": chapter["title"],
                        "chapter_order": chapter["chapter_index"],
                        "chapter_characters": [],
                        "chapter_interactions": [],
                        "chapter_events": [],
                        "chapter_world_facts": [],
                    }
                    for chapter in chapters
                ],
                "analysis_diagnostics": {
                    "candidate_counts": {},
                    "model_route": {
                        "role": model_role,
                        "selected_model": f"{repair_strategy['actions'][0]}-model",
                        "reason": "probe_skipped",
                        "candidates": [f"{repair_strategy['actions'][0]}-model"],
                    },
                },
                "candidate_counts": {},
                "failed_chapters": [],
                "chapter_index_attempts": [],
                "chapter_index_status": [],
                "model_route": {
                    "role": model_role,
                    "selected_model": f"{repair_strategy['actions'][0]}-model",
                    "reason": "probe_skipped",
                    "candidates": [f"{repair_strategy['actions'][0]}-model"],
                },
            }

    storage = MemoryStorageManager()
    scheduler = build_scheduler(storage_manager=storage)
    task = Task(
        id="repair-split",
        type="chapter_index_rerun",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={
            "session_id": "session-repair",
            "parent_id": "novel-repair",
            "chapter_index_status": [
                {"chapter_id": "chapter-timeout", "status": "failed", "needs_retry": True, "error_type": "gateway_timeout"},
                {"chapter_id": "chapter-json", "status": "failed", "needs_retry": True, "error_type": "json_invalid"},
            ],
        },
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._extract_chapter_index_assets_with_persisted_diagnostics(
        SplitRecorderExtractionService(),
        [
            {"id": "chapter-timeout", "title": "timeout", "chapter_index": 1, "content": "text"},
            {"id": "chapter-json", "title": "json", "chapter_index": 2, "content": "text"},
        ],
        task,
    ))

    assert len(calls) == 2
    assert {tuple(call["chapter_ids"]) for call in calls} == {("chapter-timeout",), ("chapter-json",)}
    actions_by_chapter = {
        call["chapter_ids"][0]: call["repair_strategy"]["actions"]
        for call in calls
    }
    assert actions_by_chapter["chapter-timeout"] == ["shrink_chunk_and_extend_timeout"]
    assert actions_by_chapter["chapter-json"] == ["prefer_json_repair", "schema_repair_first"]
    assert storage.saved["chapter_index_run_repair-split"]["repair_strategy"]["split_by_error_type"] is True
    assert storage.saved["chapter_index_run_repair-split"]["repair_strategy"]["batch_count"] == 2
    assert len(result["analysis_diagnostics"]["repair_strategy_batches"]) == 2
    assert len(result["analysis_diagnostics"]["model_route_batches"]) == 2
    assert result["candidate_counts"]["chapter_index_repair_batch_count"] == 2
    assert [item["chapter_id"] for item in result["chapter_indices"]] == ["chapter-timeout", "chapter-json"]


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


def test_import_chapter_split_size_uses_extractor_fast_role_settings(monkeypatch):
    class ChunkConfig(DummyConfig):
        def get_model_role_settings(self, role):
            if role == "extractor_fast":
                return {"chunk_size": 1200}
            return {}

    scheduler = AITaskScheduler(DummyAIService(), MemoryStorageManager(), ChunkConfig())

    # Isolate: clear any process-level override so role-settings default is tested.
    monkeypatch.delenv("NOVELFORGE_IMPORT_CHAPTER_MAX_CHARS", raising=False)
    assert scheduler._resolve_import_chapter_max_chars() == 1200

    monkeypatch.setenv("NOVELFORGE_IMPORT_CHAPTER_MAX_CHARS", "500")
    assert scheduler._resolve_import_chapter_max_chars() == 800

    monkeypatch.setenv("NOVELFORGE_IMPORT_CHAPTER_MAX_CHARS", "9000")
    assert scheduler._resolve_import_chapter_max_chars() == 9000


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
    assert result["model_stage_plan"]["next_recommended_stage"] is None
    stages = {stage["model_role"]: stage for stage in result["model_stage_plan"]["stages"]}
    assert stages["extractor_fast"]["status"] == "completed"
    assert stages["extractor_repair"]["status"] == "skipped"
    assert stages["extractor_deep"]["status"] == "skipped"
    assert stages["judge"]["status"] == "completed"
    assert result["analysis_diagnostics"]["model_stage_plan"]["pipeline"] == [
        "extractor_fast",
        "extractor_repair",
        "extractor_deep",
        "judge",
    ]


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
    assert result["model_stage_plan"]["next_recommended_stage"] == "extractor_repair"
    stages = {stage["model_role"]: stage for stage in result["model_stage_plan"]["stages"]}
    assert stages["extractor_repair"]["status"] == "recommended"
    assert stages["extractor_deep"]["status"] == "blocked"


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


def test_deep_asset_enrichment_returns_preview_with_deep_model_role(monkeypatch):
    import novelforge.services.extraction_service as extraction_module

    class FakeExtractionService:
        def __init__(self):
            self.received_chapters = None
            self.received_model_role = None

        async def extract_chapter_index_assets(
            self,
            chapters,
            diagnostics_recorder=None,
            model_role=None,
            repair_strategy=None,
        ):
            self.received_chapters = chapters
            self.received_model_role = model_role
            return {
                "characters": [
                    Character(
                        name="Alex",
                        role=CharacterRole.PROTAGONIST,
                        description="A focused protagonist with clearer motive.",
                        personality="guarded but loyal",
                    )
                ],
                "relationships": [
                    NetworkEdge(
                        source="Alex",
                        target="Mira",
                        relationship_type=RelationshipType.FRIEND,
                        description="They rely on each other under pressure.",
                        evidence=["Alex waits for Mira before entering the sealed room."],
                    )
                ],
                "timeline_events": [
                    TimelineEvent(
                        title="The sealed room opens",
                        description="Alex and Mira uncover the rule that changes their choices.",
                        characters=["Alex", "Mira"],
                        evidence=["The sealed room opens only when both names are spoken."],
                    )
                ],
                "world_setting": WorldSetting(
                    history="The city records debts as public memory.",
                    rules=["Names can unlock old obligations."],
                ),
                "analysis_diagnostics": {
                    "candidate_counts": {"chapter_character_candidates": 2},
                    "model_route": {"role": model_role, "model": "deep-model"},
                    "failed_chapters": [],
                },
            }

    service = FakeExtractionService()
    monkeypatch.setattr(extraction_module, "get_extraction_service", lambda *args, **kwargs: service)

    content_manager = RecordingContentManager()
    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="chapter-deep-1",
            title="Chapter 1",
            type=ContentType.CHAPTER,
            parent_id="novel-deep",
            session_id="session-deep",
        ),
        content="Alex waits for Mira before entering the sealed room.",
        extracted_data={"chapter_index": 1},
    )))
    scheduler = build_scheduler(content_manager=content_manager, storage_manager=MemoryStorageManager())
    task = Task(
        id="task-deep-enrichment",
        type="deep_asset_enrichment",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.MEDIUM,
        parameters={
            "session_id": "session-deep",
            "parent_id": "novel-deep",
            "analysis_diagnostics": {
                "needs_ai_repair_characters": ["Alex"],
                "weak_relationships": [{"source": "Alex", "target": "Mira", "missing_signals": ["debt"]}],
                "weak_world_facts": [{"name": "The sealed room", "reason": "rule lacks consequence"}],
            },
            "quality_issues": ["core relationship lacks emotional tension"],
        },
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._process_import_repair_task(task))

    assert service.received_chapters[0]["id"] == "chapter-deep-1"
    assert service.received_model_role == "extractor_deep"
    assert result["repair_type"] == "deep_assets"
    assert result["write_mode"] == "preview"
    assert result["model_role"] == "extractor_deep"
    assert result["characters_count"] == 1
    assert result["relationships_count"] == 1
    assert result["timeline_count"] == 1
    assert result["world_count"] == 1
    assert result["characters"][0]["name"] == "Alex"
    assert result["world_setting"]["rules"] == ["Names can unlock old obligations."]
    assert result["relationships"][0]["source"] == "Alex"
    assert result["timeline_events"][0]["title"] == "The sealed room opens"
    assert result["analysis_diagnostics"]["model_route"]["role"] == "extractor_deep"
    assert result["deep_enrichment_targets"]["counts"]["needs_ai_repair_characters"] == 1
    assert result["deep_enrichment_targets"]["counts"]["weak_relationships"] == 1
    assert result["deep_enrichment_targets"]["counts"]["weak_world_facts"] == 1
    assert result["deep_enrichment_targets"]["counts"]["quality_issues"] == 1
    assert len([item for item in content_manager.items if item.metadata.type != ContentType.CHAPTER]) == 0


def test_import_repair_task_filters_retryable_chapters_from_diagnostics(monkeypatch):
    import novelforge.services.extraction_service as extraction_module

    class FakeExtractionService:
        def __init__(self):
            self.received_chapters = None

        async def extract_chapter_index_assets(self, chapters):
            self.received_chapters = chapters
            return {
                "characters": [],
                "relationships": [],
                "timeline_events": [],
                "world_setting": None,
                "analysis_diagnostics": {
                    "candidate_counts": {},
                    "failed_chapters": [],
                    "chapter_index_status": [],
                },
            }

    service = FakeExtractionService()
    monkeypatch.setattr(extraction_module, "get_extraction_service", lambda *args, **kwargs: service)

    content_manager = RecordingContentManager()
    for index in range(1, 4):
        asyncio.run(content_manager.create_content(ContentItem(
            metadata=ContentMetadata(
                id=f"chapter-{index}",
                title=f"第{index}章",
                type=ContentType.CHAPTER,
                parent_id="novel-retry",
                session_id="session-retry",
            ),
            content=f"正文 {index}",
            extracted_data={"chapter_index": index},
        )))

    scheduler = build_scheduler(content_manager=content_manager, storage_manager=MemoryStorageManager())
    task = Task(
        id="rerun-diagnostics-task",
        type="chapter_index_rerun",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.MEDIUM,
        parameters={
            "session_id": "session-retry",
            "parent_id": "novel-retry",
            "analysis_diagnostics": {
                "chapter_index_status": [
                    {"chapter_id": "chapter-1", "status": "success", "needs_retry": False},
                    {"chapter_id": "chapter-2", "status": "failed", "needs_retry": True},
                    {"chapter_id": "chapter-3", "status": "success", "needs_retry": False},
                ]
            },
        },
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._process_import_repair_task(task))

    assert [chapter["id"] for chapter in service.received_chapters] == ["chapter-2"]
    assert result["chapters_count"] == 1


def test_import_repair_task_filters_explicit_failed_chapters(monkeypatch):
    import novelforge.services.extraction_service as extraction_module

    class FakeExtractionService:
        def __init__(self):
            self.received_chapters = None

        async def extract_chapter_index_assets(self, chapters):
            self.received_chapters = chapters
            return {
                "characters": [],
                "relationships": [],
                "timeline_events": [],
                "world_setting": None,
                "analysis_diagnostics": {},
            }

    service = FakeExtractionService()
    monkeypatch.setattr(extraction_module, "get_extraction_service", lambda *args, **kwargs: service)

    content_manager = RecordingContentManager()
    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="chapter-ok",
            title="已成功章",
            type=ContentType.CHAPTER,
            parent_id="novel-failed-filter",
            session_id="session-failed-filter",
        ),
        content="成功正文",
        extracted_data={"chapter_index": 1},
    )))
    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="chapter-failed",
            title="失败章",
            type=ContentType.CHAPTER,
            parent_id="novel-failed-filter",
            session_id="session-failed-filter",
        ),
        content="失败正文",
        extracted_data={"chapter_index": 2},
    )))

    scheduler = build_scheduler(content_manager=content_manager, storage_manager=MemoryStorageManager())
    task = Task(
        id="rerun-failed-filter-task",
        type="chapter_index_rerun",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.MEDIUM,
        parameters={
            "session_id": "session-failed-filter",
            "parent_id": "novel-failed-filter",
            "failed_chapters": [{"chapter_id": "chapter-failed", "error_type": "gateway_timeout"}],
        },
        created_at=datetime.now(),
    )

    asyncio.run(scheduler._process_import_repair_task(task))

    assert [chapter["id"] for chapter in service.received_chapters] == ["chapter-failed"]


def test_import_repair_task_merges_previous_successful_chapter_indices(monkeypatch):
    import novelforge.services.extraction_service as extraction_module

    previous_index = ChapterIndex(
        chapter_id="chapter-ok",
        chapter_title="已成功章",
        chapter_order=1,
        chapter_characters=[
            ChapterCharacterCandidate(
                name="林墨",
                role_hint="protagonist",
                description="在上一轮成功章中建立的人物。",
                evidence=["林墨在雨里等候。"],
            )
        ],
    )
    rerun_index = ChapterIndex(
        chapter_id="chapter-failed",
        chapter_title="失败章",
        chapter_order=2,
        chapter_characters=[
            ChapterCharacterCandidate(
                name="周岚",
                role_hint="supporting",
                description="重跑失败章后补回的人物。",
                evidence=["周岚终于赶到旧桥。"],
            )
        ],
        chapter_interactions=[
            ChapterInteractionCandidate(
                source="林墨",
                target="周岚",
                relationship_type="friend",
                description="两人在旧桥重新并肩。",
                evidence=["林墨与周岚在旧桥重新并肩。"],
            )
        ],
    )

    class FakeExtractionService:
        def __init__(self):
            self.received_chapters = None

        async def extract_chapter_index_assets(self, chapters, diagnostics_recorder=None):
            self.received_chapters = chapters
            if diagnostics_recorder:
                await diagnostics_recorder({"event_type": "chapter_index", "record": rerun_index.model_dump()})
                await diagnostics_recorder({
                    "event_type": "status",
                    "record": {
                        "chapter_id": "chapter-failed",
                        "chapter_title": "失败章",
                        "chapter_order": 2,
                        "status": "success",
                        "model_used": "repair-model",
                        "attempt_count": 1,
                        "latency_ms": 100,
                        "error_type": None,
                        "error": None,
                        "parsed_candidate_counts": {"characters": 1, "interactions": 1, "events": 0, "world_facts": 0},
                        "needs_retry": False,
                    },
                })
            return {
                "characters": [Character(name="周岚", role=CharacterRole.SUPPORTING, description="配角")],
                "relationships": [],
                "timeline_events": [],
                "world_setting": None,
                "chapter_indices": [rerun_index.model_dump()],
                "analysis_diagnostics": {
                    "candidate_counts": {"chapters_indexed": 1},
                    "failed_chapters": [],
                    "chapter_index_status": [],
                },
            }

    service = FakeExtractionService()
    monkeypatch.setattr(extraction_module, "get_extraction_service", lambda *args, **kwargs: service)

    content_manager = RecordingContentManager()
    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="chapter-ok",
            title="已成功章",
            type=ContentType.CHAPTER,
            parent_id="novel-merge-history",
            session_id="session-merge-history",
        ),
        content="林墨在雨里等候。",
        extracted_data={"chapter_index": 1},
    )))
    asyncio.run(content_manager.create_content(ContentItem(
        metadata=ContentMetadata(
            id="chapter-failed",
            title="失败章",
            type=ContentType.CHAPTER,
            parent_id="novel-merge-history",
            session_id="session-merge-history",
        ),
        content="周岚终于赶到旧桥。",
        extracted_data={"chapter_index": 2},
    )))

    storage = MemoryStorageManager()
    storage.saved["chapter_index_run_previous"] = {
        "task_id": "previous",
        "chapter_indices": [previous_index.model_dump()],
        "chapter_index_status": [
            {"chapter_id": "chapter-ok", "status": "success", "needs_retry": False},
            {"chapter_id": "chapter-failed", "status": "failed", "needs_retry": True},
        ],
    }
    scheduler = build_scheduler(content_manager=content_manager, storage_manager=storage)
    task = Task(
        id="rerun-merge-history-task",
        type="relationship_backfill",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.MEDIUM,
        parameters={
            "session_id": "session-merge-history",
            "parent_id": "novel-merge-history",
            "analysis_diagnostics": {
                "chapter_index_run_key": "chapter_index_run_previous",
                "chapter_index_status": [
                    {"chapter_id": "chapter-ok", "status": "success", "needs_retry": False},
                    {"chapter_id": "chapter-failed", "status": "failed", "needs_retry": True},
                ],
            },
        },
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._process_import_repair_task(task))

    assert [chapter["id"] for chapter in service.received_chapters] == ["chapter-failed"]
    assert result["characters_count"] == 2
    assert result["relationships_count"] == 1
    assert result["relationships"][0]["source"] == "林墨"
    assert result["relationships"][0]["target"] == "周岚"
    assert result["candidate_counts"]["chapter_index_history_reused"] == 1
    assert result["candidate_counts"]["chapter_index_combined_indices"] == 2
    assert result["analysis_diagnostics"]["chapter_index_history_run_key"] == "chapter_index_run_previous"
    assert result["analysis_diagnostics"]["chapter_index_history_reused_chapters"] == ["chapter-ok"]
    assert len(result["chapter_indices"]) == 2


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
    assert len(result["created_content_ids"]) == 2
    assert result["written_assets"][0]["type"] == "relationship"
    assert result["written_assets"][0]["id"] == relationship_items[0].metadata.id
    assert result["written_assets"][1]["type"] == "timeline"
    assert result["written_assets"][1]["id"] == timeline_items[0].metadata.id
    assert relationship_items[0].metadata.tags[0] == "repair-preview"
    assert relationship_items[0].relations == {"source": ["林墨"], "target": ["周岚"]}
    assert timeline_items[0].relations == {"characters": ["林墨", "周岚"], "locations": ["雨城"]}


def test_import_repair_apply_task_writes_deep_character_and_world_assets():
    content_manager = RecordingContentManager()
    scheduler = build_scheduler(content_manager=content_manager, storage_manager=MemoryStorageManager())
    preview_result = {
        "repair_type": "deep_assets",
        "characters": [
            {
                "name": "Alex",
                "role": "protagonist",
                "description": "A focused protagonist with clearer motive.",
                "personality": "guarded but loyal",
                "quality_flags": ["needs_ai_repair"],
            }
        ],
        "world_setting": {
            "history": "The city records debts as public memory.",
            "rules": ["Names can unlock old obligations."],
            "themes": ["memory", "debt"],
        },
    }
    task = Task(
        id="task-deep-apply",
        type="import_repair_apply",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.MEDIUM,
        parameters={
            "session_id": "session-deep-apply",
            "parent_id": "novel-deep-apply",
            "preview_task_id": "preview-deep-1",
            "preview_result": preview_result,
        },
        created_at=datetime.now(),
    )

    result = asyncio.run(scheduler._process_import_repair_apply_task(task))

    character_items = [item for item in content_manager.items if item.metadata.type == ContentType.CHARACTER]
    world_items = [item for item in content_manager.items if item.metadata.type == ContentType.WORLD]
    assert result["write_mode"] == "confirmed"
    assert result["characters_count"] == 1
    assert result["world_count"] == 1
    assert result["relationships_count"] == 0
    assert result["timeline_count"] == 0
    assert [asset["type"] for asset in result["written_assets"]] == ["character", "world"]
    assert character_items[0].metadata.tags[:3] == ["repair-preview", "ai-repaired", "character-enrichment"]
    assert character_items[0].extracted_data["source_type"] == "user_confirmed_repair"
    assert character_items[0].extracted_data["repair_status"] == "confirmed"
    assert character_items[0].extracted_data["repair_source_task_id"] == "preview-deep-1"
    assert "character_enriched" in character_items[0].extracted_data["quality_flags"]
    assert world_items[0].metadata.tags[:3] == ["repair-preview", "ai-repaired", "world-enrichment"]
    assert world_items[0].extracted_data["source_type"] == "user_confirmed_repair"
    assert world_items[0].extracted_data["repair_status"] == "confirmed"
    assert world_items[0].extracted_data["repair_source_task_id"] == "preview-deep-1"
    assert "world_enriched" in world_items[0].extracted_data["quality_flags"]

    duplicate_task = Task(
        id="task-deep-apply-duplicate",
        type="import_repair_apply",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.MEDIUM,
        parameters={
            "session_id": "session-deep-apply",
            "parent_id": "novel-deep-apply",
            "preview_task_id": "preview-deep-1",
            "preview_result": preview_result,
        },
        created_at=datetime.now(),
    )

    duplicate_result = asyncio.run(scheduler._process_import_repair_apply_task(duplicate_task))

    assert duplicate_result["characters_count"] == 0
    assert duplicate_result["world_count"] == 0
    assert duplicate_result["written_assets"] == []
    assert len([item for item in content_manager.items if item.metadata.type == ContentType.CHARACTER]) == 1
    assert len([item for item in content_manager.items if item.metadata.type == ContentType.WORLD]) == 1


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
    assert result["created_content_ids"] == []
    assert result["written_assets"] == []
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


def test_chapter_index_analysis_propagates_provider_unavailable():
    class ProviderUnavailableService:
        async def extract_chapter_index_assets(self, chapters, diagnostics_recorder=None, model_role=None, repair_strategy=None):
            return {
                "characters": [],
                "relationships": [],
                "timeline_events": [],
                "world_setting": None,
                "analysis_diagnostics": {
                    "provider_unavailable": True,
                    "provider_health_summary": {
                        "all_candidates_failed": True,
                        "failed_routes": ["model-a", "model-b"],
                        "recommended_action": "check_provider_status_or_wait",
                    },
                    "model_route": {
                        "role": "extractor_fast",
                        "selected_model": "model-a",
                        "reason": "no_probe_passed_using_best_score",
                        "candidates": ["model-a", "model-b"],
                    },
                },
                "model_route": {
                    "role": "extractor_fast",
                    "selected_model": "model-a",
                    "reason": "no_probe_passed_using_best_score",
                    "candidates": ["model-a", "model-b"],
                },
            }

    scheduler = build_scheduler(storage_manager=MemoryStorageManager())
    task = Task(
        id="provider-unavailable",
        type="novel_import",
        status=TaskStatus.RUNNING,
        priority=TaskPriority.HIGH,
        parameters={"session_id": "session-pu", "parent_id": "novel-pu"},
        created_at=datetime.now(),
    )

    result = asyncio.run(
        scheduler._run_import_chapter_index_analysis(
            ProviderUnavailableService(),
            [{"id": "chapter-1", "title": "第一章", "chapter_index": 1, "content": "正文"}],
            task,
        )
    )

    assert result["status"] == "provider_unavailable"
    assert result["retryable"] is True
    assert result["provider_health_summary"]["all_candidates_failed"] is True
    assert result["failed_routes"] == ["model-a", "model-b"]
    assert result["recommended_action"] == "check_provider_status_or_wait"
    assert result["analysis_status"] == "failed"
    assert result["stage_results"]["chapter_index"] == "failed"
    assert result["characters"] == []
    assert result["world_setting"] is None
    assert result["timeline_events"] == []
    assert result["relationships"] == []
    assert result["chapter_index_attempts"] == []
    # Safe diagnostics: no raw text leakage
    result_str = str(result)
    assert "正文" not in result_str
    assert "chapter-1" not in result_str
