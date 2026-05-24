from novelforge.extractors.unified_character_extractor import UnifiedCharacterExtractor
from novelforge.extractors.base_extractor import ExtractionConfig


def test_character_alias_merging_uses_generic_name_normalization():
    extractor = UnifiedCharacterExtractor(ExtractionConfig())

    assert extractor._normalize_name("  酒寄 彩叶  ") == "酒寄彩叶"
    assert extractor._normalize_name("辉夜（八千代）") == "辉夜八千代"
    assert extractor._are_potential_aliases("帝明", "帝") is True
    assert extractor._are_potential_aliases("酒寄朝日", "朝日") is True
    assert extractor._are_potential_aliases("彩叶", "辉夜") is False
