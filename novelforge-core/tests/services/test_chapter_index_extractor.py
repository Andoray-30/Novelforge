import asyncio

from novelforge.extractors.chapter_index_extractor import (
    ChapterCharacterCandidate,
    ChapterEventCandidate,
    ChapterIndex,
    ChapterIndexExtractor,
    ChapterInteractionCandidate,
    ChapterWorldFactCandidate,
)
from novelforge.extractors.base_extractor import ExtractionConfig


class DummyAIService:
    pass


class ScriptedAIService:
    def __init__(self, responses):
        self.responses = list(responses)
        self.config = type("Config", (), {"model": "scripted-model"})()

    async def chat(self, *_args, **_kwargs):
        if not self.responses:
            raise RuntimeError("no scripted response")
        result = self.responses.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


def build_extractor() -> ChapterIndexExtractor:
    return ChapterIndexExtractor(ai_service=DummyAIService())


def test_chapter_index_keeps_evidence_backed_minor_characters_as_minimal_profiles():
    extractor = build_extractor()
    index = ChapterIndex(
        chapter_id="chapter-1",
        chapter_title="第一章",
        chapter_order=1,
        chapter_characters=[
            ChapterCharacterCandidate(
                name="林墨",
                role_hint="protagonist",
                description="林墨独自进入雨夜。",
                desire="想找回失踪的人。",
                wound="害怕再次失去重要的人。",
                evidence=["林墨推开门，雨水沿着袖口往下滴。"],
                confidence="high",
            ),
            ChapterCharacterCandidate(
                name="小夏",
                role_hint="minor",
                evidence=["小夏把信塞进林墨掌心。"],
                confidence="medium",
            ),
        ],
    )

    result = extractor.merge_indices([index])

    names = {character.name for character in result.characters}
    assert {"林墨", "小夏"} <= names
    minor = next(character for character in result.characters if character.name == "小夏")
    assert minor.extraction_quality["profile_type"] == "minimal_profile"
    assert minor.source_contexts == ["小夏把信塞进林墨掌心。"]
    assert result.diagnostics.low_confidence_characters == [
        {
            "name": "小夏",
            "confidence": "medium",
            "profile_score": 0,
            "evidence_count": 1,
            "profile_type": "minimal_profile",
            "chapter_coverage": 1,
        }
    ]


def test_chapter_index_backfills_relationship_endpoint_with_evidence():
    extractor = build_extractor()
    index = ChapterIndex(
        chapter_id="chapter-1",
        chapter_title="第一章",
        chapter_order=1,
        chapter_characters=[
            ChapterCharacterCandidate(
                name="林墨",
                role_hint="protagonist",
                evidence=["林墨看见门外的人影。"],
            )
        ],
        chapter_interactions=[
            ChapterInteractionCandidate(
                source="林墨",
                target="小夏",
                relationship_type="friend",
                description="小夏把关键线索交给林墨。",
                tension="信任里带着隐瞒。",
                evidence=["小夏把信塞进林墨掌心。"],
            )
        ],
    )

    result = extractor.merge_indices([index])

    names = {character.name for character in result.characters}
    assert "小夏" in names
    assert not result.diagnostics.relationship_unresolved_endpoints
    assert result.relationships[0].source == "林墨"
    assert result.relationships[0].target == "小夏"


def test_chapter_index_splits_grouped_relationship_endpoints():
    extractor = build_extractor()
    index = ChapterIndex(
        chapter_id="chapter-1",
        chapter_title="第一章",
        chapter_order=1,
        chapter_characters=[
            ChapterCharacterCandidate(
                name="林墨",
                role_hint="protagonist",
                evidence=["林墨向两位朋友道歉。"],
            )
        ],
        chapter_interactions=[
            ChapterInteractionCandidate(
                source="林墨",
                target="小夏/阿岚",
                relationship_type="friend",
                description="两位朋友支撑了林墨。",
                evidence=["直到现在林墨才发觉自己被两人支撑了多少。"],
            )
        ],
    )

    result = extractor.merge_indices([index])

    names = {character.name for character in result.characters}
    assert {"小夏", "阿岚"} <= names
    edges = {(relationship.source, relationship.target) for relationship in result.relationships}
    assert ("林墨", "小夏") in edges
    assert ("林墨", "阿岚") in edges
    assert "小夏/阿岚" not in names


def test_chapter_index_concurrency_is_bounded(monkeypatch):
    monkeypatch.setenv("NOVELFORGE_CHAPTER_INDEX_CONCURRENCY", "9")
    assert build_extractor().chapter_concurrency == 8

    monkeypatch.setenv("NOVELFORGE_CHAPTER_INDEX_CONCURRENCY", "0")
    assert build_extractor().chapter_concurrency == 1

    monkeypatch.setenv("NOVELFORGE_CHAPTER_INDEX_CONCURRENCY", "invalid")
    assert build_extractor().chapter_concurrency == 4


def test_chapter_index_max_tokens_is_configurable_and_bounded(monkeypatch):
    monkeypatch.setenv("NOVELFORGE_CHAPTER_INDEX_MAX_TOKENS", "1200")
    assert build_extractor().max_tokens == 1200

    monkeypatch.setenv("NOVELFORGE_CHAPTER_INDEX_MAX_TOKENS", "9000")
    assert build_extractor().max_tokens == 5000

    monkeypatch.setenv("NOVELFORGE_CHAPTER_INDEX_MAX_TOKENS", "bad")
    assert build_extractor().max_tokens == 2500


def test_chapter_index_resolves_unique_single_character_alias_with_evidence():
    extractor = build_extractor()
    index = ChapterIndex(
        chapter_id="chapter-1",
        chapter_title="第一章",
        chapter_order=1,
        chapter_characters=[
            ChapterCharacterCandidate(name="彩叶", evidence=["彩叶举起武器。"]),
            ChapterCharacterCandidate(name="帝明", evidence=["帝明站在天守阁前。"]),
        ],
        chapter_interactions=[
            ChapterInteractionCandidate(
                source="彩叶",
                target="帝",
                relationship_type="rival",
                description="彩叶与帝在天守阁决战。",
                evidence=["彩叶与帝交锋，帝明的加速招式几乎撕开战局。"],
            )
        ],
    )

    result = extractor.merge_indices([index])

    assert not result.diagnostics.relationship_unresolved_endpoints
    assert result.relationships[0].target == "帝明"
    match = next(
        item
        for item in result.diagnostics.relationship_endpoint_resolution
        if item["raw_endpoint"] == "帝"
    )
    assert match["match_type"] == "unique_single_char_alias"
    assert match["matched_character_name"] == "帝明"
    assert match["confidence"] >= 0.8


def test_chapter_index_does_not_resolve_ambiguous_single_character_alias():
    extractor = build_extractor()
    index = ChapterIndex(
        chapter_id="chapter-1",
        chapter_title="第一章",
        chapter_order=1,
        chapter_characters=[
            ChapterCharacterCandidate(name="彩叶", evidence=["彩叶进入会场。"]),
            ChapterCharacterCandidate(name="帝明", evidence=["帝明已经登场。"]),
            ChapterCharacterCandidate(name="帝子", evidence=["帝子也站在同一侧。"]),
        ],
        chapter_interactions=[
            ChapterInteractionCandidate(
                source="彩叶",
                target="帝",
                relationship_type="rival",
                description="彩叶与帝交锋。",
                evidence=["彩叶与帝交锋。"],
            )
        ],
    )

    result = extractor.merge_indices([index])

    assert "帝" in result.diagnostics.relationship_unresolved_endpoints
    assert not result.relationships
    detail = result.diagnostics.relationship_unresolved_details[0]
    assert detail["match_type"] == "ambiguous_single_char_alias"
    assert sorted(detail["candidates"]) == ["帝子", "帝明"]


def test_chapter_index_prefers_explicit_alias_before_partial_matching():
    extractor = build_extractor()
    index = ChapterIndex(
        chapter_id="chapter-1",
        chapter_title="第一章",
        chapter_order=1,
        chapter_characters=[
            ChapterCharacterCandidate(name="彩叶", evidence=["彩叶注视舞台。"]),
            ChapterCharacterCandidate(name="月见八千代", aliases=["八千代"], evidence=["月见八千代出现在舞台中央。"]),
            ChapterCharacterCandidate(name="八千代子", evidence=["八千代子也在后台等待。"]),
        ],
        chapter_interactions=[
            ChapterInteractionCandidate(
                source="彩叶",
                target="八千代",
                relationship_type="mentor",
                description="八千代给了彩叶希望。",
                evidence=["八千代温柔地握住彩叶的手。"],
            )
        ],
    )

    result = extractor.merge_indices([index])

    assert result.relationships[0].target == "月见八千代"
    match = next(item for item in result.diagnostics.relationship_endpoint_resolution if item["raw_endpoint"] == "八千代")
    assert match["match_type"] == "explicit_alias"
    assert match["confidence"] >= 0.9


def test_chapter_index_marks_weak_single_character_resolution_for_review():
    extractor = build_extractor()
    index = ChapterIndex(
        chapter_id="chapter-1",
        chapter_title="第一章",
        chapter_order=1,
        chapter_characters=[
            ChapterCharacterCandidate(name="彩叶", evidence=["彩叶按住剑柄。"]),
            ChapterCharacterCandidate(name="帝明", evidence=["帝明已经先一步登上高台。"]),
        ],
        chapter_interactions=[
            ChapterInteractionCandidate(
                source="彩叶",
                target="帝",
                relationship_type="rival",
                description="彩叶被帝压迫到退无可退。",
                evidence=["彩叶被帝一步步逼退。"],
            )
        ],
    )

    result = extractor.merge_indices([index])

    match = next(item for item in result.diagnostics.relationship_endpoint_resolution if item["raw_endpoint"] == "帝")
    assert match["match_type"] == "unique_single_char_alias"
    assert match["matched_character_name"] == "帝明"
    assert match["needs_review"] is True
    assert result.diagnostics.relationship_low_confidence_resolved_endpoints == [match]


def test_chapter_index_keeps_unresolved_endpoint_when_no_evidence_allows_backfill():
    extractor = build_extractor()
    index = ChapterIndex(
        chapter_id="chapter-1",
        chapter_title="第一章",
        chapter_order=1,
        chapter_characters=[ChapterCharacterCandidate(name="林墨", evidence=["林墨关上门。"])],
        chapter_interactions=[
            ChapterInteractionCandidate(
                source="林墨",
                target="陌生人",
                relationship_type="other",
                description="林墨感觉有人在看他。",
                evidence=[],
            )
        ],
    )

    result = extractor.merge_indices([index])

    assert "陌生人" in result.diagnostics.relationship_unresolved_endpoints
    assert not result.relationships
    assert result.diagnostics.relationship_unresolved_details[0]["reason"] == "no_matching_character_alias"


def test_chapter_index_timeline_events_preserve_own_title_description_pairs():
    extractor = build_extractor()
    index = ChapterIndex(
        chapter_id="chapter-1",
        chapter_title="第一章",
        chapter_order=1,
        chapter_events=[
            ChapterEventCandidate(
                title="雨夜重逢",
                description="林墨在雨夜遇见小夏。",
                narrative_order=1,
                characters=["林墨", "小夏"],
                evidence=["雨幕里，小夏站在旧街灯下。"],
            ),
            ChapterEventCandidate(
                title="信件揭露",
                description="小夏递出的信揭开失踪案的第一条线索。",
                narrative_order=2,
                characters=["小夏"],
                evidence=["信封里只有一张被雨水晕开的照片。"],
            ),
        ],
    )

    result = extractor.merge_indices([index])

    events = {event.title: event.description for event in result.timeline_events}
    assert events["雨夜重逢"] == "林墨在雨夜遇见小夏。"
    assert events["信件揭露"] == "小夏递出的信揭开失踪案的第一条线索。"


def test_chapter_index_merges_world_facts_for_creative_use():
    extractor = build_extractor()
    index = ChapterIndex(
        chapter_id="chapter-1",
        chapter_title="第一章",
        chapter_order=1,
        chapter_world_facts=[
            ChapterWorldFactCandidate(
                name="旧城区",
                category="location",
                description="常年潮湿、街灯昏黄的旧街区。",
                emotional_use="适合承载秘密和重逢。",
                evidence=["旧街灯在雨里发出昏黄的光。"],
            ),
            ChapterWorldFactCandidate(
                name="雨",
                category="imagery",
                description="雨反复出现，形成压抑又温柔的氛围。",
                emotional_use="可作为序章情绪意象。",
                evidence=["雨水沿着袖口往下滴。"],
            ),
        ],
    )

    result = extractor.merge_indices([index])

    assert result.world_setting
    assert result.world_setting.locations[0].name == "旧城区"
    assert any("雨" in theme for theme in result.world_setting.themes)
def test_chapter_index_does_not_flag_evidence_backed_event_as_mismatch():
    extractor = build_extractor()
    index = ChapterIndex(
        chapter_id="chapter-1",
        chapter_title="chapter one",
        chapter_order=1,
        chapter_events=[
            ChapterEventCandidate(
                title="virtual and real opening",
                description="A heroine wins in the game, then returns to a tired real life.",
                narrative_order=1,
                characters=["heroine"],
                evidence=["The heroine takes off the headset and sees the cramped room."],
            ),
        ],
    )

    result = extractor.merge_indices([index])

    assert len(result.timeline_events) == 1
    assert result.diagnostics.timeline_mismatch_events == []


def test_chapter_index_records_success_attempt_diagnostics():
    extractor = ChapterIndexExtractor(ai_service=ScriptedAIService([
        """
        {
          "chapter_characters": [{"name": "林墨", "evidence": ["林墨推开门。"]}],
          "chapter_interactions": [],
          "chapter_events": [{"title": "入夜", "description": "林墨推门入夜。", "evidence": ["林墨推开门。"]}],
          "chapter_world_facts": [{"name": "旧宅", "category": "location", "description": "雨夜旧宅", "evidence": ["旧宅灯光昏暗。"]}]
        }
        """
    ]))

    result = asyncio.run(extractor.extract_and_merge([
        {"id": "chapter-1", "title": "第一章", "chapter_index": 1, "content": "林墨推开门。"}
    ]))

    attempts = result.diagnostics.chapter_index_attempts
    status = result.diagnostics.chapter_index_status
    assert len(attempts) == 1
    assert attempts[0]["status"] == "success"
    assert attempts[0]["model_used"] == "scripted-model"
    assert attempts[0]["raw_response_hash"]
    assert attempts[0]["parsed_candidate_counts"] == {
        "characters": 1,
        "interactions": 0,
        "events": 1,
        "world_facts": 1,
    }
    assert status == [
        {
            "chapter_id": "chapter-1",
            "chapter_title": "第一章",
            "chapter_order": 1,
            "status": "success",
            "model_used": "scripted-model",
            "attempt_count": 1,
            "latency_ms": status[0]["latency_ms"],
            "error_type": None,
            "error": None,
            "parsed_candidate_counts": {
                "characters": 1,
                "interactions": 0,
                "events": 1,
                "world_facts": 1,
            },
            "needs_retry": False,
        }
    ]
    assert result.diagnostics.candidate_counts["chapter_index_attempts"] == 1
    assert result.diagnostics.candidate_counts["chapter_index_needs_retry"] == 0


def test_chapter_index_records_failed_attempts_as_retryable():
    extractor = ChapterIndexExtractor(
        ai_service=ScriptedAIService([TimeoutError("API request timed out (3s)")]),
        config=ExtractionConfig(timeout=1.0, max_retries=1, retry_delay=0),
    )

    result = asyncio.run(extractor.extract_and_merge([
        {"id": "chapter-2", "title": "第二章", "chapter_index": 2, "content": "小夏站在雨里。"}
    ]))

    assert result.characters == []
    assert result.diagnostics.failed_chapters == [
        {
            "chapter_id": "chapter-2",
            "title": "第二章",
            "error": "API request timed out (3s)",
            "error_type": "timeout",
        }
    ]
    assert result.diagnostics.chapter_index_attempts[0]["status"] == "failed"
    assert result.diagnostics.chapter_index_attempts[0]["error_type"] == "timeout"
    assert result.diagnostics.chapter_index_attempts[0]["needs_retry"] is True
    assert result.diagnostics.chapter_index_status[0]["needs_retry"] is True
    assert result.diagnostics.candidate_counts["chapters_indexed"] == 0
    assert result.diagnostics.candidate_counts["chapter_index_failed_attempts"] == 1
