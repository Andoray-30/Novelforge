from fastapi.testclient import TestClient

import novelforge.api as api_module


class FakeStorageManager:
    def __init__(self):
        self.data = {}

    async def load(self, key, storage_type=None):  # noqa: ANN001
        return self.data.get(key)

    async def list_keys(self, storage_type=None):  # noqa: ANN001
        return list(self.data.keys())


def _run_state(session_id="session-a", parent_id="novel-a"):
    return {
        "task_id": "task-a",
        "task_type": "novel_import",
        "model_role": "extractor_fast",
        "repair_strategy": {
            "model_role": "extractor_fast",
            "error_types": ["gateway_timeout"],
            "actions": ["shrink_chunk_and_extend_timeout"],
        },
        "repair_strategy_batches": [
            {
                "batch_key": "repair_batch_1_shrink_chunk_and_extend_timeout",
                "chapter_ids": ["chapter-2"],
                "repair_strategy": {
                    "actions": ["shrink_chunk_and_extend_timeout"],
                    "error_types": ["gateway_timeout"],
                },
            }
        ],
        "session_id": session_id,
        "parent_id": parent_id,
        "total_chapters": 2,
        "created_at": "2026-05-29T10:00:00",
        "updated_at": "2026-05-29T10:01:00",
        "chapter_index_attempts": [
            {
                "chapter_id": "chapter-1",
                "chapter_title": "第一章",
                "attempt_number": 1,
                "status": "success",
            },
            {
                "chapter_id": "chapter-2",
                "chapter_title": "第二章",
                "attempt_number": 1,
                "status": "failed",
                "error_type": "gateway_timeout",
            },
        ],
        "chapter_index_status": [
            {"chapter_id": "chapter-1", "chapter_title": "第一章", "status": "success", "needs_retry": False},
            {"chapter_id": "chapter-2", "chapter_title": "第二章", "status": "failed", "needs_retry": True},
        ],
        "chapter_indices": [
            {
                "chapter_id": "chapter-1",
                "chapter_title": "第一章",
                "chapter_order": 1,
                "chapter_characters": [{"name": "角色甲"}],
                "chapter_interactions": [],
                "chapter_events": [{"title": "事件"}],
                "chapter_world_facts": [],
            }
        ],
        "model_route": {
            "role": "extractor_fast",
            "selected_model": "route-model",
            "reason": "probe_passed",
            "candidates": ["route-model"],
        },
        "model_route_batches": [
            {
                "batch_key": "repair_batch_1_shrink_chunk_and_extend_timeout",
                "chapter_ids": ["chapter-2"],
                "model_route": {"selected_model": "repair-model"},
            }
        ],
    }


def test_chapter_index_run_query_is_scoped_and_summarized(monkeypatch):
    storage = FakeStorageManager()
    storage.data["chapter_index_run_task-a"] = _run_state()
    monkeypatch.setattr(api_module.config, "auth_required", False, raising=False)
    monkeypatch.setattr(api_module, "storage_manager", storage, raising=False)

    client = TestClient(api_module.app)
    response = client.get(
        "/api/extraction/chapter-index-runs/chapter_index_run_task-a",
        params={"session_id": "session-a", "parent_id": "novel-a"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_key"] == "chapter_index_run_task-a"
    assert payload["candidate_counts"]["chapter_index_failed_attempts"] == 1
    assert payload["candidate_counts"]["chapter_index_needs_retry"] == 1
    assert payload["chapter_indices_summary"][0]["characters_count"] == 1
    assert payload["model_role"] == "extractor_fast"
    assert payload["repair_strategy"]["actions"] == ["shrink_chunk_and_extend_timeout"]
    assert payload["repair_strategy_batches"][0]["batch_key"] == "repair_batch_1_shrink_chunk_and_extend_timeout"
    assert payload["model_route"]["selected_model"] == "route-model"
    assert payload["model_route_batches"][0]["model_route"]["selected_model"] == "repair-model"
    assert payload["candidate_counts"]["chapter_index_repair_batch_count"] == 1
    assert "chapter_indices" not in payload

    with_indices = client.get(
        "/api/extraction/chapter-index-runs/chapter_index_run_task-a",
        params={"session_id": "session-a", "parent_id": "novel-a", "include_indices": True},
    )
    assert with_indices.status_code == 200
    assert with_indices.json()["chapter_indices"][0]["chapter_id"] == "chapter-1"


def test_chapter_index_run_query_rejects_cross_project_access(monkeypatch):
    storage = FakeStorageManager()
    storage.data["chapter_index_run_task-a"] = _run_state()
    monkeypatch.setattr(api_module.config, "auth_required", False, raising=False)
    monkeypatch.setattr(api_module, "storage_manager", storage, raising=False)

    client = TestClient(api_module.app)

    mismatch = client.get(
        "/api/extraction/chapter-index-runs/chapter_index_run_task-a",
        params={"session_id": "session-b", "parent_id": "novel-a"},
    )
    assert mismatch.status_code == 403
    assert mismatch.json()["detail"] == "章节索引运行记录不属于当前项目"

    invalid = client.get(
        "/api/extraction/chapter-index-runs/bad_run_key",
        params={"session_id": "session-a"},
    )
    assert invalid.status_code == 400


def test_chapter_index_run_list_filters_by_project_scope(monkeypatch):
    storage = FakeStorageManager()
    storage.data["chapter_index_run_task-a"] = _run_state("session-a", "novel-a")
    storage.data["chapter_index_run_task-b"] = _run_state("session-a", "novel-b")
    storage.data["chapter_index_run_task-c"] = _run_state("session-b", "novel-c")
    storage.data["task_unrelated"] = {"id": "unrelated"}
    monkeypatch.setattr(api_module.config, "auth_required", False, raising=False)
    monkeypatch.setattr(api_module, "storage_manager", storage, raising=False)

    client = TestClient(api_module.app)
    response = client.get(
        "/api/extraction/chapter-index-runs",
        params={"session_id": "session-a", "parent_id": "novel-a"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert [item["run_key"] for item in payload] == ["chapter_index_run_task-a"]
