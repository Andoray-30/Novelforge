"""Persisted model health observations for routing and extraction diagnostics."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional


MODEL_HEALTH_EVENT_PREFIX = "model_health_event_"


def _now_iso() -> str:
    return datetime.now().isoformat()


def _clean_string(value: Any, *, max_length: int = 240) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_length]


def _clean_int(value: Any) -> Optional[int]:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _event_id(event: Dict[str, Any]) -> str:
    stable_payload = {
        key: event.get(key)
        for key in (
            "source",
            "run_key",
            "batch_key",
            "task_id",
            "role",
            "model",
            "chapter_id",
            "attempt_number",
            "status",
            "reason",
            "error_type",
        )
    }
    raw = json.dumps(stable_payload, sort_keys=True, ensure_ascii=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:20]


def _build_event(base: Dict[str, Any], **values: Any) -> Optional[Dict[str, Any]]:
    model = _clean_string(values.get("model"))
    if not model:
        return None

    event: Dict[str, Any] = {
        "source": _clean_string(values.get("source")) or "unknown",
        "role": _clean_string(values.get("role") or base.get("model_role")),
        "model": model,
        "status": _clean_string(values.get("status")),
        "available": values.get("available") if isinstance(values.get("available"), bool) else None,
        "latency_ms": _clean_int(values.get("latency_ms")),
        "error_type": _clean_string(values.get("error_type"), max_length=80),
        "reason": _clean_string(values.get("reason"), max_length=120),
        "score": _clean_int(values.get("score")),
        "task_id": _clean_string(base.get("task_id")),
        "task_type": _clean_string(base.get("task_type")),
        "session_id": _clean_string(base.get("session_id")),
        "parent_id": _clean_string(base.get("parent_id")),
        "run_key": _clean_string(base.get("run_key")),
        "batch_key": _clean_string(values.get("batch_key")),
        "chapter_id": _clean_string(values.get("chapter_id")),
        "attempt_number": _clean_int(values.get("attempt_number")),
        "needs_retry": values.get("needs_retry") if isinstance(values.get("needs_retry"), bool) else None,
        "observed_at": _clean_string(values.get("observed_at") or base.get("updated_at") or base.get("created_at")),
        "created_at": _now_iso(),
    }
    event["id"] = _event_id(event)
    return {key: value for key, value in event.items() if value is not None}


def _probe_status(role: Optional[str], probe: Dict[str, Any]) -> str:
    available = bool(probe.get("available"))
    non_empty = bool(probe.get("non_empty_chat"))
    if role in {"extractor_fast", "extractor_deep", "extractor_repair"}:
        passed = available and non_empty and bool(probe.get("json_capable")) and bool(probe.get("extraction_rich"))
    else:
        passed = available and non_empty
    if passed:
        return "passed"
    return "failed"


def build_model_health_events_from_run_state(run_key: str, state: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Build durable model-health events from one chapter-index run state.

    The events intentionally keep only routing/attempt metadata. They do not
    persist prompts, source text, raw responses, API keys, or free-form provider
    error bodies.
    """

    base = dict(state)
    base["run_key"] = run_key
    events: List[Dict[str, Any]] = []

    def add(event: Optional[Dict[str, Any]]) -> None:
        if event is not None:
            events.append(event)

    def add_route(route: Dict[str, Any], *, batch_key: Optional[str] = None) -> None:
        role = _clean_string(route.get("role") or base.get("model_role"))
        selected_model = _clean_string(route.get("selected_model"))
        if selected_model:
            add(_build_event(
                base,
                source="model_route_selected",
                role=role,
                model=selected_model,
                status="selected",
                reason=route.get("reason"),
                batch_key=batch_key,
            ))

        probe_results = route.get("probe_results")
        if not isinstance(probe_results, list):
            return
        for probe in probe_results:
            if not isinstance(probe, dict):
                continue
            probe_role = _clean_string(probe.get("role") or role)
            add(_build_event(
                base,
                source="model_route_probe",
                role=probe_role,
                model=probe.get("model"),
                status=_probe_status(probe_role, probe),
                available=probe.get("available"),
                latency_ms=probe.get("latency_ms"),
                error_type=probe.get("error_type"),
                score=probe.get("score"),
                batch_key=batch_key,
                observed_at=probe.get("checked_at"),
            ))

    route = state.get("model_route")
    if isinstance(route, dict):
        add_route(route)

    route_batches = state.get("model_route_batches")
    if isinstance(route_batches, list):
        for batch in route_batches:
            if not isinstance(batch, dict):
                continue
            batch_route = batch.get("model_route")
            if isinstance(batch_route, dict):
                add_route(batch_route, batch_key=_clean_string(batch.get("batch_key")))

    attempts = state.get("chapter_index_attempts")
    if isinstance(attempts, list):
        for attempt in attempts:
            if not isinstance(attempt, dict):
                continue
            add(_build_event(
                base,
                source="chapter_index_attempt",
                role=base.get("model_role"),
                model=attempt.get("model_used"),
                status=attempt.get("status"),
                latency_ms=attempt.get("latency_ms"),
                error_type=attempt.get("error_type"),
                chapter_id=attempt.get("chapter_id"),
                attempt_number=attempt.get("attempt_number"),
                needs_retry=attempt.get("needs_retry"),
            ))

    return events


async def record_model_health_from_chapter_index_run(storage: Any, run_key: str, state: Dict[str, Any]) -> List[Dict[str, Any]]:
    events = build_model_health_events_from_run_state(run_key, state)
    for event in events:
        await storage.save(f"{MODEL_HEALTH_EVENT_PREFIX}{event['id']}", event)
    return events


async def list_model_health_events(
    storage: Any,
    *,
    session_id: str,
    parent_id: Optional[str] = None,
    role: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    keys = await storage.list_keys()
    event_keys = sorted(
        (key for key in keys if isinstance(key, str) and key.startswith(MODEL_HEALTH_EVENT_PREFIX)),
        reverse=True,
    )
    events: List[Dict[str, Any]] = []
    normalized_role = _clean_string(role)
    for key in event_keys:
        loaded = await storage.load(key)
        if not isinstance(loaded, dict):
            continue
        if loaded.get("session_id") != session_id:
            continue
        if parent_id and loaded.get("parent_id") not in {None, parent_id}:
            continue
        if normalized_role and loaded.get("role") != normalized_role:
            continue
        events.append(loaded)
    events.sort(key=lambda item: str(item.get("created_at") or item.get("observed_at") or ""), reverse=True)
    return events[:limit]


def summarize_model_health_events(events: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_model: Dict[str, Dict[str, Any]] = {}
    for event in events:
        model = _clean_string(event.get("model"))
        if not model:
            continue
        summary = by_model.setdefault(model, {
            "model": model,
            "roles": set(),
            "sources": set(),
            "selected_count": 0,
            "probe_count": 0,
            "probe_passed": 0,
            "probe_failed": 0,
            "attempt_count": 0,
            "successful_attempts": 0,
            "failed_attempts": 0,
            "error_counts": {},
            "latencies": [],
            "last_seen_at": None,
        })

        role = _clean_string(event.get("role"))
        source = _clean_string(event.get("source"))
        status = _clean_string(event.get("status")) or ""
        if role:
            summary["roles"].add(role)
        if source:
            summary["sources"].add(source)
        if source == "model_route_selected":
            summary["selected_count"] += 1
        elif source == "model_route_probe":
            summary["probe_count"] += 1
            if status == "passed":
                summary["probe_passed"] += 1
            else:
                summary["probe_failed"] += 1
        elif source == "chapter_index_attempt":
            summary["attempt_count"] += 1
            if status == "success":
                summary["successful_attempts"] += 1
            else:
                summary["failed_attempts"] += 1

        latency_ms = _clean_int(event.get("latency_ms"))
        if latency_ms is not None:
            summary["latencies"].append(latency_ms)
        error_type = _clean_string(event.get("error_type"), max_length=80)
        if error_type:
            summary["error_counts"][error_type] = summary["error_counts"].get(error_type, 0) + 1

        seen_at = _clean_string(event.get("created_at") or event.get("observed_at"))
        if seen_at and (summary["last_seen_at"] is None or seen_at > summary["last_seen_at"]):
            summary["last_seen_at"] = seen_at

    results: List[Dict[str, Any]] = []
    for summary in by_model.values():
        latencies = summary.pop("latencies")
        summary["roles"] = sorted(summary["roles"])
        summary["sources"] = sorted(summary["sources"])
        summary["average_latency_ms"] = int(round(sum(latencies) / len(latencies))) if latencies else None
        results.append(summary)

    results.sort(key=lambda item: str(item.get("last_seen_at") or ""), reverse=True)
    return results


async def get_model_health_report(
    storage: Any,
    *,
    session_id: str,
    parent_id: Optional[str] = None,
    role: Optional[str] = None,
    limit: int = 200,
) -> Dict[str, Any]:
    events = await list_model_health_events(
        storage,
        session_id=session_id,
        parent_id=parent_id,
        role=role,
        limit=limit,
    )
    return {
        "generated_at": _now_iso(),
        "event_count": len(events),
        "items": summarize_model_health_events(events),
        "events": events,
    }
