"""Reproduce identity disturbances against an immutable baseline and this checkout.

Run from the repository root with its Python environment:
  python services/vision/tools/tracking_stability.py
Only synthetic canonical observations are used; no camera or model is loaded.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import subprocess
import sys
import types
from pathlib import Path
from statistics import median
from time import perf_counter_ns
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
TRACKING_PATH = "services/vision/motion_vision/tracking.py"
BASELINE = "3071e54a7af87889ceeac2e2e409534178f4d85e"


def person(x: float, width: float = 0.16, height: float = 0.65) -> dict[str, Any]:
    joints = {}
    for name, dx, dy in (
        ("left_shoulder", 0.28, 0.22),
        ("right_shoulder", 0.72, 0.22),
        ("left_elbow", 0.18, 0.38),
        ("right_elbow", 0.82, 0.38),
        ("left_wrist", 0.08, 0.50),
        ("right_wrist", 0.92, 0.50),
        ("left_hip", 0.36, 0.57),
        ("right_hip", 0.64, 0.57),
    ):
        joints[name] = {
            "x": x + width * dx,
            "y": 0.15 + height * dy,
            "score": 0.95,
            "status": "observed",
            "inFrame": True,
        }
    return {"box": {"x": x, "y": 0.15, "width": width, "height": height}, "joints": joints}


def load_tracker(name: str, source: str) -> types.ModuleType:
    module = types.ModuleType(name)
    sys.modules[name] = module
    exec(compile(source, TRACKING_PATH, "exec"), module.__dict__)
    return module


def replay(module: types.ModuleType, mode: str, scenario: str, reverse: bool) -> dict[str, Any]:
    if scenario == "minor-disturbance":
        width = 0.16
        frames = [(t, [0.20, 0.36]) for t in (0, 33, 66)] + [
            (82, [0.17, 0.33]),
            (232, [0.20, 0.36]),
        ]
    else:
        width = 0.10
        final = [0.37, 0.43] if scenario == "approach-stop" else [0.35, 0.45]
        frames = [(0, [0.30, 0.50]), (100, [0.37, 0.43]), (250, final)]
    tracker = module.Tracker(mode)
    expected = {}
    output_frames = []
    wrong = 0
    correct = 0
    ambiguous = 0
    for frame_index, (time_ms, positions) in enumerate(frames):
        order = [1, 0] if reverse ^ bool(frame_index % 2) else [0, 1]
        output = tracker.update([person(positions[i], width) for i in order], time_ms * 1_000_000)
        people = []
        for index, detection in zip(order, output, strict=True):
            if frame_index == 0:
                expected[index] = detection["trackId"]
            elif detection["trackId"] is not None:
                if detection["trackId"] in set(expected.values()) - {expected[index]}:
                    wrong += 1
                elif detection["trackId"] == expected[index]:
                    correct += 1
            ambiguous += detection["identity"] == "ambiguous"
            people.append({"subject": "AB"[index], **detection})
        output_frames.append({"timeMs": time_ms, "people": people})
    return {
        "mode": mode,
        "scenario": scenario,
        "reverseInitialOrder": reverse,
        "wrongInitialIdAssignments": wrong,
        "correctContinuations": correct,
        "ambiguousObservations": ambiguous,
        "frames": output_frames,
    }


def timing(module: types.ModuleType, mode: str, count: int, samples: int) -> dict[str, Any]:
    tracker = module.Tracker(mode)
    values = []
    for frame in range(samples + 20):
        people = [person(0.05 + index * 0.15 + frame * 0.0001, 0.08, 0.4) for index in range(count)]
        start = perf_counter_ns()
        tracker.update(people, frame * 33_000_000)
        elapsed = (perf_counter_ns() - start) / 1e6
        if frame >= 20:
            values.append(elapsed)
    values.sort()
    return {
        "mode": mode,
        "people": count,
        "samples": samples,
        "medianMs": round(median(values), 4),
        "p95Ms": round(values[int(0.95 * (samples - 1))], 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-ref", default=BASELINE)
    parser.add_argument("--samples", type=int, default=100)
    parser.add_argument(
        "--output", type=Path, default=ROOT / "reports/tracking-stability-results.json"
    )
    args = parser.parse_args()
    if not 20 <= args.samples <= 1000:
        parser.error("samples must be between 20 and 1000")
    baseline_sha = subprocess.check_output(
        ["git", "rev-parse", "--verify", f"{args.baseline_ref}^{{commit}}"], cwd=ROOT, text=True
    ).strip()
    baseline_source = subprocess.check_output(
        ["git", "show", f"{baseline_sha}:{TRACKING_PATH}"], cwd=ROOT, text=True, encoding="utf-8"
    )
    current_source = (ROOT / TRACKING_PATH).read_text(encoding="utf-8")
    result = {
        "method": "Synthetic canonical boxes/joints; serial tracker-only execution; no camera, inference or transport.",
        "python": platform.python_version(),
        "platform": platform.system(),
        "baselineCommit": baseline_sha,
        "versions": {},
    }
    for name, source in (("baseline", baseline_source), ("fixed", current_source)):
        module = load_tracker(f"tracking_stability_{name}", source)
        replays = [
            replay(module, mode, scenario, reverse)
            for mode in ("iou", "pose")
            for scenario in ("minor-disturbance", "approach-stop", "approach-reverse")
            for reverse in (False, True)
        ]
        result["versions"][name] = {
            "trackingSourceSha256": hashlib.sha256(source.encode()).hexdigest(),
            "wrongInitialIdAssignments": sum(item["wrongInitialIdAssignments"] for item in replays),
            "ambiguousObservations": sum(item["ambiguousObservations"] for item in replays),
            "replays": replays,
            "timing": [
                timing(module, mode, count, args.samples)
                for mode in ("iou", "pose")
                for count in (3, 6)
            ],
        }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "output": str(args.output),
                "wrongAssignments": {
                    key: value["wrongInitialIdAssignments"]
                    for key, value in result["versions"].items()
                },
            }
        )
    )


if __name__ == "__main__":
    main()
