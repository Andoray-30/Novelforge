import httpx

from novelforge.core.config import Config
from novelforge.services import ai_service as ai_service_module
from novelforge.services.ai_service import AIService


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

    AIService(config)._get_http_client()

    assert captured["proxy"] == "http://127.0.0.1:7897"
    assert captured["trust_env"] is False
    assert isinstance(captured["timeout"], httpx.Timeout)
