"""Unified error classification for retry decisions.

Single source of truth for error_type labels and retryability.
Replaces three inconsistent classify_error implementations.
"""

from __future__ import annotations

import json
from typing import Optional


RETRYABLE_ERROR_TYPES: set[str] = {
    "rate_limited",
    "gateway_timeout",
    "timeout",
    "provider_unavailable",
    "empty_content",
    "json_invalid",
}

NON_RETRYABLE_ERROR_TYPES: set[str] = {
    "auth_failed",
}


def classify_error(error: Exception) -> str:
    if error is None:
        return ""
    status_code = getattr(error, "status_code", None)
    text = str(error).lower()

    if status_code == 429 or "429" in text or "too many requests" in text:
        return "rate_limited"
    if status_code in (401, 403) or "unauthorized" in text or "forbidden" in text or "auth" in text:
        return "auth_failed"
    if status_code in (502, 503, 504) or "gateway" in text or "timeout" in text or "timed out" in text:
        return "gateway_timeout"
    if status_code and int(status_code) >= 500:
        return "provider_unavailable"
    if isinstance(error, json.JSONDecodeError) or "json" in text:
        return "json_invalid"
    if "empty content" in text:
        return "empty_content"
    return error.__class__.__name__


def is_retryable(error_type: str) -> bool:
    return error_type in RETRYABLE_ERROR_TYPES


def is_retryable_error(error: Exception) -> bool:
    return is_retryable(classify_error(error))
