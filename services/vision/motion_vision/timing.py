"""Shared high-resolution host clock for capture, freshness and stage durations."""

import time
from collections import deque


class SourceRate:
    """Count captures over a bounded source-clock window, including skipped sequences.

    Averaging instantaneous inverse intervals overstates FPS when a driver releases
    buffered frames in bursts. An aggregate count/time ratio does not amplify those bursts.
    """

    def __init__(self) -> None:
        self.samples: deque[tuple[int, int]] = deque(maxlen=240)

    def record(self, sequence: int, captured_ns: int) -> float:
        if self.samples and (sequence <= self.samples[-1][0] or captured_ns <= self.samples[-1][1]):
            self.samples.clear()
        self.samples.append((sequence, captured_ns))
        while len(self.samples) > 2 and captured_ns - self.samples[1][1] >= 1_000_000_000:
            self.samples.popleft()
        elapsed = captured_ns - self.samples[0][1]
        return (sequence - self.samples[0][0]) * 1e9 / elapsed if elapsed >= 500_000_000 else 0.0


def host_time_ns() -> int:
    # Python 3.12's Windows monotonic_ns uses coarse GetTickCount64. QPC is
    # monotonic too; every producer/consumer must switch together, never mix them.
    return time.perf_counter_ns()


def next_preview_tick(previous_ns: int, now_ns: int) -> int:
    """20 Hz synthetic pacing without accumulating sleep overshoot or replaying ticks."""
    period_ns = 50_000_000
    return previous_ns + max(1, (now_ns - previous_ns) // period_ns + 1) * period_ns
