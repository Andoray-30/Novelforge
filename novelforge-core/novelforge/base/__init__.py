"""
基础组件层 - 文本分片、状态、速率限制、重试策略、并发控制、文档解析
"""

from novelforge.base.status import (
    ExtractionPhase,
    ExtractionStatus,
)
from novelforge.base.splitter import (
    TextSplitter,
    TextChunk,
)
from novelforge.base.rate_limiter import (
    RateLimiter,
    RateUsage,
)
from novelforge.base.retry_policy import (
    RetryPolicy,
    RetryStats,
    retry_with_policy,
)
from novelforge.base.concurrency import (
    AdaptiveConcurrency,
    ConcurrencyState,
    ConcurrencyStats,
)
from novelforge.base.parser import (
    FileType,
    Chapter,
    ParsedDocument,
    DocumentParser,
    parse_document,
)

__all__ = [
    # 状态
    "ExtractionPhase",
    "ExtractionStatus",
    # 分片
    "TextSplitter",
    "TextChunk",
    # 速率限制
    "RateLimiter",
    "RateUsage",
    # 重试策略
    "RetryPolicy",
    "RetryStats",
    "retry_with_policy",
    # 并发控制
    "AdaptiveConcurrency",
    "ConcurrencyState",
    "ConcurrencyStats",
    # 文档解析
    "FileType",
    "Chapter",
    "ParsedDocument",
    "DocumentParser",
    "parse_document",
]
