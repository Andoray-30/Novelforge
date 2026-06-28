from typing import Any, Dict, List, Optional
import pytest
from novelforge.extractors.chapter_index_extractor import ChapterIndexMergeResult, ImportAnalysisDiagnostics
from novelforge.services.extraction_service import ExtractionService
from novelforge.services.model_router import ModelRouteDecision, ModelProbeResult


class FakeConfig:
    model = "base-model"
    model_pools: Dict[str, List[str]] = {"extractor_fast": ["model-a", "model-b"]}
    enable_model_router = True
    model_probe_timeout = 1.0
    model_cooldown_seconds = 30.0


class FakeAIService:
    def __init__(self, responses: Optional[Dict[str, Any]] = None, *, real_client: bool = True, model: Optional[str] = None):
        self.responses = responses or {}
        self.calls: List[str] = []
        self.real_client = real_client
        self.config = FakeConfig()
        if model:
            self.config.model = model

    def has_real_client(self) -> bool:
        return self.real_client

    def with_overrides(self, *, model: Optional[str] = None, strict_model: Optional[bool] = None):
        return FakeAIService(self.responses, real_client=self.real_client, model=model)

    async def chat(self, prompt: str, **kwargs: Any) -> str:
        model_name = self.config.model or "default"
        self.calls.append(model_name)
        response = self.responses.get(model_name, "")
        if isinstance(response, Exception):
            raise response
        return response


class FakeRoutedAIService:
    def __init__(self, responses: Dict[str, Any], *, real_client: bool = True):
        self.responses = responses
        self.calls: List[str] = []
        self.real_client = real_client
        self.config = FakeConfig()

    def has_real_client(self) -> bool:
        return self.real_client

    def with_overrides(self, *, model: Optional[str] = None, strict_model: Optional[bool] = None):
        return FakeRoutedAIService(self.responses, real_client=self.real_client)

    async def chat(self, prompt: str, **kwargs: Any) -> str:
        self.calls.append(str(kwargs.get("model", "default")))
        return ""


def test_model_route_decision_probe_passed_true():
    decision = ModelRouteDecision(
        role="extractor_fast",
        selected_model="rich-model",
        reason="probe_passed",
        candidates=["empty-model", "rich-model"],
        probe_results=[
            ModelProbeResult(role="extractor_fast", model="empty-model", available=False, latency_ms=100),
            ModelProbeResult(
                role="extractor_fast",
                model="rich-model",
                available=True,
                non_empty_chat=True,
                json_capable=True,
                extraction_rich=True,
                latency_ms=900,
            ),
        ],
    )
    assert decision.probe_passed is True


def test_model_route_decision_probe_passed_false():
    decision = ModelRouteDecision(
        role="extractor_fast",
        selected_model="model-a",
        reason="no_probe_passed_using_best_score",
        candidates=["model-a", "model-b"],
        probe_results=[
            ModelProbeResult(role="extractor_fast", model="model-a", available=False, latency_ms=100),
            ModelProbeResult(role="extractor_fast", model="model-b", available=False, latency_ms=100),
        ],
    )
    assert decision.probe_passed is False


def test_model_route_decision_probe_passed_no_results():
    decision = ModelRouteDecision(
        role="extractor_fast",
        selected_model="model-a",
        reason="probe_skipped",
        candidates=["model-a"],
        probe_results=[],
    )
    assert decision.probe_passed is False


@pytest.mark.asyncio
async def test_extraction_service_blocks_when_all_candidates_fail_probe(monkeypatch):
    from novelforge.extractors import chapter_index_extractor as cie_module

    extract_called = False

    async def fake_extract_and_merge(self, chapters):
        nonlocal extract_called
        extract_called = True
        return ChapterIndexMergeResult(
            diagnostics=ImportAnalysisDiagnostics(candidate_counts={"chapters_total": len(chapters)})
        )

    monkeypatch.setattr(cie_module.ChapterIndexExtractor, "extract_and_merge", fake_extract_and_merge)

    class GateConfig(FakeConfig):
        model_pools = {"extractor_fast": ["model-a", "model-b"]}

    service = FakeRoutedAIService({
        "model-a": Exception("503 Service Unavailable"),
        "model-b": Exception("503 Service Unavailable"),
    }, real_client=True)

    extraction = ExtractionService(service, GateConfig())
    chapters = [
        {"id": "c1", "title": "chapter1", "content": "text1"},
        {"id": "c2", "title": "chapter2", "content": "text2"},
    ]

    result = await extraction.extract_chapter_index_assets(chapters, session_id="session-1")

    assert extract_called is False
    assert result["status"] == "provider_unavailable"
    assert result["retryable"] is True
    assert result["provider_health_summary"]["all_candidates_failed"] is True
    assert result["failed_routes"] == ["model-a", "model-b"]
    assert result["recommended_action"] == "check_provider_status_or_wait"
    assert result["analysis_diagnostics"]["provider_unavailable"] is True
    assert result["analysis_diagnostics"]["provider_health_summary"]["all_candidates_failed"] is True
    assert result["analysis_diagnostics"]["provider_health_summary"]["failed_routes"] == ["model-a", "model-b"]
    assert result["analysis_diagnostics"]["provider_health_summary"]["recommended_action"] == "check_provider_status_or_wait"
    assert "model_route" in result
    assert result["model_route"]["selected_model"] in {"model-a", "model-b"}
    assert result["model_route"]["reason"] == "no_probe_passed_using_best_score"
    assert result["characters"] == []
    assert result["world_setting"] is None
    assert result["timeline_events"] == []
    assert result["relationships"] == []
    assert result["failed_chapters"] == []
    assert result["chapter_index_attempts"] == []
    diag_str = str(result["analysis_diagnostics"])
    assert "text1" not in diag_str
    assert "c1" not in diag_str


@pytest.mark.asyncio
async def test_extraction_service_uses_fallback_when_first_candidate_fails(monkeypatch):
    from novelforge.extractors import chapter_index_extractor as cie_module

    extract_called = False
    used_model = None

    async def fake_extract_and_merge(self, chapters):
        nonlocal extract_called, used_model
        extract_called = True
        used_model = self.ai_service.config.model
        return ChapterIndexMergeResult(
            diagnostics=ImportAnalysisDiagnostics(candidate_counts={"chapters_total": len(chapters)})
        )

    monkeypatch.setattr(cie_module.ChapterIndexExtractor, "extract_and_merge", fake_extract_and_merge)

    class FallbackConfig(FakeConfig):
        model_pools = {"extractor_fast": ["model-a", "model-b"]}

    service = FakeAIService({
        "model-a": Exception("503 Service Unavailable"),
        "model-b": '{"chapter_characters":[{"name":"A","evidence":["ok"]}],"chapter_interactions":[],"chapter_events":[],"chapter_world_facts":[]}',
    }, real_client=True)

    extraction = ExtractionService(service, FallbackConfig())
    chapters = [{"id": "c1", "title": "chapter1", "content": "text"}]

    result = await extraction.extract_chapter_index_assets(chapters, session_id="session-2")

    assert extract_called is True
    assert used_model == "model-b"
    assert result["model_route"]["selected_model"] == "model-b"
    assert result["model_route"]["reason"] == "probe_passed"
    assert "provider_unavailable" not in result["analysis_diagnostics"]


@pytest.mark.asyncio
async def test_extraction_service_preserves_existing_behavior_without_real_client(monkeypatch):
    from novelforge.extractors import chapter_index_extractor as cie_module

    extract_called = False

    async def fake_extract_and_merge(self, chapters):
        nonlocal extract_called
        extract_called = True
        return ChapterIndexMergeResult(
            diagnostics=ImportAnalysisDiagnostics(candidate_counts={"chapters_total": len(chapters)})
        )

    monkeypatch.setattr(cie_module.ChapterIndexExtractor, "extract_and_merge", fake_extract_and_merge)

    service = FakeAIService({}, real_client=False)

    extraction = ExtractionService(service, FakeConfig())
    chapters = [{"id": "c1", "title": "chapter1", "content": "text"}]

    result = await extraction.extract_chapter_index_assets(chapters, session_id="session-3")

    assert extract_called is True
    assert result["model_route"]["reason"] == "probe_skipped"
    assert "provider_unavailable" not in result["analysis_diagnostics"]


@pytest.mark.asyncio
async def test_extraction_service_no_chapter_attempts_when_provider_unavailable(monkeypatch):
    from novelforge.extractors import chapter_index_extractor as cie_module

    extract_called = False

    async def fake_extract_and_merge(self, chapters):
        nonlocal extract_called
        extract_called = True
        return ChapterIndexMergeResult(
            diagnostics=ImportAnalysisDiagnostics(
                candidate_counts={"chapters_total": len(chapters)},
                failed_chapters=[{"chapter_id": ch["id"], "error": "timeout"} for ch in chapters],
            )
        )

    monkeypatch.setattr(cie_module.ChapterIndexExtractor, "extract_and_merge", fake_extract_and_merge)

    class Q2Config(FakeConfig):
        model_pools = {"extractor_fast": ["model-a", "model-b"]}

    service = FakeAIService({
        "model-a": Exception("504 Gateway Timeout"),
        "model-b": Exception("504 Gateway Timeout"),
    }, real_client=True)

    extraction = ExtractionService(service, Q2Config())
    chapters = [
        {"id": f"c{i}", "title": f"chapter{i}", "content": f"text{i}"}
        for i in range(1, 9)
    ]

    result = await extraction.extract_chapter_index_assets(chapters, session_id="session-q2")

    assert extract_called is False
    assert result["status"] == "provider_unavailable"
    assert result["retryable"] is True
    assert result["provider_health_summary"]["all_candidates_failed"] is True
    assert result["failed_routes"] == ["model-a", "model-b"]
    assert result["recommended_action"] == "check_provider_status_or_wait"
    assert result["analysis_diagnostics"]["provider_unavailable"] is True
    assert result["failed_chapters"] == []
    assert result["chapter_index_attempts"] == []
    assert result["retry_stats"] is None
    assert result["characters"] == []
    assert result["world_setting"] is None
    assert result["timeline_events"] == []
    assert result["relationships"] == []
