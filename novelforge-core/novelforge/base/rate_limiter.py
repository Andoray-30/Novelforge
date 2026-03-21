"""
限流器 - RPM/TPM 限流控制
"""

import asyncio
import time
from collections import deque
from dataclasses import dataclass
from typing import Optional
from rich.console import Console

# console = Console()


@dataclass
class RateUsage:
    """限流使用情况"""
    rpm_current: int
    rpm_limit: int
    rpm_usage: float  # 使用率 (0-1)
    tpm_current: int
    tpm_limit: int
    tpm_usage: float  # 使用率 (0-1)
    wait_time: Optional[float] = None  # 需要等待的时间（秒）


class RateLimiter:
    """
    限流器 - 使用滑动窗口算法控制 API 调用速率

    功能：
    - RPM 限制：每分钟请求数限制
    - TPM 限制：每分钟 Token 数限制
    - 滑动窗口：精确跟踪时间窗口内的使用量
    - 阻塞等待：超限时自动等待
    """

    def __init__(
        self,
        rpm_limit: int = 500,
        tpm_limit: int = 2_000_000,
        window_size: int = 60,
    ):
        """
        初始化限流器

        Args:
            rpm_limit: 每分钟请求数限制
            tpm_limit: 每分钟 Token 数限制
            window_size: 时间窗口大小（秒），默认 60 秒
        """
        self.rpm_limit = rpm_limit
        self.tpm_limit = tpm_limit
        self.window_size = window_size

        # 滑动窗口：记录请求时间戳和对应的 token 使用量
        self.request_times: deque[float] = deque()
        self.token_counts: deque[int] = deque()

        # 统计信息
        self.total_requests = 0
        self.total_tokens = 0

    async def acquire(self, estimated_tokens: int = 1000) -> None:
        """
        获取请求许可，必要时等待

        Args:
            estimated_tokens: 预估的 token 使用量
        """
        now = time.time()

        # 清理过期记录
        self._cleanup_expired(now)

        # 计算当前使用量
        current_rpm = len(self.request_times)
        current_tpm = sum(self.token_counts)

        # 检查是否超限
        if current_rpm >= self.rpm_limit or current_tpm + estimated_tokens >= self.tpm_limit:
            # 计算需要等待的时间
            wait_time = self._calculate_wait_time(estimated_tokens, now)

            if wait_time > 0:
                # console.print(
                #     f"[yellow][限流] 限流器: 等待 {wait_time:.2f} 秒 "
                #     f"(RPM: {current_rpm}/{self.rpm_limit}, "
                #     f"TPM: {current_tpm}/{self.tpm_limit})[/yellow]"
                # )
                await asyncio.sleep(wait_time)
                # 重新清理过期记录，因为等待后可能有更多记录过期
                self._cleanup_expired(time.time())

        # 记录请求
        self.request_times.append(time.time())
        self.token_counts.append(estimated_tokens)
        self.total_requests += 1

    def record(self, tokens_used: int) -> None:
        """
        记录实际使用的 token 数

        Args:
            tokens_used: 实际使用的 token 数
        """
        if self.token_counts:
            # 更新最后一个请求的 token 使用量
            self.token_counts[-1] = tokens_used
        self.total_tokens += tokens_used

    def get_usage(self) -> RateUsage:
        """
        获取当前使用情况

        Returns:
            RateUsage: 使用情况对象
        """
        now = time.time()
        self._cleanup_expired(now)

        current_rpm = len(self.request_times)
        current_tpm = sum(self.token_counts)

        return RateUsage(
            rpm_current=current_rpm,
            rpm_limit=self.rpm_limit,
            rpm_usage=current_rpm / self.rpm_limit if self.rpm_limit > 0 else 0,
            tpm_current=current_tpm,
            tpm_limit=self.tpm_limit,
            tpm_usage=current_tpm / self.tpm_limit if self.tpm_limit > 0 else 0,
        )

    def _cleanup_expired(self, now: float) -> None:
        """清理过期的记录"""
        while self.request_times and now - self.request_times[0] > self.window_size:
            self.request_times.popleft()
            self.token_counts.popleft()

    def _calculate_wait_time(self, estimated_tokens: int, now: float) -> float:
        """
        计算需要等待的时间

        Args:
            estimated_tokens: 预估的 token 使用量
            now: 当前时间戳

        Returns:
            需要等待的秒数
        """
        # 计算 RPM 需要等待的时间
        rpm_wait = 0.0
        if len(self.request_times) >= self.rpm_limit:
            # 找到最早的请求时间
            earliest_time = self.request_times[0]
            rpm_wait = max(0.0, earliest_time + self.window_size - now)

        # 计算 TPM 需要等待的时间
        tpm_wait = 0.0
        current_tpm = sum(self.token_counts)
        if current_tpm + estimated_tokens >= self.tpm_limit:
            # 需要找到最早的时间点，使得窗口内的token总数低于限制
            # 从最早的请求开始累积，直到剩余的token数满足要求
            accumulated_tokens = 0
            required_release = current_tpm + estimated_tokens - self.tpm_limit
            
            # 找到需要等待的时间点
            for i in range(len(self.token_counts)):
                accumulated_tokens += self.token_counts[i]
                if accumulated_tokens >= required_release:
                    # 找到了足够的token释放点
                    earliest_time = self.request_times[i]
                    tpm_wait = max(0.0, earliest_time + self.window_size - now)
                    break
            else:
                # 如果所有token都不够，等待整个窗口
                if self.request_times:
                    earliest_time = self.request_times[0]
                    tpm_wait = max(0.0, earliest_time + self.window_size - now)

        # 返回较大的等待时间
        return max(rpm_wait, tpm_wait)

    def reset(self) -> None:
        """重置限流器"""
        self.request_times.clear()
        self.token_counts.clear()
        self.total_requests = 0
        self.total_tokens = 0
