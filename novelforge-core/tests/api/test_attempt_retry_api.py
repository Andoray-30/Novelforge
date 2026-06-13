"""Integration tests for Attempt and Retry Queue API endpoints."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from novelforge.api import app
    return TestClient(app)


def test_list_attempts_returns_empty_for_no_data(client):
    response = client.get("/api/extraction/attempts?session_id=test-empty")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] == 0


def test_attempt_summary_returns_stats(client):
    response = client.get("/api/extraction/attempts/summary?session_id=test-summary")
    assert response.status_code == 200
    data = response.json()
    assert "total_attempts" in data
    assert "partial_recoverable" in data
    assert "overall_status" in data


def test_attempt_summary_overall_status_no_data(client):
    response = client.get("/api/extraction/attempts/summary?session_id=test-no-data")
    assert response.status_code == 200
    data = response.json()
    assert data["overall_status"] == "no_data"
    assert data["partial_recoverable"] is False


def test_get_attempt_returns_404_for_missing(client):
    response = client.get("/api/extraction/attempts/nonexistent?session_id=test")
    assert response.status_code == 404


def test_list_retry_queue_returns_empty(client):
    response = client.get("/api/extraction/retry-queue?session_id=test-retry-empty")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "stats" in data
    assert data["total"] == 0


def test_get_retry_job_returns_404_for_missing(client):
    response = client.get("/api/extraction/retry-queue/nonexistent?session_id=test")
    assert response.status_code == 404


def test_run_due_returns_counts(client):
    response = client.post("/api/extraction/retry-queue/run-due", json={"session_id": "test-run-due"})
    assert response.status_code == 200
    data = response.json()
    assert "accepted" in data
    assert "skipped_already_success" in data
    assert "queued" in data


def test_retry_attempt_returns_404_for_missing(client):
    response = client.post("/api/extraction/attempts/nonexistent/retry", json={"session_id": "test"})
    assert response.status_code == 404


def test_list_attempts_with_status_filter(client):
    response = client.get("/api/extraction/attempts?session_id=test-filter&status=failed")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


def test_list_attempts_with_limit(client):
    response = client.get("/api/extraction/attempts?session_id=test-limit&limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) <= 5


def test_list_retry_queue_with_status_filter(client):
    response = client.get("/api/extraction/retry-queue?session_id=test-retry-filter&status=pending")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


def test_attempt_summary_fields(client):
    response = client.get("/api/extraction/attempts/summary?session_id=test-fields")
    assert response.status_code == 200
    data = response.json()
    assert "success_count" in data
    assert "failed_count" in data
    assert "avg_latency_ms" in data
    assert "p95_latency_ms" in data
    assert "error_breakdown" in data
    assert "chapters_needing_retry" in data
    assert "repair_local_count" in data
    assert "repair_model_count" in data
    assert "repair_failed_count" in data
    assert "repair_success_rate" in data


def test_run_due_with_model_role(client):
    response = client.post(
        "/api/extraction/retry-queue/run-due",
        json={"session_id": "test-role", "model_role": "extractor_deep"},
    )
    assert response.status_code == 200


def test_list_attempts_truncates_preview(client):
    response = client.get("/api/extraction/attempts?session_id=test-preview")
    assert response.status_code == 200
    data = response.json()
    for item in data["items"]:
        if item.get("raw_response_preview"):
            assert len(item["raw_response_preview"]) <= 103
