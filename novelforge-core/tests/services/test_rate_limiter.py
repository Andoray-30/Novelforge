import asyncio
import time

import pytest

from novelforge.base.rate_limiter import RateLimiter


@pytest.mark.asyncio
async def test_rate_limiter_serializes_concurrent_acquire_with_sliding_window():
    limiter = RateLimiter(rpm_limit=2, tpm_limit=100_000, window_size=0.05)

    started = time.monotonic()
    await asyncio.gather(*(limiter.acquire(estimated_tokens=1) for _ in range(3)))
    elapsed = time.monotonic() - started

    assert limiter.total_requests == 3
    assert elapsed >= 0.035
