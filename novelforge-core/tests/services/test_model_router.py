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


@pytest.mark.asyncio
async def test_model_router_selects_first_extractor_model_with_rich_json():
    responses = {
        "empty-model": "",
        "rich-model": '{"chapter_characters":[{"name":"辉夜","evidence":["辉夜醒来"]}],"chapter_interactions":[],"chapter_events":[],"chapter_world_facts":[]}',
    }
    router = ModelRouter(FakeRoutedAIService(responses), FakeConfig())

    decision = await router.select_model("extractor_fast")

    assert decision.selected_model == "rich-model"
    assert decision.reason == "probe_passed"
    assert [result.model for result in decision.probe_results] == ["empty-model", "rich-model"]
    assert router._is_cooling_down("empty-model")


@pytest.mark.asyncio
async def test_model_router_skips_probe_without_real_client():
    service = FakeRoutedAIService({"empty-model": ""}, real_client=False)
    router = ModelRouter(service, FakeConfig())

    decision = await router.select_model("extractor_fast")

    assert decision.selected_model == "empty-model"
    assert decision.reason == "probe_skipped"
    assert service.calls == []


def test_model_router_classifies_gateway_and_auth_errors():
    assert ModelRouter.classify_error(RuntimeError("504 Gateway Time-out")) == "gateway_timeout"
    assert ModelRouter.classify_error(RuntimeError("Authorization failed")) == "auth_failed"
    assert ModelRouter.classify_error(RuntimeError("Model returned empty content")) == "empty_content"


def test_config_model_pool_env_dedupes(monkeypatch):
    monkeypatch.setenv("NOVELFORGE_EXTRACTOR_FAST_MODELS", "a,b,a,, c ")

    assert Config._model_pool_from_env("NOVELFORGE_EXTRACTOR_FAST_MODELS", ["fallback"]) == ["a", "b", "c"]


@pytest.mark.asyncio
async def test_extraction_service_records_model_route(monkeypatch):
    class ServiceConfig(FakeConfig):
        model_pools = {"extractor_fast": ["route-model"]}

    service = FakeRoutedAIService({"route-model": "{}"}, real_client=False)

    async def fake_extract_and_merge(self, chapters):
        return ChapterIndexMergeResult(
            diagnostics=ImportAnalysisDiagnostics(candidate_counts={"chapters_total": len(chapters)})
        )

    monkeypatch.setattr(
        "novelforge.extractors.chapter_index_extractor.ChapterIndexExtractor.extract_and_merge",
        fake_extract_and_merge,
    )

    extraction_service = ExtractionService(service, ServiceConfig())
    result = await extraction_service.extract_chapter_index_assets([{"id": "c1", "title": "第一章", "content": "正文"}])

    assert result["model_route"]["selected_model"] == "route-model"
    assert result["analysis_diagnostics"]["model_route"]["selected_model"] == "route-model"
