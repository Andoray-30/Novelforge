from novelforge.core.models import TimelineEvent
from novelforge.extractors.base_extractor import ExtractionConfig
from novelforge.extractors.unified_timeline_extractor import UnifiedTimelineExtractor


def test_timeline_event_quality_marks_evidenced_anchored_events_high_confidence():
    extractor = UnifiedTimelineExtractor(ExtractionConfig())

    event = extractor._create_event_from_dict(
        {
            "id": "event_001",
            "title": "主角离开故乡",
            "description": "林墨在第一章离开故乡，踏上旅程。",
            "characters": ["林墨"],
            "chapter_reference": "第一章",
            "evidence": ["林墨回头看了一眼故乡"],
        }
    )
    quality = extractor._build_event_quality(event)

    assert quality["confidence"] == "high"
    assert quality["evidence_count"] == 1
    assert quality["has_characters"] is True
    assert quality["has_time_anchor"] is True


def test_timeline_response_skips_empty_title_or_description():
    class ParserAIService:
        def _parse_json(self, response, expected_type=None):
            import json
            return json.loads(response)

    extractor = UnifiedTimelineExtractor(ExtractionConfig(), ParserAIService())

    events = extractor._parse_timeline_response(
        '{"events": [{"title": "", "description": "无标题"}, {"title": "有效事件", "description": "有描述", "evidence": ["证据"]}]}'
    )

    assert [event.title for event in events] == ["有效事件"]
    assert events[0].timeline_quality["confidence"] == "medium"


def test_timeline_merge_preserves_time_anchor_and_recomputes_quality():
    extractor = UnifiedTimelineExtractor(ExtractionConfig())
    base = TimelineEvent(title="相遇", description="林墨遇见周岚", characters=["林墨"], evidence=[])
    other = TimelineEvent(
        title="相遇",
        description="林墨在第一章遇见周岚，并决定同行。",
        characters=["周岚"],
        chapter_reference="第一章",
        evidence=["林墨遇见周岚"],
    )

    merged = extractor._merge_event_group([base, other])

    assert merged.description == "林墨在第一章遇见周岚，并决定同行。"
    assert merged.chapter_reference == "第一章"
    assert set(merged.characters) == {"林墨", "周岚"}
    assert merged.timeline_quality["confidence"] == "high"
