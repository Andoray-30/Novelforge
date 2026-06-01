import pytest

from novelforge.services.model_health import (
    MODEL_HEALTH_EVENT_PREFIX,
    get_model_health_report,
    rank_model_candidates_by_health,
    record_model_health_event,
    record_model_health_from_chapter_index_run,
)


class MemoryStorage:
    def __init__(self):
        self.data = {}

    async def save(self, key, value, storage_type=None):  # noqa: ANN001
        self.data[key] = value
        return True

    async def load(self, key, storage_type=None):  # noqa: ANN001
        return self.data.get(key)

    async def list_keys(self, storage_type=None):  # noqa: ANN001
        return list(self.data.keys())


@pytest.mark.asyncio
async def test_model_health_records_route_probe_and_attempt_events():
    storage = MemoryStorage()
    run_state = {
        "task_id": "task-1",
        "task_type": "novel_import",
        "model_role": "extractor_fast",
        "session_id": "session-a",
        "parent_id": "novel-a",
        "updated_at": "2026-05-30T12:00:00",
        "model_route": {
            "role": "extractor_fast",
            "selected_model": "rich-model",
            "reason": "probe_passed",
            "probe_results": [
                {
                    "role": "extractor_fast",
                    "model": "empty-model",
                    "available": False,
                    "latency_ms": 1200,
                    "non_empty_chat": False,
                    "json_capable": False,
                    "extraction_rich": False,
                    "error_type": "empty_content",
                    "score": 0,
                },
                {
                    "role": "extractor_fast",
                    "model": "rich-model",
                    "available": True,
                    "latency_ms": 900,
                    "non_empty_chat": True,
                    "json_capable": True,
                    "extraction_rich": True,
                    "score": 95,
                },
            ],
        },
        "chapter_index_attempts": [
            {
                "chapter_id": "chapter-1",
                "attempt_number": 1,
                "status": "success",
                "model_used": "rich-model",
                "latency_ms": 2400,
                "needs_retry": False,
            },
            {
                "chapter_id": "chapter-2",
                "attempt_number": 1,
                "status": "failed",
                "model_used": "empty-model",
                "latency_ms": 3000,
                "error_type": "gateway_timeout",
                "needs_retry": True,
            },
        ],
    }

    events = await record_model_health_from_chapter_index_run(storage, "chapter_index_run_task-1", run_state)
    report = await get_model_health_report(storage, session_id="session-a", parent_id="novel-a")

    assert len(events) == 5
    assert all(key.startswith(MODEL_HEALTH_EVENT_PREFIX) for key in storage.data)
    assert report["event_count"] == 5

    by_model = {item["model"]: item for item in report["items"]}
    assert by_model["rich-model"]["selected_count"] == 1
    assert by_model["rich-model"]["probe_passed"] == 1
    assert by_model["rich-model"]["successful_attempts"] == 1
    assert by_model["empty-model"]["probe_failed"] == 1
    assert by_model["empty-model"]["failed_attempts"] == 1
    assert by_model["empty-model"]["error_counts"] == {
        "empty_content": 1,
        "gateway_timeout": 1,
    }


@pytest.mark.asyncio
async def test_model_health_report_filters_project_scope_and_role():
    storage = MemoryStorage()
    await record_model_health_from_chapter_index_run(
        storage,
        "chapter_index_run_a",
        {
            "task_id": "a",
            "task_type": "novel_import",
            "model_role": "extractor_fast",
            "session_id": "session-a",
            "parent_id": "novel-a",
            "model_route": {"selected_model": "fast-model", "reason": "probe_skipped"},
        },
    )
    await record_model_health_from_chapter_index_run(
        storage,
        "chapter_index_run_b",
        {
            "task_id": "b",
            "task_type": "novel_import",
            "model_role": "extractor_deep",
            "session_id": "session-a",
            "parent_id": "novel-b",
            "model_route": {"selected_model": "deep-model", "reason": "probe_skipped"},
        },
    )

    report = await get_model_health_report(
        storage,
        session_id="session-a",
        parent_id="novel-a",
        role="extractor_fast",
    )

    assert report["event_count"] == 1
    assert report["items"][0]["model"] == "fast-model"


def test_rank_model_candidates_prefers_recent_success_over_recent_failures():
    events = [
        {
            "source": "chapter_index_attempt",
            "role": "extractor_fast",
            "model": "flaky-model",
            "status": "failed",
            "error_type": "gateway_timeout",
            "latency_ms": 5000,
        },
        {
            "source": "chapter_index_attempt",
            "role": "extractor_fast",
            "model": "stable-model",
            "status": "success",
            "latency_ms": 28000,
        },
        {
            "source": "model_route_probe",
            "role": "extractor_fast",
            "model": "stable-model",
            "status": "passed",
            "latency_ms": 26000,
        },
    ]

    ordered, rankings = rank_model_candidates_by_health(["flaky-model", "stable-model"], events)

    assert ordered == ["stable-model", "flaky-model"]
    stable = next(item for item in rankings if item["model"] == "stable-model")
    flaky = next(item for item in rankings if item["model"] == "flaky-model")
    assert stable["score"] > flaky["score"]
    assert stable["successful_attempts"] == 1
    assert stable["average_latency_ms"] == 27000
    assert flaky["error_counts"] == {"gateway_timeout": 1}


@pytest.mark.asyncio
async def test_model_health_records_writer_chat_attempt_without_prompt_text():
    storage = MemoryStorage()

    event = await record_model_health_event(
        storage,
        source="writer_chat_attempt",
        role="writer_pro",
        model="stable-writer",
        status="success",
        session_id="session-a",
        parent_id="novel-a",
        task_id="conversation-a",
        task_type="chat",
        latency_ms=32000,
        event_key="conversation-a:message-a:success",
    )
    report = await get_model_health_report(storage, session_id="session-a", parent_id="novel-a", role="writer_pro")

    assert event is not None
    assert event["source"] == "writer_chat_attempt"
    assert "prompt" not in event
    assert "response" not in event
    assert report["event_count"] == 1
    item = report["items"][0]
    assert item["model"] == "stable-writer"
    assert item["successful_attempts"] == 1
    assert item["average_latency_ms"] == 32000
