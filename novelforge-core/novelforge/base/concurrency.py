"""
动态并发控制器 - 根据系统状态动态调整并发数
"""

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from rich.console import Console

# console = Console()


class ConcurrencyState(str, Enum):
    """并发控制状态"""
    SLOW_START = "slow_start"  # 慢启动阶段
    CONGESTION_AVOIDANCE = "congestion_avoidance"  # 拥塞避免阶段
    FAST_RECOVERY = "fast_recovery"  # 快速恢复阶段


@dataclass
class ConcurrencyStats:
    """并发统计信息"""
    current_concurrency: int
    min_concurrency: int
    max_concurrency: int
    state: ConcurrencyState
    total_requests: int
    successful_requests: int
    failed_requests: int
    success_rate: float
    avg_response_time: float
    min_response_time: float
    max_response_time: float
    recent_response_times: list[float] = field(default_factory=list)


class AdaptiveConcurrency:
    """
    动态并发控制器 - 类似 TCP 拥塞控制算法

    功能：
    - 成功率监控：跟踪请求成功/失败率
    - 响应时间监控：跟踪平均响应时间
    - 动态调整：根据指标调整并发数
    - 拥塞控制：类似 TCP 的拥塞控制算法

    算法：
    1. 慢启动阶段：成功率 > 95% 且响应时间 < 目标值，每次成功后并发数 +1
    2. 拥塞避免阶段：成功率在 90%-95% 之间，每 N 次成功后并发数 +1
    3. 快速恢复阶段：成功率 < 90% 或响应时间 > 目标值，并发数减半
    """

    def __init__(
        self,
        min_concurrency: int = 2,
        max_concurrency: int = 10,
        target_success_rate: float = 0.95,
        target_response_time: float = 5.0,
        window_size: int = 20,
        congestion_threshold: float = 0.90,
    ):
        """
        初始化动态并发控制器

        Args:
            min_concurrency: 最小并发数
            max_concurrency: 最大并发数
            target_success_rate: 目标成功率 (0-1)
            target_response_time: 目标响应时间（秒）
            window_size: 统计窗口大小（请求数）
            congestion_threshold: 拥塞阈值，低于此成功率进入快速恢复
        """
        self.min_concurrency = min_concurrency
        self.max_concurrency = max_concurrency
        self.target_success_rate = target_success_rate
        self.target_response_time = target_response_time
        self.window_size = window_size
        self.congestion_threshold = congestion_threshold

        # 当前状态
        self.current_concurrency = min_concurrency
        self.state = ConcurrencyState.SLOW_START

        # 统计信息
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.response_times: deque[float] = deque(maxlen=window_size)

        # 拥塞避免阶段的计数器
        self.congestion_avoidance_counter = 0
        self.congestion_avoidance_threshold = 5  # 每 5 次成功增加 1 个并发

        # 信号量（用于控制并发）
        self._semaphore = asyncio.Semaphore(min_concurrency)
        self._lock = asyncio.Lock()
        # 当前实际的信号量值，用于安全更新
        self._current_semaphore_value = min_concurrency

    async def acquire(self) -> None:
        """
        获取并发许可

        如果当前并发数已满，会阻塞等待
        """
        await self._semaphore.acquire()

    async def release(self, success: bool, response_time: float) -> None:
        """
        释放并发许可并更新状态

        Args:
            success: 请求是否成功
            response_time: 响应时间（秒）
        """
        # 更新统计
        self.total_requests += 1
        if success:
            self.successful_requests += 1
        else:
            self.failed_requests += 1

        self.response_times.append(response_time)

        # 调整并发数（异步调用，使用锁保护）
        await self._adjust_concurrency(success, response_time)

        # 释放信号量
        self._semaphore.release()

    def get_current_concurrency(self) -> int:
        """获取当前并发数"""
        return self.current_concurrency

    def get_stats(self) -> ConcurrencyStats:
        """获取统计信息"""
        success_rate = (
            self.successful_requests / self.total_requests
            if self.total_requests > 0
            else 1.0
        )

        avg_response_time = (
            sum(self.response_times) / len(self.response_times)
            if self.response_times
            else 0.0
        )

        min_response_time = min(self.response_times) if self.response_times else 0.0
        max_response_time = max(self.response_times) if self.response_times else 0.0

        return ConcurrencyStats(
            current_concurrency=self.current_concurrency,
            min_concurrency=self.min_concurrency,
            max_concurrency=self.max_concurrency,
            state=self.state,
            total_requests=self.total_requests,
            successful_requests=self.successful_requests,
            failed_requests=self.failed_requests,
            success_rate=success_rate,
            avg_response_time=avg_response_time,
            min_response_time=min_response_time,
            max_response_time=max_response_time,
            recent_response_times=list(self.response_times),
        )

    async def _adjust_concurrency(self, success: bool, response_time: float) -> None:
        """
        调整并发数（内部方法，异步版本，使用锁保护）

        Args:
            success: 请求是否成功
            response_time: 响应时间（秒）
        """
        async with self._lock:
            # 计算指标
            success_rate = (
                self.successful_requests / self.total_requests
                if self.total_requests > 0
                else 1.0
            )

            avg_response_time = (
                sum(self.response_times) / len(self.response_times)
                if self.response_times
                else 0.0
            )

            # 根据状态调整
            if self.state == ConcurrencyState.SLOW_START:
                self._slow_start(success_rate, avg_response_time)
            elif self.state == ConcurrencyState.CONGESTION_AVOIDANCE:
                self._congestion_avoidance(success_rate, avg_response_time)
            elif self.state == ConcurrencyState.FAST_RECOVERY:
                self._fast_recovery(success_rate, avg_response_time)

            # 更新信号量
            await self._update_semaphore()

    def _slow_start(self, success_rate: float, avg_response_time: float) -> None:
        """
        慢启动阶段

        条件：成功率 > 95% 且响应时间 < 目标值
        动作：每次成功后并发数 +1
        """
        if success_rate >= self.target_success_rate and avg_response_time <= self.target_response_time:
            # 成功率高，响应快 - 增加并发
            if self.current_concurrency < self.max_concurrency:
                old_concurrency = self.current_concurrency
                self.current_concurrency += 1
                # console.print(
                #     f"[green]⬆️ 动态并发: {old_concurrency} → {self.current_concurrency} "
                #     f"(慢启动: 成功率 {success_rate:.1%}, 响应时间 {avg_response_time:.2f}s)[/green]"
                # )

            # 进入拥塞避免阶段
            if self.current_concurrency >= self.max_concurrency * 0.7:
                self.state = ConcurrencyState.CONGESTION_AVOIDANCE
                # console.print(
                #     f"[cyan][并发] 动态并发: 进入拥塞避免阶段 (并发数: {self.current_concurrency})[/cyan]"
                # )
        elif success_rate < self.congestion_threshold or avg_response_time > self.target_response_time * 1.5:
            # 成功率低或响应慢 - 进入快速恢复
            self.state = ConcurrencyState.FAST_RECOVERY
            # console.print(
            #     f"[yellow][警告] 动态并发: 进入快速恢复阶段 "
            #     f"(成功率 {success_rate:.1%}, 响应时间 {avg_response_time:.2f}s)[/yellow]"
            # )

    def _congestion_avoidance(self, success_rate: float, avg_response_time: float) -> None:
        """
        拥塞避免阶段

        条件：成功率在 90%-95% 之间
        动作：每 N 次成功后并发数 +1
        """
        if success_rate >= self.target_success_rate and avg_response_time <= self.target_response_time:
            # 成功率高，响应快 - 缓慢增加并发
            self.congestion_avoidance_counter += 1

            if self.congestion_avoidance_counter >= self.congestion_avoidance_threshold:
                if self.current_concurrency < self.max_concurrency:
                    old_concurrency = self.current_concurrency
                    self.current_concurrency += 1
                    # console.print(
                    #     f"[green][增加] 动态并发: {old_concurrency} → {self.current_concurrency} "
                    #     f"(拥塞避免: 成功率 {success_rate:.1%}, 响应时间 {avg_response_time:.2f}s)[/green]"
                    # )
                self.congestion_avoidance_counter = 0
        elif success_rate < self.congestion_threshold or avg_response_time > self.target_response_time * 1.5:
            # 成功率低或响应慢 - 进入快速恢复
            self.state = ConcurrencyState.FAST_RECOVERY
            self.congestion_avoidance_counter = 0
            # console.print(
            #     f"[yellow][警告] 动态并发: 进入快速恢复阶段 "
            #     f"(成功率 {success_rate:.1%}, 响应时间 {avg_response_time:.2f}s)[/yellow]"
            # )

    def _fast_recovery(self, success_rate: float, avg_response_time: float) -> None:
        """
        快速恢复阶段

        条件：成功率 < 90% 或响应时间 > 目标值
        动作：并发数减半
        """
        if success_rate >= self.target_success_rate and avg_response_time <= self.target_response_time:
            # 成功率恢复 - 进入慢启动
            self.state = ConcurrencyState.SLOW_START
            # console.print(
            #     f"[cyan][并发] 动态并发: 进入慢启动阶段 "
            #     f"(成功率 {success_rate:.1%}, 响应时间 {avg_response_time:.2f}s)[/cyan]"
            # )
        else:
            # 继续快速恢复 - 减少并发
            if self.current_concurrency > self.min_concurrency:
                old_concurrency = self.current_concurrency
                self.current_concurrency = max(
                    self.current_concurrency // 2,
                    self.min_concurrency
                )
                # console.print(
                #     f"[red]⬇️ 动态并发: {old_concurrency} → {self.current_concurrency} "
                #     f"(快速恢复: 成功率 {success_rate:.1%}, 响应时间 {avg_response_time:.2f}s)[/red]"
                # )

    async def _update_semaphore(self) -> None:
        """更新信号量的并发限制（异步版本，使用锁保护）"""
        # 安全地更新信号量：如果需要增加并发数，直接释放额外的许可
        # 如果需要减少并发数，我们无法直接减少，但会在下次创建新信号量时生效
        if self.current_concurrency > self._current_semaphore_value:
            # 增加并发数：释放额外的许可
            diff = self.current_concurrency - self._current_semaphore_value
            for _ in range(diff):
                try:
                    self._semaphore.release()
                except ValueError:
                    # 信号量已满，停止释放
                    break
            self._current_semaphore_value = self.current_concurrency
        elif self.current_concurrency < self._current_semaphore_value:
            # 减少并发数：创建新的信号量
            # 注意：这会导致短暂的并发控制不一致，但这是可接受的
            old_semaphore = self._semaphore
            self._semaphore = asyncio.Semaphore(self.current_concurrency)
            self._current_semaphore_value = self.current_concurrency

    def reset(self) -> None:
        """重置并发控制器"""
        self.current_concurrency = self.min_concurrency
        self.state = ConcurrencyState.SLOW_START
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.response_times.clear()
        self.congestion_avoidance_counter = 0
        self._semaphore = asyncio.Semaphore(self.min_concurrency)
        self._current_semaphore_value = self.min_concurrency
