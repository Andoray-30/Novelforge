from novelforge.api.__init__ import (
    _build_world_semantic_nodes,
    _clean_title,
    _normalize_content_item_for_write,
    _normalize_relationship_type,
)
from novelforge.content.models import ContentItem, ContentMetadata

import asyncio


def test_clean_title_decodes_html_entities():
    assert _clean_title("第一卷 续&#12539;终章") == "第一卷 续・终章"


def test_relationship_type_does_not_expose_internal_enum():
    assert _normalize_relationship_type("RelationshipType.FRIEND") == "friendship"
    assert _normalize_relationship_type("lover") == "romantic"
    assert _normalize_relationship_type("enemy") == "conflict"


def test_world_semantic_nodes_expand_world_facts():
    nodes = _build_world_semantic_nodes(
        "world-1",
        {
            "locations": [{"name": "月面都市", "description": "辉夜传说的源头"}],
            "rules": ["记忆会被月光改写"],
            "history": "千年前的迁徙留下了禁忌。",
        },
    )

    assert [node["type"] for node in nodes] == ["world_location", "world_rule", "world_history"]
    assert nodes[0]["title"] == "月面都市"
    assert all(node["metadata"]["parent_id"] == "world-1" for node in nodes)


def test_character_creative_signals_are_promoted_to_stable_fields():
    item = ContentItem(
        metadata=ContentMetadata(id="char-1", title="阿岚", type="character"),
        content="守灯人",
        extracted_data={
            "name": "阿岚",
            "role": "supporting",
            "creative_signals": {
                "desires": ["守住最后一盏灯"],
                "wounds": ["害怕再次失去故乡"],
                "emotional_states": ["克制而疲惫"],
                "voices": ["说话短促"],
            },
        },
    )

    normalized = asyncio.run(_normalize_content_item_for_write(item))

    assert normalized.extracted_data["goals"] == ["守住最后一盏灯"]
    assert normalized.extracted_data["fears"] == ["害怕再次失去故乡"]
    assert normalized.extracted_data["personality_tension"] == "克制而疲惫"
    assert "害怕再次失去故乡" in normalized.extracted_data["character_arc"]


def test_relationship_normalization_adds_tension_and_confidence():
    item = ContentItem(
        metadata=ContentMetadata(id="rel-1", title="关系", type="relationship"),
        content="",
        extracted_data={
            "source": "阿岚",
            "target": "雾港",
            "relationship_type": "RelationshipType.FRIEND",
            "tension": "亏欠与守护并存",
            "evidence": ["阿岚回到雾港。"],
        },
    )

    normalized = asyncio.run(_normalize_content_item_for_write(item))

    assert normalized.metadata.title == "阿岚 -> 雾港 (friendship)"
    assert normalized.extracted_data["relationship_tension"] == "亏欠与守护并存"
    assert normalized.extracted_data["confidence"] == "medium"
