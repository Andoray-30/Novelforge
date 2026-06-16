import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from novelforge.services.attempt_store import AttemptStore


class FakeRouter:
    def __init__(self):
        self.calls = []

    async def select_model(self, role, *, probe=True, session_id=None, parent_id=None, token_bucket=None):
        self.calls.append({"role": role, "probe": probe, "session_id": session_id})
        return SimpleNamespace(
            to_dict=lambda: {
                "role": role,
                "selected_model": "deep-model",
                "reason": "probe_skipped",
                "candidates": ["deep-model"],
            }
        )


class MemoryStorage:
    def __init__(self):
        self.data = {}

    async def save(self, key, value, storage_type=None):
        self.data[key] = value
        return True

    async def load(self, key, storage_type=None):
        return self.data.get(key)

    async def list_keys(self, storage_type=None):
        return list(self.data.keys())


def payload(**overrides):
    data = {
        "session_id": "api-session-deep",
        "scope_type": "character",
        "scope_ids": ["char-api"],
        "budget_tier": "low",
        "assets": [
            {
                "asset_type": "character",
                "asset_id": "char-api",
                "asset_version": "v1",
                "data": {
                    "suggested_changes": [
                        {
                            "field_path": "profile.summary",
                            "current_value": "旧摘要",
                            "proposed_value": "新摘要",
                            "confidence": 0.75,
                            "reason": "结构化资产摘要需要更新。",
                            "risk_level": "low",
                        }
                    ]
                },
            }
        ],
    }
    data.update(overrides)
    return data


def client_with_fake_router(monkeypatch):
    import novelforge.api as api_module

    router = FakeRouter()
    monkeypatch.setattr(api_module.extraction_service, "model_router", router)
    monkeypatch.setattr(api_module, "attempt_store", AttemptStore(MemoryStorage()))
    return TestClient(api_module.app), router


def test_post_deep_synthesis_preview_success(monkeypatch):
    client, router = client_with_fake_router(monkeypatch)

    response = client.post("/api/extraction/deep-synthesis/preview", json=payload())

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["preview"]["proposed_changes"][0]["asset_id"] == "char-api"
    assert router.calls[0]["role"] == "extractor_deep"


def test_post_deep_synthesis_preview_rejects_forbidden_field(monkeypatch):
    client, _ = client_with_fake_router(monkeypatch)
    request = payload(assets=[{
        "asset_type": "character",
        "asset_id": "char-api",
        "asset_version": "v1",
        "data": {"raw_response_text": "forbidden"},
    }])

    response = client.post("/api/extraction/deep-synthesis/preview", json=request)

    assert response.status_code == 400
    assert "raw_response_text" in response.json()["detail"]


def test_post_deep_synthesis_preview_empty_assets_returns_warning(monkeypatch):
    client, _ = client_with_fake_router(monkeypatch)

    response = client.post("/api/extraction/deep-synthesis/preview", json=payload(assets=[]))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "no_actionable_assets"
    assert data["warnings"][0]["code"] == "no_actionable_assets"


def test_post_deep_synthesis_preview_response_shape(monkeypatch):
    client, _ = client_with_fake_router(monkeypatch)

    response = client.post("/api/extraction/deep-synthesis/preview", json=payload())
    data = response.json()

    assert "preview" in data
    assert "budget_summary" in data
    assert "warnings" in data
    assert "attempt_id" in data
    assert data["attempt_id"]


def test_post_deep_synthesis_preview_response_excludes_forbidden_fields(monkeypatch):
    client, _ = client_with_fake_router(monkeypatch)

    response = client.post("/api/extraction/deep-synthesis/preview", json=payload())
    serialized = json.dumps(response.json(), ensure_ascii=False)

    assert "chapter_content" not in serialized
    assert "raw_response_text" not in serialized
    assert "raw_response_preview" not in serialized
