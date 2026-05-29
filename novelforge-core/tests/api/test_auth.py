from fastapi.testclient import TestClient

import novelforge.api as api_module
from novelforge.content.models import ContentSearchResult


def test_protected_api_requires_admin_session_when_auth_enabled(monkeypatch):
    monkeypatch.setattr(api_module.config, "auth_required", True, raising=False)
    monkeypatch.setattr(api_module.config, "admin_password", "secret", raising=False)
    monkeypatch.setattr(api_module.config, "session_secret", "test-session-secret", raising=False)

    client = TestClient(api_module.app)

    response = client.get("/api/content/stats")
    assert response.status_code == 401

    bad_login = client.post("/api/auth/login", json={"password": "wrong"})
    assert bad_login.status_code == 401

    login = client.post("/api/auth/login", json={"password": "secret"})
    assert login.status_code == 200
    assert login.json()["authenticated"] is True

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["authenticated"] is True
    assert me.json()["admin_password_configured"] is True
    assert me.json()["session_secret_configured"] is True


def test_public_deployment_config_validation_requires_secure_settings(monkeypatch):
    monkeypatch.setattr(api_module.config, "public_deployment", True, raising=False)
    monkeypatch.setattr(api_module.config, "admin_password", None, raising=False)
    monkeypatch.setattr(api_module.config, "session_secret", None, raising=False)
    monkeypatch.setattr(api_module.config, "api_key", None, raising=False)
    monkeypatch.setattr(api_module.config, "storage_type", "file", raising=False)
    monkeypatch.setattr(api_module.config, "use_content_database", False, raising=False)
    monkeypatch.setattr(api_module.config, "frontend_origin", "http://localhost:3010", raising=False)

    try:
        api_module._validate_public_deployment_config()
    except RuntimeError as exc:
        message = str(exc)
    else:
        raise AssertionError("public deployment validation should fail")

    assert "NOVELFORGE_ADMIN_PASSWORD" in message
    assert "NOVELFORGE_SESSION_SECRET" in message
    assert "OPENAI_API_KEY" in message
    assert "FRONTEND_ORIGIN=https://your-frontend-domain" in message
    assert "STORAGE_TYPE=content_db" in message


def test_auth_me_exposes_safe_deployment_readiness(monkeypatch):
    monkeypatch.setattr(api_module.config, "auth_required", False, raising=False)
    monkeypatch.setattr(api_module.config, "admin_password", None, raising=False)
    monkeypatch.setattr(api_module.config, "session_secret", None, raising=False)
    monkeypatch.setattr(api_module.config, "api_key", "provider-key", raising=False)
    monkeypatch.setattr(api_module.config, "data_dir", "./data", raising=False)
    monkeypatch.setattr(api_module.config, "storage_type", "content_db", raising=False)
    monkeypatch.setattr(api_module.config, "use_content_database", True, raising=False)

    client = TestClient(api_module.app)
    response = client.get("/api/auth/me")

    assert response.status_code == 200
    payload = response.json()
    assert payload["authenticated"] is True
    assert payload["admin_password_configured"] is False
    assert payload["session_secret_configured"] is False
    assert payload["provider_key_configured"] is True
    assert payload["storage_type"] == "content_db"
    assert payload["content_database_enabled"] is True


def test_ai_mode_is_allowed_when_runtime_overrides_are_disabled(monkeypatch):
    monkeypatch.setattr(api_module.config, "allow_runtime_openai_overrides", False, raising=False)
    monkeypatch.setattr(api_module.config, "fast_model", "fast-model", raising=False)
    monkeypatch.setattr(api_module.config, "pro_model", "pro-model", raising=False)

    service = api_module._resolve_runtime_ai_service({"ai_mode": "pro", "model": "browser-model"})

    assert service.config.model == "pro-model"


def test_explicit_model_override_still_wins_in_local_debug_mode(monkeypatch):
    monkeypatch.setattr(api_module.config, "allow_runtime_openai_overrides", True, raising=False)
    monkeypatch.setattr(api_module.config, "fast_model", "fast-model", raising=False)
    monkeypatch.setattr(api_module.config, "pro_model", "pro-model", raising=False)

    service = api_module._resolve_runtime_ai_service({"ai_mode": "pro", "model": "browser-model"})

    assert service.config.model == "browser-model"


def test_start_conversation_persists_requested_project_title(monkeypatch):
    monkeypatch.setattr(api_module.config, "auth_required", False, raising=False)

    client = TestClient(api_module.app)

    response = client.post(
        "/api/chat/start-conversation",
        json={"title": "超时空辉夜姬 提取项目", "metadata": {"source": "test"}},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "超时空辉夜姬 提取项目"
    assert payload["metadata"]["type"] == "novel_creation"
    assert payload["metadata"]["source"] == "test"

    loaded = client.get(f"/api/chat/conversation/{payload['id']}")
    assert loaded.status_code == 200
    assert loaded.json()["title"] == "超时空辉夜姬 提取项目"


def test_cleanup_empty_conversations_keeps_projects_with_messages_or_assets(monkeypatch):
    class FakeStorageManager:
        def __init__(self):
            self.data = {}

        async def save(self, key, value, storage_type=None):
            self.data[key] = value
            return True

        async def load(self, key, storage_type=None):
            return self.data.get(key)

        async def list_keys(self, storage_type=None):
            return list(self.data.keys())

        async def delete(self, key, storage_type=None):
            self.data.pop(key, None)
            return True

    class FakeContentManager:
        def __init__(self):
            self.counts = {}

        async def search_content(self, request):
            return ContentSearchResult(
                items=[],
                total=self.counts.get(request.session_id, 0),
                page=1,
                limit=request.limit,
            )

    fake_storage = FakeStorageManager()
    fake_content = FakeContentManager()
    monkeypatch.setattr(api_module.config, "auth_required", False, raising=False)
    monkeypatch.setattr(api_module, "storage_manager", fake_storage, raising=False)
    monkeypatch.setattr(api_module, "content_manager", fake_content, raising=False)

    client = TestClient(api_module.app)

    empty = client.post("/api/chat/start-conversation", json={"title": "空项目"}).json()
    with_assets = client.post("/api/chat/start-conversation", json={"title": "有资产项目"}).json()
    with_messages = client.post("/api/chat/start-conversation", json={"title": "有消息项目"}).json()
    fake_content.counts[with_assets["id"]] = 1
    fake_storage.data[f"conversation_{with_messages['id']}"]["messages"] = [
        api_module.Message(role="user", content="hello").model_dump()
    ]

    response = client.delete("/api/chat/conversations/empty")

    assert response.status_code == 200
    payload = response.json()
    assert payload["deleted"] == 1
    assert payload["deleted_ids"] == [empty["id"]]
    assert client.get(f"/api/chat/conversation/{empty['id']}").status_code == 404
    assert client.get(f"/api/chat/conversation/{with_assets['id']}").status_code == 200
    assert client.get(f"/api/chat/conversation/{with_messages['id']}").status_code == 200
