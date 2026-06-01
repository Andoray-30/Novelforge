from fastapi.testclient import TestClient

import novelforge.api as api_module
from novelforge.api.writing_agent import AgentPreparation
from novelforge.services.model_health import MODEL_HEALTH_EVENT_PREFIX


class FakeStorageManager:
    def __init__(self):
        self.data = {}

    async def save(self, key, value, storage_type=None):  # noqa: ANN001
        self.data[key] = value
        return True

    async def load(self, key, storage_type=None):  # noqa: ANN001
        return self.data.get(key)

    async def list_keys(self, storage_type=None):  # noqa: ANN001
        return list(self.data.keys())


class FakeAIService:
    def __init__(self, model="base-model"):
        self.config = type("Config", (), {"model": model})()

    def has_real_client(self):
        return False

    def with_overrides(self, *, model=None, **_kwargs):  # noqa: ANN001
        return FakeAIService(model=model or self.config.model)

    async def chat(self, prompt, system_prompt=None, **_kwargs):  # noqa: ANN001
        assert "agent context" in system_prompt
        return f"AI response from {self.config.model} with save suggestion"


class FakeWritingAgent:
    async def prepare(self, *, user_message, context, conversation, base_system_prompt, ai_service=None):  # noqa: ANN001
        return AgentPreparation(
            system_prompt=f"{base_system_prompt}\nagent context",
            trace={
                "enabled": True,
                "plan_summary": "read recent conversation",
                "tool_calls": [{"name": "get_recent_conversation", "status": "ok", "summary": "read 1 message"}],
                "used_assets": [],
                "chapter_snippets": [],
                "degraded": False,
                "max_tool_calls": 5,
            },
        )


def test_chat_response_and_stored_assistant_message_include_agent_trace(monkeypatch):
    fake_storage = FakeStorageManager()
    monkeypatch.setattr(api_module.config, "auth_required", False, raising=False)
    monkeypatch.setattr(api_module.config, "model_pools", {"writer_fast": ["fast-writer"]}, raising=False)
    monkeypatch.setattr(api_module, "storage_manager", fake_storage, raising=False)
    monkeypatch.setattr(api_module, "_resolve_runtime_ai_service", lambda _config=None: FakeAIService(), raising=False)
    monkeypatch.setattr(api_module, "_get_writing_agent_runtime", lambda: FakeWritingAgent(), raising=False)

    client = TestClient(api_module.app)
    response = client.post(
        "/api/chat/send-message",
        json={
            "message": "rewrite the previous version",
            "context": {"session_id": "session-a", "selected_novel_id": "novel-a"},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    trace = payload["context"]["agent_trace"]
    assert trace["tool_calls"][0]["name"] == "get_recent_conversation"
    assert trace["model_role"] == "writer_fast"
    assert trace["model_route"]["selected_model"] == "fast-writer"
    assert payload["message"]["metadata"]["agent_trace"]["plan_summary"] == "read recent conversation"
    assert payload["message"]["content"] == "AI response from fast-writer with save suggestion"

    stored = fake_storage.data[f"conversation_{payload['conversation_id']}"]
    assistant_message = stored["messages"][-1]
    assert assistant_message["metadata"]["agent_trace"]["enabled"] is True
    health_events = [
        value for key, value in fake_storage.data.items()
        if key.startswith(MODEL_HEALTH_EVENT_PREFIX)
    ]
    assert len(health_events) == 1
    assert health_events[0]["source"] == "writer_chat_attempt"
    assert health_events[0]["role"] == "writer_fast"
    assert health_events[0]["model"] == "fast-writer"
    assert health_events[0]["status"] == "success"


def test_chat_writer_route_prefers_recent_healthy_model(monkeypatch):
    fake_storage = FakeStorageManager()
    fake_storage.data[f"{MODEL_HEALTH_EVENT_PREFIX}history-stable"] = {
        "source": "writer_chat_attempt",
        "role": "writer_pro",
        "model": "stable-pro",
        "status": "success",
        "session_id": "session-a",
        "parent_id": "novel-a",
        "latency_ms": 28000,
        "created_at": "2026-06-01T10:00:00",
    }
    fake_storage.data[f"{MODEL_HEALTH_EVENT_PREFIX}history-flaky"] = {
        "source": "writer_chat_attempt",
        "role": "writer_pro",
        "model": "flaky-pro",
        "status": "failed",
        "session_id": "session-a",
        "parent_id": "novel-a",
        "error_type": "gateway_timeout",
        "latency_ms": 5000,
        "created_at": "2026-06-01T10:01:00",
    }
    monkeypatch.setattr(api_module.config, "auth_required", False, raising=False)
    monkeypatch.setattr(api_module.config, "model_pools", {"writer_pro": ["flaky-pro", "stable-pro"]}, raising=False)
    monkeypatch.setattr(api_module.config, "enable_model_health_routing", True, raising=False)
    monkeypatch.setattr(api_module, "storage_manager", fake_storage, raising=False)
    monkeypatch.setattr(api_module, "_resolve_runtime_ai_service", lambda _config=None: FakeAIService(), raising=False)
    monkeypatch.setattr(api_module, "_get_writing_agent_runtime", lambda: FakeWritingAgent(), raising=False)

    client = TestClient(api_module.app)
    response = client.post(
        "/api/chat/send-message",
        json={
            "message": "generate a formal prologue",
            "context": {"session_id": "session-a", "selected_novel_id": "novel-a"},
            "openai_config": {"ai_mode": "pro"},
        },
    )

    assert response.status_code == 200
    route = response.json()["context"]["agent_trace"]["model_route"]
    assert route["role"] == "writer_pro"
    assert route["selected_model"] == "stable-pro"
    assert route["candidate_order_source"] == "health_history"
    assert route["original_candidates"] == ["flaky-pro", "stable-pro"]


def test_http_exception_detail_preserves_actionable_chinese_message(monkeypatch):
    monkeypatch.setattr(api_module.config, "auth_required", False, raising=False)
    monkeypatch.setattr(api_module, "storage_manager", FakeStorageManager(), raising=False)

    client = TestClient(api_module.app)
    response = client.get("/api/chat/conversation/missing-conversation")

    assert response.status_code == 404
    payload = response.json()
    assert payload["detail"] == "Conversation not found"
    assert "HTTP 404" in payload["error"]
