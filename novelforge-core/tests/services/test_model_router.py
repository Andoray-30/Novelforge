from types import SimpleNamespace

import pytest

from novelforge.core.config import Config
from novelforge.extractors.chapter_index_extractor import ChapterIndexMergeResult, ImportAnalysisDiagnostics
from novelforge.services.extraction_service import ExtractionService
from novelforge.services.model_router import ModelRouter


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
