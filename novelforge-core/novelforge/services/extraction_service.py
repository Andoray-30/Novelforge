"""
Extraction service.

Provides single-type extraction and unified multi-asset extraction for:
- characters
- world setting
- timeline
- relationships

This service now runs in two stages for long texts:
1. full-text batch extraction across the whole source
2. a second recall pass based on cross-book sampling, merged back into stage 1

The second pass is additive only, so extraction quality can improve without making
the primary path more fragile.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from .ai_service import AIService
from ..core.config import Config
from ..core.models import Character, Culture, NetworkEdge, TimelineEvent, WorldSetting
from ..extractors.base_extractor import ExtractionConfig, SmartChunker
from ..extractors.unified_character_extractor import UnifiedCharacterExtractor
from ..extractors.unified_relationship_extractor import UnifiedRelationshipExtractor
from ..extractors.unified_timeline_extractor import UnifiedTimelineExtractor
from ..extractors.unified_world_extractor import UnifiedWorldExtractor

logger = logging.getLogger(__name__)


class ExtractionService:
    """High level extraction orchestration service."""

    def __init__(self, ai_service: AIService, config: Config):
        self.ai_service = ai_service
        self.config = config

        unified_config = ExtractionConfig(
            timeout=300.0,
            max_retries=2,
            retry_delay=1.0,
            chunk_size=15000,
            chunk_overlap=500,
        )

        self.recall_chunker = SmartChunker(chunk_size=12000, chunk_overlap=1000)

        self.unified_character_extractor = UnifiedCharacterExtractor(
            config=unified_config,
            ai_service=ai_service,
        )
        self.unified_world_extractor = UnifiedWorldExtractor(
            config=unified_config,
            ai_service=ai_service,
        )
        self.unified_relationship_extractor = UnifiedRelationshipExtractor(
            config=unified_config,
            ai_service=ai_service,
        )
        self.unified_timeline_extractor = UnifiedTimelineExtractor(
            config=unified_config,
            ai_service=ai_service,
        )

    async def extract_characters(self, text: str) -> List[Character]:
        return await self.unified_character_extractor.extract_characters(text)

    async def extract_world_setting(self, text: str) -> WorldSetting:
        return await self.unified_world_extractor.extract_world(text)

    async def extract_timeline(self, text: str) -> List[TimelineEvent]:
        return await self.unified_timeline_extractor.extract_timeline(text)

    async def extract_relationships(self, text: str) -> List[NetworkEdge]:
        return await self.unified_relationship_extractor.extract_relationships(text)

    async def extract_all(self, text: str) -> Dict[str, Any]:
        """Extract all supported assets with partial-failure tolerance."""
        tasks = {
            "characters": self.unified_character_extractor.extract_characters(text),
            "world_setting": self.unified_world_extractor.extract_world(text),
            "timeline_events": self.unified_timeline_extractor.extract_timeline(text),
            "relationships": self.unified_relationship_extractor.extract_relationships(text),
        }
        ordered_keys = list(tasks.keys())
        raw_results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        merged: Dict[str, Any] = {
            "characters": [],
            "world_setting": None,
            "timeline_events": [],
            "relationships": [],
            "errors": [],
        }

        for key, value in zip(ordered_keys, raw_results):
            if isinstance(value, Exception):
                logger.error("Extraction step failed: %s -> %s", key, value)
                merged["errors"].append(f"{key}: {str(value)}")
                continue
            merged[key] = value

        if len(text) > 25000:
            recall_sample = self._build_recall_sample(text)
            if recall_sample and recall_sample != text:
                merged = await self._run_recall_pass(recall_sample, merged)

        return merged

    def _build_recall_sample(self, text: str, sample_count: int = 6) -> str:
        chunks = self.recall_chunker.chunk(text)
        if len(chunks) <= sample_count:
            return text

        last_index = len(chunks) - 1
        selected_indices = {0, last_index}
        if sample_count > 2:
            for slot in range(1, sample_count - 1):
                ratio = slot / (sample_count - 1)
                selected_indices.add(round(last_index * ratio))

        ordered_indices = sorted(selected_indices)
        parts: List[str] = []
        for order, chunk_index in enumerate(ordered_indices, start=1):
            chunk = chunks[chunk_index]
            parts.append(
                f"[全书采样片段 {order}/{len(ordered_indices)} | 原始片段 {chunk_index + 1}/{len(chunks)}]\n{chunk.content}"
            )

        return "\n\n=== 全书采样分隔 ===\n\n".join(parts)

    async def _run_recall_pass(self, recall_sample: str, merged: Dict[str, Any]) -> Dict[str, Any]:
        logger.info("Running extraction recall pass on cross-book sample")

        try:
            supplemental_characters = await self.unified_character_extractor.extract_characters(recall_sample)
            if supplemental_characters:
                all_characters = list(merged.get("characters") or []) + supplemental_characters
                merged["characters"] = (
                    await self.unified_character_extractor._smart_merge_characters(all_characters)
                    if len(all_characters) > 1
                    else all_characters
                )
        except Exception as exc:
            logger.warning("Character recall pass failed: %s", exc)
            merged["errors"].append(f"characters_recall: {str(exc)}")

        try:
            supplemental_world = await self.unified_world_extractor.extract_world(recall_sample)
            merged["world_setting"] = await self._merge_world_settings(
                merged.get("world_setting"),
                supplemental_world,
            )
        except Exception as exc:
            logger.warning("World recall pass failed: %s", exc)
            merged["errors"].append(f"world_setting_recall: {str(exc)}")

        try:
            supplemental_timeline = await self.unified_timeline_extractor.extract_timeline(recall_sample)
            if supplemental_timeline:
                all_events = list(merged.get("timeline_events") or []) + supplemental_timeline
                merged["timeline_events"] = (
                    await self.unified_timeline_extractor._smart_merge_timeline_events(all_events)
                    if len(all_events) > 1
                    else all_events
                )
        except Exception as exc:
            logger.warning("Timeline recall pass failed: %s", exc)
            merged["errors"].append(f"timeline_events_recall: {str(exc)}")

        try:
            supplemental_relationships = await self.unified_relationship_extractor.extract_relationships(recall_sample)
            if supplemental_relationships:
                all_relationships = list(merged.get("relationships") or []) + supplemental_relationships
                merged["relationships"] = (
                    await self.unified_relationship_extractor._smart_merge_relationships(all_relationships)
                    if len(all_relationships) > 1
                    else all_relationships
                )
        except Exception as exc:
            logger.warning("Relationship recall pass failed: %s", exc)
            merged["errors"].append(f"relationships_recall: {str(exc)}")

        return merged

    async def _merge_world_settings(
        self,
        primary: Optional[WorldSetting],
        supplemental: Optional[WorldSetting],
    ) -> Optional[WorldSetting]:
        if primary is None:
            return supplemental
        if supplemental is None:
            return primary

        merged_locations = await self.unified_world_extractor._smart_merge_locations(
            list(primary.locations) + list(supplemental.locations)
        )

        merged_rules = list(
            dict.fromkeys(
                [
                    rule
                    for rule in list(primary.rules) + list(supplemental.rules)
                    if isinstance(rule, str) and rule.strip()
                ]
            )
        )

        merged_themes = list(
            dict.fromkeys(
                [
                    theme
                    for theme in list(primary.themes) + list(supplemental.themes)
                    if isinstance(theme, str) and theme.strip()
                ]
            )
        )

        merged_history_parts: List[str] = []
        for history in [primary.history, supplemental.history]:
            if isinstance(history, str) and history.strip() and history.strip() not in merged_history_parts:
                merged_history_parts.append(history.strip())

        return WorldSetting(
            locations=merged_locations,
            cultures=self._merge_cultures(list(primary.cultures), list(supplemental.cultures)),
            rules=merged_rules,
            history="\n\n".join(merged_history_parts) if merged_history_parts else None,
            themes=merged_themes,
        )

    def _merge_cultures(self, primary: List[Culture], supplemental: List[Culture]) -> List[Culture]:
        merged: Dict[str, Culture] = {}

        for culture in list(primary) + list(supplemental):
            name = culture.name.strip()
            if not name:
                continue

            existing = merged.get(name)
            if existing is None:
                merged[name] = culture
                continue

            merged[name] = Culture(
                name=name,
                description=existing.description or culture.description,
                beliefs=list(dict.fromkeys(existing.beliefs + culture.beliefs)),
                values=list(dict.fromkeys(existing.values + culture.values)),
                customs=list(dict.fromkeys(existing.customs + culture.customs)),
                traditions=list(dict.fromkeys(existing.traditions + culture.traditions)),
            )

        return list(merged.values())

    async def extract_specific_elements(self, text: str, elements: List[str]) -> Dict[str, Any]:
        extracted: Dict[str, Any] = {}

        for element in elements:
            if element == 'characters':
                extracted['characters'] = await self.unified_character_extractor.extract_characters(text)
            elif element == 'world':
                extracted['world_setting'] = await self.unified_world_extractor.extract_world(text)
            elif element == 'timeline':
                extracted['timeline_events'] = await self.unified_timeline_extractor.extract_timeline(text)
            elif element == 'relationships':
                extracted['relationships'] = await self.unified_relationship_extractor.extract_relationships(text)

        return extracted

    async def enhance_character_data(self, characters: List[Character], text: str) -> List[Character]:
        return characters

    async def enhance_timeline_data(self, timeline_events: List[TimelineEvent], text: str) -> List[TimelineEvent]:
        return timeline_events

    async def enhance_world_setting_data(self, world_setting: WorldSetting, text: str) -> WorldSetting:
        return world_setting

    async def enhance_relationships_data(self, relationships: List[NetworkEdge], text: str) -> List[NetworkEdge]:
        return relationships


_extraction_service: Optional[ExtractionService] = None


def get_extraction_service(ai_service: AIService, config: Config) -> ExtractionService:
    return ExtractionService(ai_service, config)
