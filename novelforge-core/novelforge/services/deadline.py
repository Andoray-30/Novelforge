"""Per-chapter deadline enforcement for extraction reliability."""

from __future__ import annotations

import time
from types import TracebackType
from typing import Callable, Optional, Type


class DeadlineExceeded(Exception):
    """Raised when a deadline has been exceeded."""

    pass


class Deadline:
    """Monotonic-clock-based deadline for per-chapter extraction.

    Usage:
        deadline = Deadline(seconds=180.0)
        for attempt in range(max_retries):
            deadline.check()  # raises DeadlineExceeded if expired
            remaining = deadline.remaining_ms
            safe_timeout = min(config.timeout, max(remaining / 1000, 5.0))
            response = await ai_service.chat(..., timeout=safe_timeout)
    """

    def __init__(self, seconds: float, clock: Callable[[], float] = time.monotonic):
        self._deadline = clock() + seconds
        self._clock = clock

    @property
    def remaining_ms(self) -> int:
        """Milliseconds remaining before deadline. Returns 0 if expired."""
        remaining = self._deadline - self._clock()
        return max(0, int(remaining * 1000))

    @property
    def is_expired(self) -> bool:
        """True if the deadline has passed."""
        return self._clock() >= self._deadline

    def check(self) -> None:
        """Raise DeadlineExceeded if the deadline has passed."""
        if self.is_expired:
            raise DeadlineExceeded("Chapter extraction deadline exceeded")

    def __enter__(self) -> Deadline:
        return self

    def __exit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        # Don't suppress existing exceptions
        if exc_type is not None:
            return
        # Check deadline on clean exit
        self.check()
