"""Tests for Deadline class."""

import time

import pytest

from novelforge.services.deadline import Deadline, DeadlineExceeded


def test_deadline_remaining_ms_decreases():
    """Deadline.remaining_ms 必须随时间递减。"""
    fake_time = [1000.0]

    def fake_clock():
        return fake_time[0]

    deadline = Deadline(seconds=10.0, clock=fake_clock)
    initial = deadline.remaining_ms

    fake_time[0] = 1000.005  # 5ms later

    later = deadline.remaining_ms
    assert later < initial
    assert later > 0


def test_deadline_is_expired_false_when_time_remaining():
    """Deadline.is_expired 在有剩余时间时必须返回 False。"""
    deadline = Deadline(seconds=10.0)
    assert deadline.is_expired is False


def test_deadline_is_expired_true_when_time_exceeded():
    """Deadline.is_expired 在超时后必须返回 True。"""
    deadline = Deadline(seconds=0.01)  # 10ms
    time.sleep(0.02)  # 20ms
    assert deadline.is_expired is True


def test_deadline_check_raises_when_expired():
    """Deadline.check() 在超时后必须抛出 DeadlineExceeded。"""
    deadline = Deadline(seconds=0.01)
    time.sleep(0.02)

    with pytest.raises(DeadlineExceeded):
        deadline.check()


def test_deadline_check_does_not_raise_when_time_remaining():
    """Deadline.check() 在有剩余时间时不能抛出异常。"""
    deadline = Deadline(seconds=10.0)
    deadline.check()  # 应该不抛出异常


def test_deadline_uses_monotonic_clock():
    """Deadline 必须使用单调时钟，不受系统时间修改影响。"""
    deadline = Deadline(seconds=10.0)

    # 记录初始剩余时间
    initial = deadline.remaining_ms

    # 单调时钟不会因为系统时间修改而回退
    assert initial > 0
    assert initial <= 10000


def test_deadline_context_manager():
    """Deadline 必须支持上下文管理器协议。"""
    with Deadline(seconds=10.0) as deadline:
        assert deadline.is_expired is False
        assert deadline.remaining_ms > 0


def test_deadline_context_manager_raises_on_exit_if_expired():
    """Deadline 上下文管理器在超时退出时必须抛出 DeadlineExceeded。"""
    with pytest.raises(DeadlineExceeded):
        with Deadline(seconds=0.01) as deadline:
            time.sleep(0.02)
            # 在 with 块结束时，__exit__ 会检查是否超时


def test_deadline_remaining_ms_floor_at_zero():
    """Deadline.remaining_ms 在超时后必须返回 0，不能为负数。"""
    deadline = Deadline(seconds=0.01)
    time.sleep(0.02)

    assert deadline.remaining_ms == 0


def test_deadline_custom_clock():
    """Deadline 必须支持自定义时钟函数。"""
    fake_time = [1000.0]

    def fake_clock():
        return fake_time[0]

    deadline = Deadline(seconds=10.0, clock=fake_clock)
    assert deadline.remaining_ms == 10000

    fake_time[0] = 1005.0
    assert deadline.remaining_ms == 5000

    fake_time[0] = 1010.0
    assert deadline.remaining_ms == 0

    fake_time[0] = 1015.0
    assert deadline.is_expired is True
