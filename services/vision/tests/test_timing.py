from motion_vision import sources, timing
from motion_vision.runtime import VisionRuntime


def test_capture_and_runtime_use_the_same_high_resolution_clock(monkeypatch):
    # Distinct fake clock origins expose accidental mixing even on Unix hosts
    # where monotonic and perf_counter happen to share an implementation.
    monkeypatch.setattr(timing.time, "monotonic_ns", lambda: 90_000_000_000)
    ticks = iter([1_000_000_123, 1_000_001_456, 1_000_002_789])
    monkeypatch.setattr(timing.time, "perf_counter_ns", lambda: next(ticks))
    assert timing.host_time_ns() == 1_000_000_123
    assert sources.host_time_ns() == 1_000_001_456
    assert VisionRuntime().clock_ns() == 1_000_002_789


def test_synthetic_pacing_does_not_accumulate_oversleep_or_replay_missed_ticks():
    assert timing.next_preview_tick(0, 5_000_000) == 50_000_000
    # A 12 ms scheduling overshoot still aims at the original 100 ms tick.
    assert timing.next_preview_tick(50_000_000, 67_000_000) == 100_000_000
    # Long stalls skip missed ticks instead of creating a catch-up burst.
    assert timing.next_preview_tick(50_000_000, 160_000_000) == 200_000_000
