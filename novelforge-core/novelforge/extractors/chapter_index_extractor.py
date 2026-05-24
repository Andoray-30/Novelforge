"""
Chapter-level index extractor for import analysis.

This extractor turns each saved chapter into a local index first, then merges
those chapter indices into the existing asset models. The goal is to preserve
evidence and chapter provenance so imported assets can support emotionally
useful writing, not just field extraction.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from ..core.models import (
    Character,
    CharacterRole,
    Culture,
    EventType,
    Gender,
    Importance,
    Location,
    LocationType,
    NetworkEdge,
    RelationshipStatus,
    RelationshipType,
    TimelineEvent,
    WorldSetting,
)
from .base_extractor import ExtractionConfig

logger = logging.getLogger(__name__)


class ChapterSource(BaseModel):
    id: str
    title: str
    order: int
    content: str


class ChapterCharacterCandidate(BaseModel):
    name: str
    aliases: List[str] = Field(default_factory=list)
    role_hint: str = "minor"
    description: str = ""
    desire: str = ""
    wound: str = ""
    emotional_state: str = ""
    voice: str = ""
    evidence: List[str] = Field(default_factory=list)
    confidence: str = "medium"


class ChapterInteractionCandidate(BaseModel):
    source: str
    target: str
    relationship_type: str = "other"
    description: str = ""
    tension: str = ""
    evidence: List[str] = Field(default_factory=list)
    confidence: str = "medium"


class ChapterEventCandidate(BaseModel):
    title: str
    description: str
    narrative_order: int = 0
    characters: List[str] = Field(default_factory=list)
    locations: List[str] = Field(default_factory=list)
    emotional_turn: str = ""
    foreshadowing: List[str] = Field(default_factory=list)
    imagery: List[str] = Field(default_factory=list)
    evidence: List[str] = Field(default_factory=list)
    confidence: str = "medium"


class ChapterWorldFactCandidate(BaseModel):
    name: str
    category: str = "rule"
    description: str = ""
    emotional_use: str = ""
    evidence: List[str] = Field(default_factory=list)
    confidence: str = "medium"


class ChapterIndex(BaseModel):
    chapter_id: str
    chapter_title: str
    chapter_order: int
    chapter_characters: List[ChapterCharacterCandidate] = Field(default_factory=list)
    chapter_interactions: List[ChapterInteractionCandidate] = Field(default_factory=list)
    chapter_events: List[ChapterEventCandidate] = Field(default_factory=list)
    chapter_world_facts: List[ChapterWorldFactCandidate] = Field(default_factory=list)


class ImportAnalysisDiagnostics(BaseModel):
    candidate_counts: Dict[str, int] = Field(default_factory=dict)
    dropped_candidates: List[Dict[str, Any]] = Field(default_factory=list)
    low_confidence_characters: List[Dict[str, Any]] = Field(default_factory=list)
    relationship_unresolved_endpoints: List[str] = Field(default_factory=list)
    timeline_mismatch_events: List[Dict[str, str]] = Field(default_factory=list)
    failed_chapters: List[Dict[str, str]] = Field(default_factory=list)


class ChapterIndexMergeResult(BaseModel):
    characters: List[Character] = Field(default_factory=list)
    relationships: List[NetworkEdge] = Field(default_factory=list)
    timeline_events: List[TimelineEvent] = Field(default_factory=list)
    world_setting: Optional[WorldSetting] = None
    diagnostics: ImportAnalysisDiagnostics = Field(default_factory=ImportAnalysisDiagnostics)


ChapterIndexAnalysis = ChapterIndexMergeResult


class ChapterIndexExtractor:
    """Extract and merge chapter-level novel understanding indices."""

    def __init__(self, ai_service: Any, config: Optional[ExtractionConfig] = None):
        self.ai_service = ai_service
        self.config = config or ExtractionConfig(timeout=180.0, max_retries=2, retry_delay=1.0)

    async def extract_and_merge(self, chapters: List[Dict[str, Any]]) -> ChapterIndexMergeResult:
        sources = [self._coerce_chapter_source(chapter) for chapter in chapters if self._chapter_content(chapter)]
        diagnostics = ImportAnalysisDiagnostics(
            candidate_counts={"chapters_total": len(chapters), "chapters_indexed": 0}
        )
        if not sources:
            return ChapterIndexMergeResult(diagnostics=diagnostics)

        tasks = [self._extract_chapter_index(source) for source in sources]
        raw_results = await asyncio.gather(*tasks, return_exceptions=True)
        indices: List[ChapterIndex] = []
        for source, result in zip(sources, raw_results):
            if isinstance(result, Exception):
                logger.warning("Chapter index failed for %s: %s", source.title, result)
                diagnostics.failed_chapters.append(
                    {"chapter_id": source.id, "title": source.title, "error": str(result)}
                )
                continue
            indices.append(result)

        diagnostics.candidate_counts["chapters_indexed"] = len(indices)
        return self.merge_indices(indices, diagnostics=diagnostics)

    async def extract_chapter_indices(self, chapters: List[Dict[str, Any]]) -> ChapterIndexMergeResult:
        return await self.extract_and_merge(chapters)

    async def _extract_chapter_index(self, chapter: ChapterSource) -> ChapterIndex:
        prompt = self._build_chapter_prompt(chapter)
        last_error: Optional[Exception] = None
        for attempt in range(self.config.max_retries):
            try:
                response = await self.ai_service.chat(
                    prompt,
                    max_tokens=5000,
                    timeout=self.config.timeout,
                )
                return self._parse_chapter_response(response, chapter)
            except Exception as exc:
                last_error = exc
                if attempt < self.config.max_retries - 1:
                    await asyncio.sleep(self.config.retry_delay)
        raise last_error or RuntimeError("chapter index extraction failed")

    def _build_chapter_prompt(self, chapter: ChapterSource) -> str:
        return f"""你是小说创作分析助手。请为单章建立结构化索引，目标是帮助后续 AI 写出动人、优美、有情绪张力的小说序章。

章节：{chapter.title}
顺序：{chapter.order}

正文：
{chapter.content}

请只根据本章证据输出 JSON，不要输出 markdown。字段如下：
{{
  "chapter_characters": [
    {{
      "name": "角色名",
      "aliases": ["别名"],
      "role_hint": "protagonist/supporting/antagonist/minor",
      "description": "本章可确认的人物信息",
      "desire": "本章呈现的欲望/追求/渴望",
      "wound": "本章呈现的伤口/恐惧/缺憾",
      "emotional_state": "本章情绪状态",
      "voice": "说话方式或叙述质感",
      "evidence": ["原文短证据"],
      "confidence": "high/medium/low"
    }}
  ],
  "chapter_interactions": [
    {{
      "source": "角色A",
      "target": "角色B",
      "relationship_type": "family/friend/enemy/lover/mentor/rival/colleague/other",
      "description": "互动和关系描述",
      "tension": "关系张力、亏欠、误解、吸引、冲突或牵挂",
      "evidence": ["原文短证据"],
      "confidence": "high/medium/low"
    }}
  ],
  "chapter_events": [
    {{
      "title": "事件标题",
      "description": "只描述同一个事件，不要混入其他事件",
      "narrative_order": 1,
      "characters": ["涉及角色"],
      "locations": ["地点"],
      "emotional_turn": "情绪转折",
      "foreshadowing": ["可用于序章伏笔的线索"],
      "imagery": ["意象/氛围材料"],
      "evidence": ["原文短证据"],
      "confidence": "high/medium/low"
    }}
  ],
  "chapter_world_facts": [
    {{
      "name": "设定名",
      "category": "location/culture/rule/history/concept/imagery",
      "description": "设定事实",
      "emotional_use": "它如何帮助营造氛围或情绪",
      "evidence": ["原文短证据"],
      "confidence": "high/medium/low"
    }}
  ]
}}"""

    def _parse_chapter_response(self, response: str, chapter: ChapterSource) -> ChapterIndex:
        payload = self._extract_json_object(response)
        return ChapterIndex(
            chapter_id=chapter.id,
            chapter_title=chapter.title,
            chapter_order=chapter.order,
            chapter_characters=[
                ChapterCharacterCandidate(**item)
                for item in self._ensure_list(payload.get("chapter_characters"))
                if isinstance(item, dict)
            ],
            chapter_interactions=[
                ChapterInteractionCandidate(**item)
                for item in self._ensure_list(payload.get("chapter_interactions"))
                if isinstance(item, dict)
            ],
            chapter_events=[
                ChapterEventCandidate(**item)
                for item in self._ensure_list(payload.get("chapter_events"))
                if isinstance(item, dict)
            ],
            chapter_world_facts=[
                ChapterWorldFactCandidate(**item)
                for item in self._ensure_list(payload.get("chapter_world_facts"))
                if isinstance(item, dict)
            ],
        )

    def merge_indices(
        self,
        indices: List[ChapterIndex],
        *,
        diagnostics: Optional[ImportAnalysisDiagnostics] = None,
    ) -> ChapterIndexMergeResult:
        diagnostics = diagnostics or ImportAnalysisDiagnostics()
        diagnostics.candidate_counts.update(
            {
                "chapter_character_candidates": sum(len(index.chapter_characters) for index in indices),
                "chapter_interaction_candidates": sum(len(index.chapter_interactions) for index in indices),
                "chapter_event_candidates": sum(len(index.chapter_events) for index in indices),
                "chapter_world_fact_candidates": sum(len(index.chapter_world_facts) for index in indices),
            }
        )

        characters = self._merge_characters(indices, diagnostics)
        relationships = self._merge_relationships(indices, characters, diagnostics)
        timeline_events = self._merge_timeline_events(indices, diagnostics)
        world_setting = self._merge_world_facts(indices)

        diagnostics.candidate_counts.update(
            {
                "merged_characters": len(characters),
                "saved_characters": len(characters),
                "merged_relationships": len(relationships),
                "merged_timeline_events": len(timeline_events),
            }
        )
        return ChapterIndexMergeResult(
            characters=characters,
            relationships=relationships,
            timeline_events=timeline_events,
            world_setting=world_setting,
            diagnostics=diagnostics,
        )

    def merge_chapter_indices(
        self,
        indices: List[ChapterIndex],
        diagnostics: Optional[ImportAnalysisDiagnostics] = None,
    ) -> ChapterIndexMergeResult:
        return self.merge_indices(indices, diagnostics=diagnostics)

    def _merge_characters(
        self,
        indices: List[ChapterIndex],
        diagnostics: ImportAnalysisDiagnostics,
    ) -> List[Character]:
        groups: Dict[str, Dict[str, Any]] = {}
        alias_to_key: Dict[str, str] = {}
        for index in indices:
            for candidate in index.chapter_characters:
                name = self._normalize_name(candidate.name)
                if not self._looks_like_person_name(name):
                    diagnostics.dropped_candidates.append(
                        {"name": candidate.name, "evidence_count": len(candidate.evidence), "reason": "invalid_character_name"}
                    )
                    continue
                aliases = [self._normalize_name(alias) for alias in candidate.aliases if self._normalize_name(alias)]
                key = alias_to_key.get(name) or next((alias_to_key[a] for a in aliases if a in alias_to_key), name)
                group = groups.setdefault(
                    key,
                    {
                        "name": name,
                        "aliases": set(),
                        "descriptions": [],
                        "desires": [],
                        "wounds": [],
                        "emotions": [],
                        "voices": [],
                        "evidence": [],
                        "role": candidate.role_hint,
                        "confidence": [],
                        "chapters": set(),
                    },
                )
                group["aliases"].update(alias for alias in aliases if alias != name)
                group["descriptions"].append(candidate.description)
                group["desires"].append(candidate.desire)
                group["wounds"].append(candidate.wound)
                group["emotions"].append(candidate.emotional_state)
                group["voices"].append(candidate.voice)
                group["evidence"].extend(candidate.evidence)
                group["confidence"].append(candidate.confidence)
                group["chapters"].add(index.chapter_id)
                group["role"] = self._pick_role(group["role"], candidate.role_hint)
                alias_to_key[name] = key
                for alias in aliases:
                    alias_to_key[alias] = key

        characters: List[Character] = []
        for group in groups.values():
            evidence = self._unique(group["evidence"])[:8]
            if not evidence:
                diagnostics.dropped_candidates.append(
                    {"name": group["name"], "evidence_count": 0, "reason": "missing_evidence"}
                )
                continue
            profile_score = sum(
                bool(self._join_best(group[field]))
                for field in ("descriptions", "desires", "wounds", "emotions", "voices")
            )
            confidence = "high" if profile_score >= 4 and len(evidence) >= 2 else "medium" if evidence else "low"
            character = Character(
                name=group["name"],
                description=self._join_best(group["descriptions"]) or f"{group['name']}在原文中出现，已保留为最小角色档案。",
                personality=self._join_best(group["emotions"]),
                background=self._join_best(group["wounds"]),
                role=self._to_character_role(group["role"]),
                gender=Gender.UNKNOWN,
                tags=sorted(group["aliases"]),
                mentions=len(evidence),
                source_contexts=evidence,
                behavior_examples=self._unique(group["desires"])[:4],
                example_dialogues=self._unique(group["voices"])[:4],
            )
            setattr(
                character,
                "extraction_quality",
                {
                    "evidence_count": len(evidence),
                    "profile_score": profile_score,
                    "aliases": sorted(group["aliases"]),
                    "confidence": confidence,
                    "profile_type": "full_profile" if profile_score >= 3 else "minimal_profile",
                    "profile_level": "full_profile" if profile_score >= 3 else "minimal_profile",
                    "chapter_coverage": len(group["chapters"]),
                },
            )
            if confidence == "low" or profile_score < 3:
                diagnostics.low_confidence_characters.append(
                    {
                        "name": group["name"],
                        "confidence": confidence,
                        "profile_score": profile_score,
                        "evidence_count": len(evidence),
                        "profile_type": "full_profile" if profile_score >= 3 else "minimal_profile",
                        "chapter_coverage": len(group["chapters"]),
                    }
                )
            setattr(
                character,
                "creative_signals",
                {
                    "desires": self._unique(group["desires"])[:5],
                    "wounds": self._unique(group["wounds"])[:5],
                    "emotional_states": self._unique(group["emotions"])[:5],
                    "voices": self._unique(group["voices"])[:5],
                },
            )
            characters.append(character)

        return sorted(
            characters,
            key=lambda character: (
                -getattr(character, "extraction_quality", {}).get("evidence_count", 0),
                character.name,
            ),
        )

    def _merge_relationships(
        self,
        indices: List[ChapterIndex],
        characters: List[Character],
        diagnostics: ImportAnalysisDiagnostics,
    ) -> List[NetworkEdge]:
        canonical, character_names = self._character_alias_map(characters)
        relationships: Dict[str, NetworkEdge] = {}
        backfilled: List[Character] = []

        for index in indices:
            for candidate in index.chapter_interactions:
                for raw_source in self._split_endpoint_names(candidate.source):
                    for raw_target in self._split_endpoint_names(candidate.target):
                        source = self._resolve_character(raw_source, canonical)
                        target = self._resolve_character(raw_target, canonical)
                        if source not in character_names and self._can_backfill_endpoint(source, candidate.evidence):
                            backfilled.append(self._build_backfilled_character(source, candidate.evidence, index.chapter_id))
                            character_names.add(source)
                            canonical[self._normalize_name(source)] = source
                        if target not in character_names and self._can_backfill_endpoint(target, candidate.evidence):
                            backfilled.append(self._build_backfilled_character(target, candidate.evidence, index.chapter_id))
                            character_names.add(target)
                            canonical[self._normalize_name(target)] = target
                        if source not in character_names:
                            diagnostics.relationship_unresolved_endpoints.append(raw_source)
                            continue
                        if target not in character_names:
                            diagnostics.relationship_unresolved_endpoints.append(raw_target)
                            continue
                        if source == target:
                            continue

                        key = "->".join(sorted([source, target])) + f":{self._to_relationship_type(candidate.relationship_type).value}"
                        existing = relationships.get(key)
                        evidence = self._unique((existing.evidence if existing else []) + candidate.evidence)[:8]
                        chapter_refs = self._unique((existing.chapter_references if existing else []) + [index.chapter_title])
                        description = self._join_best([existing.description if existing else "", candidate.description, candidate.tension])
                        edge = NetworkEdge(
                            source=source,
                            target=target,
                            relationship_type=self._to_relationship_type(candidate.relationship_type),
                            description=description or candidate.tension or "章节索引识别到两者存在互动关系。",
                            strength=min(10, 4 + len(evidence) + len(chapter_refs)),
                            status=RelationshipStatus.ACTIVE,
                            evidence=evidence,
                            chapter_references=chapter_refs,
                            evolution=self._unique([candidate.tension])[:4],
                        )
                        relationships[key] = edge

        if backfilled:
            existing = {character.name for character in characters}
            characters.extend(character for character in backfilled if character.name not in existing)
            diagnostics.candidate_counts["relationship_backfilled_characters"] = len(backfilled)

        diagnostics.relationship_unresolved_endpoints = sorted(set(diagnostics.relationship_unresolved_endpoints))
        return sorted(relationships.values(), key=lambda edge: (-len(edge.evidence), edge.source, edge.target))

    def _merge_timeline_events(
        self,
        indices: List[ChapterIndex],
        diagnostics: ImportAnalysisDiagnostics,
    ) -> List[TimelineEvent]:
        events: List[TimelineEvent] = []
        seen: set[str] = set()
        for index in sorted(indices, key=lambda item: item.chapter_order):
            for event in sorted(index.chapter_events, key=lambda item: item.narrative_order):
                title = event.title.strip()
                description = event.description.strip()
                if not title or not description:
                    continue
                key = f"{index.chapter_id}:{event.narrative_order}:{self._normalize_name(title)}"
                if key in seen:
                    continue
                seen.add(key)
                mismatch = self._timeline_mismatch(title, description, event.characters, event.evidence)
                if mismatch:
                    diagnostics.timeline_mismatch_events.append(
                        {"title": title, "description_preview": description[:120], "chapter_id": index.chapter_id}
                    )
                timeline_event = TimelineEvent(
                    title=title,
                    description=description,
                    event_type=EventType.OTHER,
                    narrative_time=f"{index.chapter_order:04d}-{event.narrative_order:03d}",
                    characters=self._unique(event.characters),
                    locations=self._unique(event.locations),
                    chapter_reference=index.chapter_title,
                    importance=Importance.HIGH if event.confidence == "high" else Importance.MEDIUM,
                    consequences=self._unique(event.foreshadowing + ([event.emotional_turn] if event.emotional_turn else [])),
                    evidence=self._unique(event.evidence)[:6],
                )
                setattr(
                    timeline_event,
                    "creative_signals",
                    {
                        "emotional_turn": event.emotional_turn,
                        "foreshadowing": event.foreshadowing,
                        "imagery": event.imagery,
                        "chapter_id": index.chapter_id,
                    },
                )
                events.append(timeline_event)
        return events

    def _merge_world_facts(self, indices: List[ChapterIndex]) -> WorldSetting:
        locations: Dict[str, Location] = {}
        cultures: Dict[str, Culture] = {}
        rules: List[str] = []
        history: List[str] = []
        themes: List[str] = []
        for index in indices:
            for fact in index.chapter_world_facts:
                name = fact.name.strip()
                description = fact.description.strip()
                if not name or not description:
                    continue
                category = fact.category.lower()
                evidence = self._unique(fact.evidence)[:4]
                if category == "location":
                    existing = locations.get(name)
                    source_contexts = self._unique((existing.source_contexts if existing else []) + evidence)
                    locations[name] = Location(
                        name=name,
                        description=self._join_best([existing.description if existing else "", description]),
                        type=LocationType.OTHER,
                        importance=Importance.MEDIUM,
                        source_contexts=source_contexts,
                    )
                elif category == "culture":
                    existing = cultures.get(name)
                    cultures[name] = Culture(
                        name=name,
                        description=self._join_best([existing.description if existing else "", description]),
                        beliefs=[],
                        values=self._unique((existing.values if existing else []) + [fact.emotional_use]) if fact.emotional_use else [],
                    )
                elif category == "history":
                    history.append(f"{name}: {description}")
                elif category in {"imagery", "concept"}:
                    themes.append(f"{name}: {description}")
                else:
                    rules.append(f"{name}: {description}")
                if fact.emotional_use:
                    themes.append(f"{name}（创作用途）: {fact.emotional_use}")

        return WorldSetting(
            locations=list(locations.values()),
            cultures=list(cultures.values()),
            rules=self._unique(rules),
            history="\n".join(self._unique(history)) or None,
            themes=self._unique(themes),
        )

    def _coerce_chapter_source(self, chapter: Dict[str, Any]) -> ChapterSource:
        return ChapterSource(
            id=str(chapter.get("id") or chapter.get("chapter_id") or chapter.get("title") or "chapter"),
            title=str(chapter.get("title") or chapter.get("chapter_title") or "章节"),
            order=int(chapter.get("chapter_index") or chapter.get("order") or 0),
            content=self._chapter_content(chapter),
        )

    @staticmethod
    def _chapter_content(chapter: Dict[str, Any]) -> str:
        return str(chapter.get("content") or chapter.get("chapter_content") or "").strip()

    @staticmethod
    def _extract_json_object(response: str) -> Dict[str, Any]:
        text = response.strip()
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start < 0 or end <= start:
                raise
            payload = json.loads(text[start:end + 1])
        if not isinstance(payload, dict):
            raise ValueError("chapter index response must be a JSON object")
        return payload

    @staticmethod
    def _ensure_list(value: Any) -> List[Any]:
        if isinstance(value, list):
            return value
        if value in (None, ""):
            return []
        return [value]

    @staticmethod
    def _normalize_name(name: str) -> str:
        return re.sub(r"[\s·・•（）()《》<>『』「」\[\]]+", "", (name or "").strip())

    def _looks_like_person_name(self, name: str) -> bool:
        if not name or len(name) < 2 or len(name) > 16:
            return False
        if re.search(r"[。！？；：，、\s]", name):
            return False
        non_person_markers = ("世界", "城市", "学校", "组织", "事件", "月球", "地球", "直播", "演唱会", "咖啡店")
        return not any(marker == name or name.endswith(marker) for marker in non_person_markers)

    def _pick_role(self, current: str, candidate: str) -> str:
        priority = {"protagonist": 4, "antagonist": 3, "supporting": 2, "minor": 1}
        current_key = str(current or "minor").lower()
        candidate_key = str(candidate or "minor").lower()
        return candidate_key if priority.get(candidate_key, 1) > priority.get(current_key, 1) else current_key

    @staticmethod
    def _to_character_role(role: str) -> CharacterRole:
        try:
            return CharacterRole(str(role or "minor").lower())
        except ValueError:
            return CharacterRole.MINOR

    @staticmethod
    def _to_relationship_type(rel_type: str) -> RelationshipType:
        try:
            return RelationshipType(str(rel_type or "other").lower())
        except ValueError:
            return RelationshipType.OTHER

    def _character_alias_map(self, characters: List[Character]) -> tuple[Dict[str, str], set[str]]:
        canonical: Dict[str, str] = {}
        names: set[str] = set()
        for character in characters:
            name = self._normalize_name(character.name)
            if not name:
                continue
            canonical[name] = name
            names.add(name)
            for alias in character.tags or []:
                normalized_alias = self._normalize_name(str(alias))
                if normalized_alias:
                    canonical[normalized_alias] = name
        return canonical, names

    def _resolve_character(self, name: str, canonical: Dict[str, str]) -> str:
        normalized = self._normalize_name(name)
        if normalized in canonical:
            return canonical[normalized]
        for alias, target in canonical.items():
            if len(alias) >= 2 and len(normalized) >= 2 and (alias.endswith(normalized) or normalized.endswith(alias)):
                return target
        return normalized

    def _split_endpoint_names(self, value: str) -> List[str]:
        text = str(value or "").strip()
        if not text:
            return []
        parts = re.split(r"\s*(?:/|／|、|，|,|&|＆|\+|＋)\s*", text)
        return self._unique(parts) or [text]

    def _can_backfill_endpoint(self, name: str, evidence: List[str]) -> bool:
        return self._looks_like_person_name(name) and bool(evidence)

    def _build_backfilled_character(self, name: str, evidence: List[str], chapter_id: str) -> Character:
        character = Character(
            name=name,
            description=f"{name}由关系端点和原文证据回补为最小角色档案。",
            role=CharacterRole.MINOR,
            gender=Gender.UNKNOWN,
            source_contexts=self._unique(evidence)[:6],
            mentions=len(evidence),
        )
        setattr(
            character,
            "extraction_quality",
            {
                "evidence_count": len(evidence),
                "profile_score": 1,
                "aliases": [],
                "confidence": "medium",
                "profile_type": "minimal_profile",
                "profile_level": "minimal_profile",
                "backfilled_from_relationship": True,
                "chapter_id": chapter_id,
            },
        )
        return character

    def _timeline_mismatch(
        self,
        title: str,
        description: str,
        characters: List[str],
        evidence: Optional[List[str]] = None,
    ) -> bool:
        if not title.strip() or not description.strip():
            return True
        if evidence:
            return False
        normalized_title = self._normalize_name(title)
        normalized_desc = self._normalize_name(description)
        if normalized_title and normalized_title in normalized_desc:
            return False
        for character in characters:
            normalized_character = self._normalize_name(character)
            if not normalized_character:
                continue
            if normalized_character in normalized_desc:
                return False
            if len(normalized_character) >= 3 and normalized_character[-2:] in normalized_desc:
                return False

        title_chars = {
            char
            for char in normalized_title
            if "\u4e00" <= char <= "\u9fff" and char not in {"的", "了", "与", "和", "在", "中", "之"}
        }
        desc_chars = {char for char in normalized_desc if "\u4e00" <= char <= "\u9fff"}
        if len(title_chars & desc_chars) >= 2:
            return False
        return True

    @staticmethod
    def _unique(values: List[Any]) -> List[str]:
        seen: set[str] = set()
        result: List[str] = []
        for value in values:
            text = str(value or "").strip()
            if not text or text in seen:
                continue
            seen.add(text)
            result.append(text)
        return result

    def _join_best(self, values: List[Any]) -> str:
        unique_values = self._unique(values)
        if not unique_values:
            return ""
        return max(unique_values, key=len)
