"""Tests for BudgetedScheduler — budget-controlled extraction scheduling."""

import time

import pytest

from novelforge.services.budgeted_scheduler import (
    BudgetedScheduler,
    BudgetedWorkItem,
    BudgetPolicy,
    BudgetState,
    BudgetSummary,
)


def make_policy(**overrides) -> BudgetPolicy:
    defaults = {
        "max_model_calls": 10,
        "max_retry_attempts": 3,
        "max_repair_attempts": 5,
        "max_wall_clock_seconds": 600.0,
        "max_estimated_tokens": 100000,
        "enabled": True,
    }
    defaults.update(overrides)
    return BudgetPolicy(**defaults)


def make_item(chapter_id="chapter-1", phase="first_pass", **overrides) -> BudgetedWorkItem:
    defaults = {
        "chapter_id": chapter_id,
        "chapter_title": "第一章",
        "chapter_order": 1,
        "phase": phase,
        "estimated_model_calls": 1,
        "estimated_tokens": 5000,
        "retry_count": 0,
        "repair_count": 0,
    }
    defaults.update(overrides)
    return BudgetedWorkItem(**defaults)


def test_budget_policy_defaults():
    policy = make_policy()
    assert policy.max_model_calls == 10
    assert policy.max_retry_attempts == 3
    assert policy.max_repair_attempts == 5
    assert policy.max_wall_clock_seconds == 600.0
    assert policy.max_estimated_tokens == 100000
    assert policy.enabled is True


def test_budget_state_starts_empty():
    state = BudgetState()
    assert state.model_calls_used == 0
    assert state.tokens_used == 0
    assert state.accepted_count == 0
    assert state.skipped_chapters == []
    assert state.deferred_chapters == []
    assert state.deferred_by_reason == {}


def test_work_item_validates_phase():
    item = make_item(phase="first_pass")
    assert item.phase == "first_pass"

    item = make_item(phase="retry")
    assert item.phase == "retry"

    item = make_item(phase="repair")
    assert item.phase == "repair"


def test_first_pass_prioritized_over_retry():
    scheduler = BudgetedScheduler(policy=make_policy())
    items = [
        make_item(chapter_id="ch-retry", phase="retry"),
        make_item(chapter_id="ch-first", phase="first_pass"),
    ]
    result = scheduler.plan(items)
    assert result.accepted[0].chapter_id == "ch-first"
    assert result.accepted[1].chapter_id == "ch-retry"


def test_successful_chapters_excluded():
    scheduler = BudgetedScheduler(policy=make_policy())
    items = [
        make_item(chapter_id="ch-1", phase="first_pass"),
        make_item(chapter_id="ch-2", phase="first_pass"),
    ]
    result = scheduler.plan(items, successful_chapter_ids=["ch-1"])
    assert len(result.accepted) == 1
    assert result.accepted[0].chapter_id == "ch-2"
    assert len(result.skipped) == 1


def test_budget_exhausted_defers_work():
    scheduler = BudgetedScheduler(policy=make_policy(max_model_calls=1))
    items = [
        make_item(chapter_id="ch-1", phase="first_pass"),
        make_item(chapter_id="ch-2", phase="first_pass"),
    ]
    result = scheduler.plan(items)
    assert len(result.accepted) == 1
    assert len(result.deferred) == 1
    assert result.deferred[0].reason == "budget_exhausted"


def test_retry_limited_by_max_retry_attempts():
    scheduler = BudgetedScheduler(policy=make_policy(max_retry_attempts=1))
    items = [
        make_item(chapter_id="ch-1", phase="retry", retry_count=0),
        make_item(chapter_id="ch-2", phase="retry", retry_count=0),
    ]
    result = scheduler.plan(items)
    assert len(result.accepted) == 1
    assert len(result.deferred) == 1


def test_repair_limited_by_max_repair_attempts():
    scheduler = BudgetedScheduler(policy=make_policy(max_repair_attempts=1))
    items = [
        make_item(chapter_id="ch-1", phase="repair", repair_count=0),
        make_item(chapter_id="ch-2", phase="repair", repair_count=0),
    ]
    result = scheduler.plan(items)
    assert len(result.accepted) == 1
    assert len(result.deferred) == 1


def test_can_start_checks_budget():
    scheduler = BudgetedScheduler(policy=make_policy(max_model_calls=1))
    item = make_item()
    assert scheduler.can_start(item) is True
    scheduler.charge(item)
    assert scheduler.can_start(make_item(chapter_id="ch-2")) is False


def test_charge_updates_state():
    scheduler = BudgetedScheduler(policy=make_policy())
    item = make_item(estimated_model_calls=2, estimated_tokens=10000)
    scheduler.charge(item, actual_tokens=8000)
    assert scheduler.state.model_calls_used == 2
    assert scheduler.state.tokens_used == 8000


def test_defer_records_reason():
    scheduler = BudgetedScheduler(policy=make_policy())
    item = make_item()
    scheduler.defer(item, "budget_exhausted")
    assert "chapter-1" in scheduler.state.deferred_chapters


def test_summary_counts():
    scheduler = BudgetedScheduler(policy=make_policy(max_model_calls=2))
    items = [
        make_item(chapter_id="ch-1", phase="first_pass"),
        make_item(chapter_id="ch-2", phase="first_pass"),
        make_item(chapter_id="ch-3", phase="first_pass"),
    ]
    result = scheduler.plan(items)
    summary = scheduler.summary()
    assert summary.total_accepted == 2
    assert summary.total_deferred == 1
    assert summary.total_skipped == 0
    assert summary.model_calls_remaining == 0


def test_disabled_scheduler_accepts_all():
    scheduler = BudgetedScheduler(policy=make_policy(enabled=False))
    items = [
        make_item(chapter_id="ch-1"),
        make_item(chapter_id="ch-2"),
        make_item(chapter_id="ch-3"),
    ]
    result = scheduler.plan(items)
    assert len(result.accepted) == 3
    assert len(result.deferred) == 0


def test_summary_accepted_count_distinct_from_model_calls():
    scheduler = BudgetedScheduler(policy=make_policy(max_model_calls=10))
    items = [
        make_item(chapter_id="ch-1", estimated_model_calls=3),
        make_item(chapter_id="ch-2", estimated_model_calls=5),
    ]
    result = scheduler.plan(items)
    summary = scheduler.summary()
    assert summary.total_accepted == 2
    assert summary.model_calls_used == 8


def test_summary_skipped_counts_successful_chapters():
    scheduler = BudgetedScheduler(policy=make_policy())
    items = [
        make_item(chapter_id="ch-1"),
        make_item(chapter_id="ch-2"),
        make_item(chapter_id="ch-3"),
    ]
    result = scheduler.plan(items, successful_chapter_ids=["ch-1", "ch-2"])
    summary = scheduler.summary()
    assert summary.total_skipped == 2
    assert summary.total_accepted == 1


def test_token_budget_defers_when_exceeded():
    scheduler = BudgetedScheduler(policy=make_policy(max_estimated_tokens=5000))
    items = [
        make_item(chapter_id="ch-1", estimated_tokens=4000),
        make_item(chapter_id="ch-2", estimated_tokens=4000),
    ]
    result = scheduler.plan(items)
    assert len(result.accepted) == 1
    assert len(result.deferred) == 1
    assert result.deferred[0].reason == "budget_exhausted"


def test_deferred_by_reason_aggregation():
    scheduler = BudgetedScheduler(policy=make_policy(max_model_calls=1))
    items = [
        make_item(chapter_id="ch-1"),
        make_item(chapter_id="ch-2"),
        make_item(chapter_id="ch-3"),
    ]
    result = scheduler.plan(items)
    summary = scheduler.summary()
    assert summary.deferred_by_reason.get("budget_exhausted") == 2
