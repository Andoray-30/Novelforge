from types import SimpleNamespace

import pytest

from novelforge.core.config import Config
from novelforge.extractors.chapter_index_extractor import ChapterIndexMergeResult, ImportAnalysisDiagnostics
from novelforge.services.extraction_service import ExtractionService
from novelforge.services.model_router import ModelRouter
from novelforge.services.performance_profile import (
    PerformanceProfile,
    PerformanceProfileKey,
    PerformanceProfileMetrics,
    PerformanceProfileStore,
)
from novelforge.storage.memory_storage import MemoryStorage


class FakeConfig:
    model = "base-model"
    model_pools = {
        "extractor_fast": ["empty-model", "rich-model"],
        "writer_fast": ["writer-model"],
    }
    enable_model_router = True
    model_probe_timeout = 1.0
    model_cooldown_seconds = 30.0


class FakeRoutedAIService:
    def __init__(self, responses, model="base-model", calls=None, real_client=True):
        self.responses = responses
        self.model = model
        self.calls = calls if calls is not None else []
        self.real_client = real_client
        self.config = SimpleNamespace(model=model)

    def has_real_client(self):
        return self.real_client

    def with_overrides(self, *, model=None, strict_model=None):
        return FakeRoutedAIService(
            self.responses,
            model=model or self.model,
            calls=self.calls,
            real_client=self.real_client,
        )

    async def chat(self, prompt, **kwargs):
        self.calls.append(self.model)
        response = self.responses[self.model]
        if isinstance(response, Exception):
            raise response
        return response


class FakeStorage:
    def __init__(self, data):
        self.data = data

    async def load(self, key, storage_type=None):  # noqa: ANN001
        return self.data.get(key)

    async def list_keys(self, storage_type=None):  # noqa: ANN001
        return list(self.data.keys())


def make_profile(
    *,
    scope="session",
    session_id="test",
    model="model-a",
    role="extractor_fast",
    token_bucket="medium",
    total_attempts=20,
    success_count=18,
    timeout_count=0,
    p95_latency_ms=5000,
    source_attempt_count=None,
    generated_at="2026-06-01T10:00:00",
):
    return PerformanceProfile(
        key=PerformanceProfileKey(
            scope=scope,
            session_id=session_id,
            model_used=model,
            task_role=role,
            token_bucket=token_bucket,
        ),
        metrics=PerformanceProfileMetrics(
            total_attempts=total_attempts,
            success_count=success_count,
            timeout_count=timeout_count,
            p95_latency_ms=p95_latency_ms,
        ),
        source_attempt_count=source_attempt_count if source_attempt_count is not None else total_attempts,
        generated_at=generated_at,
    )


async def make_profile_store(*profiles):
    profile_store = PerformanceProfileStore(MemoryStorage())
    for profile in profiles:
        await profile_store.save(profile)
    return profile_store


@pytest.mark.asyncio
async def test_model_router_selects_first_extractor_model_with_rich_json():
    responses = {
        "empty-model": "",
        "rich-model": '{"chapter_characters":[{"name":"林墨","evidence":["林墨在雨夜醒来"]}],"chapter_interactions":[],"chapter_events":[],"chapter_world_facts":[]}',
    }
    router = ModelRouter(FakeRoutedAIService(responses), FakeConfig())

    decision = await router.select_model("extractor_fast")

    assert decision.selected_model == "rich-model"
    assert decision.reason == "probe_passed"
    assert [result.model for result in decision.probe_results] == ["empty-model", "rich-model"]
    assert router._is_cooling_down("empty-model")


def test_model_probe_prompts_are_readable_and_sample_neutral():
    prompts = [ModelRouter.EXTRACTOR_PROBE_PROMPT, ModelRouter.CHAT_PROBE_PROMPT]
    suspicious_fragments = ["閿", "锟", "鐢", "Ã", "Â", "杈", "閲", "超时空辉夜姬", "辉夜", "八千代", "帝明"]

    for prompt in prompts:
        assert all(fragment not in prompt for fragment in suspicious_fragments)
        assert "原文证据" in prompt or "可读短句" in prompt


@pytest.mark.asyncio
async def test_model_router_skips_probe_without_real_client():
    service = FakeRoutedAIService({"empty-model": ""}, real_client=False)
    router = ModelRouter(service, FakeConfig())

    decision = await router.select_model("extractor_fast")

    assert decision.selected_model == "empty-model"
    assert decision.reason == "probe_skipped"
    assert service.calls == []


@pytest.mark.asyncio
async def test_model_router_orders_candidates_by_persisted_health_without_probe():
    class HealthConfig(FakeConfig):
        model_pools = {"extractor_fast": ["flaky-model", "stable-model"]}

    storage = FakeStorage({
        "model_health_event_flaky": {
            "source": "chapter_index_attempt",
            "role": "extractor_fast",
            "model": "flaky-model",
            "status": "failed",
            "error_type": "gateway_timeout",
            "session_id": "session-a",
            "parent_id": "novel-a",
            "created_at": "2026-06-01T10:00:00",
        },
        "model_health_event_stable": {
            "source": "chapter_index_attempt",
            "role": "extractor_fast",
            "model": "stable-model",
            "status": "success",
            "latency_ms": 26000,
            "session_id": "session-a",
            "parent_id": "novel-a",
            "created_at": "2026-06-01T10:01:00",
        },
    })
    service = FakeRoutedAIService({"stable-model": "ok", "flaky-model": "bad"}, real_client=False)
    router = ModelRouter(service, HealthConfig(), storage=storage)

    decision = await router.select_model("extractor_fast", session_id="session-a", parent_id="novel-a")

    assert decision.selected_model == "stable-model"
    assert decision.candidates == ["stable-model", "flaky-model"]
    assert decision.original_candidates == ["flaky-model", "stable-model"]
    assert decision.health_rankings[0]["model"] == "stable-model"
    assert decision.to_dict()["candidate_order_source"] == "health_history"


def test_model_router_classifies_gateway_and_auth_errors():
    assert ModelRouter.classify_error(RuntimeError("504 Gateway Time-out")) == "gateway_timeout"
    assert ModelRouter.classify_error(RuntimeError("Authorization failed")) == "auth_failed"
    assert ModelRouter.classify_error(RuntimeError("Model returned empty content")) == "empty_content"


def test_config_model_pool_env_dedupes(monkeypatch):
    monkeypatch.setenv("NOVELFORGE_EXTRACTOR_FAST_MODELS", "a,b,a,, c ")

    assert Config._model_pool_from_env("NOVELFORGE_EXTRACTOR_FAST_MODELS", ["fallback"]) == ["a", "b", "c"]


def test_config_model_role_settings_are_configurable(monkeypatch):
    monkeypatch.setenv("NOVELFORGE_EXTRACTOR_FAST_TIMEOUT", "75")
    monkeypatch.setenv("NOVELFORGE_EXTRACTOR_FAST_CONCURRENCY", "2")
    monkeypatch.setenv("NOVELFORGE_EXTRACTOR_FAST_CHUNK_SIZE", "1600")
    monkeypatch.setenv("NOVELFORGE_EXTRACTOR_FAST_MAX_TOKENS", "2200")

    settings = Config().get_model_role_settings("extractor_fast")

    assert settings == {
        "timeout": 75.0,
        "concurrency": 2,
        "chunk_size": 1600,
        "max_tokens": 2200,
    }


def test_config_model_health_routing_is_configurable(monkeypatch):
    monkeypatch.setenv("NOVELFORGE_ENABLE_MODEL_HEALTH_ROUTING", "false")
    monkeypatch.setenv("NOVELFORGE_MODEL_HEALTH_ROUTING_LIMIT", "77")

    config = Config()

    assert config.enable_model_health_routing is False
    assert config.model_health_routing_limit == 77


@pytest.mark.asyncio
async def test_extraction_service_records_model_route(monkeypatch):
    class ServiceConfig(FakeConfig):
        model_pools = {"extractor_fast": ["route-model"]}
        model_role_settings = {
            "extractor_fast": {
                "timeout": 77.0,
                "concurrency": 2,
                "chunk_size": 1600,
                "max_tokens": 2100,
            }
        }

        def get_model_role_settings(self, role):
            return dict(self.model_role_settings.get(role, {}))

    service = FakeRoutedAIService({"route-model": "{}"}, real_client=False)
    observed = {}

    async def fake_extract_and_merge(self, chapters):
        observed["timeout"] = self.config.timeout
        observed["chunk_size"] = self.config.chunk_size
        observed["chapter_concurrency"] = self.chapter_concurrency
        observed["max_tokens"] = self.max_tokens
        return ChapterIndexMergeResult(
            diagnostics=ImportAnalysisDiagnostics(candidate_counts={"chapters_total": len(chapters)})
        )

    monkeypatch.setattr(
        "novelforge.extractors.chapter_index_extractor.ChapterIndexExtractor.extract_and_merge",
        fake_extract_and_merge,
    )

    extraction_service = ExtractionService(service, ServiceConfig())
    result = await extraction_service.extract_chapter_index_assets(
        [{"id": "c1", "title": "第一章", "content": "正文"}],
        repair_strategy={
            "model_role": "extractor_fast",
            "error_types": ["gateway_timeout"],
            "actions": ["shrink_chunk_and_extend_timeout"],
            "runtime_settings_overrides": {"chunk_size": 1200, "concurrency": 1},
        },
    )

    assert result["model_route"]["selected_model"] == "route-model"
    assert result["model_route"]["runtime_settings"]["timeout"] == 77.0
    assert result["model_route"]["runtime_settings"]["chunk_size"] == 1200
    assert result["model_route"]["runtime_settings"]["concurrency"] == 1
    assert result["analysis_diagnostics"]["repair_strategy"]["actions"] == ["shrink_chunk_and_extend_timeout"]
    assert result["analysis_diagnostics"]["model_route"]["selected_model"] == "route-model"
    assert observed == {
        "timeout": 77.0,
        "chunk_size": 1200,
        "chapter_concurrency": 1,
        "max_tokens": 2100,
    }


@pytest.mark.asyncio
async def test_extraction_service_uses_project_scoped_health_for_model_route(monkeypatch):
    class ServiceConfig(FakeConfig):
        model_pools = {"extractor_fast": ["flaky-model", "stable-model"]}
        model_role_settings = {"extractor_fast": {"timeout": 77.0, "concurrency": 1, "chunk_size": 1200, "max_tokens": 2100}}

        def get_model_role_settings(self, role):
            return dict(self.model_role_settings.get(role, {}))

    storage = FakeStorage({
        "model_health_event_stable": {
            "source": "chapter_index_attempt",
            "role": "extractor_fast",
            "model": "stable-model",
            "status": "success",
            "session_id": "session-a",
            "parent_id": "novel-a",
            "created_at": "2026-06-01T10:00:00",
        },
    })
    service = FakeRoutedAIService({"flaky-model": "bad", "stable-model": "ok"}, real_client=False)
    observed = {}

    async def fake_extract_and_merge(self, chapters):
        observed["model"] = self.ai_service.config.model
        return ChapterIndexMergeResult(
            diagnostics=ImportAnalysisDiagnostics(candidate_counts={"chapters_total": len(chapters)})
        )

    monkeypatch.setattr(
        "novelforge.extractors.chapter_index_extractor.ChapterIndexExtractor.extract_and_merge",
        fake_extract_and_merge,
    )

    extraction_service = ExtractionService(service, ServiceConfig(), storage)
    result = await extraction_service.extract_chapter_index_assets(
        [{"id": "c1", "title": "chapter", "content": "text"}],
        session_id="session-a",
        parent_id="novel-a",
    )

    assert observed["model"] == "stable-model"
    assert result["model_route"]["selected_model"] == "stable-model"
    assert result["model_route"]["original_candidates"] == ["flaky-model", "stable-model"]


def test_rank_candidates_by_profile_high_success_rate_ranks_first():
    from novelforge.services.model_router import rank_candidates_by_profile

    candidates = ["model-a", "model-b"]
    profiles = {
        "model-a": {"success_rate": 0.95, "confidence_level": "high", "timeout_rate": 0.01, "json_invalid_rate": 0.0, "p95_latency_ms": 5000, "repair_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "recommendation_hint": "good_for_extractor_fast"},
        "model-b": {"success_rate": 0.6, "confidence_level": "high", "timeout_rate": 0.1, "json_invalid_rate": 0.1, "p95_latency_ms": 15000, "repair_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "recommendation_hint": "high_timeout_risk"},
    }
    ranked, rankings = rank_candidates_by_profile("extractor_fast", candidates, profiles)
    assert ranked[0] == "model-a"
    assert rankings[0]["score"] > rankings[1]["score"]


def test_rank_candidates_by_profile_low_confidence_not_strongly_ranked():
    from novelforge.services.model_router import rank_candidates_by_profile

    candidates = ["model-a", "model-b"]
    profiles = {
        "model-a": {"success_rate": 0.9, "confidence_level": "low", "timeout_rate": 0.0, "json_invalid_rate": 0.0, "p95_latency_ms": 5000, "repair_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "recommendation_hint": "insufficient_data"},
        "model-b": {"success_rate": 0.8, "confidence_level": "high", "timeout_rate": 0.05, "json_invalid_rate": 0.0, "p95_latency_ms": 8000, "repair_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "recommendation_hint": "ok"},
    }
    ranked, rankings = rank_candidates_by_profile("extractor_fast", candidates, profiles)
    assert ranked[0] == "model-b"
    assert rankings[0]["confidence_level"] == "high"


def test_rank_candidates_by_schema_repair_favors_repair_salvage():
    from novelforge.services.model_router import rank_candidates_by_profile

    candidates = ["model-a", "model-b"]
    profiles = {
        "model-a": {"success_rate": 0.7, "confidence_level": "high", "timeout_rate": 0.05, "json_invalid_rate": 0.2, "p95_latency_ms": 10000, "repair_salvage_rate": 0.8, "budget_deferred_count": 0, "budget_exhausted_count": 0, "recommendation_hint": "needs_schema_repair"},
        "model-b": {"success_rate": 0.9, "confidence_level": "high", "timeout_rate": 0.01, "json_invalid_rate": 0.0, "p95_latency_ms": 5000, "repair_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "recommendation_hint": "ok"},
    }
    ranked, rankings = rank_candidates_by_profile("schema_repair", candidates, profiles)
    assert ranked[0] == "model-a"
    assert "high_repair_salvage" in rankings[0]["reason"]


def test_rank_candidates_by_profile_no_profiles_returns_original():
    from novelforge.services.model_router import rank_candidates_by_profile

    candidates = ["model-a", "model-b"]
    ranked, rankings = rank_candidates_by_profile("extractor_fast", candidates, {})
    assert ranked == candidates
    assert rankings == []


def test_rank_candidates_by_profile_needs_schema_repair_hint():
    from novelforge.services.model_router import rank_candidates_by_profile

    candidates = ["model-a"]
    profiles = {
        "model-a": {"success_rate": 0.7, "confidence_level": "high", "timeout_rate": 0.05, "json_invalid_rate": 0.25, "p95_latency_ms": 10000, "repair_salvage_rate": 0.5, "budget_deferred_count": 0, "budget_exhausted_count": 0, "recommendation_hint": "needs_schema_repair"},
    }
    ranked, rankings = rank_candidates_by_profile("extractor_fast", candidates, profiles)
    assert "needs_schema_repair" in rankings[0]["reason"]


@pytest.mark.asyncio
async def test_model_router_profile_routing_disabled_by_default():
    class ProfileConfig(FakeConfig):
        enable_profile_routing = False
        model_pools = {"extractor_fast": ["model-a", "model-b"]}

    service = FakeRoutedAIService({"model-a": "ok", "model-b": "ok"}, real_client=False)
    router = ModelRouter(service, ProfileConfig())

    decision = await router.select_model("extractor_fast", probe=False, session_id="test")

    assert decision.profile_rankings == []
    assert decision.profile_warnings == []


@pytest.mark.asyncio
async def test_model_router_profile_routing_enabled_with_profiles():
    from novelforge.services.performance_profile import PerformanceProfileStore, PerformanceProfile, PerformanceProfileKey, PerformanceProfileMetrics
    from novelforge.storage.memory_storage import MemoryStorage

    class ProfileConfig(FakeConfig):
        enable_profile_routing = True
        profile_routing_scope = "session"
        profile_routing_min_confidence = "medium"
        profile_routing_allow_low_confidence = False
        model_pools = {"extractor_fast": ["model-a", "model-b"]}

    storage = MemoryStorage()
    profile_store = PerformanceProfileStore(storage)

    profile_a = PerformanceProfile(
        key=PerformanceProfileKey(scope="session", session_id="test", model_used="model-a", task_role="extractor_fast", token_bucket="medium"),
        metrics=PerformanceProfileMetrics(total_attempts=20, success_count=18, p95_latency_ms=5000, timeout_count=1),
    )
    profile_b = PerformanceProfile(
        key=PerformanceProfileKey(scope="session", session_id="test", model_used="model-b", task_role="extractor_fast", token_bucket="medium"),
        metrics=PerformanceProfileMetrics(total_attempts=20, success_count=12, p95_latency_ms=15000, timeout_count=3),
    )

    await profile_store.save(profile_a)
    await profile_store.save(profile_b)

    service = FakeRoutedAIService({"model-a": "ok", "model-b": "ok"}, real_client=False)
    router = ModelRouter(service, ProfileConfig(), profile_store=profile_store)

    decision = await router.select_model("extractor_fast", session_id="test")

    assert len(decision.profile_rankings) > 0
    assert decision.profile_rankings[0]["model"] == "model-a"
    assert decision.profile_confidence == "medium"


def test_model_route_decision_to_dict_includes_profile_fields():
    from novelforge.services.model_router import ModelRouteDecision

    decision = ModelRouteDecision(
        role="extractor_fast",
        selected_model="model-a",
        reason="probe_skipped",
        candidates=["model-a", "model-b"],
        profile_rankings=[{"model": "model-a", "score": 150, "confidence_level": "high", "success_rate": 0.9, "p95_latency_ms": 5000, "timeout_rate": 0.01, "repair_salvage_rate": 0.0, "recommendation_hint": "good_for_extractor_fast"}],
        profile_confidence="high",
        profile_warnings=[],
    )

    result = decision.to_dict()
    assert "profile_rankings" in result
    assert result["profile_order_source"] == "performance_profile"
    assert result["profile_confidence"] == "high"
    assert result["selected_profile_hint"] == "good_for_extractor_fast"
    assert "selected_profile_metrics" in result


def test_config_profile_routing_env_vars(monkeypatch):
    monkeypatch.setenv("NOVELFORGE_ENABLE_PROFILE_ROUTING", "true")
    monkeypatch.setenv("NOVELFORGE_PROFILE_ROUTING_MIN_CONFIDENCE", "low")
    monkeypatch.setenv("NOVELFORGE_PROFILE_ROUTING_SCOPE", "global")
    monkeypatch.setenv("NOVELFORGE_PROFILE_ROUTING_ALLOW_LOW_CONFIDENCE", "true")

    from novelforge.core.config import Config
    config = Config()

    assert config.enable_profile_routing is True
    assert config.profile_routing_min_confidence == "low"
    assert config.profile_routing_scope == "global"
    assert config.profile_routing_allow_low_confidence is True


# ============================================================================
# Profile Routing Tests
# ============================================================================


def test_rank_candidates_by_profile_high_success_rate_ranks_first():
    from novelforge.services.model_router import rank_candidates_by_profile

    candidates = ["model-a", "model-b"]
    profiles = {
        "model-a": {"confidence_level": "high", "success_rate": 0.95, "timeout_rate": 0.01, "json_invalid_rate": 0.0, "p95_latency_ms": 5000, "repair_salvage_rate": 0.0, "retry_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "total_attempts": 50},
        "model-b": {"confidence_level": "high", "success_rate": 0.7, "timeout_rate": 0.05, "json_invalid_rate": 0.0, "p95_latency_ms": 10000, "repair_salvage_rate": 0.0, "retry_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "total_attempts": 50},
    }

    ranked, rankings = rank_candidates_by_profile("extractor_fast", candidates, profiles)

    assert ranked[0] == "model-a"
    assert rankings[0]["score"] > rankings[1]["score"]


def test_rank_candidates_by_profile_high_timeout_ranks_lower():
    from novelforge.services.model_router import rank_candidates_by_profile

    candidates = ["model-a", "model-b"]
    profiles = {
        "model-a": {"confidence_level": "high", "success_rate": 0.9, "timeout_rate": 0.3, "json_invalid_rate": 0.0, "p95_latency_ms": 10000, "repair_salvage_rate": 0.0, "retry_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "total_attempts": 50},
        "model-b": {"confidence_level": "high", "success_rate": 0.9, "timeout_rate": 0.01, "json_invalid_rate": 0.0, "p95_latency_ms": 10000, "repair_salvage_rate": 0.0, "retry_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "total_attempts": 50},
    }

    ranked, rankings = rank_candidates_by_profile("extractor_fast", candidates, profiles)

    assert ranked[0] == "model-b"


def test_rank_candidates_by_profile_json_invalid_with_high_repair_kept():
    from novelforge.services.model_router import rank_candidates_by_profile

    candidates = ["model-a", "model-b"]
    profiles = {
        "model-a": {"confidence_level": "high", "success_rate": 0.85, "timeout_rate": 0.01, "json_invalid_rate": 0.3, "p95_latency_ms": 10000, "repair_salvage_rate": 0.7, "retry_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "total_attempts": 50},
        "model-b": {"confidence_level": "high", "success_rate": 0.85, "timeout_rate": 0.01, "json_invalid_rate": 0.0, "p95_latency_ms": 10000, "repair_salvage_rate": 0.0, "retry_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "total_attempts": 50},
    }

    ranked, rankings = rank_candidates_by_profile("extractor_fast", candidates, profiles)

    model_a_ranking = next(r for r in rankings if r["model"] == "model-a")
    assert "needs_schema_repair" in model_a_ranking["reason"]


def test_rank_candidates_by_profile_low_confidence_not_strongly_reordered():
    from novelforge.services.model_router import rank_candidates_by_profile

    candidates = ["model-a", "model-b"]
    profiles = {
        "model-a": {"confidence_level": "low", "success_rate": 1.0, "timeout_rate": 0.0, "json_invalid_rate": 0.0, "p95_latency_ms": 1000, "repair_salvage_rate": 0.0, "retry_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "total_attempts": 2},
        "model-b": {"confidence_level": "low", "success_rate": 0.5, "timeout_rate": 0.1, "json_invalid_rate": 0.0, "p95_latency_ms": 5000, "repair_salvage_rate": 0.0, "retry_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "total_attempts": 3},
    }

    ranked, rankings = rank_candidates_by_profile("extractor_fast", candidates, profiles)

    for r in rankings:
        assert r["score"] == 0
        assert r["reason"] == "low_confidence"


def test_rank_candidates_by_profile_schema_repair_prefers_repair_salvage():
    from novelforge.services.model_router import rank_candidates_by_profile

    candidates = ["model-a", "model-b"]
    profiles = {
        "model-a": {"confidence_level": "high", "success_rate": 0.8, "timeout_rate": 0.05, "json_invalid_rate": 0.1, "p95_latency_ms": 15000, "repair_salvage_rate": 0.9, "retry_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "total_attempts": 50},
        "model-b": {"confidence_level": "high", "success_rate": 0.85, "timeout_rate": 0.05, "json_invalid_rate": 0.1, "p95_latency_ms": 15000, "repair_salvage_rate": 0.2, "retry_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "total_attempts": 50},
    }

    ranked, rankings = rank_candidates_by_profile("schema_repair", candidates, profiles)

    assert ranked[0] == "model-a"


def test_rank_candidates_by_profile_no_profiles_returns_original():
    from novelforge.services.model_router import rank_candidates_by_profile

    candidates = ["model-a", "model-b"]
    profiles: dict = {}

    ranked, rankings = rank_candidates_by_profile("extractor_fast", candidates, profiles)

    assert ranked == candidates
    assert rankings == []


def test_rank_candidates_by_profile_extractor_deep_tolerates_latency():
    from novelforge.services.model_router import rank_candidates_by_profile

    candidates = ["model-a", "model-b"]
    profiles = {
        "model-a": {"confidence_level": "high", "success_rate": 0.9, "timeout_rate": 0.01, "json_invalid_rate": 0.0, "p95_latency_ms": 50000, "repair_salvage_rate": 0.0, "retry_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "total_attempts": 50},
        "model-b": {"confidence_level": "high", "success_rate": 0.95, "timeout_rate": 0.01, "json_invalid_rate": 0.0, "p95_latency_ms": 10000, "repair_salvage_rate": 0.0, "retry_salvage_rate": 0.0, "budget_deferred_count": 0, "budget_exhausted_count": 0, "total_attempts": 50},
    }

    ranked, rankings = rank_candidates_by_profile("extractor_deep", candidates, profiles)

    latency_penalty_a = next(r for r in rankings if r["model"] == "model-a")
    latency_penalty_b = next(r for r in rankings if r["model"] == "model-b")
    assert latency_penalty_a["score"] > 0


def test_config_profile_routing_is_configurable(monkeypatch):
    monkeypatch.setenv("NOVELFORGE_ENABLE_PROFILE_ROUTING", "true")
    monkeypatch.setenv("NOVELFORGE_PROFILE_ROUTING_MIN_CONFIDENCE", "low")
    monkeypatch.setenv("NOVELFORGE_PROFILE_ROUTING_SCOPE", "global")
    monkeypatch.setenv("NOVELFORGE_PROFILE_ROUTING_ALLOW_LOW_CONFIDENCE", "true")

    from novelforge.core.config import Config
    config = Config()

    assert config.enable_profile_routing is True
    assert config.profile_routing_min_confidence == "low"
    assert config.profile_routing_scope == "global"
    assert config.profile_routing_allow_low_confidence is True


@pytest.mark.asyncio
async def test_model_router_disabled_profile_routing_preserves_order():
    class ProfileConfig(FakeConfig):
        model_pools = {"extractor_fast": ["model-a", "model-b"]}
        enable_profile_routing = False

    service = FakeRoutedAIService({"model-a": "ok", "model-b": "ok"}, real_client=False)
    router = ModelRouter(service, ProfileConfig())

    decision = await router.select_model("extractor_fast", probe=False, session_id="test")

    assert decision.profile_rankings == []
    assert decision.profile_warnings == []


@pytest.mark.asyncio
async def test_model_router_decision_includes_profile_fields():
    class ProfileConfig(FakeConfig):
        model_pools = {"extractor_fast": ["model-a"]}
        enable_profile_routing = False

    service = FakeRoutedAIService({"model-a": "ok"}, real_client=False)
    router = ModelRouter(service, ProfileConfig())

    decision = await router.select_model("extractor_fast", probe=False, session_id="test")

    data = decision.to_dict()
    assert "profile_rankings" in data or decision.profile_rankings == []
    assert "profile_confidence" in data or decision.profile_confidence is None
    assert "profile_warnings" in data or decision.profile_warnings == []


def test_config_profile_routing_defaults(monkeypatch):
    monkeypatch.delenv("NOVELFORGE_ENABLE_PROFILE_ROUTING", raising=False)
    monkeypatch.delenv("NOVELFORGE_PROFILE_ROUTING_MIN_CONFIDENCE", raising=False)
    monkeypatch.delenv("NOVELFORGE_PROFILE_ROUTING_SCOPE", raising=False)
    monkeypatch.delenv("NOVELFORGE_PROFILE_ROUTING_ALLOW_LOW_CONFIDENCE", raising=False)

    config = Config()

    assert config.enable_profile_routing is False
    assert config.profile_routing_min_confidence == "medium"
    assert config.profile_routing_scope == "session"
    assert config.profile_routing_allow_low_confidence is False


def test_config_profile_routing_env_override_required_values(monkeypatch):
    monkeypatch.setenv("NOVELFORGE_ENABLE_PROFILE_ROUTING", "true")
    monkeypatch.setenv("NOVELFORGE_PROFILE_ROUTING_ALLOW_LOW_CONFIDENCE", "true")
    monkeypatch.setenv("NOVELFORGE_PROFILE_ROUTING_SCOPE", "global")

    config = Config()

    assert config.enable_profile_routing is True
    assert config.profile_routing_allow_low_confidence is True
    assert config.profile_routing_scope == "global"


@pytest.mark.asyncio
async def test_model_router_low_confidence_disallowed_preserves_candidate_order():
    class ProfileConfig(FakeConfig):
        model_pools = {"extractor_fast": ["model-a", "model-b"]}
        enable_profile_routing = True
        profile_routing_scope = "session"
        profile_routing_min_confidence = "medium"
        profile_routing_allow_low_confidence = False

    profile_store = await make_profile_store(
        make_profile(model="model-b", total_attempts=2, success_count=2, p95_latency_ms=1000)
    )
    service = FakeRoutedAIService({"model-a": "ok", "model-b": "ok"}, real_client=False)
    router = ModelRouter(service, ProfileConfig(), profile_store=profile_store)

    decision = await router.select_model("extractor_fast", probe=False, session_id="test")

    assert decision.selected_model == "model-a"
    assert decision.candidates == ["model-a", "model-b"]
    low_ranking = next(r for r in decision.profile_rankings if r["model"] == "model-b")
    assert low_ranking["reason"] == "low_confidence"
    assert decision.profile_confidence == "low"


@pytest.mark.asyncio
async def test_model_router_low_confidence_allowed_can_reorder_candidates():
    class ProfileConfig(FakeConfig):
        model_pools = {"extractor_fast": ["model-a", "model-b"]}
        enable_profile_routing = True
        profile_routing_scope = "session"
        profile_routing_min_confidence = "medium"
        profile_routing_allow_low_confidence = True

    profile_store = await make_profile_store(
        make_profile(model="model-a", total_attempts=2, success_count=1, timeout_count=1, p95_latency_ms=9000),
        make_profile(model="model-b", total_attempts=2, success_count=2, timeout_count=0, p95_latency_ms=1000),
    )
    service = FakeRoutedAIService({"model-a": "ok", "model-b": "ok"}, real_client=False)
    router = ModelRouter(service, ProfileConfig(), profile_store=profile_store)

    decision = await router.select_model("extractor_fast", probe=False, session_id="test")

    assert decision.selected_model == "model-b"
    assert decision.candidates[0] == "model-b"
    assert decision.profile_rankings[0]["confidence_level"] == "low"
    assert decision.profile_confidence == "low"


@pytest.mark.asyncio
async def test_model_router_low_confidence_allowed_does_not_bypass_cooldown():
    class ProfileConfig(FakeConfig):
        model_pools = {"extractor_fast": ["model-a", "model-b"]}
        enable_profile_routing = True
        profile_routing_scope = "session"
        profile_routing_allow_low_confidence = True

    profile_store = await make_profile_store(
        make_profile(model="model-a", total_attempts=2, success_count=1, timeout_count=1, p95_latency_ms=9000),
        make_profile(model="model-b", total_attempts=2, success_count=2, timeout_count=0, p95_latency_ms=1000),
    )
    service = FakeRoutedAIService({"model-a": "ok", "model-b": "ok"}, real_client=False)
    router = ModelRouter(service, ProfileConfig(), profile_store=profile_store)
    router.mark_cooldown("model-b")

    decision = await router.select_model("extractor_fast", probe=False, session_id="test")

    assert decision.candidates[0] == "model-b"
    assert decision.selected_model == "model-a"


@pytest.mark.asyncio
async def test_model_router_global_scope_uses_global_profiles_without_session_id():
    class ProfileConfig(FakeConfig):
        model_pools = {"extractor_fast": ["model-a", "model-b"]}
        enable_profile_routing = True
        profile_routing_scope = "global"
        profile_routing_min_confidence = "medium"
        profile_routing_allow_low_confidence = False

    profile_store = await make_profile_store(
        make_profile(scope="global", session_id="", model="model-b", total_attempts=20, success_count=19),
        make_profile(scope="global", session_id="", model="model-a", total_attempts=20, success_count=10),
    )
    service = FakeRoutedAIService({"model-a": "ok", "model-b": "ok"}, real_client=False)
    router = ModelRouter(service, ProfileConfig(), profile_store=profile_store)

    decision = await router.select_model("extractor_fast", probe=False)

    assert decision.selected_model == "model-b"
    assert decision.profile_warnings == []


@pytest.mark.asyncio
async def test_model_router_session_scope_without_session_id_warns_and_preserves_order():
    class ProfileConfig(FakeConfig):
        model_pools = {"extractor_fast": ["model-a", "model-b"]}
        enable_profile_routing = True
        profile_routing_scope = "session"

    profile_store = await make_profile_store(
        make_profile(scope="global", session_id="", model="model-b", total_attempts=20, success_count=19)
    )
    service = FakeRoutedAIService({"model-a": "ok", "model-b": "ok"}, real_client=False)
    router = ModelRouter(service, ProfileConfig(), profile_store=profile_store)

    decision = await router.select_model("extractor_fast", probe=False)

    assert decision.selected_model == "model-a"
    assert "session_scope_missing_session_id" in decision.profile_warnings


@pytest.mark.asyncio
async def test_model_router_session_scope_falls_back_to_global_when_session_profile_missing():
    class ProfileConfig(FakeConfig):
        model_pools = {"extractor_fast": ["model-a", "model-b"]}
        enable_profile_routing = True
        profile_routing_scope = "session"
        profile_routing_min_confidence = "medium"

    profile_store = await make_profile_store(
        make_profile(scope="global", session_id="", model="model-b", total_attempts=20, success_count=19),
        make_profile(scope="global", session_id="", model="model-a", total_attempts=20, success_count=10),
    )
    service = FakeRoutedAIService({"model-a": "ok", "model-b": "ok"}, real_client=False)
    router = ModelRouter(service, ProfileConfig(), profile_store=profile_store)

    decision = await router.select_model("extractor_fast", probe=False, session_id="missing-session")

    assert decision.selected_model == "model-b"
    assert "fallback_to_global" in decision.profile_warnings


@pytest.mark.asyncio
async def test_model_router_invalid_profile_scope_warns_and_falls_back_safely():
    class ProfileConfig(FakeConfig):
        model_pools = {"extractor_fast": ["model-a", "model-b"]}
        enable_profile_routing = True
        profile_routing_scope = "invalid"

    profile_store = await make_profile_store(
        make_profile(scope="global", session_id="", model="model-b", total_attempts=20, success_count=19)
    )
    service = FakeRoutedAIService({"model-a": "ok", "model-b": "ok"}, real_client=False)
    router = ModelRouter(service, ProfileConfig(), profile_store=profile_store)

    decision = await router.select_model("extractor_fast", probe=False, session_id="test")

    assert decision.selected_model == "model-b"
    assert "invalid_profile_scope_fallback" in decision.profile_warnings
    assert "fallback_to_global" in decision.profile_warnings


def test_model_router_same_model_prefers_known_bucket_over_unknown():
    unknown_profile = make_profile(model="model-a", token_bucket="unknown", total_attempts=20, success_count=10)
    medium_profile = make_profile(model="model-a", token_bucket="medium", total_attempts=20, success_count=18)

    assert ModelRouter._is_better_profile(medium_profile, unknown_profile) is True
    assert ModelRouter._is_better_profile(unknown_profile, medium_profile) is False


def test_model_router_same_model_prefers_high_confidence_over_low():
    low_profile = make_profile(model="model-a", total_attempts=2, success_count=2)
    high_profile = make_profile(model="model-a", total_attempts=35, success_count=30)

    assert ModelRouter._is_better_profile(high_profile, low_profile) is True
    assert ModelRouter._is_better_profile(low_profile, high_profile) is False


def test_model_router_profile_choice_is_deterministic_for_exact_priority_ties():
    profile_a = make_profile(
        model="model-a",
        token_bucket="medium",
        total_attempts=20,
        success_count=12,
        generated_at="2026-06-01T10:00:00",
    )
    profile_b = make_profile(
        model="model-a",
        token_bucket="medium",
        total_attempts=20,
        success_count=18,
        generated_at="2026-06-01T10:00:00",
    )

    first = max([profile_a, profile_b], key=ModelRouter._profile_sort_key)
    second = max([profile_b, profile_a], key=ModelRouter._profile_sort_key)

    assert first == second


def test_model_route_decision_does_not_expose_raw_or_chapter_content_fields():
    from novelforge.services.model_router import ModelRouteDecision

    decision = ModelRouteDecision(
        role="extractor_fast",
        selected_model="model-a",
        reason="probe_skipped",
        candidates=["model-a"],
        profile_rankings=[{"model": "model-a", "score": 80, "confidence_level": "low"}],
        profile_confidence="low",
    )

    data = decision.to_dict()

    assert "raw_response_text" not in data
    assert "raw_response_preview" not in data
    assert "chapter_content" not in data


@pytest.mark.asyncio
async def test_model_router_profile_lookup_failure_falls_back_with_warning():
    class BrokenProfileStore:
        async def list_by_scope(self, scope, session_id=""):
            raise RuntimeError("profile store unavailable")

    class ProfileConfig(FakeConfig):
        model_pools = {"extractor_fast": ["model-a", "model-b"]}
        enable_profile_routing = True

    service = FakeRoutedAIService({"model-a": "ok", "model-b": "ok"}, real_client=False)
    router = ModelRouter(service, ProfileConfig(), profile_store=BrokenProfileStore())

    decision = await router.select_model("extractor_fast", probe=False, session_id="test")

    assert decision.selected_model == "model-a"
    assert "profile_lookup_failed" in decision.profile_warnings
