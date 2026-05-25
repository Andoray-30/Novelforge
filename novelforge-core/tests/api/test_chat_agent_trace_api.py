from fastapi.testclient import TestClient

import novelforge.api as api_module
from novelforge.api.writing_agent import AgentPreparation


class FakeStorageManager:
    def __init__(self):
        self.data = {}

    async def save(self, key, value, storage_type=None):  # noqa: ANN001
        self.data[key] = value
        return True

    async def load(self, key, storage_type=None):  # noqa: ANN001
        return self.data.get(key)


class FakeAIService:
    async def chat(self, prompt, system_prompt=None):  # noqa: ANN001
        assert "agent context" in system_prompt
        return "AI response with save suggestion"


class FakeWritingAgent:
    async def prepare(self, *, user_message, context, conversation, base_system_prompt, ai_service=None):  # noqa: ANN001
        return AgentPreparation(
            system_prompt=f"{base_system_prompt}\nagent context",
            trace={
                "enabled": True,
                "plan_summary": "读取最近对话。",
                "tool_calls": [{"name": "get_recent_conversation", "status": "ok", "summary": "读取最近 1 条对话。"}],
                "used_assets": [],
                "chapter_snippets": [],
                "degraded": False,
                "max_tool_calls": 5,
            },
        )


def test_chat_response_and_stored_assistant_message_include_agent_trace(monkeypatch):
    fake_storage = FakeStorageManager()
    monkeypatch.setattr(api_module.config, "auth_required", False, raising=False)
    monkeypatch.setattr(api_module, "storage_manager", fake_storage, raising=False)
    monkeypatch.setattr(api_module, "_resolve_runtime_ai_service", lambda _config=None: FakeAIService(), raising=False)
    monkeypatch.setattr(api_module, "_get_writing_agent_runtime", lambda: FakeWritingAgent(), raising=False)

    client = TestClient(api_module.app)
    response = client.post(
        "/api/chat/send-message",
        json={
            "message": "按刚才那版改写",
            "context": {"session_id": "session-a", "selected_novel_id": "novel-a"},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    trace = payload["context"]["agent_trace"]
    assert trace["tool_calls"][0]["name"] == "get_recent_conversation"
    assert payload["message"]["metadata"]["agent_trace"]["plan_summary"] == "读取最近对话。"

    stored = fake_storage.data[f"conversation_{payload['conversation_id']}"]
    assistant_message = stored["messages"][-1]
    assert assistant_message["metadata"]["agent_trace"]["enabled"] is True
