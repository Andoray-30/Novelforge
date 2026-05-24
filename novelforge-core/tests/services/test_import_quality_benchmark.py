import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
MODULE_PATH = ROOT / "data" / "evaluate_import_smoke_quality.py"
SPEC = importlib.util.spec_from_file_location("evaluate_import_smoke_quality", MODULE_PATH)
quality_module = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(quality_module)


def test_quality_benchmark_accepts_internal_usable_import_result():
    report = quality_module.evaluate_smoke_output(
        {
            "result": {
                "analysis_status": "completed",
                "chapters_count": 8,
                "characters_count": 9,
                "relationships_count": 10,
                "timeline_count": 23,
                "world_count": 1,
                "analysis_diagnostics": {
                    "candidate_counts": {"relationship_endpoint_mapping_ratio": 1.0},
                    "failed_chapters": [],
                    "relationship_unresolved_endpoints": [],
                    "timeline_mismatch_events": [],
                },
                "analysis_quality_issues": [],
            }
        }
    )

    assert report["passed"] is True
    assert report["issues"] == []


def test_quality_benchmark_rejects_completed_status_for_low_quality_result():
    report = quality_module.evaluate_smoke_output(
        {
            "result": {
                "analysis_status": "completed",
                "chapters_count": 8,
                "characters_count": 4,
                "relationships_count": 7,
                "timeline_count": 6,
                "world_count": 1,
                "analysis_diagnostics": {
                    "candidate_counts": {"relationship_endpoint_mapping_ratio": 0.7},
                    "relationship_unresolved_endpoints": [{"endpoint": "Unknown"}],
                    "timeline_mismatch_events": [{"title": "错配"}],
                },
            }
        }
    )

    assert report["passed"] is False
    assert "characters_count 4 < 8" in report["issues"]
    assert "analysis_status is completed despite quality failures" in report["issues"]


def test_quality_benchmark_reports_low_confidence_characters_from_diagnostics():
    report = quality_module.evaluate_smoke_output(
        {
            "result": {
                "analysis_status": "completed",
                "chapters_count": 8,
                "characters_count": 9,
                "relationships_count": 8,
                "timeline_count": 6,
                "world_count": 1,
                "analysis_diagnostics": {
                    "candidate_counts": {"relationship_endpoint_mapping_ratio": 1.0},
                    "low_confidence_characters": [{"name": "低频角色", "confidence": 0.35}],
                },
            }
        }
    )

    assert report["passed"] is True
    assert report["metrics"]["low_confidence_characters_count"] == 1
