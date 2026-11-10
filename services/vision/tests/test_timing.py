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


def test_capture_rate_uses_aggregate_time_instead_of_amplifying_driver_bursts():
    from motion_vision.timing import SourceRate

    rate = SourceRate()
    values = [rate.record(i + 1, (i // 3) * 100_000_000 + (i % 3) * 1000) for i in range(31)]
    assert max(values) < 35
    assert values[-1] == 30
    assert rate.record(1, 0) == 0


def test_capture_rate_counts_skipped_sequences_and_bounds_history():
    from motion_vision.timing import SourceRate

    rate = SourceRate()
    assert rate.record(1, 0) == 0
    assert rate.record(31, 1_000_000_000) == 30
    for i in range(32, 1000):
        rate.record(i, i * 1_000_000_000 // 30)
    assert len(rate.samples) <= 240
