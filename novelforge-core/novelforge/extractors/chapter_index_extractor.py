"""
Chapter-level index extractor for import analysis.

This extractor turns each saved chapter into a local index first, then merges
those chapter indices into the existing asset models. The goal is to preserve
evidence and chapter provenance so imported assets can support emotionally
useful writing, not just field extraction.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
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
    relationship_unresolved_details: List[Dict[str, Any]] = Field(default_factory=list)
    relationship_endpoint_resolution: List[Dict[str, Any]] = Field(default_factory=list)
    relationship_low_confidence_resolved_endpoints: List[Dict[str, Any]] = Field(default_factory=list)
    timeline_mismatch_events: List[Dict[str, str]] = Field(default_factory=list)
    failed_chapters: List[Dict[str, str]] = Field(default_factory=list)
    chapter_index_attempts: List[Dict[str, Any]] = Field(default_factory=list)
    chapter_index_status: List[Dict[str, Any]] = Field(default_factory=list)


class ChapterIndexMergeResult(BaseModel):
    characters: List[Character] = Field(default_factory=list)
    relationships: List[NetworkEdge] = Field(default_factory=list)
    timeline_events: List[TimelineEvent] = Field(default_factory=list)
    world_setting: Optional[WorldSetting] = None
    diagnostics: ImportAnalysisDiagnostics = Field(default_factory=ImportAnalysisDiagnostics)


ChapterIndexAnalysis = ChapterIndexMergeResult


@dataclass
class EndpointMatch:
    raw_endpoint: str
    normalized_endpoint: str
    resolved_name: str
    matched: bool
    match_type: str
    confidence: float
    matched_character_id: str = ""
    matched_character_name: str = ""
    evidence: List[str] = field(default_factory=list)
    needs_review: bool = False
    reason: str = ""
    candidates: List[str] = field(default_factory=list)

    def to_diagnostic(self) -> Dict[str, Any]:
        return {
            "raw_endpoint": self.raw_endpoint,
            "normalized_endpoint": self.normalized_endpoint,
            "resolved_endpoint": self.resolved_name,
            "match_type": self.match_type,
            "confidence": round(self.confidence, 3),
            "matched_character_id": self.matched_character_id,
            "matched_character_name": self.matched_character_name,
            "evidence": self.evidence[:2],
            "needs_review": self.needs_review,
            "reason": self.reason,
            "candidates": self.candidates[:5],
        }


class ChapterIndexExtractor:
    """Extract and merge chapter-level novel understanding indices."""

    def __init__(self, ai_service: Any, config: Optional[ExtractionConfig] = None):
        self.ai_service = ai_service
        self.config = config or ExtractionConfig(timeout=180.0, max_retries=1, retry_delay=1.0)
        self.chapter_concurrency = self._resolve_chapter_concurrency()
        self.max_tokens = self._resolve_int_env("NOVELFORGE_CHAPTER_INDEX_MAX_TOKENS", default=2500, minimum=800, maximum=5000)

    async def extract_and_merge(self, chapters: List[Dict[str, Any]]) -> ChapterIndexMergeResult:
        sources = [self._coerce_chapter_source(chapter) for chapter in chapters if self._chapter_content(chapter)]
        diagnostics = ImportAnalysisDiagnostics(
            candidate_counts={"chapters_total": len(chapters), "chapters_indexed": 0}
        )
        if not sources:
            return ChapterIndexMergeResult(diagnostics=diagnostics)

        semaphore = asyncio.Semaphore(self.chapter_concurrency)

        async def run_with_limit(source: ChapterSource) -> Dict[str, Any]:
            async with semaphore:
                try:
                    index, attempts = await self._extract_chapter_index_with_attempts(source)
                    return {"source": source, "index": index, "attempts": attempts, "error": None}
                except Exception as exc:
                    attempts = getattr(exc, "attempts", [])
                    return {"source": source, "index": None, "attempts": attempts, "error": exc}

        tasks = [run_with_limit(source) for source in sources]
        raw_results = await asyncio.gather(*tasks, return_exceptions=True)
        indices: List[ChapterIndex] = []
        for source, result in zip(sources, raw_results):
            if isinstance(result, Exception):
                logger.warning("Chapter index failed for %s: %s", source.title, result)
                diagnostics.failed_chapters.append(
                    {"chapter_id": source.id, "title": source.title, "error": str(result)}
                )
                diagnostics.chapter_index_status.append(
                    self._build_chapter_status(source, attempts=[], error=result)
                )
                continue
            attempts = result.get("attempts") if isinstance(result, dict) else []
            diagnostics.chapter_index_attempts.extend(attempts or [])
            index = result.get("index") if isinstance(result, dict) else None
            error = result.get("error") if isinstance(result, dict) else None
            if error is not None:
                logger.warning("Chapter index failed for %s: %s", source.title, error)
                diagnostics.failed_chapters.append(
                    {
                        "chapter_id": source.id,
                        "title": source.title,
                        "error": str(error),
                        "error_type": self._classify_error(error),
                    }
                )
                diagnostics.chapter_index_status.append(
                    self._build_chapter_status(source, attempts=attempts or [], error=error)
                )
                continue
            if isinstance(index, ChapterIndex):
                indices.append(index)
                diagnostics.chapter_index_status.append(
                    self._build_chapter_status(source, attempts=attempts or [], index=index)
                )

        diagnostics.candidate_counts["chapters_indexed"] = len(indices)
        diagnostics.candidate_counts["chapter_index_attempts"] = len(diagnostics.chapter_index_attempts)
        diagnostics.candidate_counts["chapter_index_failed_attempts"] = sum(
            1 for attempt in diagnostics.chapter_index_attempts if attempt.get("status") != "success"
        )
        diagnostics.candidate_counts["chapter_index_needs_retry"] = sum(
            1 for status in diagnostics.chapter_index_status if status.get("needs_retry")
        )
        return self.merge_indices(indices, diagnostics=diagnostics)

    async def extract_chapter_indices(self, chapters: List[Dict[str, Any]]) -> ChapterIndexMergeResult:
        return await self.extract_and_merge(chapters)

    @staticmethod
    def _resolve_chapter_concurrency() -> int:
        return ChapterIndexExtractor._resolve_int_env(
            "NOVELFORGE_CHAPTER_INDEX_CONCURRENCY",
            default=4,
            minimum=1,
            maximum=8,
        )

    @staticmethod
    def _resolve_int_env(name: str, *, default: int, minimum: int, maximum: int) -> int:
        raw = os.getenv(name, str(default))
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return default
        return max(minimum, min(value, maximum))

    async def _extract_chapter_index(self, chapter: ChapterSource) -> ChapterIndex:
        index, _attempts = await self._extract_chapter_index_with_attempts(chapter)
        return index

    async def _extract_chapter_index_with_attempts(self, chapter: ChapterSource) -> tuple[ChapterIndex, List[Dict[str, Any]]]:
        prompt = self._build_chapter_prompt(chapter)
        last_error: Optional[Exception] = None
        attempts: List[Dict[str, Any]] = []
        max_retries = max(1, int(getattr(self.config, "max_retries", 1) or 1))
        for attempt in range(max_retries):
            started = time.perf_counter()
            try:
                response = await self.ai_service.chat(
                    prompt,
                    max_tokens=self.max_tokens,
                    timeout=self.config.timeout,
                )
                index = self._parse_chapter_response(response, chapter)
                attempts.append(
                    self._build_attempt_record(
                        chapter,
                        attempt_number=attempt + 1,
                        status="success",
                        latency_ms=self._elapsed_ms(started),
                        raw_response=response,
                        parsed_candidate_counts=self._index_candidate_counts(index),
                        retry_count=attempt,
                        needs_retry=False,
                    )
                )
                return index, attempts
            except Exception as exc:
                last_error = exc
                is_final_attempt = attempt >= max_retries - 1
                attempts.append(
                    self._build_attempt_record(
                        chapter,
                        attempt_number=attempt + 1,
                        status="failed",
                        latency_ms=self._elapsed_ms(started),
                        error=exc,
                        retry_count=attempt,
                        needs_retry=is_final_attempt,
                    )
                )
                if not is_final_attempt:
                    await asyncio.sleep(self.config.retry_delay)
        final_error = last_error or RuntimeError("chapter index extraction failed")
        setattr(final_error, "attempts", attempts)
        raise final_error

    def _build_attempt_record(
        self,
        chapter: ChapterSource,
        *,
        attempt_number: int,
        status: str,
        latency_ms: int,
        raw_response: Optional[str] = None,
        parsed_candidate_counts: Optional[Dict[str, int]] = None,
        error: Optional[Exception] = None,
        retry_count: int = 0,
        needs_retry: bool = False,
    ) -> Dict[str, Any]:
        response_text = raw_response or ""
        model_used = self._current_model_name()
        record: Dict[str, Any] = {
            "chapter_id": chapter.id,
            "chapter_title": chapter.title,
            "chapter_order": chapter.order,
            "attempt_number": attempt_number,
            "status": status,
            "model_used": model_used,
            "latency_ms": latency_ms,
            "error_type": self._classify_error(error) if error else None,
            "error": str(error)[:500] if error else None,
            "raw_response_hash": self._hash_response(response_text) if response_text else None,
            "raw_response_chars": len(response_text),
            "parsed_candidate_counts": parsed_candidate_counts or {},
            "retry_count": retry_count,
            "needs_retry": bool(needs_retry),
        }
        return record

    def _build_chapter_status(
        self,
        chapter: ChapterSource,
        *,
        attempts: List[Dict[str, Any]],
        index: Optional[ChapterIndex] = None,
        error: Optional[Exception] = None,
    ) -> Dict[str, Any]:
        latest_attempt = attempts[-1] if attempts else {}
        success = index is not None and error is None
        parsed_counts = self._index_candidate_counts(index) if index is not None else {}
        return {
            "chapter_id": chapter.id,
            "chapter_title": chapter.title,
            "chapter_order": chapter.order,
            "status": "success" if success else "failed",
            "model_used": latest_attempt.get("model_used") or self._current_model_name(),
            "attempt_count": len(attempts),
            "latency_ms": sum(int(attempt.get("latency_ms") or 0) for attempt in attempts),
            "error_type": latest_attempt.get("error_type") or (self._classify_error(error) if error else None),
            "error": latest_attempt.get("error") or (str(error)[:500] if error else None),
            "parsed_candidate_counts": parsed_counts,
            "needs_retry": not success,
        }

    def _index_candidate_counts(self, index: Optional[ChapterIndex]) -> Dict[str, int]:
        if index is None:
            return {}
        return {
            "characters": len(index.chapter_characters),
            "interactions": len(index.chapter_interactions),
            "events": len(index.chapter_events),
            "world_facts": len(index.chapter_world_facts),
        }

    def _current_model_name(self) -> str:
        service_config = getattr(self.ai_service, "config", None)
        model_name = getattr(service_config, "model", "") if service_config else ""
        return str(model_name or "").strip()

    @staticmethod
    def _elapsed_ms(started: float) -> int:
        return max(0, int(round((time.perf_counter() - started) * 1000)))

    @staticmethod
    def _hash_response(response: str) -> str:
        return hashlib.sha256(response.encode("utf-8", errors="ignore")).hexdigest()[:16]

    @staticmethod
    def _classify_error(error: Optional[Exception]) -> str:
        if error is None:
            return ""
        status_code = getattr(error, "status_code", None)
        text = str(error).lower()
        if status_code == 429 or "429" in text or "too many requests" in text:
            return "rate_limited"
        if status_code == 401 or "401" in text or "unauthorized" in text:
            return "auth_failed"
        if status_code == 403 or "403" in text or "forbidden" in text:
            return "auth_failed"
        if status_code == 504 or "504" in text or "gateway time" in text:
            return "gateway_timeout"
        if status_code and int(status_code) >= 500:
            return "provider_unavailable"
        if isinstance(error, json.JSONDecodeError) or "json" in text:
            return "json_invalid"
        if isinstance(error, TimeoutError) or "timeout" in text or "timed out" in text:
            return "timeout"
        if "empty content" in text:
            return "empty_content"
        return error.__class__.__name__

    def _build_chapter_prompt(self, chapter: ChapterSource) -> str:
        return f"""你是小说创作分析助手。请为单章建立结构化索引，目标是帮助后续 AI 写出动人、优美、有情绪张力的小说序章。

输出要求：
- 只输出一个 JSON object，从 {{ 开始，到 }} 结束。
- 不要输出 markdown、解释、注释、代码块。
- 保持精简：角色最多 5 个，互动最多 5 条，事件最多 4 个，世界观事实最多 5 条。
- evidence 只摘原文短句，每条不超过 40 个中文字符；没有证据则不要编造。
- 没有内容的数组输出 []，不要省略字段。

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
                        source_match = self._resolve_character(raw_source, canonical, character_names, candidate.evidence)
                        target_match = self._resolve_character(raw_target, canonical, character_names, candidate.evidence)
                        source = source_match.resolved_name
                        target = target_match.resolved_name
                        if source not in character_names and self._can_backfill_endpoint(source, candidate.evidence):
                            backfilled.append(self._build_backfilled_character(source, candidate.evidence, index.chapter_id))
                            character_names.add(source)
                            canonical.setdefault(self._normalize_name(source), []).append(
                                self._alias_entry(source, source, match_type="backfilled", evidence=candidate.evidence)
                            )
                        if target not in character_names and self._can_backfill_endpoint(target, candidate.evidence):
                            backfilled.append(self._build_backfilled_character(target, candidate.evidence, index.chapter_id))
                            character_names.add(target)
                            canonical.setdefault(self._normalize_name(target), []).append(
                                self._alias_entry(target, target, match_type="backfilled", evidence=candidate.evidence)
                            )
                        if source not in character_names:
                            diagnostics.relationship_unresolved_endpoints.append(raw_source)
                            diagnostics.relationship_unresolved_details.append(source_match.to_diagnostic())
                            continue
                        if target not in character_names:
                            diagnostics.relationship_unresolved_endpoints.append(raw_target)
                            diagnostics.relationship_unresolved_details.append(target_match.to_diagnostic())
                            continue
                        if source == target:
                            continue

                        self._record_endpoint_resolution(source_match, diagnostics)
                        self._record_endpoint_resolution(target_match, diagnostics)

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
        diagnostics.relationship_unresolved_details = self._unique_diagnostic_items(diagnostics.relationship_unresolved_details)
        diagnostics.relationship_endpoint_resolution = self._unique_diagnostic_items(diagnostics.relationship_endpoint_resolution)
        diagnostics.relationship_low_confidence_resolved_endpoints = self._unique_diagnostic_items(
            diagnostics.relationship_low_confidence_resolved_endpoints
        )
        diagnostics.candidate_counts["relationship_resolved_endpoints"] = len(diagnostics.relationship_endpoint_resolution)
        diagnostics.candidate_counts["relationship_low_confidence_resolved_endpoints"] = len(
            diagnostics.relationship_low_confidence_resolved_endpoints
        )
        diagnostics.candidate_counts["relationship_unresolved_endpoint_count"] = len(diagnostics.relationship_unresolved_endpoints)
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

    def _character_alias_map(self, characters: List[Character]) -> tuple[Dict[str, List[Dict[str, Any]]], set[str]]:
        canonical: Dict[str, List[Dict[str, Any]]] = {}
        names: set[str] = set()
        for character in characters:
            name = self._normalize_name(character.name)
            if not name:
                continue
            self._add_alias_entry(canonical, name, character, "canonical")
            names.add(name)
            aliases = list(character.tags or [])
            extraction_quality = getattr(character, "extraction_quality", None)
            if isinstance(extraction_quality, dict):
                aliases.extend(extraction_quality.get("aliases") or [])
            extracted_data = getattr(character, "extracted_data", None)
            if isinstance(extracted_data, dict):
                aliases.extend(extracted_data.get("aliases") or [])
            for alias in aliases:
                normalized_alias = self._normalize_name(str(alias))
                if normalized_alias:
                    self._add_alias_entry(canonical, normalized_alias, character, "explicit_alias")
                    for variant in self._title_stripped_variants(normalized_alias):
                        self._add_alias_entry(canonical, variant, character, "title_stripped_alias")
            for variant in self._title_stripped_variants(name):
                self._add_alias_entry(canonical, variant, character, "title_stripped_name")
        return canonical, names

    def _resolve_character(
        self,
        name: str,
        canonical: Dict[str, List[Dict[str, Any]]],
        character_names: set[str],
        evidence: Optional[List[str]] = None,
    ) -> EndpointMatch:
        normalized = self._normalize_name(name)
        evidence_items = self._unique(evidence or [])[:3]
        if not normalized:
            return EndpointMatch(name, "", "", False, "empty", 0.0, evidence=evidence_items, reason="empty_endpoint")

        exact = self._unique_alias_targets(canonical.get(normalized, []))
        if len(exact) == 1:
            entry = exact[0]
            return self._matched_endpoint(name, normalized, entry, self._confidence_for_match_type(entry["match_type"]), evidence_items)
        if len(exact) > 1:
            return EndpointMatch(
                name,
                normalized,
                normalized,
                False,
                "ambiguous_exact_alias",
                0.0,
                evidence=evidence_items,
                reason="alias_maps_to_multiple_characters",
                candidates=[entry["canonical_name"] for entry in exact],
            )

        if len(normalized) >= 2:
            fuzzy_entries: List[Dict[str, Any]] = []
            for alias, entries in canonical.items():
                if len(alias) < 2:
                    continue
                if alias.endswith(normalized) or normalized.endswith(alias) or alias.startswith(normalized) or normalized.startswith(alias):
                    fuzzy_entries.extend(entries)
            fuzzy_targets = self._unique_alias_targets(fuzzy_entries)
            if len(fuzzy_targets) == 1:
                return self._matched_endpoint(name, normalized, fuzzy_targets[0], 0.82, evidence_items, "unique_partial_alias")
            if len(fuzzy_targets) > 1:
                return EndpointMatch(
                    name,
                    normalized,
                    normalized,
                    False,
                    "ambiguous_partial_alias",
                    0.0,
                    evidence=evidence_items,
                    reason="partial_alias_matches_multiple_characters",
                    candidates=[entry["canonical_name"] for entry in fuzzy_targets],
                )

        if self._is_safe_single_char_endpoint(normalized):
            single_entries = self._single_char_alias_candidates(normalized, canonical, evidence_items)
            single_targets = self._unique_alias_targets(single_entries)
            if len(single_targets) == 1:
                entry = single_targets[0]
                confidence = 0.86 if self._evidence_mentions_name(entry["canonical_name"], evidence_items) else 0.74
                return self._matched_endpoint(
                    name,
                    normalized,
                    entry,
                    confidence,
                    evidence_items,
                    "unique_single_char_alias",
                    needs_review=confidence < 0.8,
                )
            if len(single_targets) > 1:
                return EndpointMatch(
                    name,
                    normalized,
                    normalized,
                    False,
                    "ambiguous_single_char_alias",
                    0.0,
                    evidence=evidence_items,
                    reason="single_char_matches_multiple_characters",
                    candidates=[entry["canonical_name"] for entry in single_targets],
                )

        return EndpointMatch(
            name,
            normalized,
            normalized,
            normalized in character_names,
            "canonical_name" if normalized in character_names else "unresolved",
            1.0 if normalized in character_names else 0.0,
            matched_character_name=normalized if normalized in character_names else "",
            matched_character_id=normalized if normalized in character_names else "",
            evidence=evidence_items,
            reason="" if normalized in character_names else "no_matching_character_alias",
        )

    def _record_endpoint_resolution(self, match: EndpointMatch, diagnostics: ImportAnalysisDiagnostics) -> None:
        if not match.matched:
            return
        diagnostic = match.to_diagnostic()
        diagnostics.relationship_endpoint_resolution.append(diagnostic)
        if match.needs_review or match.confidence < 0.8:
            diagnostics.relationship_low_confidence_resolved_endpoints.append(diagnostic)

    def _matched_endpoint(
        self,
        raw: str,
        normalized: str,
        entry: Dict[str, Any],
        confidence: float,
        evidence: List[str],
        match_type_override: Optional[str] = None,
        needs_review: bool = False,
    ) -> EndpointMatch:
        match_type = match_type_override or entry["match_type"]
        return EndpointMatch(
            raw_endpoint=raw,
            normalized_endpoint=normalized,
            resolved_name=entry["canonical_name"],
            matched=True,
            match_type=match_type,
            confidence=confidence,
            matched_character_id=entry.get("character_id") or entry["canonical_name"],
            matched_character_name=entry["canonical_name"],
            evidence=evidence,
            needs_review=needs_review,
        )

    def _add_alias_entry(
        self,
        alias_map: Dict[str, List[Dict[str, Any]]],
        alias: str,
        character: Character,
        match_type: str,
    ) -> None:
        normalized_alias = self._normalize_name(alias)
        canonical_name = self._normalize_name(character.name)
        if not normalized_alias or not canonical_name:
            return
        entry = self._alias_entry(
            normalized_alias,
            canonical_name,
            match_type=match_type,
            character_id=str(getattr(character, "id", "") or canonical_name),
            evidence=getattr(character, "source_contexts", []) or [],
        )
        existing = alias_map.setdefault(normalized_alias, [])
        if not any(item["canonical_name"] == canonical_name and item["match_type"] == match_type for item in existing):
            existing.append(entry)

    @staticmethod
    def _alias_entry(
        alias: str,
        canonical_name: str,
        match_type: str,
        character_id: str = "",
        evidence: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        return {
            "alias": alias,
            "canonical_name": canonical_name,
            "character_id": character_id or canonical_name,
            "match_type": match_type,
            "evidence": list(evidence or [])[:2],
        }

    @staticmethod
    def _unique_alias_targets(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen: set[str] = set()
        unique: List[Dict[str, Any]] = []
        for entry in entries:
            name = str(entry.get("canonical_name") or "")
            if not name or name in seen:
                continue
            seen.add(name)
            unique.append(entry)
        return unique

    @staticmethod
    def _confidence_for_match_type(match_type: str) -> float:
        if match_type == "canonical":
            return 1.0
        if match_type == "explicit_alias":
            return 0.95
        if match_type.startswith("title_stripped"):
            return 0.88
        if match_type == "backfilled":
            return 0.8
        return 0.82

    @staticmethod
    def _title_stripped_variants(name: str) -> List[str]:
        suffixes = (
            "老师",
            "先生",
            "小姐",
            "前辈",
            "学长",
            "学姐",
            "哥哥",
            "姐姐",
            "店长",
            "社长",
            "队长",
            "殿下",
            "陛下",
            "大人",
            "同学",
        )
        variants: List[str] = []
        for suffix in suffixes:
            if name.endswith(suffix) and len(name) > len(suffix) + 1:
                variants.append(name[: -len(suffix)])
        return variants

    @staticmethod
    def _is_safe_single_char_endpoint(name: str) -> bool:
        if len(name) != 1 or not ("\u4e00" <= name <= "\u9fff"):
            return False
        stop_chars = {"我", "你", "他", "她", "它", "谁", "其", "这", "那", "和", "与", "的", "了", "们"}
        return name not in stop_chars

    def _single_char_alias_candidates(
        self,
        name: str,
        canonical: Dict[str, List[Dict[str, Any]]],
        evidence: List[str],
    ) -> List[Dict[str, Any]]:
        if not evidence:
            return []
        matches: List[Dict[str, Any]] = []
        for alias, entries in canonical.items():
            if len(alias) < 2:
                continue
            if alias.startswith(name) or alias.endswith(name):
                matches.extend(entries)
        return matches

    def _evidence_mentions_name(self, name: str, evidence: List[str]) -> bool:
        normalized_name = self._normalize_name(name)
        return any(normalized_name and normalized_name in self._normalize_name(item) for item in evidence)

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

    @staticmethod
    def _unique_diagnostic_items(values: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen: set[str] = set()
        result: List[Dict[str, Any]] = []
        for value in values:
            key = json.dumps(value, ensure_ascii=False, sort_keys=True)
            if key in seen:
                continue
            seen.add(key)
            result.append(value)
        return result

    def _join_best(self, values: List[Any]) -> str:
        unique_values = self._unique(values)
        if not unique_values:
            return ""
        return max(unique_values, key=len)
