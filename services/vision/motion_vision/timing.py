"""Shared high-resolution host clock for capture, freshness and stage durations."""

import time


def host_time_ns() -> int:
    # Python 3.12's Windows monotonic_ns uses coarse GetTickCount64. QPC is
    # monotonic too; every producer/consumer must switch together, never mix them.
    return time.perf_counter_ns()


def next_preview_tick(previous_ns: int, now_ns: int) -> int:
    """20 Hz synthetic pacing without accumulating sleep overshoot or replaying ticks."""
    period_ns = 50_000_000
    return previous_ns + max(1, (now_ns - previous_ns) // period_ns + 1) * period_ns
