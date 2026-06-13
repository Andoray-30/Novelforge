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
from .model_router import ModelRouter
from ..core.config import Config
from ..core.models import Character, Culture, NetworkEdge, TimelineEvent, WorldSetting
from ..extractors.base_extractor import ExtractionConfig, SmartChunker
from ..extractors.unified_character_extractor import UnifiedCharacterExtractor
from ..extractors.chapter_index_extractor import ChapterIndexExtractor
from ..extractors.unified_relationship_extractor import UnifiedRelationshipExtractor
from ..extractors.unified_timeline_extractor import UnifiedTimelineExtractor
from ..extractors.unified_world_extractor import UnifiedWorldExtractor

logger = logging.getLogger(__name__)


class ExtractionService:
    """High level extraction orchestration service."""

    def __init__(
        self,
        ai_service: AIService,
        config: Config,
        storage_manager: Optional[Any] = None,
        attempt_store: Optional[Any] = None,
        retry_queue: Optional[Any] = None,
        content_manager: Optional[Any] = None,
        budget_policy: Optional[Any] = None,
    ):
        self.ai_service = ai_service
        self.config = config
        self.storage_manager = storage_manager
        self.attempt_store = attempt_store
        self.retry_queue = retry_queue
        self.content_manager = content_manager
        self.budget_policy = budget_policy
        self.model_router = ModelRouter(ai_service, config, storage=storage_manager)

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
        self.chapter_index_extractor = ChapterIndexExtractor(
            config=unified_config,
            ai_service=ai_service,
        )

    def _model_role_settings(self, role: str, overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        getter = getattr(self.config, "get_model_role_settings", None)
        if callable(getter):
            settings = getter(role)
        else:
            settings = dict(getattr(self.config, "model_role_settings", {}).get(role, {}))
        settings = dict(settings or {})
        if overrides:
            for key in ("timeout", "concurrency", "chunk_size", "max_tokens"):
                if key in overrides and overrides[key] is not None:
                    settings[key] = overrides[key]
        return settings

    def _chapter_index_config_for_role(self, role: str, runtime_settings: Optional[Dict[str, Any]] = None) -> ExtractionConfig:
        base_config = self.chapter_index_extractor.config
        settings = self._model_role_settings(role, runtime_settings)
        return ExtractionConfig(
            timeout=float(settings.get("timeout", base_config.timeout)),
            max_retries=base_config.max_retries,
            retry_delay=base_config.retry_delay,
            chunk_size=int(settings.get("chunk_size", base_config.chunk_size)),
            chunk_overlap=base_config.chunk_overlap,
        )

    def _build_chapter_index_extractor(
        self,
        *,
        ai_service: AIService,
        diagnostics_recorder: Optional[Any],
        role: str,
        runtime_settings: Optional[Dict[str, Any]] = None,
        session_id: str = "",
    ) -> ChapterIndexExtractor:
        from .schema_repairer import LocalJsonRepairer, ModelSchemaRepairer, SchemaRepairer

        settings = self._model_role_settings(role, runtime_settings)

        schema_repairer = None
        if getattr(self.config, "enable_schema_repair", True):
            local_repairer = LocalJsonRepairer()
            model_repairer = None
            if getattr(self.config, "enable_model_schema_repair", False):
                repair_settings = self._model_role_settings("schema_repair")
                repair_timeout = float(repair_settings.get("timeout", 120.0))
                model_repairer = ModelSchemaRepairer(ai_service=ai_service, timeout=repair_timeout)
            schema_repairer = SchemaRepairer(
                local_repairer=local_repairer,
                model_repairer=model_repairer,
            )

        return ChapterIndexExtractor(
            config=self._chapter_index_config_for_role(role, settings),
            ai_service=ai_service,
            diagnostics_recorder=diagnostics_recorder,
            chapter_concurrency=int(settings["concurrency"]) if "concurrency" in settings else None,
            max_tokens=int(settings["max_tokens"]) if "max_tokens" in settings else None,
            schema_repairer=schema_repairer,
            attempt_store=self.attempt_store,
            session_id=session_id,
        )

    async def extract_characters(self, text: str) -> List[Character]:
        return await self.unified_character_extractor.extract_characters(text)

    async def extract_world_setting(self, text: str) -> WorldSetting:
        return await self.unified_world_extractor.extract_world(text)

    async def extract_timeline(self, text: str) -> List[TimelineEvent]:
        return await self.unified_timeline_extractor.extract_timeline(text)

    async def extract_relationships(self, text: str) -> List[NetworkEdge]:
        return await self.unified_relationship_extractor.extract_relationships(text)

    async def extract_relationships_guided(self, text: str, characters: Optional[List[Character]] = None) -> List[NetworkEdge]:
        return await self.unified_relationship_extractor.extract_relationships_guided(text, characters=characters)

    async def extract_chapter_index_assets(
        self,
        chapters: List[Dict[str, Any]],
        diagnostics_recorder: Optional[Any] = None,
        model_role: str = "extractor_fast",
        repair_strategy: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        parent_id: Optional[str] = None,
        suppress_auto_enqueue: bool = False,
    ) -> Dict[str, Any]:
        from .budgeted_scheduler import BudgetedScheduler, BudgetedWorkItem

        role = model_role or "extractor_fast"
        runtime_settings = (
            repair_strategy.get("runtime_settings_overrides")
            if isinstance(repair_strategy, dict) and isinstance(repair_strategy.get("runtime_settings_overrides"), dict)
            else None
        )

        budget_summary = None
        if self.budget_policy and getattr(self.budget_policy, "enabled", True):
            scheduler = BudgetedScheduler(policy=self.budget_policy)
            successful_ids = []
            if self.attempt_store:
                for ch in chapters:
                    records = await self.attempt_store.list_by_chapter(ch.get("id", ""), session_id=session_id)
                    if any(r.status == "success" for r in records):
                        successful_ids.append(ch.get("id", ""))

            work_items = [
                BudgetedWorkItem(
                    chapter_id=ch.get("id", ""),
                    chapter_title=ch.get("title", ""),
                    chapter_order=ch.get("chapter_index", 0),
                    phase="first_pass",
                )
                for ch in chapters
            ]
            plan_result = scheduler.plan(work_items, successful_chapter_ids=successful_ids)
            chapters = [
                ch for ch in chapters
                if any(item.chapter_id == ch.get("id", "") for item in plan_result.accepted)
            ]
            budget_summary = scheduler.summary()

        extractor = self._build_chapter_index_extractor(
            ai_service=self.ai_service,
            diagnostics_recorder=diagnostics_recorder,
            role=role,
            runtime_settings=runtime_settings,
            session_id=session_id or "",
        )
        model_route = None
        if getattr(self.config, "enable_model_router", True):
            decision = await self.model_router.select_model(role, session_id=session_id, parent_id=parent_id)
            role = decision.role or role
            model_route = decision.to_dict()
            model_route["runtime_settings"] = self._model_role_settings(role, runtime_settings)
            if repair_strategy:
                model_route["repair_strategy"] = repair_strategy
            with_overrides = getattr(self.ai_service, "with_overrides", None)
            if decision.selected_model and callable(with_overrides):
                routed_service = with_overrides(
                    model=decision.selected_model,
                    strict_model=True,
                )
                extractor = self._build_chapter_index_extractor(
                    ai_service=routed_service,
                    diagnostics_recorder=diagnostics_recorder,
                    role=role,
                    runtime_settings=runtime_settings,
                    session_id=session_id or "",
                )
        result = await extractor.extract_and_merge(chapters)
        diagnostics = result.diagnostics.model_dump()
        if model_route:
            diagnostics["model_route"] = model_route
        if repair_strategy:
            diagnostics["repair_strategy"] = repair_strategy

        retry_stats = None
        if self.retry_queue and result.diagnostics.failed_chapters and not suppress_auto_enqueue:
            from .retry_queue import RetryJob, RetrySourceRef
            from .error_classifier import is_retryable

            for failed in result.diagnostics.failed_chapters:
                error_type = failed.get("error_type", "")
                if not is_retryable(error_type):
                    continue
                if await self.retry_queue.should_skip_chapter(failed.get("chapter_id", ""), session_id=session_id):
                    continue
                source_ref = RetrySourceRef(
                    kind="content_item",
                    content_id=failed.get("chapter_id", ""),
                    session_id=session_id or "",
                    parent_id=parent_id,
                )
                job = RetryJob(
                    job_id=str(uuid.uuid4())[:20],
                    session_id=session_id or "",
                    chapter_id=failed.get("chapter_id", ""),
                    chapter_title=failed.get("title", ""),
                    chapter_order=failed.get("chapter_order", 0),
                    error_type=error_type,
                    error_message=failed.get("error_message", ""),
                    original_attempt_id=f"{failed.get('chapter_id', '')}-attempt-final",
                    model_used=failed.get("model_used", ""),
                    source_ref=source_ref,
                )
                await self.retry_queue.enqueue(job)
            retry_stats = await self.retry_queue.stats(session_id=session_id)

        return {
            "characters": result.characters,
            "world_setting": result.world_setting,
            "timeline_events": result.timeline_events,
            "relationships": result.relationships,
            "chapter_indices": [index.model_dump() for index in result.chapter_indices],
            "analysis_diagnostics": diagnostics,
            "candidate_counts": result.diagnostics.candidate_counts,
            "failed_chapters": result.diagnostics.failed_chapters,
            "chapter_index_attempts": result.diagnostics.chapter_index_attempts,
            "chapter_index_status": result.diagnostics.chapter_index_status,
            "relationship_unresolved_endpoints": result.diagnostics.relationship_unresolved_endpoints,
            "timeline_mismatch_events": result.diagnostics.timeline_mismatch_events,
            "model_route": model_route,
            "retry_stats": retry_stats.model_dump() if retry_stats else None,
            "budget_summary": budget_summary.model_dump() if budget_summary else None,
        }

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

    async def retry_pending_chapters(
        self,
        session_id: str,
        model_role: str = "extractor_repair",
    ) -> Dict[str, Any]:
        import uuid as _uuid
        from .budgeted_scheduler import BudgetedScheduler, BudgetedWorkItem

        if not self.retry_queue:
            return {"accepted": 0, "skipped_already_success": 0, "queued": 0, "error": "retry_queue_not_configured"}

        pending_jobs = await self.retry_queue.list_pending(session_id=session_id)
        accepted = 0
        skipped = 0
        deferred = 0

        scheduler = None
        if self.budget_policy and getattr(self.budget_policy, "enabled", True):
            scheduler = BudgetedScheduler(policy=self.budget_policy)

        for job in pending_jobs:
            if await self.retry_queue.should_skip_chapter(job.chapter_id, session_id=session_id):
                await self.retry_queue.mark_cancelled(job.job_id)
                skipped += 1
                continue

            if scheduler and not scheduler.can_start(BudgetedWorkItem(
                chapter_id=job.chapter_id,
                chapter_title=job.chapter_title,
                chapter_order=job.chapter_order,
                phase="retry",
                retry_count=job.retry_count,
            )):
                await self.retry_queue.mark_deferred(job.job_id, "budget_exhausted")
                deferred += 1
                continue

            await self.retry_queue.mark_running(job.job_id)
            try:
                from .retry_content_resolver import RetryContentResolver
                resolver = RetryContentResolver(content_manager=self.content_manager)
                chapter_data = await resolver.resolve(job)
                result = await self.extract_chapter_index_assets(
                    chapters=[chapter_data],
                    model_role=model_role,
                    session_id=session_id,
                    suppress_auto_enqueue=True,
                )
                if result.get("failed_chapters"):
                    error_type = result["failed_chapters"][0].get("error_type", "unknown")
                    error_message = result["failed_chapters"][0].get("error_message", "unknown")
                    await self.retry_queue.mark_failed(job.job_id, error_type, error_message)
                else:
                    await self.retry_queue.mark_success(job.job_id, f"{job.chapter_id}-retry-{job.retry_count + 1}")
                    accepted += 1
                    if scheduler:
                        scheduler.charge(BudgetedWorkItem(
                            chapter_id=job.chapter_id,
                            chapter_title=job.chapter_title,
                            chapter_order=job.chapter_order,
                            phase="retry",
                        ))
            except Exception as exc:
                await self.retry_queue.mark_failed(job.job_id, type(exc).__name__, str(exc)[:500])

        return {
            "accepted": accepted,
            "skipped_already_success": skipped,
            "queued": len(pending_jobs),
            "deferred": deferred,
            "budget_summary": scheduler.summary().model_dump() if scheduler else None,
        }


_extraction_service: Optional[ExtractionService] = None


def get_extraction_service(
    ai_service: AIService,
    config: Config,
    storage_manager: Optional[Any] = None,
    attempt_store: Optional[Any] = None,
    retry_queue: Optional[Any] = None,
    content_manager: Optional[Any] = None,
    budget_policy: Optional[Any] = None,
) -> ExtractionService:
    return ExtractionService(
        ai_service,
        config,
        storage_manager,
        attempt_store=attempt_store,
        retry_queue=retry_queue,
        content_manager=content_manager,
        budget_policy=budget_policy,
    )
