import asyncio
import json

import httpx

from novelforge.core.config import Config
from novelforge.services import ai_service as ai_service_module
from novelforge.services.ai_service import AIService
from novelforge.services.extraction_service import ExtractionService
from novelforge.extractors.chapter_index_extractor import ChapterIndexExtractor


def test_ai_service_passes_configured_proxy_to_http_client(monkeypatch):
    captured = {}

    class FakeAsyncClient:
        is_closed = False

        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(ai_service_module.httpx, "AsyncClient", FakeAsyncClient)

    config = Config.__new__(Config)
    config.api_key = "test-key"
    config.base_url = "https://example.test/v1"
    config.model = "test-model"
    config.openai_proxy = "http://127.0.0.1:7897"
    config.rpm_limit = 1
    config.tpm_limit = 1
    config.max_retries = 1
    config.retry_base_delay = 0.1
    config.retry_max_delay = 0.1

    service = AIService(config)
    service._get_http_client()

    assert service.has_real_client() is True
    assert captured["proxy"] == "http://127.0.0.1:7897"
    assert captured["trust_env"] is False
    assert isinstance(captured["timeout"], httpx.Timeout)


def test_deterministic_mock_chapter_index_never_initializes_external_client(monkeypatch):
    monkeypatch.setenv("NOVELFORGE_MOCK_TOOL_CALLS", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "configured-but-must-not-be-used")

    def fail_external_client(*args, **kwargs):
        raise AssertionError("mock mode must not initialize an external client")

    monkeypatch.setattr(ai_service_module, "AsyncOpenAI", fail_external_client)
    monkeypatch.setattr(ai_service_module.httpx, "AsyncClient", fail_external_client)

    config = Config()
    service = AIService(config)
    extraction = ExtractionService(service, config)
    chapters = [
        {
            "id": f"chapter-{order}",
            "title": f"第{order}章",
            "chapter_index": order,
            "content": "本轮完全虚构的浮空城验收正文。",
        }
        for order in range(1, 4)
    ]

    result = asyncio.run(extraction.extract_chapter_index_assets(chapters))

    assert service.has_real_client() is False
    assert service.client is None
    assert result["model_route"]["reason"] == "probe_skipped"
    assert len(result["chapter_indices"]) == 3
    assert len(result["characters"]) >= 3
    assert {"岚舟", "砾星", "弦月"}.issubset(
        {character.name for character in result["characters"]}
    )
    assert len(result["relationships"]) >= 2
    assert len(result["timeline_events"]) >= 3
    assert result["world_setting"] is not None
    assert any(location.name == "云穹城浮核站" for location in result["world_setting"].locations)
    assert result["failed_chapters"] == []


def test_deterministic_mock_chapter_response_is_valid_schema_json(monkeypatch):
    monkeypatch.setenv("NOVELFORGE_MOCK_TOOL_CALLS", "true")
    service = AIService(Config())
    extractor = ChapterIndexExtractor(service)
    chapter = extractor._coerce_chapter_source(
        {"id": "chapter-2", "title": "第二章", "chapter_index": 2, "content": "合成正文"}
    )

    response = asyncio.run(service.chat(extractor._build_chapter_prompt(chapter)))
    payload = json.loads(response)
    parsed = extractor._parse_chapter_response(response, chapter)

    assert "合成正文" not in response
    assert set(payload) == {
        "chapter_characters",
        "chapter_interactions",
        "chapter_events",
        "chapter_world_facts",
    }
    assert parsed.chapter_order == 2
    assert parsed.chapter_events[0].title == "进入稳压环"
