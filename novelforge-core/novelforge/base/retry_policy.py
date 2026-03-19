"""
重试策略 - 指数退避重试机制
"""

import asyncio
import random
from dataclasses import dataclass
from typing import Optional, Type
from rich.console import Console

console = Console()


@dataclass
class RetryStats:
    """重试统计信息"""
    total_attempts: int
    successful_attempts: int
    failed_attempts: int
    total_wait_time: float
    last_retry_delay: float


class RetryPolicy:
    """
    重试策略 - 指数退避重试机制

    功能：
    - 指数退避：每次重试等待时间指数增长
    - 最大重试次数：限制重试次数
    - 可重试判断：判断错误是否可重试
    - 抖动添加：避免重试风暴

    可重试的错误类型：
    - 429 Too Many Requests
    - 500 Internal Server Error
    - 502 Bad Gateway
    - 503 Service Unavailable
    - 504 Gateway Timeout
    - asyncio.TimeoutError
    """

    # 可重试的 HTTP 状态码
    RETRYABLE_STATUS_CODES = {
        429,  # Too Many Requests
        449,  # Retry With (某些API提供商使用)
        500,  # Internal Server Error
        502,  # Bad Gateway
        503,  # Service Unavailable
        504,  # Gateway Timeout
    }

    # 可重试的异常类型
    RETRYABLE_EXCEPTIONS = (
        asyncio.TimeoutError,
        ConnectionError,
        OSError,
    )

    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
        jitter_factor: float = 0.5,
    ):
        """
        初始化重试策略

        Args:
            max_retries: 最大重试次数
            base_delay: 基础延迟时间（秒）
            max_delay: 最大延迟时间（秒）
            exponential_base: 指数退避的基数
            jitter: 是否添加随机抖动
            jitter_factor: 抖动因子 (0-1)，0.5 表示 ±50%
        """
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter
        self.jitter_factor = jitter_factor

        # 统计信息
        self.total_attempts = 0
        self.successful_attempts = 0
        self.failed_attempts = 0
        self.total_wait_time = 0.0

    def should_retry(self, error: Exception) -> bool:
        """
        判断错误是否可重试

        Args:
            error: 异常对象

        Returns:
            是否可重试
        """
        # 检查是否为可重试的异常类型
        if isinstance(error, self.RETRYABLE_EXCEPTIONS):
            return True

        # 检查是否为 HTTP 错误
        if hasattr(error, 'status_code'):
            status_code = getattr(error, 'status_code', None)
            console.print(f"[yellow]重试策略检查: status_code={status_code}, type={type(status_code)}[/yellow]")
            # 尝试转换为整数进行比较
            try:
                status_code_int = int(status_code) if status_code is not None else None
                if status_code_int in self.RETRYABLE_STATUS_CODES:
                    return True
            except (ValueError, TypeError):
                pass

        # 检查错误消息中是否包含状态码
        error_message = str(error).lower()
        for code in self.RETRYABLE_STATUS_CODES:
            if str(code) in error_message:
                return True

        return False

    async def wait_for_retry(self, attempt: int) -> None:
        """
        等待重试

        Args:
            attempt: 当前重试次数（从 0 开始）
        """
        delay = self.get_delay(attempt)

        if delay > 0:
            console.print(
                f"[yellow][重试] 等待 {delay:.2f} 秒后重试 "
                f"(第 {attempt + 1}/{self.max_retries} 次重试)[/yellow]"
            )
            await asyncio.sleep(delay)
            self.total_wait_time += delay

    def get_delay(self, attempt: int) -> float:
        """
        计算重试延迟

        Args:
            attempt: 当前重试次数（从 0 开始）

        Returns:
            延迟时间（秒）
        """
        # 指数退避
        delay = self.base_delay * (self.exponential_base ** attempt)

        # 限制最大延迟
        delay = min(delay, self.max_delay)

        # 添加随机抖动（避免重试风暴）
        if self.jitter:
            # 抖动范围：±jitter_factor
            jitter_range = delay * self.jitter_factor
            delay = delay - jitter_range + (random.random() * 2 * jitter_range)

        return max(0.0, delay)

    def record_success(self) -> None:
        """记录成功"""
        self.total_attempts += 1
        self.successful_attempts += 1

    def record_failure(self) -> None:
        """记录失败"""
        self.total_attempts += 1
        self.failed_attempts += 1

    def get_stats(self) -> RetryStats:
        """获取统计信息"""
        return RetryStats(
            total_attempts=self.total_attempts,
            successful_attempts=self.successful_attempts,
            failed_attempts=self.failed_attempts,
            total_wait_time=self.total_wait_time,
            last_retry_delay=self.get_delay(0),
        )

    def reset(self) -> None:
        """重置统计信息"""
        self.total_attempts = 0
        self.successful_attempts = 0
        self.failed_attempts = 0
        self.total_wait_time = 0.0


async def retry_with_policy(
    func,
    retry_policy: RetryPolicy,
    *args,
    **kwargs,
):
    """
    使用重试策略执行函数

    Args:
        func: 要执行的异步函数
        retry_policy: 重试策略
        *args: 函数参数
        **kwargs: 函数关键字参数

    Returns:
        函数执行结果

    Raises:
        最后一次尝试的异常
    """
    last_error = None

    for attempt in range(retry_policy.max_retries + 1):
        try:
            result = await func(*args, **kwargs)
            retry_policy.record_success()
            return result
        except Exception as e:
            last_error = e
            retry_policy.record_failure()

            # 检查是否可重试
            if not retry_policy.should_retry(e):
                console.print(
                    f"[red][错误] 重试策略: 错误不可重试 - {type(e).__name__}: {e}[/red]"
                )
                raise

            # 检查是否还有重试机会
            if attempt < retry_policy.max_retries:
                await retry_policy.wait_for_retry(attempt)
            else:
                console.print(
                    f"[red][错误] 重试策略: 已达到最大重试次数 ({retry_policy.max_retries})[/red]"
                )
                raise

    # 理论上不会到达这里
    if last_error:
        raise last_error
