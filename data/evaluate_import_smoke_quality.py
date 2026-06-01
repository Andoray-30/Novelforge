import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple


DEFAULT_THRESHOLDS = {
    "chapters_count": 8,
    "characters_count": 8,
    "relationships_count": 8,
    "timeline_count": 6,
    "world_count": 1,
    "relationship_endpoint_mapping_ratio": 0.8,
}


def _result(payload: Dict[str, Any]) -> Dict[str, Any]:
    result = payload.get("result")
    return result if isinstance(result, dict) else payload


def _diagnostics(result: Dict[str, Any]) -> Dict[str, Any]:
    diagnostics = result.get("analysis_diagnostics")
    return diagnostics if isinstance(diagnostics, dict) else {}


def _candidate_counts(result: Dict[str, Any]) -> Dict[str, Any]:
    direct = result.get("candidate_counts")
    if isinstance(direct, dict):
        return direct
    diagnostics = _diagnostics(result)
    nested = diagnostics.get("candidate_counts")
    return nested if isinstance(nested, dict) else {}


def _list_field(result: Dict[str, Any], key: str) -> List[Any]:
    value = result.get(key)
    if isinstance(value, list):
        return value
    diagnostics = _diagnostics(result)
    nested = diagnostics.get(key)
    return nested if isinstance(nested, list) else []


def evaluate_smoke_output(payload: Dict[str, Any], thresholds: Dict[str, Any] | None = None) -> Dict[str, Any]:
    thresholds = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    result = _result(payload)
    candidate_counts = _candidate_counts(result)
    metrics = {
        "analysis_status": result.get("analysis_status"),
        "chapters_count": int(result.get("chapters_count") or 0),
        "characters_count": int(result.get("characters_count") or 0),
        "relationships_count": int(result.get("relationships_count") or 0),
        "timeline_count": int(result.get("timeline_count") or 0),
        "world_count": int(result.get("world_count") or 0),
        "relationship_endpoint_mapping_ratio": float(
            candidate_counts.get("relationship_endpoint_mapping_ratio") or 0
        ),
        "failed_chapters_count": len(_list_field(result, "failed_chapters")),
        "relationship_unresolved_endpoints_count": len(
            _list_field(result, "relationship_unresolved_endpoints")
        ),
        "low_confidence_characters_count": len(_list_field(result, "low_confidence_characters")),
        "timeline_mismatch_events_count": len(_list_field(result, "timeline_mismatch_events")),
        "analysis_quality_issues_count": len(_list_field(result, "analysis_quality_issues")),
    }

    issues: List[str] = []
    for key in ("chapters_count", "characters_count", "relationships_count", "timeline_count", "world_count"):
        if metrics[key] < thresholds[key]:
            issues.append(f"{key} {metrics[key]} < {thresholds[key]}")

    if metrics["relationship_endpoint_mapping_ratio"] < thresholds["relationship_endpoint_mapping_ratio"]:
        issues.append(
            "relationship_endpoint_mapping_ratio "
            f"{metrics['relationship_endpoint_mapping_ratio']:.2f} < "
            f"{thresholds['relationship_endpoint_mapping_ratio']:.2f}"
        )
    if metrics["relationship_unresolved_endpoints_count"]:
        issues.append(
            f"relationship_unresolved_endpoints_count={metrics['relationship_unresolved_endpoints_count']}"
        )
    if metrics["timeline_mismatch_events_count"]:
        issues.append(f"timeline_mismatch_events_count={metrics['timeline_mismatch_events_count']}")
    if metrics["failed_chapters_count"]:
        issues.append(f"failed_chapters_count={metrics['failed_chapters_count']}")

    status = metrics["analysis_status"]
    if issues and status == "completed":
        issues.append("analysis_status is completed despite quality failures")
    if not issues and status not in {"completed", "partial"}:
        issues.append(f"analysis_status {status!r} does not match passing quality metrics")

    return {
        "passed": not issues,
        "metrics": metrics,
        "thresholds": thresholds,
        "issues": issues,
        "candidate_counts": candidate_counts,
    }


def load_and_evaluate(path: Path) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload, evaluate_smoke_output(payload)


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a NovelForge import smoke JSON result.")
    parser.add_argument("json_path", type=Path)
    parser.add_argument("--no-fail", action="store_true", help="Always exit 0 after printing the report.")
    args = parser.parse_args()

    _, report = load_and_evaluate(args.json_path)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report["passed"] and not args.no_fail:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
