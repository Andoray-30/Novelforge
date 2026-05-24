import asyncio

from novelforge.extractors.chapter_index_extractor import (
    ChapterCharacterCandidate,
    ChapterEventCandidate,
    ChapterIndex,
    ChapterIndexExtractor,
    ChapterInteractionCandidate,
    ChapterWorldFactCandidate,
)


class DummyAIService:
    pass


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
