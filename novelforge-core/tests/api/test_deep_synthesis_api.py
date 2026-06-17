import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from novelforge.services.attempt_store import AttemptStore
from novelforge.content.models import ContentItem, ContentMetadata, ContentStatus, ContentType


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


def make_content_item(*, content_id="char-api", version=1, extracted_data=None):
    return ContentItem(
        metadata=ContentMetadata(
            id=content_id,
            title="林墨",
            type=ContentType.CHARACTER,
            status=ContentStatus.DRAFT,
            version=version,
        ),
        content="",
        extracted_data=extracted_data or {"profile": {"summary": "旧摘要", "traits": ["沉默"]}},
    )


class FakeContentManager:
    def __init__(self, items=None, fail_on_get=False, fail_on_update=False):
        self.items = {item.metadata.id: item for item in (items or [])}
        self.fail_on_get = fail_on_get
        self.fail_on_update = fail_on_update
        self.write_calls = []

    async def get_content(self, content_id):
        if self.fail_on_get:
            raise RuntimeError("provider_error_body: get failed")
        return self.items.get(content_id)

    async def update_content(self, content_id, content_item):
        if self.fail_on_update:
            raise RuntimeError("provider_error_body: update failed")
        existing = self.items.get(content_id)
        if existing is None:
            return False
        content_item.metadata.version = existing.metadata.version + 1
        self.items[content_id] = content_item
        self.write_calls.append((content_id, content_item))
        return True


class FailingStorage(MemoryStorage):
    async def save(self, key, value, storage_type=None):
        raise RuntimeError("provider_error_body: secret chapter_content leaked")


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


def apply_payload(**overrides):
    data = {
        "session_id": "api-session-deep",
        "preview": {
            "summary": "已生成 Deep Synthesis preview patch。",
            "proposed_changes": [
                {
                    "change_id": "char-api:1",
                    "asset_type": "character",
                    "asset_id": "char-api",
                    "asset_version": "v1",
                    "field_path": "profile.summary",
                    "current_value": "旧摘要",
                    "proposed_value": "新摘要",
                    "confidence": 0.9,
                    "reason": "结构化资产摘要需要更新。",
                    "evidence_refs": [],
                    "risk_level": "low",
                }
            ],
            "conflicts_resolved": [],
            "new_links": [],
            "risk_flags": [],
            "confidence_delta": 0.0,
            "evidence_refs": [],
            "apply_plan": {
                "requires_user_confirmation": True,
                "apply_mode": "preview_patch",
                "patch_strategy": "field_level",
                "asset_write_policy": "confirm_before_apply",
            },
            "requires_user_confirmation": True,
        },
        "accepted_change_ids": ["char-api:1"],
        "rejected_change_ids": [],
        "expected_asset_versions": {"char-api": "v1"},
        "dry_run": False,
    }
    data.update(overrides)
    return data


def client_with_fake_router(monkeypatch):
    import novelforge.api as api_module

    router = FakeRouter()
    monkeypatch.setattr(api_module.extraction_service, "model_router", router)
    monkeypatch.setattr(api_module, "attempt_store", AttemptStore(MemoryStorage()))
    return TestClient(api_module.app), router


def client_with_fake_content(monkeypatch, content_manager):
    import novelforge.api as api_module

    router = FakeRouter()
    monkeypatch.setattr(api_module.extraction_service, "model_router", router)
    monkeypatch.setattr(api_module, "attempt_store", AttemptStore(MemoryStorage()))
    monkeypatch.setattr(api_module, "content_manager", content_manager)
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


def test_post_deep_synthesis_preview_500_returns_safe_detail(monkeypatch):
    import novelforge.api as api_module

    router = FakeRouter()
    monkeypatch.setattr(api_module.extraction_service, "model_router", router)
    monkeypatch.setattr(api_module, "attempt_store", AttemptStore(FailingStorage()))
    client = TestClient(api_module.app, raise_server_exceptions=False)

    response = client.post("/api/extraction/deep-synthesis/preview", json=payload())

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail == "Deep Synthesis preview 生成失败"
    assert "provider_error_body" not in detail
    assert "chapter_content" not in detail
    assert "secret" not in detail


def test_post_deep_synthesis_preview_forbidden_field_does_not_echo_value(monkeypatch):
    client, _ = client_with_fake_router(monkeypatch)
    request = payload(assets=[{
        "asset_type": "character",
        "asset_id": "char-api",
        "asset_version": "v1",
        "data": {"chapter_content": "secret novel text here"},
    }])

    response = client.post("/api/extraction/deep-synthesis/preview", json=request)

    assert response.status_code == 400
    detail = response.json()["detail"]
    # field names are allowed
    assert "chapter_content" in detail
    # field values must not be echoed
    assert "secret novel text here" not in detail


def test_post_deep_synthesis_apply_success(monkeypatch):
    client, _ = client_with_fake_content(monkeypatch, FakeContentManager([make_content_item()]))

    response = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload())

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["summary"]["applied_count"] == 1


def test_post_deep_synthesis_apply_with_idempotency_key_success(monkeypatch):
    client, _ = client_with_fake_content(monkeypatch, FakeContentManager([make_content_item()]))

    response = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload(idempotency_key="api-key-1"))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["attempt_id"]


def test_post_deep_synthesis_apply_duplicate_key_same_request_does_not_double_write(monkeypatch):
    manager = FakeContentManager([make_content_item()])
    client, _ = client_with_fake_content(monkeypatch, manager)
    request = apply_payload(idempotency_key="api-key-1")

    first = client.post("/api/extraction/deep-synthesis/apply", json=request)
    second = client.post("/api/extraction/deep-synthesis/apply", json=request)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["attempt_id"] == first.json()["attempt_id"]
    assert len(manager.write_calls) == 1


def test_post_deep_synthesis_apply_duplicate_key_different_request_returns_409(monkeypatch):
    manager = FakeContentManager([make_content_item()])
    client, _ = client_with_fake_content(monkeypatch, manager)

    first = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload(idempotency_key="api-key-1"))
    different = apply_payload(idempotency_key="api-key-1", accepted_change_ids=[])
    second = client.post("/api/extraction/deep-synthesis/apply", json=different)

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["detail"]["error"] == "idempotency_conflict"
    assert len(manager.write_calls) == 1


def test_post_deep_synthesis_apply_without_idempotency_key_still_works(monkeypatch):
    manager = FakeContentManager([make_content_item()])
    client, _ = client_with_fake_content(monkeypatch, manager)

    response = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload())

    assert response.status_code == 200
    assert response.json()["summary"]["applied_count"] == 1
    assert len(manager.write_calls) == 1


def test_post_deep_synthesis_apply_rejected_ids_are_skipped(monkeypatch):
    client, _ = client_with_fake_content(monkeypatch, FakeContentManager([make_content_item()]))

    response = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload(accepted_change_ids=[], rejected_change_ids=["char-api:1"]))

    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["skipped_count"] == 1
    assert data["skipped_changes"][0]["reason"] == "rejected_by_user"


def test_post_deep_synthesis_apply_version_mismatch_returns_409(monkeypatch):
    client, _ = client_with_fake_content(monkeypatch, FakeContentManager([make_content_item(version=2)]))

    response = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload())

    assert response.status_code == 409


def test_post_deep_synthesis_apply_forbidden_field_returns_400(monkeypatch):
    client, _ = client_with_fake_content(monkeypatch, FakeContentManager([make_content_item()]))
    request = apply_payload()
    request["preview"]["proposed_changes"][0]["field_path"] = "profile.raw_response_text"

    response = client.post("/api/extraction/deep-synthesis/apply", json=request)

    assert response.status_code == 400


def test_post_deep_synthesis_apply_dry_run_does_not_write(monkeypatch):
    manager = FakeContentManager([make_content_item()])
    client, _ = client_with_fake_content(monkeypatch, manager)

    response = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload(dry_run=True))

    assert response.status_code == 200
    assert manager.items["char-api"].extracted_data["profile"]["summary"] == "旧摘要"


def test_post_deep_synthesis_apply_dry_run_response_has_zero_applied_count(monkeypatch):
    manager = FakeContentManager([make_content_item()])
    client, _ = client_with_fake_content(monkeypatch, manager)

    response = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload(dry_run=True))

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "dry_run"
    assert data["summary"]["applied_count"] == 0
    assert data["applied_changes"] == []


def test_post_deep_synthesis_apply_409_truncates_long_conflict_values(monkeypatch):
    client, _ = client_with_fake_content(monkeypatch, FakeContentManager([make_content_item(version=2)]))

    response = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload())

    assert response.status_code == 409
    detail = response.json()["detail"]
    serialized = json.dumps(detail, ensure_ascii=False)
    assert "旧摘要旧摘要旧摘要旧摘要旧摘要" not in serialized
    assert len(serialized) < 5000


def test_post_deep_synthesis_apply_500_returns_safe_detail(monkeypatch):
    client, _ = client_with_fake_content(monkeypatch, FakeContentManager([make_content_item()], fail_on_get=True))
    client = TestClient(client.app, raise_server_exceptions=False)

    response = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload())

    assert response.status_code == 500
    assert response.json()["detail"] == "Deep Synthesis apply 执行失败"


def test_post_deep_synthesis_apply_response_excludes_forbidden_fields(monkeypatch):
    client, _ = client_with_fake_content(monkeypatch, FakeContentManager([make_content_item()]))

    response = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload())
    serialized = json.dumps(response.json(), ensure_ascii=False)

    assert "chapter_content" not in serialized
    assert "raw_response_text" not in serialized
    assert "raw_response_preview" not in serialized


def test_post_deep_synthesis_apply_idempotent_response_excludes_forbidden_fields(monkeypatch):
    client, _ = client_with_fake_content(monkeypatch, FakeContentManager([make_content_item()]))

    response = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload(idempotency_key="safe-api-key"))
    replay = client.post("/api/extraction/deep-synthesis/apply", json=apply_payload(idempotency_key="safe-api-key"))
    serialized = json.dumps(replay.json(), ensure_ascii=False)

    assert response.status_code == 200
    assert replay.status_code == 200
    assert "chapter_content" not in serialized
    assert "raw_response_text" not in serialized
    assert "raw_response_preview" not in serialized
    assert "provider_error_body" not in serialized
