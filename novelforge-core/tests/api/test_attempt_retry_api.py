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


def test_list_retry_queue_redacts_chapter_content(client):
    response = client.get("/api/extraction/retry-queue?session_id=test-redact-list")
    assert response.status_code == 200
    data = response.json()
    for item in data["items"]:
        assert "chapter_content" not in item


def test_get_retry_job_redacts_chapter_content(client):
    response = client.get("/api/extraction/retry-queue/nonexistent?session_id=test-redact-get")
    assert response.status_code == 404


def test_retry_queue_response_includes_safe_source_ref_metadata(client):
    response = client.get("/api/extraction/retry-queue?session_id=test-source-ref")
    assert response.status_code == 200
    data = response.json()
    for item in data["items"]:
        assert "chapter_content" not in item
        if "source_ref" in item and item["source_ref"]:
            assert "kind" in item["source_ref"]
            assert "content_id" in item["source_ref"]


def test_get_performance_profile_returns_empty_for_no_data(client):
    """GET /api/extraction/performance-profile returns empty for no data."""
    response = client.get("/api/extraction/performance-profile?session_id=test-profile-empty")
    assert response.status_code == 200
    data = response.json()
    assert "profiles" in data
    assert "generated_at" in data
    assert "source_attempt_count" in data
    assert "warnings" in data
    assert data["profiles"] == []
    assert data["source_attempt_count"] == 0


def test_get_performance_profile_with_scope_session(client):
    """GET /api/extraction/performance-profile supports scope=session."""
    response = client.get(
        "/api/extraction/performance-profile?session_id=test-profile-session&scope=session"
    )
    assert response.status_code == 200
    data = response.json()
    assert "profiles" in data


def test_get_performance_profile_with_scope_global(client):
    """GET /api/extraction/performance-profile supports scope=global."""
    response = client.get(
        "/api/extraction/performance-profile?scope=global"
    )
    assert response.status_code == 200
    data = response.json()
    assert "profiles" in data
    assert "source_attempt_count" in data


def test_get_performance_profile_with_model_filter(client):
    """GET /api/extraction/performance-profile supports model_used filter."""
    response = client.get(
        "/api/extraction/performance-profile?session_id=test-profile-model&model_used=gpt-4"
    )
    assert response.status_code == 200
    data = response.json()
    assert "profiles" in data


def test_get_performance_profile_with_role_filter(client):
    """GET /api/extraction/performance-profile supports task_role filter."""
    response = client.get(
        "/api/extraction/performance-profile?session_id=test-profile-role&task_role=extractor_fast"
    )
    assert response.status_code == 200
    data = response.json()
    assert "profiles" in data


def test_get_performance_profile_with_bucket_filter(client):
    """GET /api/extraction/performance-profile supports token_bucket filter."""
    response = client.get(
        "/api/extraction/performance-profile?session_id=test-profile-bucket&token_bucket=medium"
    )
    assert response.status_code == 200
    data = response.json()
    assert "profiles" in data


def test_post_rebuild_performance_profile(client):
    """POST /api/extraction/performance-profile/rebuild returns profiles."""
    response = client.post(
        "/api/extraction/performance-profile/rebuild",
        json={"session_id": "test-rebuild", "scope": "session"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "profiles" in data
    assert "generated_at" in data


def test_post_rebuild_global_performance_profile(client):
    """POST /api/extraction/performance-profile/rebuild supports global scope."""
    response = client.post(
        "/api/extraction/performance-profile/rebuild",
        json={"scope": "global"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "profiles" in data
    assert "source_attempt_count" in data


def test_get_global_performance_profile_empty_data_safe(client):
    response = client.get(
        "/api/extraction/performance-profile?scope=global&model_used=__missing_model__"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["profiles"] == []
    assert "generated_at" in data
    assert "warnings" in data


def test_performance_profile_no_raw_response_text(client):
    """PerformanceProfile API must not expose raw_response_text."""
    response = client.get(
        "/api/extraction/performance-profile?session_id=test-profile-safe"
    )
    assert response.status_code == 200
    data = response.json()
    for profile in data.get("profiles", []):
        assert "raw_response_text" not in profile
        assert "raw_response_preview" not in profile


def test_performance_profile_no_chapter_content(client):
    """PerformanceProfile API must not expose chapter content."""
    response = client.get(
        "/api/extraction/performance-profile?session_id=test-profile-no-content"
    )
    assert response.status_code == 200
    data = response.json()
    for profile in data.get("profiles", []):
        assert "chapter_content" not in profile
        assert "chapter_text" not in profile


def test_performance_profile_has_metrics_fields(client):
    """PerformanceProfile response must contain metrics fields."""
    response = client.get(
        "/api/extraction/performance-profile?session_id=test-profile-metrics"
    )
    assert response.status_code == 200
    data = response.json()
    assert "profiles" in data
    assert "generated_at" in data
    assert "source_attempt_count" in data


def test_get_performance_profile_invalid_scope_returns_400(client):
    """GET with invalid scope must return 400."""
    response = client.get(
        "/api/extraction/performance-profile?session_id=test&scope=invalid"
    )
    assert response.status_code == 400


def test_post_rebuild_invalid_scope_returns_400(client):
    """POST rebuild with invalid scope must return 400."""
    response = client.post(
        "/api/extraction/performance-profile/rebuild",
        json={"session_id": "test", "scope": "invalid"},
    )
    assert response.status_code == 400


def test_post_rebuild_session_scope_empty_session_id_returns_400(client):
    """POST rebuild with session scope and empty session_id must return 400."""
    response = client.post(
        "/api/extraction/performance-profile/rebuild",
        json={"session_id": "", "scope": "session"},
    )
    assert response.status_code == 400


def test_empty_data_returns_warning(client):
    """Empty data must return profiles=[] with warning."""
    response = client.get(
        "/api/extraction/performance-profile?session_id=test-empty-warn"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["profiles"] == []
    assert "no_attempts_found" in data.get("warnings", [])


def test_get_performance_profile_invalid_scope_returns_400(client):
    """GET /api/extraction/performance-profile rejects invalid scope."""
    response = client.get(
        "/api/extraction/performance-profile?session_id=test&scope=invalid"
    )
    assert response.status_code == 400


def test_post_rebuild_invalid_scope_returns_400(client):
    """POST /api/extraction/performance-profile/rebuild rejects invalid scope."""
    response = client.post(
        "/api/extraction/performance-profile/rebuild",
        json={"session_id": "test", "scope": "invalid"},
    )
    assert response.status_code == 400
