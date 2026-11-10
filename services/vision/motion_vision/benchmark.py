"""Reproducible synthetic stage measurements; no camera or participant images."""

from __future__ import annotations

import argparse
import json
import platform
import statistics
import time
from collections.abc import Callable
from typing import Any

import numpy as np

from .providers import RTMPoseProvider, detector_input, pose_input
from .runtime import ROOT, VALIDATE_OBSERVATION, VALIDATOR, encode_packet
from .sources import demo_frame
from .tracking import Tracker


def measure(run: Callable[[], Any], samples: int) -> dict[str, float | int]:
    for _ in range(5):
        run()
    elapsed = []
    for _ in range(samples):
        started = time.perf_counter_ns()
        run()
        elapsed.append((time.perf_counter_ns() - started) / 1e6)
    return {
        "samples": samples,
        "p50Ms": statistics.median(elapsed),
        "p95Ms": sorted(elapsed)[min(samples - 1, int(samples * 0.95))],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=200)
    parser.add_argument(
        "--models", action="store_true", help="Also time local RTMDet/RTMPose tensors"
    )
    args = parser.parse_args()
    if not 10 <= args.samples <= 10000:
        parser.error("samples must be between 10 and 10000")
    observation = json.loads((ROOT / "contracts/examples/synthetic-observation.json").read_text())
    _, people = demo_frame(0, "three")
    observation.update(
        people=Tracker().update(people, 1, epoch="benchmark"),
        detectedCount=3,
        capacity=3,
        capacityReached=True,
    )
    results: dict[str, Any] = {
        "platform": platform.system(),
        "architecture": platform.machine(),
        "workload": "synthetic three-person observation; model inputs are constant gray tensors",
        "referenceSchema": measure(lambda: VALIDATOR.validate(observation), args.samples),
        "compiledSchema": measure(lambda: VALIDATE_OBSERVATION(observation), args.samples),
        "compiledPacket": measure(
            lambda: encode_packet(observation, b"\xff\xd8\xff\xd9"), args.samples
        ),
    }
    if args.models:
        provider = RTMPoseProvider(3)
        try:
            image = np.full((540, 960, 3), 127, dtype=np.uint8)
            detector, _ = detector_input(image)
            pose, _, _ = pose_input(image, [200, 40, 700, 520])
            results["detector"] = measure(
                lambda: provider.detector.run(None, {provider.detector_input_name: detector}),
                args.samples,
            )
            results["poseCrop"] = measure(
                lambda: provider.pose.run(None, {provider.pose_input_name: pose}), args.samples
            )
        finally:
            provider.close()
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
