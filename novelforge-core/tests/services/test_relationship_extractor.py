from novelforge.core.models import Character, CharacterRole
from novelforge.extractors.unified_relationship_extractor import UnifiedRelationshipExtractor
from novelforge.extractors.base_extractor import ExtractionConfig


def test_relationship_extractor_normalizes_string_list_fields():
    extractor = UnifiedRelationshipExtractor(ExtractionConfig())

    relationship = extractor._create_relationship_from_dict(
        {
            "source": "酒寄彩叶",
            "target": "辉夜",
            "relationship_type": "friend",
            "description": "同居者与重要伙伴",
            "evidence": "彩叶收养辉夜",
            "evolution": "从同居者演变为彼此支撑的伙伴",
            "chapter_references": "第一卷 第二章",
        }
    )

    assert relationship.evidence == ["彩叶收养辉夜"]
    assert relationship.evolution == ["从同居者演变为彼此支撑的伙伴"]
    assert relationship.chapter_references == ["第一卷 第二章"]


def test_relationship_extractor_builds_character_guidance_context():
    extractor = UnifiedRelationshipExtractor(ExtractionConfig())

    context = extractor._build_character_context([
        Character(name="林墨", role=CharacterRole.PROTAGONIST, tags=["墨哥"]),
        Character(name="周岚", role=CharacterRole.SUPPORTING, tags=["岚姐"]),
    ])

    assert "标准名：林墨" in context
    assert "别名：墨哥" in context
    assert "标准名：周岚" in context


def test_guided_relationship_prompt_includes_candidate_pool():
    class CaptureAIService:
        def __init__(self):
            self.prompt = ""

        def _parse_json(self, response, expected_type=None):
            import json
            return json.loads(response)

        async def chat(self, prompt, max_tokens=6000, timeout=300):
            self.prompt = prompt
            return '{"relationships": []}'

    ai_service = CaptureAIService()
    extractor = UnifiedRelationshipExtractor(ExtractionConfig(), ai_service)

    import asyncio
    asyncio.run(extractor._extract_relationships("林墨看向周岚。", character_context="- 标准名：林墨；别名：墨哥"))

    assert "已识别角色候选池" in ai_service.prompt
    assert "标准名：林墨" in ai_service.prompt
    assert "关系端点应优先使用这些标准名" in ai_service.prompt
