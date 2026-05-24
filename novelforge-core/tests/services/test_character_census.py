import asyncio
from datetime import datetime
from pathlib import Path

from novelforge.core.models import Character, CharacterRole
from novelforge.extractors.base_extractor import Chunk, ExtractionConfig
from novelforge.extractors.unified_character_extractor import UnifiedCharacterExtractor


class FakeAIService:
    def __init__(self, census_characters=None):
        self._census_characters = census_characters or []

    def _parse_json(self, response, expected_type=None):
        import json
        return json.loads(response)

    async def chat(self, prompt, max_tokens=3000, timeout=300):
        if "所有出场的角色" in prompt:
            return '{"characters": []}'
        return '{"characters": []}'


def test_character_census_returns_lightweight_candidates():
    census_chars = [
        Character(name="角色A", role=CharacterRole.SUPPORTING, tags=["A君"], source_contexts=["角色A出现了"]),
        Character(name="角色B", role=CharacterRole.MINOR, tags=[], source_contexts=["角色B在场"]),
    ]

    class CensusAIService:
        def _parse_json(self, response, expected_type=None):
            import json
            return json.loads(response)

        async def chat(self, prompt, max_tokens=3000, timeout=300):
            if "出场的角色" in prompt:
                return '{"characters": [{"name": "角色A", "aliases": ["A君"], "role_hint": "supporting", "evidence": ["角色A出现了"]}, {"name": "角色B", "role_hint": "minor", "evidence": ["角色B在场"]}]}'
            return '{"characters": []}'

    extractor = UnifiedCharacterExtractor(ExtractionConfig(), CensusAIService())
    chunks = [Chunk(content="测试文本段落", index=0, start=0, end=6)]

    result = asyncio.run(extractor._run_character_census(chunks))

    assert len(result) == 2
    assert result[0].name == "角色A"
    assert result[0].tags == ["A君"]
    assert result[1].name == "角色B"


def test_character_census_handles_batch_failure_gracefully():
    class FailingAIService:
        def _parse_json(self, response, expected_type=None):
            import json
            return json.loads(response)

        async def chat(self, prompt, max_tokens=3000, timeout=300):
            raise RuntimeError("上游失败")

    extractor = UnifiedCharacterExtractor(ExtractionConfig(), FailingAIService())
    chunks = [Chunk(content="测试文本", index=0, start=0, end=4)]

    result = asyncio.run(extractor._run_character_census(chunks))

    assert result == []




def test_census_candidates_merge_with_detailed_profiles_and_rank_by_evidence():
    extractor = UnifiedCharacterExtractor(ExtractionConfig())
    detailed = [
        Character(
            name="林墨",
            role=CharacterRole.PROTAGONIST,
            description="主角档案",
            source_contexts=["林墨第一次出现"],
        )
    ]
    census = [
        Character(
            name="墨哥",
            role=CharacterRole.SUPPORTING,
            tags=["林墨"],
            source_contexts=["墨哥再次出现"],
        ),
        Character(
            name="周岚",
            role=CharacterRole.MINOR,
            source_contexts=["周岚在场"],
        ),
    ]

    result = extractor._rank_characters(extractor._merge_census_candidates(detailed, census))

    assert [character.name for character in result] == ["林墨", "周岚"]
    assert "墨哥" in result[0].tags
    assert result[0].description == "主角档案"
    assert result[0].mentions == 2




def test_census_candidate_filter_rejects_sentence_like_noise():
    extractor = UnifiedCharacterExtractor(ExtractionConfig())
    candidates = [
        Character(name="这是一个错误角色名", role=CharacterRole.MINOR, source_contexts=["噪声"]),
        Character(name="有效角色", role=CharacterRole.MINOR, source_contexts=["有效角色出现"]),
    ]

    result = extractor._merge_census_candidates([], candidates)

    assert [character.name for character in result] == ["有效角色"]


def test_select_targeted_profile_candidates_prioritizes_evidenced_light_profiles():
    extractor = UnifiedCharacterExtractor(ExtractionConfig())
    candidates = [
        Character(name="主角", role=CharacterRole.PROTAGONIST, source_contexts=["主角出现"]),
        Character(name="路人甲", role=CharacterRole.MINOR, source_contexts=["路人甲出现"]),
        Character(name="配角", role=CharacterRole.MINOR, source_contexts=["配角出现1", "配角出现2"]),
        Character(
            name="完整角色",
            role=CharacterRole.SUPPORTING,
            description="描述",
            background="背景",
            appearance="外貌",
            occupation="身份",
            personality="冷静",
            source_contexts=["完整角色出现"],
        ),
    ]

    result = extractor._select_targeted_profile_candidates(candidates)

    assert [character.name for character in result] == ["主角", "配角"]


def test_collect_context_for_character_uses_aliases():
    extractor = UnifiedCharacterExtractor(ExtractionConfig())
    character = Character(name="林墨", tags=["墨哥"], role=CharacterRole.SUPPORTING)
    text = "开场没有名字。后来墨哥推门而入，众人看向他。"

    result = extractor._collect_context_for_character(text, character, max_contexts=1, window=6)

    assert result
    assert "墨哥" in result[0]


def test_annotate_character_quality_adds_confidence_metadata():
    extractor = UnifiedCharacterExtractor(ExtractionConfig())
    character = Character(
        name="林墨",
        role=CharacterRole.PROTAGONIST,
        description="描述",
        background="背景",
        appearance="外貌",
        occupation="身份",
        personality="冷静",
        source_contexts=["证据1", "证据2"],
    )

    result = extractor._annotate_character_quality([character])[0]

    assert result.extraction_quality["confidence"] == "high"
    assert result.extraction_quality["evidence_count"] == 2
    assert result.extraction_quality["profile_score"] >= 4
