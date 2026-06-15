"""Runtime model probing and routing for OpenAI-compatible gateways."""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from .ai_service import AIService
from .model_health import list_model_health_events, rank_model_candidates_by_health
from ..core.config import Config


EXTRACTOR_ROLES = {"extractor_fast", "extractor_deep", "extractor_repair"}


ROLE_LATENCY_TOLERANCE_MS = {
    "extractor_fast": 20_000,
    "writer_fast": 20_000,
    "extractor_repair": 45_000,
    "judge": 45_000,
    "extractor_deep": 90_000,
    "writer_pro": 90_000,
    "schema_repair": 30_000,
}


def rank_candidates_by_profile(
    role: str,
    candidates: List[str],
    profiles: Dict[str, Dict[str, Any]],
    token_bucket: Optional[str] = None,
) -> Tuple[List[str], List[Dict[str, Any]]]:
    if not profiles:
        return candidates, []

    rankings: List[Dict[str, Any]] = []
    for index, model in enumerate(candidates):
        profile = profiles.get(model)
        if not profile:
            rankings.append({
                "model": model,
                "score": 0,
                "reason": "no_profile",
                "original_index": index,
                "confidence_level": "low",
            })
            continue

        confidence = profile.get("confidence_level", "low")
        success_rate = profile.get("success_rate", 0.0)
        timeout_rate = profile.get("timeout_rate", 0.0)
        json_invalid_rate = profile.get("json_invalid_rate", 0.0)
        p95_latency_ms = profile.get("p95_latency_ms", 0.0)
        repair_salvage_rate = profile.get("repair_salvage_rate", 0.0)
        retry_salvage_rate = profile.get("retry_salvage_rate", 0.0)
        budget_deferred_count = profile.get("budget_deferred_count", 0)
        budget_exhausted_count = profile.get("budget_exhausted_count", 0)

        if confidence == "low":
            rankings.append({
                "model": model,
                "score": 0,
                "reason": "low_confidence",
                "original_index": index,
                "confidence_level": confidence,
                "success_rate": success_rate,
                "p95_latency_ms": p95_latency_ms,
            })
            continue

        score = 0
        reasons: List[str] = []

        score += int(success_rate * 100)
        if success_rate >= 0.9:
            reasons.append("high_success_rate")

        latency_penalty = 0
        tolerance = ROLE_LATENCY_TOLERANCE_MS.get(role, 30000)
        if p95_latency_ms > tolerance:
            overage = p95_latency_ms - tolerance
            latency_penalty = min(30, int(overage / 1000))
            reasons.append("high_latency")

        if role == "extractor_deep":
            latency_penalty = max(0, latency_penalty - 10)

        score -= latency_penalty

        timeout_penalty = int(timeout_rate * 50)
        score -= timeout_penalty
        if timeout_rate > 0.1:
            reasons.append("high_timeout_rate")

        json_penalty = int(json_invalid_rate * 40)
        if role == "schema_repair":
            if repair_salvage_rate > 0.5:
                json_penalty = max(0, json_penalty - 20)
                reasons.append("repairable_format")
        score -= json_penalty

        if role == "schema_repair":
            repair_bonus = int(repair_salvage_rate * 30)
            score += repair_bonus
            if repair_salvage_rate > 0.5:
                reasons.append("high_repair_salvage")

        if json_invalid_rate > 0.2 and repair_salvage_rate > 0.3:
            reasons.append("needs_schema_repair")

        budget_penalty = (budget_deferred_count + budget_exhausted_count) * 5
        score -= min(20, budget_penalty)

        hint = profile.get("recommendation_hint", "")
        hints_list = hint.split(",") if hint else []

        hint_flags: List[str] = []
        if "needs_schema_repair" in hints_list:
            hint_flags.append("needs_schema_repair")
        if "high_timeout_risk" in hints_list:
            hint_flags.append("high_timeout_risk")
        if "unstable_format" in hints_list:
            hint_flags.append("unstable_format")

        rankings.append({
            "model": model,
            "score": max(0, score),
            "reason": ",".join(reasons) if reasons else "neutral",
            "original_index": index,
            "confidence_level": confidence,
            "success_rate": success_rate,
            "p95_latency_ms": p95_latency_ms,
            "timeout_rate": timeout_rate,
            "json_invalid_rate": json_invalid_rate,
            "repair_salvage_rate": repair_salvage_rate,
            "retry_salvage_rate": retry_salvage_rate,
            "recommendation_hint": hint,
            "hint_flags": hint_flags,
        })

    ranked = sorted(rankings, key=lambda x: x["score"], reverse=True)
    ranked_candidates = [r["model"] for r in ranked]

    return ranked_candidates, ranked


@dataclass
class ModelProbeResult:
    role: str
    model: str
    available: bool
    latency_ms: int
    non_empty_chat: bool = False
    json_capable: bool = False
    extraction_rich: bool = False
    error_type: Optional[str] = None
    error: Optional[str] = None
    checked_at: float = field(default_factory=time.time)

    @property
    def score(self) -> int:
        score = 0
        if self.available:
            score += 20
        if self.non_empty_chat:
            score += 30
        if self.json_capable:
            score += 25
        if self.extraction_rich:
            score += 20
        if self.latency_ms:
            score += max(0, 10 - min(self.latency_ms // 1000, 10))
        return score

    def passes_for_role(self) -> bool:
        if self.role in EXTRACTOR_ROLES:
            return self.available and self.non_empty_chat and self.json_capable and self.extraction_rich
        return self.available and self.non_empty_chat

    def to_dict(self) -> Dict[str, Any]:
        return {
            "role": self.role,
            "model": self.model,
            "available": self.available,
            "latency_ms": self.latency_ms,
            "non_empty_chat": self.non_empty_chat,
            "json_capable": self.json_capable,
            "extraction_rich": self.extraction_rich,
            "error_type": self.error_type,
            "error": self.error,
            "score": self.score,
            "checked_at": self.checked_at,
        }


@dataclass
class ModelRouteDecision:
    role: str
    selected_model: str
    reason: str
    candidates: List[str]
    probe_results: List[ModelProbeResult] = field(default_factory=list)
    original_candidates: List[str] = field(default_factory=list)
    health_rankings: List[Dict[str, Any]] = field(default_factory=list)
    profile_rankings: List[Dict[str, Any]] = field(default_factory=list)
    profile_confidence: Optional[str] = None
    profile_warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        payload = {
            "role": self.role,
            "selected_model": self.selected_model,
            "reason": self.reason,
            "candidates": self.candidates,
            "probe_results": [result.to_dict() for result in self.probe_results],
        }
        if self.original_candidates and self.original_candidates != self.candidates:
            payload["original_candidates"] = self.original_candidates
        if self.health_rankings:
            payload["health_rankings"] = self.health_rankings
            payload["candidate_order_source"] = "health_history"
        if self.profile_rankings:
            payload["profile_rankings"] = self.profile_rankings
            payload["profile_order_source"] = "performance_profile"
        if self.profile_confidence:
            payload["profile_confidence"] = self.profile_confidence
        if self.profile_warnings:
            payload["profile_warnings"] = self.profile_warnings
        selected_profile = self._selected_profile_summary()
        if selected_profile:
            payload["selected_profile_hint"] = selected_profile.get("recommendation_hint", "")
            payload["selected_profile_metrics"] = selected_profile
        return payload

    def _selected_profile_summary(self) -> Optional[Dict[str, Any]]:
        if not self.profile_rankings:
            return None
        for ranking in self.profile_rankings:
            if ranking.get("model") == self.selected_model:
                return {
                    "success_rate": ranking.get("success_rate", 0.0),
                    "p95_latency_ms": ranking.get("p95_latency_ms", 0.0),
                    "timeout_rate": ranking.get("timeout_rate", 0.0),
                    "repair_salvage_rate": ranking.get("repair_salvage_rate", 0.0),
                    "confidence_level": ranking.get("confidence_level", "low"),
                    "recommendation_hint": ranking.get("recommendation_hint", ""),
                }
        return None


class ModelRouter:
    """Select a currently suitable model for a task role.

    The router is intentionally runtime and in-memory: provider health can vary by
    time window, so this should guide the current task without turning observations
    into hard-coded product logic.
    """

    EXTRACTOR_PROBE_PROMPT = """只输出 JSON object，不要 markdown。
文本：林墨在雨夜醒来，遇见周岚，又被追兵逼近。他必须在保护同伴与揭开真相之间选择。
字段：
{
  "chapter_characters": [{"name": "角色名", "evidence": ["原文证据"], "confidence": "high"}],
  "chapter_interactions": [{"source": "角色A", "target": "角色B", "relationship_type": "rival", "evidence": ["原文证据"]}],
  "chapter_events": [{"title": "事件", "description": "同一事件", "narrative_order": 1, "characters": ["角色名"], "evidence": ["原文证据"]}],
  "chapter_world_facts": [{"name": "设定", "category": "concept", "description": "事实", "evidence": ["原文证据"]}]
}"""

    CHAT_PROBE_PROMPT = "请只用中文回复一句不超过 20 字的可读短句。"

    def __init__(
        self,
        ai_service: AIService,
        config: Config,
        *,
        storage: Any = None,
        clock: Callable[[], float] = time.time,
        profile_store: Any = None,
    ):
        self.ai_service = ai_service
        self.config = config
        self.storage = storage
        self.clock = clock
        self.profile_store = profile_store
        self.cooldowns: Dict[str, float] = {}
        self.last_decisions: Dict[str, ModelRouteDecision] = {}

    def candidates_for_role(self, role: str) -> List[str]:
        pools = getattr(self.config, "model_pools", {}) or {}
        candidates = list(pools.get(role) or [])
        if not candidates:
            candidates = [getattr(self.config, "model", "")]
        return self._dedupe(candidates)

    async def select_model(
        self,
        role: str,
        *,
        probe: bool = True,
        session_id: Optional[str] = None,
        parent_id: Optional[str] = None,
    ) -> ModelRouteDecision:
        candidates = self.candidates_for_role(role)
        original_candidates = list(candidates)
        health_rankings: List[Dict[str, Any]] = []
        candidates, health_rankings = await self._rank_candidates_by_health(
            role,
            candidates,
            session_id=session_id,
            parent_id=parent_id,
        )

        profile_rankings: List[Dict[str, Any]] = []
        profile_order_source: Optional[str] = None
        profile_confidence: str = "low"
        profile_warnings: List[str] = []

        enable_profile = getattr(self.config, "enable_profile_routing", False)
        if enable_profile and self.profile_store and session_id:
            try:
                scope = getattr(self.config, "profile_routing_scope", "session")
                min_confidence = getattr(self.config, "profile_routing_min_confidence", "medium")
                allow_low = getattr(self.config, "profile_routing_allow_low_confidence", False)

                if scope == "session":
                    profiles_list = await self.profile_store.list_by_scope("session", session_id)
                else:
                    profiles_list = await self.profile_store.list_by_scope("global", "")

                if not profiles_list and scope == "session":
                    profiles_list = await self.profile_store.list_by_scope("global", "")
                    if profiles_list:
                        profile_warnings.append("fallback_to_global")

                profiles_by_model: Dict[str, Any] = {}
                for p in profiles_list:
                    if p.key.task_role == role:
                        model = p.key.model_used
                        if model not in profiles_by_model or p.key.scope == "session":
                            profiles_by_model[model] = p

                if profiles_by_model:
                    can_use = False
                    for p in profiles_by_model.values():
                        cl = p.metrics.confidence_level
                        if cl == "high":
                            can_use = True
                            profile_confidence = "high"
                        elif cl == "medium" and min_confidence in ("medium", "low"):
                            can_use = True
                            if profile_confidence != "high":
                                profile_confidence = "medium"
                        elif cl == "low" and allow_low:
                            if profile_confidence == "low":
                                profile_confidence = "low"

                    if can_use:
                        profiles_metrics = {model: p.metrics.model_dump() for model, p in profiles_by_model.items()}
                        candidates, profile_rankings = rank_candidates_by_profile(
                            role, candidates, profiles_metrics
                        )
                        profile_order_source = "performance_profile"
            except Exception:
                profile_warnings.append("profile_lookup_failed")

        available_candidates = [model for model in candidates if not self._is_cooling_down(model)]
        if not available_candidates:
            decision = ModelRouteDecision(
                role=role,
                selected_model=candidates[0] if candidates else getattr(self.config, "model", ""),
                reason="all_candidates_in_cooldown",
                candidates=candidates,
                original_candidates=original_candidates,
                health_rankings=health_rankings,
                profile_rankings=profile_rankings,
                profile_confidence=profile_confidence,
                profile_warnings=profile_warnings,
            )
            self.last_decisions[role] = decision
            return decision

        has_real_client = getattr(self.ai_service, "has_real_client", lambda: False)
        if not probe or not getattr(self.config, "enable_model_router", True) or not has_real_client():
            decision = ModelRouteDecision(
                role=role,
                selected_model=available_candidates[0],
                reason="probe_skipped",
                candidates=candidates,
                original_candidates=original_candidates,
                health_rankings=health_rankings,
                profile_rankings=profile_rankings,
                profile_confidence=profile_confidence,
                profile_warnings=profile_warnings,
            )
            self.last_decisions[role] = decision
            return decision

        probe_results: List[ModelProbeResult] = []
        for model in available_candidates:
            result = await self.probe_model(role, model)
            probe_results.append(result)
            if result.passes_for_role():
                decision = ModelRouteDecision(
                    role=role,
                    selected_model=model,
                    reason="probe_passed",
                    candidates=candidates,
                    probe_results=probe_results,
                    original_candidates=original_candidates,
                    health_rankings=health_rankings,
                    profile_rankings=profile_rankings,
                    profile_confidence=profile_confidence,
                    profile_warnings=profile_warnings,
                )
                self.last_decisions[role] = decision
                return decision

        ranked = sorted(probe_results, key=lambda item: item.score, reverse=True)
        selected = ranked[0].model if ranked else available_candidates[0]
        decision = ModelRouteDecision(
            role=role,
            selected_model=selected,
            reason="no_probe_passed_using_best_score",
            candidates=candidates,
            probe_results=probe_results,
            original_candidates=original_candidates,
            health_rankings=health_rankings,
            profile_rankings=profile_rankings,
            profile_confidence=profile_confidence,
            profile_warnings=profile_warnings,
        )
        self.last_decisions[role] = decision
        return decision

    async def _rank_candidates_by_health(
        self,
        role: str,
        candidates: List[str],
        *,
        session_id: Optional[str] = None,
        parent_id: Optional[str] = None,
    ) -> tuple[List[str], List[Dict[str, Any]]]:
        if not self.storage or not session_id or not getattr(self.config, "enable_model_health_routing", True):
            return candidates, []
        try:
            events = await list_model_health_events(
                self.storage,
                session_id=session_id,
                parent_id=parent_id,
                role=role,
                limit=int(getattr(self.config, "model_health_routing_limit", 200) or 200),
            )
            return rank_model_candidates_by_health(candidates, events, role=role)
        except Exception:
            return candidates, []

    async def probe_model(self, role: str, model: str) -> ModelProbeResult:
        started = self.clock()
        try:
            with_overrides = getattr(self.ai_service, "with_overrides", None)
            service = with_overrides(model=model, strict_model=True) if callable(with_overrides) else self.ai_service
            prompt = self.EXTRACTOR_PROBE_PROMPT if role in EXTRACTOR_ROLES else self.CHAT_PROBE_PROMPT
            response = await service.chat(
                prompt,
                temperature=0.1,
                max_tokens=700 if role in EXTRACTOR_ROLES else 80,
                timeout=getattr(self.config, "model_probe_timeout", 25.0),
            )
            latency_ms = int((self.clock() - started) * 1000)
            content = str(response or "").strip()
            payload = self._extract_json_object(content) if role in EXTRACTOR_ROLES else None
            result = ModelProbeResult(
                role=role,
                model=model,
                available=bool(content),
                latency_ms=latency_ms,
                non_empty_chat=bool(content),
                json_capable=payload is not None,
                extraction_rich=self._has_extraction_signal(payload) if payload is not None else False,
                error_type=None if content else "empty_content",
                error=None if content else "empty_content",
            )
            if not result.passes_for_role():
                self.mark_cooldown(model, result.error_type or "probe_not_suitable")
            return result
        except Exception as exc:
            latency_ms = int((self.clock() - started) * 1000)
            error_type = self.classify_error(exc)
            self.mark_cooldown(model, error_type)
            return ModelProbeResult(
                role=role,
                model=model,
                available=False,
                latency_ms=latency_ms,
                error_type=error_type,
                error=str(exc)[:240],
            )

    def mark_cooldown(self, model: str, reason: str = "error") -> None:
        if not model:
            return
        cooldown_seconds = float(getattr(self.config, "model_cooldown_seconds", 180.0) or 0)
        if cooldown_seconds <= 0:
            return
        self.cooldowns[model] = self.clock() + cooldown_seconds

    def _is_cooling_down(self, model: str) -> bool:
        until = self.cooldowns.get(model)
        if until is None:
            return False
        if until <= self.clock():
            self.cooldowns.pop(model, None)
            return False
        return True

    @staticmethod
    def classify_error(error: Exception) -> str:
        status_code = getattr(error, "status_code", None)
        text = str(error).lower()
        if status_code == 429 or "429" in text or "too many requests" in text:
            return "rate_limited"
        if status_code in {502, 503, 504} or any(marker in text for marker in ("502", "503", "504", "gateway", "timeout")):
            return "gateway_timeout"
        if status_code in {401, 403} or any(marker in text for marker in ("401", "403", "unauthorized", "authorization failed", "auth")):
            return "auth_failed"
        if "empty content" in text:
            return "empty_content"
        if "json" in text:
            return "json_invalid"
        if "no available channel" in text or "provider" in text:
            return "provider_unavailable"
        return "upstream_error"

    @staticmethod
    def _extract_json_object(text: str) -> Optional[Dict[str, Any]]:
        if not text:
            return None
        clean = text.strip()
        clean = re.sub(r"^```(?:json)?", "", clean).strip()
        clean = re.sub(r"```$", "", clean).strip()
        candidates = [clean]
        start = clean.find("{")
        end = clean.rfind("}")
        if start >= 0 and end > start:
            candidates.append(clean[start : end + 1])
        for candidate in candidates:
            try:
                payload = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                return payload
        return None

    @staticmethod
    def _has_extraction_signal(payload: Optional[Dict[str, Any]]) -> bool:
        if not isinstance(payload, dict):
            return False
        fields = (
            "chapter_characters",
            "chapter_interactions",
            "chapter_events",
            "chapter_world_facts",
        )
        return any(isinstance(payload.get(field), list) and len(payload[field]) > 0 for field in fields)

    @staticmethod
    def _dedupe(values: List[str]) -> List[str]:
        result: List[str] = []
        for value in values:
            normalized = str(value or "").strip()
            if normalized and normalized not in result:
                result.append(normalized)
        return result
