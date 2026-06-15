"""PerformanceProfile service contract tests.

Tests for data models, helper functions, aggregation metrics, safe output, and store rebuild semantics.
These tests define the contract BEFORE implementation exists (TDD RED phase).
"""

from __future__ import annotations

import pytest
from typing import Any, Dict, List, Optional


# ============================================================================
# Test: Data Model Fields
# ============================================================================


class TestPerformanceProfileKeyFields:
    """PerformanceProfileKey must contain grouping dimensions."""

    def test_key_has_scope(self):
        """scope field must exist and accept 'session' or 'global'."""
        from novelforge.services.performance_profile import PerformanceProfileKey

        key = PerformanceProfileKey(
            scope="session",
            session_id="test-session",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="medium",
        )
        assert key.scope == "session"

    def test_key_has_session_id(self):
        """session_id field must exist."""
        from novelforge.services.performance_profile import PerformanceProfileKey

        key = PerformanceProfileKey(
            scope="session",
            session_id="test-session-123",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="medium",
        )
        assert key.session_id == "test-session-123"

    def test_key_has_model_used(self):
        """model_used field must exist."""
        from novelforge.services.performance_profile import PerformanceProfileKey

        key = PerformanceProfileKey(
            scope="global",
            session_id="",
            model_used="deepseek-v4-flash",
            task_role="extractor_fast",
            token_bucket="small",
        )
        assert key.model_used == "deepseek-v4-flash"

    def test_key_has_task_role(self):
        """task_role field must exist."""
        from novelforge.services.performance_profile import PerformanceProfileKey

        key = PerformanceProfileKey(
            scope="global",
            session_id="",
            model_used="gpt-4",
            task_role="schema_repair",
            token_bucket="large",
        )
        assert key.task_role == "schema_repair"

    def test_key_has_token_bucket(self):
        """token_bucket field must exist."""
        from novelforge.services.performance_profile import PerformanceProfileKey

        key = PerformanceProfileKey(
            scope="global",
            session_id="",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="small",
        )
        assert key.token_bucket == "small"


class TestPerformanceProfileMetricsFields:
    """PerformanceProfileMetrics must contain all required metric fields."""

    def test_metrics_has_total_attempts(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(total_attempts=10)
        assert metrics.total_attempts == 10

    def test_metrics_has_success_count(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(success_count=7)
        assert metrics.success_count == 7

    def test_metrics_has_failed_count(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(failed_count=3)
        assert metrics.failed_count == 3

    def test_metrics_has_timeout_count(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(timeout_count=2)
        assert metrics.timeout_count == 2

    def test_metrics_has_rate_limited_count(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(rate_limited_count=1)
        assert metrics.rate_limited_count == 1

    def test_metrics_has_gateway_timeout_count(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(gateway_timeout_count=1)
        assert metrics.gateway_timeout_count == 1

    def test_metrics_has_empty_content_count(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(empty_content_count=0)
        assert metrics.empty_content_count == 0

    def test_metrics_has_json_invalid_count(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(json_invalid_count=2)
        assert metrics.json_invalid_count == 2

    def test_metrics_has_schema_error_count(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(schema_error_count=1)
        assert metrics.schema_error_count == 1

    def test_metrics_has_success_rate(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(success_rate=0.7)
        assert metrics.success_rate == 0.7

    def test_metrics_has_avg_latency_ms(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(avg_latency_ms=1500.0)
        assert metrics.avg_latency_ms == 1500.0

    def test_metrics_has_p50_latency_ms(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(p50_latency_ms=1200.0)
        assert metrics.p50_latency_ms == 1200.0

    def test_metrics_has_p95_latency_ms(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(p95_latency_ms=3000.0)
        assert metrics.p95_latency_ms == 3000.0

    def test_metrics_has_error_breakdown(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(
            error_breakdown={"timeout": 2, "rate_limited": 1}
        )
        assert metrics.error_breakdown == {"timeout": 2, "rate_limited": 1}

    def test_metrics_has_repair_salvage_rate(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(repair_salvage_rate=0.5)
        assert metrics.repair_salvage_rate == 0.5

    def test_metrics_has_retry_salvage_rate(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(retry_salvage_rate=0.3)
        assert metrics.retry_salvage_rate == 0.3

    def test_metrics_has_budget_deferred_count(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(budget_deferred_count=2)
        assert metrics.budget_deferred_count == 2

    def test_metrics_has_budget_exhausted_count(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(budget_exhausted_count=1)
        assert metrics.budget_exhausted_count == 1

    def test_metrics_has_estimated_tokens_total(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(estimated_tokens_total=50000)
        assert metrics.estimated_tokens_total == 50000

    def test_metrics_has_confidence_level(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(confidence_level="low")
        assert metrics.confidence_level == "low"

    def test_metrics_has_recommendation_hint(self):
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics = PerformanceProfileMetrics(
            recommendation_hint="good_for_extractor_fast"
        )
        assert metrics.recommendation_hint == "good_for_extractor_fast"


class TestPerformanceProfileFields:
    """PerformanceProfile must contain key, metrics, and metadata."""

    def test_profile_has_key(self):
        from novelforge.services.performance_profile import (
            PerformanceProfile,
            PerformanceProfileKey,
            PerformanceProfileMetrics,
        )

        key = PerformanceProfileKey(
            scope="session",
            session_id="test",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="medium",
        )
        metrics = PerformanceProfileMetrics(total_attempts=5)
        profile = PerformanceProfile(key=key, metrics=metrics)
        assert profile.key == key

    def test_profile_has_metrics(self):
        from novelforge.services.performance_profile import (
            PerformanceProfile,
            PerformanceProfileKey,
            PerformanceProfileMetrics,
        )

        key = PerformanceProfileKey(
            scope="session",
            session_id="test",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="medium",
        )
        metrics = PerformanceProfileMetrics(total_attempts=10, success_count=8)
        profile = PerformanceProfile(key=key, metrics=metrics)
        assert profile.metrics.success_rate == pytest.approx(0.8)

    def test_profile_has_generated_at(self):
        from novelforge.services.performance_profile import (
            PerformanceProfile,
            PerformanceProfileKey,
            PerformanceProfileMetrics,
        )

        key = PerformanceProfileKey(
            scope="session",
            session_id="test",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="medium",
        )
        metrics = PerformanceProfileMetrics()
        profile = PerformanceProfile(key=key, metrics=metrics)
        assert profile.generated_at is not None
        assert isinstance(profile.generated_at, str)

    def test_profile_has_source_attempt_count(self):
        from novelforge.services.performance_profile import (
            PerformanceProfile,
            PerformanceProfileKey,
            PerformanceProfileMetrics,
        )

        key = PerformanceProfileKey(
            scope="session",
            session_id="test",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="medium",
        )
        metrics = PerformanceProfileMetrics(total_attempts=10)
        profile = PerformanceProfile(
            key=key, metrics=metrics, source_attempt_count=10
        )
        assert profile.source_attempt_count == 10


# ============================================================================
# Test: Helper Functions
# ============================================================================


class TestTokenBucket:
    """token_bucket() must classify estimated_tokens into fixed bands."""

    def test_unknown_bucket_for_zero_tokens(self):
        from novelforge.services.performance_profile import token_bucket

        assert token_bucket(0) == "unknown"

    def test_unknown_bucket_for_negative_tokens(self):
        from novelforge.services.performance_profile import token_bucket

        assert token_bucket(-1) == "unknown"

    def test_small_bucket_for_low_tokens(self):
        from novelforge.services.performance_profile import token_bucket

        assert token_bucket(1) == "small"
        assert token_bucket(1000) == "small"
        assert token_bucket(2999) == "small"

    def test_medium_bucket_for_mid_tokens(self):
        from novelforge.services.performance_profile import token_bucket

        assert token_bucket(3000) == "medium"
        assert token_bucket(5000) == "medium"
        assert token_bucket(8000) == "medium"

    def test_large_bucket_for_high_tokens(self):
        from novelforge.services.performance_profile import token_bucket

        assert token_bucket(8001) == "large"
        assert token_bucket(50000) == "large"
        assert token_bucket(100000) == "large"


class TestConfidenceLevel:
    """confidence_level() must return low/medium/high based on sample size."""

    def test_low_confidence_for_small_sample(self):
        from novelforge.services.performance_profile import confidence_level

        assert confidence_level(0) == "low"
        assert confidence_level(1) == "low"
        assert confidence_level(4) == "low"

    def test_medium_confidence_for_medium_sample(self):
        from novelforge.services.performance_profile import confidence_level

        assert confidence_level(5) == "medium"
        assert confidence_level(15) == "medium"
        assert confidence_level(29) == "medium"

    def test_high_confidence_for_large_sample(self):
        from novelforge.services.performance_profile import confidence_level

        assert confidence_level(30) == "high"
        assert confidence_level(100) == "high"
        assert confidence_level(500) == "high"


class TestPercentiles:
    """Percentile calculations must be deterministic."""

    def test_p50_empty_list(self):
        from novelforge.services.performance_profile import percentile

        assert percentile([], 50) == 0.0

    def test_p50_single_value(self):
        from novelforge.services.performance_profile import percentile

        assert percentile([1000.0], 50) == 1000.0

    def test_p50_multiple_values(self):
        from novelforge.services.performance_profile import percentile

        values = [100.0, 200.0, 300.0, 400.0, 500.0]
        result = percentile(values, 50)
        assert result == 300.0  # median of sorted values

    def test_p95_multiple_values(self):
        from novelforge.services.performance_profile import percentile

        values = [100.0, 200.0, 300.0, 400.0, 500.0, 600.0, 700.0, 800.0, 900.0, 1000.0]
        result = percentile(values, 95)
        assert result == 1000.0  # 95th percentile

    def test_p50_filters_zeros(self):
        from novelforge.services.performance_profile import percentile

        values = [0.0, 0.0, 100.0, 200.0, 300.0]
        result = percentile(values, 50, filter_zeros=True)
        assert result == 200.0


class TestDeriveTaskRole:
    """derive_task_role() must infer role from model_used and repair_layer."""

    def test_schema_repair_when_repair_layer_is_model(self):
        from novelforge.services.performance_profile import derive_task_role

        record = {"model_used": "gpt-4", "repair_layer": "model"}
        model_pools = {"extractor_fast": ["gpt-4", "deepseek"]}
        assert derive_task_role(record, model_pools) == "schema_repair"

    def test_local_repair_not_schema_repair(self):
        from novelforge.services.performance_profile import derive_task_role

        record = {"model_used": "gpt-4", "repair_layer": "local"}
        model_pools = {"extractor_fast": ["gpt-4"]}
        assert derive_task_role(record, model_pools) == "extractor_fast"

    def test_derives_from_model_pool(self):
        from novelforge.services.performance_profile import derive_task_role

        record = {"model_used": "deepseek-v4-flash", "repair_layer": None}
        model_pools = {
            "extractor_fast": ["deepseek-v4-flash", "gpt-4"],
            "extractor_deep": ["deepseek-v4-pro"],
        }
        assert derive_task_role(record, model_pools) == "extractor_fast"

    def test_unknown_when_no_match(self):
        from novelforge.services.performance_profile import derive_task_role

        record = {"model_used": "unknown-model", "repair_layer": None}
        model_pools = {"extractor_fast": ["gpt-4"]}
        assert derive_task_role(record, model_pools) == "unknown"

    def test_unknown_when_model_missing(self):
        from novelforge.services.performance_profile import derive_task_role

        record = {"model_used": "", "repair_layer": None}
        model_pools = {"extractor_fast": ["gpt-4"]}
        assert derive_task_role(record, model_pools) == "unknown"


class TestRecommendationHints:
    """recommendation_hints() must generate correct hints from metrics."""

    def test_good_for_extractor_fast(self):
        from novelforge.services.performance_profile import (
            PerformanceProfileMetrics,
            recommendation_hints,
        )

        metrics = PerformanceProfileMetrics(
            total_attempts=10,
            success_count=10,
            p95_latency_ms=15000.0,
            timeout_count=0,
            json_invalid_count=0,
        )
        hints = recommendation_hints(metrics, "extractor_fast")
        assert "good_for_extractor_fast" in hints

    def test_insufficient_data(self):
        from novelforge.services.performance_profile import (
            PerformanceProfileMetrics,
            recommendation_hints,
        )

        metrics = PerformanceProfileMetrics(total_attempts=3, success_count=3)
        hints = recommendation_hints(metrics, "extractor_fast")
        assert "insufficient_data" in hints

    def test_high_timeout_risk(self):
        from novelforge.services.performance_profile import (
            PerformanceProfileMetrics,
            recommendation_hints,
        )

        metrics = PerformanceProfileMetrics(
            total_attempts=10,
            success_count=8,
            timeout_count=2,
            p95_latency_ms=10000.0,
        )
        hints = recommendation_hints(metrics, "extractor_fast")
        assert "high_timeout_risk" in hints

    def test_unstable_format(self):
        from novelforge.services.performance_profile import (
            PerformanceProfileMetrics,
            recommendation_hints,
        )

        metrics = PerformanceProfileMetrics(
            total_attempts=10,
            success_count=8,
            json_invalid_count=3,
            p95_latency_ms=10000.0,
        )
        hints = recommendation_hints(metrics, "extractor_fast")
        assert "unstable_format" in hints

    def test_high_latency(self):
        from novelforge.services.performance_profile import (
            PerformanceProfileMetrics,
            recommendation_hints,
        )

        metrics = PerformanceProfileMetrics(
            total_attempts=10,
            success_rate=0.9,
            p95_latency_ms=25000.0,  # > 20000 for extractor_fast
            timeout_rate=0.0,
            json_invalid_rate=0.0,
        )
        hints = recommendation_hints(metrics, "extractor_fast")
        assert "high_latency" in hints

    def test_needs_schema_repair(self):
        from novelforge.services.performance_profile import (
            PerformanceProfileMetrics,
            recommendation_hints,
        )

        metrics = PerformanceProfileMetrics(
            total_attempts=10,
            success_rate=0.8,
            repair_salvage_rate=0.5,
            p95_latency_ms=10000.0,
        )
        hints = recommendation_hints(metrics, "extractor_fast")
        assert "needs_schema_repair" in hints

    def test_avoid_for_long_context(self):
        from novelforge.services.performance_profile import (
            PerformanceProfileMetrics,
            recommendation_hints,
        )

        metrics = PerformanceProfileMetrics(
            total_attempts=10,
            success_rate=0.6,
            p95_latency_ms=10000.0,
            estimated_tokens_avg=10000,
        )
        hints = recommendation_hints(metrics, "extractor_fast")
        assert "avoid_for_long_context" in hints


# ============================================================================
# Test: Aggregation Metrics
# ============================================================================


class TestAggregationMetrics:
    """Aggregation must compute correct metrics from attempt records."""

    def test_success_rate_calculation(self):
        """success_rate = success_count / total_attempts"""
        from novelforge.services.performance_profile import (
            PerformanceProfileMetrics,
        )

        metrics = PerformanceProfileMetrics(total_attempts=10, success_count=7)
        assert metrics.success_rate == pytest.approx(0.7)

    def test_repair_salvage_rate(self):
        """repair_salvage_rate = (local + model) / (local + model + failed)"""
        from novelforge.services.performance_profile import (
            PerformanceProfileMetrics,
        )

        metrics = PerformanceProfileMetrics(
            local_repair_success_count=3,
            model_repair_success_count=2,
            repair_failed_count=5,
        )
        assert metrics.repair_salvage_rate == pytest.approx(0.5)

    def test_retry_salvage_rate(self):
        """retry_salvage_rate = retry_success / retry_queued"""
        from novelforge.services.performance_profile import (
            PerformanceProfileMetrics,
        )

        metrics = PerformanceProfileMetrics(
            retry_success_count=4, retry_queued_count=10
        )
        assert metrics.retry_salvage_rate == pytest.approx(0.4)


# ============================================================================
# Test: Safe Output (No Sensitive Fields)
# ============================================================================


class TestSafeOutput:
    """Profiles must NOT expose sensitive fields."""

    def test_no_raw_response_text_in_profile(self):
        """PerformanceProfile must not contain raw_response_text."""
        from novelforge.services.performance_profile import PerformanceProfile

        profile_fields = PerformanceProfile.model_fields.keys()
        assert "raw_response_text" not in profile_fields

    def test_no_raw_response_preview_in_profile(self):
        """PerformanceProfile must not contain raw_response_preview."""
        from novelforge.services.performance_profile import PerformanceProfile

        profile_fields = PerformanceProfile.model_fields.keys()
        assert "raw_response_preview" not in profile_fields

    def test_no_error_message_in_metrics(self):
        """PerformanceProfileMetrics must not contain error_message."""
        from novelforge.services.performance_profile import PerformanceProfileMetrics

        metrics_fields = PerformanceProfileMetrics.model_fields.keys()
        assert "error_message" not in metrics_fields

    def test_no_chapter_content_in_profile(self):
        """PerformanceProfile must not contain chapter content fields."""
        from novelforge.services.performance_profile import PerformanceProfile

        profile_fields = PerformanceProfile.model_fields.keys()
        assert "chapter_content" not in profile_fields
        assert "chapter_text" not in profile_fields

    def test_profile_serialization_excludes_none(self):
        """Serialization should not include None values."""
        from novelforge.services.performance_profile import (
            PerformanceProfile,
            PerformanceProfileKey,
            PerformanceProfileMetrics,
        )

        key = PerformanceProfileKey(
            scope="session",
            session_id="test",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="medium",
        )
        metrics = PerformanceProfileMetrics(total_attempts=5)
        profile = PerformanceProfile(key=key, metrics=metrics)
        data = profile.model_dump(mode="json", exclude_none=True)
        assert "raw_response_text" not in data
        assert "error_message" not in data


# ============================================================================
# Test: Store Rebuild Semantics
# ============================================================================


class TestStoreRebuild:
    """Store must support rebuild with overwrite semantics."""

    def test_rebuild_overwrites_existing_profile(self):
        """rebuild() must overwrite existing profile with same key."""
        import asyncio
        from novelforge.services.performance_profile import (
            PerformanceProfileStore,
            PerformanceProfile,
            PerformanceProfileKey,
            PerformanceProfileMetrics,
        )
        from novelforge.storage.memory_storage import MemoryStorage

        storage = MemoryStorage()
        store = PerformanceProfileStore(storage)

        key = PerformanceProfileKey(
            scope="session",
            session_id="test",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="medium",
        )
        metrics1 = PerformanceProfileMetrics(total_attempts=5, success_rate=0.6)
        profile1 = PerformanceProfile(
            key=key, metrics=metrics1, source_attempt_count=5
        )

        metrics2 = PerformanceProfileMetrics(total_attempts=10, success_rate=0.8)
        profile2 = PerformanceProfile(
            key=key, metrics=metrics2, source_attempt_count=10
        )

        async def run_test():
            # First rebuild
            await store.rebuild("session", "test", [profile1])
            loaded = await store.get("session", "test", key)
            assert loaded.source_attempt_count == 5

            # Second rebuild overwrites
            await store.rebuild("session", "test", [profile2])
            loaded = await store.get("session", "test", key)
            assert loaded.source_attempt_count == 10

        asyncio.run(run_test())

    def test_session_and_global_profiles_distinct(self):
        """Session and global profiles must be stored separately."""
        import asyncio
        from novelforge.services.performance_profile import (
            PerformanceProfileStore,
            PerformanceProfile,
            PerformanceProfileKey,
            PerformanceProfileMetrics,
        )
        from novelforge.storage.memory_storage import MemoryStorage

        storage = MemoryStorage()
        store = PerformanceProfileStore(storage)

        session_key = PerformanceProfileKey(
            scope="session",
            session_id="test-session",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="medium",
        )
        global_key = PerformanceProfileKey(
            scope="global",
            session_id="",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="medium",
        )

        session_profile = PerformanceProfile(
            key=session_key,
            metrics=PerformanceProfileMetrics(total_attempts=5),
            source_attempt_count=5,
        )
        global_profile = PerformanceProfile(
            key=global_key,
            metrics=PerformanceProfileMetrics(total_attempts=50),
            source_attempt_count=50,
        )

        async def run_test():
            await store.rebuild("session", "test-session", [session_profile])
            await store.rebuild("global", "", [global_profile])

            loaded_session = await store.get("session", "test-session", session_key)
            loaded_global = await store.get("global", "", global_key)

            assert loaded_session.source_attempt_count == 5
            assert loaded_global.source_attempt_count == 50

        asyncio.run(run_test())


# ============================================================================
# Test: Confidence Level Integration
# ============================================================================


class TestConfidenceLevelIntegration:
    """Confidence level must be computed from total_attempts."""

    def test_low_confidence_with_few_attempts(self):
        from novelforge.services.performance_profile import (
            PerformanceProfile,
            PerformanceProfileKey,
            PerformanceProfileMetrics,
        )

        key = PerformanceProfileKey(
            scope="session",
            session_id="test",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="medium",
        )
        metrics = PerformanceProfileMetrics(total_attempts=3)
        profile = PerformanceProfile(
            key=key, metrics=metrics, source_attempt_count=3
        )
        assert profile.metrics.confidence_level == "low"

    def test_high_confidence_with_many_attempts(self):
        from novelforge.services.performance_profile import (
            PerformanceProfile,
            PerformanceProfileKey,
            PerformanceProfileMetrics,
        )

        key = PerformanceProfileKey(
            scope="session",
            session_id="test",
            model_used="gpt-4",
            task_role="extractor_fast",
            token_bucket="medium",
        )
        metrics = PerformanceProfileMetrics(total_attempts=50)
        profile = PerformanceProfile(
            key=key, metrics=metrics, source_attempt_count=50
        )
        assert profile.metrics.confidence_level == "high"
