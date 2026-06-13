"""Budgeted Scheduler for extraction runs.

Controls extraction budget: model calls, tokens, retries, repairs, wall-clock time.
Does not evaluate model quality or route models — those are ModelRouter concerns.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class BudgetPolicy:
    max_model_calls: int = 10
    max_retry_attempts: int = 3
    max_repair_attempts: int = 5
    max_wall_clock_seconds: float = 600.0
    max_estimated_tokens: int = 100000
    enabled: bool = True


@dataclass
class BudgetState:
    model_calls_used: int = 0
    tokens_used: int = 0
    accepted_count: int = 0
    skipped_chapters: List[str] = field(default_factory=list)
    deferred_chapters: List[str] = field(default_factory=list)
    deferred_by_reason: Dict[str, int] = field(default_factory=dict)
    started_at_monotonic: float = field(default_factory=time.monotonic)


@dataclass
class BudgetedWorkItem:
    chapter_id: str
    chapter_title: str
    chapter_order: int
    phase: str
    estimated_model_calls: int = 1
    estimated_tokens: int = 5000
    retry_count: int = 0
    repair_count: int = 0
    reason: Optional[str] = None


@dataclass
class PlanResult:
    accepted: List[BudgetedWorkItem] = field(default_factory=list)
    deferred: List[BudgetedWorkItem] = field(default_factory=list)
    skipped: List[BudgetedWorkItem] = field(default_factory=list)


@dataclass
class BudgetSummary:
    total_accepted: int = 0
    total_deferred: int = 0
    total_skipped: int = 0
    model_calls_used: int = 0
    model_calls_remaining: int = 0
    tokens_remaining: int = 0
    wall_clock_remaining: float = 0.0
    deferred_by_reason: Dict[str, int] = field(default_factory=dict)


PHASE_PRIORITY = {"first_pass": 0, "repair": 1, "retry": 2}


class BudgetedScheduler:
    def __init__(self, policy: BudgetPolicy, state: Optional[BudgetState] = None):
        self.policy = policy
        self.state = state or BudgetState()
        self._clock = time.monotonic

    def plan(
        self,
        items: List[BudgetedWorkItem],
        successful_chapter_ids: Optional[List[str]] = None,
    ) -> PlanResult:
        successful = set(successful_chapter_ids or [])
        sorted_items = sorted(items, key=lambda i: (PHASE_PRIORITY.get(i.phase, 99), i.chapter_order))

        result = PlanResult()
        accepted_by_phase: Dict[str, int] = {"first_pass": 0, "retry": 0, "repair": 0}

        for item in sorted_items:
            if item.chapter_id in successful:
                result.skipped.append(item)
                self.state.skipped_chapters.append(item.chapter_id)
                continue

            if not self.policy.enabled:
                result.accepted.append(item)
                self.state.accepted_count += 1
                accepted_by_phase[item.phase] = accepted_by_phase.get(item.phase, 0) + 1
                continue

            if not self._has_budget_for(item, accepted_by_phase):
                item.reason = "budget_exhausted"
                result.deferred.append(item)
                self.state.deferred_chapters.append(item.chapter_id)
                self.state.deferred_by_reason["budget_exhausted"] = self.state.deferred_by_reason.get("budget_exhausted", 0) + 1
                continue

            result.accepted.append(item)
            self.state.accepted_count += 1
            accepted_by_phase[item.phase] = accepted_by_phase.get(item.phase, 0) + 1
            self.state.model_calls_used += item.estimated_model_calls
            self.state.tokens_used += item.estimated_tokens

        return result

    def can_start(self, item: BudgetedWorkItem) -> bool:
        if not self.policy.enabled:
            return True
        return self._has_budget_for(item, {})

    def charge(self, item: BudgetedWorkItem, actual_tokens: Optional[int] = None) -> None:
        self.state.model_calls_used += item.estimated_model_calls
        self.state.tokens_used += actual_tokens or item.estimated_tokens

    def defer(self, item: BudgetedWorkItem, reason: str) -> None:
        item.reason = reason
        self.state.deferred_chapters.append(item.chapter_id)

    def summary(self) -> BudgetSummary:
        now = self._clock()
        elapsed = now - self.state.started_at_monotonic
        wall_remaining = max(0, self.policy.max_wall_clock_seconds - elapsed)

        return BudgetSummary(
            total_accepted=self.state.accepted_count,
            total_deferred=len(self.state.deferred_chapters),
            total_skipped=len(self.state.skipped_chapters),
            model_calls_used=self.state.model_calls_used,
            model_calls_remaining=max(0, self.policy.max_model_calls - self.state.model_calls_used),
            tokens_remaining=max(0, self.policy.max_estimated_tokens - self.state.tokens_used),
            wall_clock_remaining=wall_remaining,
            deferred_by_reason=dict(self.state.deferred_by_reason),
        )

    def _has_budget_for(self, item: BudgetedWorkItem, accepted_by_phase: Dict[str, int]) -> bool:
        if self.state.model_calls_used + item.estimated_model_calls > self.policy.max_model_calls:
            return False
        if self.state.tokens_used + item.estimated_tokens > self.policy.max_estimated_tokens:
            return False
        if item.phase == "retry" and accepted_by_phase.get("retry", 0) >= self.policy.max_retry_attempts:
            return False
        if item.phase == "repair" and accepted_by_phase.get("repair", 0) >= self.policy.max_repair_attempts:
            return False
        now = self._clock()
        elapsed = now - self.state.started_at_monotonic
        if elapsed >= self.policy.max_wall_clock_seconds:
            return False
        return True
