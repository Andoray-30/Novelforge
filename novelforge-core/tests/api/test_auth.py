import asyncio

import pytest
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
    monkeypatch.setattr(api_module.config, "auth_required", False, raising=False)
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
    assert "NOVELFORGE_AUTH_REQUIRED=true" in message
    assert "FRONTEND_ORIGIN" in message
    assert "STORAGE_TYPE=content_db" in message


def _setup_valid_public_deployment(monkeypatch, tmp_path):
    """Set all required public deployment config to valid baseline values."""
    monkeypatch.setattr(api_module.config, "public_deployment", True, raising=False)
    monkeypatch.setattr(api_module.config, "auth_required", True, raising=False)
    monkeypatch.setattr(api_module.config, "admin_password", "StrongP@ssw0rd123!", raising=False)
    monkeypatch.setattr(
        api_module.config,
        "session_secret",
        "a-very-long-random-session-secret-1234567890abcdef",
        raising=False,
    )
    monkeypatch.setattr(api_module.config, "api_key", "provider-test-key", raising=False)
    monkeypatch.setattr(api_module.config, "storage_type", "content_db", raising=False)
    monkeypatch.setattr(api_module.config, "use_content_database", True, raising=False)
    monkeypatch.setattr(api_module.config, "frontend_origin", "https://forge.acme.org", raising=False)
    monkeypatch.setattr(api_module.config, "allow_runtime_openai_overrides", False, raising=False)
    monkeypatch.setattr(api_module.config, "mock_tool_calls", False, raising=False)
    monkeypatch.setattr(api_module.config, "debug", False, raising=False)
    monkeypatch.setattr(api_module.config, "data_dir", str(tmp_path / "data"), raising=False)
    monkeypatch.setattr(api_module.config, "file_storage_dir", str(tmp_path / "files"), raising=False)
    monkeypatch.setattr(api_module.config, "database_path", str(tmp_path / "data" / "app.db"), raising=False)
    monkeypatch.setattr(
        api_module.config,
        "content_database_path",
        str(tmp_path / "data" / "content.db"),
        raising=False,
    )


def test_local_development_config_accepts_localhost(monkeypatch):
    monkeypatch.setattr(api_module.config, "public_deployment", False, raising=False)
    monkeypatch.setattr(api_module.config, "frontend_origin", "http://localhost:3000", raising=False)

    api_module._validate_public_deployment_config()

    assert "http://localhost:3000" in api_module._cors_allowed_origins()


def test_valid_public_production_config_is_accepted(monkeypatch, tmp_path):
    _setup_valid_public_deployment(monkeypatch, tmp_path)

    api_module._validate_public_deployment_config()

    assert api_module._cors_allowed_origins() == ["https://forge.acme.org"]


@pytest.mark.parametrize(
    ("attribute", "value", "expected_name"),
    [
        ("auth_required", False, "NOVELFORGE_AUTH_REQUIRED"),
        ("admin_password", None, "NOVELFORGE_ADMIN_PASSWORD"),
        ("session_secret", None, "NOVELFORGE_SESSION_SECRET"),
        ("allow_runtime_openai_overrides", True, "NOVELFORGE_ALLOW_RUNTIME_OPENAI_OVERRIDES"),
        ("mock_tool_calls", True, "NOVELFORGE_MOCK_TOOL_CALLS"),
        ("debug", True, "NOVELFORGE_DEBUG"),
    ],
)
def test_public_deployment_unsafe_switches_are_blocked(
    monkeypatch, tmp_path, attribute, value, expected_name
):
    _setup_valid_public_deployment(monkeypatch, tmp_path)
    monkeypatch.setattr(api_module.config, attribute, value, raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        api_module._validate_public_deployment_config()

    assert expected_name in str(exc_info.value)


@pytest.mark.parametrize(
    "password",
    ["Ab1!", "strongpassword1!", "STRONGPASSWORD1!", "StrongPassword!", "StrongPassword123"],
)
def test_public_deployment_weak_admin_password_is_blocked(monkeypatch, tmp_path, password):
    _setup_valid_public_deployment(monkeypatch, tmp_path)
    monkeypatch.setattr(api_module.config, "admin_password", password, raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        api_module._validate_public_deployment_config()

    assert password not in str(exc_info.value)
    assert "NOVELFORGE_ADMIN_PASSWORD" in str(exc_info.value)


@pytest.mark.parametrize(
    "supplied",
    ["MyPlaceholderPassword1!", "Password123!", "ChangeMeNow1!"],
)
def test_public_deployment_placeholder_admin_password_is_blocked(
    monkeypatch, tmp_path, supplied
):
    _setup_valid_public_deployment(monkeypatch, tmp_path)
    monkeypatch.setattr(api_module.config, "admin_password", supplied, raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        api_module._validate_public_deployment_config()

    assert supplied not in str(exc_info.value)


def test_public_deployment_short_session_secret_is_blocked(monkeypatch, tmp_path):
    _setup_valid_public_deployment(monkeypatch, tmp_path)
    supplied = "short-session-secret"
    monkeypatch.setattr(api_module.config, "session_secret", supplied, raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        api_module._validate_public_deployment_config()

    assert supplied not in str(exc_info.value)


@pytest.mark.parametrize(
    "supplied",
    [
        "replace-with-a-long-random-string",
        "replace-with-a-long-random-string-appended",
        "novelforge-local-dev-session-secret-appended",
    ],
)
def test_public_deployment_placeholder_session_secret_is_blocked(
    monkeypatch, tmp_path, supplied
):
    _setup_valid_public_deployment(monkeypatch, tmp_path)
    monkeypatch.setattr(api_module.config, "session_secret", supplied, raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        api_module._validate_public_deployment_config()

    assert supplied not in str(exc_info.value)


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "http://forge.acme.org",
        "http://localhost:3000",
        "https://localhost",
        "https://127.0.0.1:3000",
        "https://127.1",
        "https://0177.0.0.1",
        "https://0x7f.0.0.1",
        "https://[::1]",
        "https://studio.local",
        "https://novelforge.example.com",
        "forge.acme.org",
        "//forge.acme.org",
        "https://[::1",
        "https://bad host.acme.org",
        "https://user:password@forge.acme.org",
        "https://forge.acme.org/path",
        "https://forge.acme.org?mode=public",
        "https://forge.acme.org#fragment",
    ],
)
def test_public_deployment_invalid_origins_are_blocked(monkeypatch, tmp_path, origin):
    _setup_valid_public_deployment(monkeypatch, tmp_path)
    monkeypatch.setattr(api_module.config, "frontend_origin", origin, raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        api_module._validate_public_deployment_config()

    message = str(exc_info.value)
    assert origin not in message
    assert "FRONTEND_ORIGIN" in message


def test_public_deployment_https_origin_with_root_slash_is_accepted(monkeypatch, tmp_path):
    _setup_valid_public_deployment(monkeypatch, tmp_path)
    monkeypatch.setattr(api_module.config, "frontend_origin", "https://forge.acme.org/", raising=False)

    api_module._validate_public_deployment_config()


def test_public_deployment_accepts_non_placeholder_strong_password(monkeypatch, tmp_path):
    _setup_valid_public_deployment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        api_module.config, "admin_password", "OrbitRiver7!North", raising=False
    )

    api_module._validate_public_deployment_config()


def test_public_cors_preflight_uses_canonical_origin(monkeypatch, tmp_path):
    _setup_valid_public_deployment(monkeypatch, tmp_path)
    monkeypatch.setattr(
        api_module.config,
        "frontend_origin",
        "HTTPS://BÜCHER.ACME.ORG:443/",
        raising=False,
    )

    api_module._validate_public_deployment_config()
    allowed_origins = api_module._cors_allowed_origins()
    assert allowed_origins == ["https://xn--bcher-kva.acme.org"]

    cors_app = api_module.FastAPI()
    cors_app.add_middleware(
        api_module.CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    with TestClient(cors_app) as client:
        response = client.options(
            "/api/test",
            headers={
                "Origin": "https://xn--bcher-kva.acme.org",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://xn--bcher-kva.acme.org"


def test_application_lifespan_invokes_public_guardrail(monkeypatch, tmp_path):
    _setup_valid_public_deployment(monkeypatch, tmp_path)
    monkeypatch.setattr(api_module.config, "auth_required", False, raising=False)

    with pytest.raises(RuntimeError, match="NOVELFORGE_AUTH_REQUIRED"):
        with TestClient(api_module.app):
            pass


def test_public_deployment_error_messages_do_not_leak_secrets(monkeypatch, tmp_path):
    _setup_valid_public_deployment(monkeypatch, tmp_path)
    supplied_password = "SecretValuePassword1!"
    supplied_session = "secret-session-value-0123456789-abcdefgh"
    supplied_api_key = "provider-secret-value-for-test"
    monkeypatch.setattr(api_module.config, "admin_password", supplied_password, raising=False)
    monkeypatch.setattr(api_module.config, "session_secret", supplied_session, raising=False)
    monkeypatch.setattr(api_module.config, "api_key", supplied_api_key, raising=False)
    monkeypatch.setattr(api_module.config, "frontend_origin", "http://forge.acme.org", raising=False)

    with pytest.raises(RuntimeError) as exc_info:
        api_module._validate_public_deployment_config()

    message = str(exc_info.value)
    assert supplied_password not in message
    assert supplied_session not in message
    assert supplied_api_key not in message


def test_user_visible_500_handlers_do_not_echo_exception_text(monkeypatch):
    supplied = "sensitive-upstream-exception-value"
    monkeypatch.setattr(api_module.config, "public_deployment", True, raising=False)

    general_response = asyncio.run(
        api_module.general_exception_handler(None, RuntimeError(supplied))
    )
    http_response = asyncio.run(
        api_module.http_exception_handler(None, api_module.HTTPException(status_code=500, detail=supplied))
    )

    assert supplied not in general_response.body.decode("utf-8")
    assert supplied not in http_response.body.decode("utf-8")


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
