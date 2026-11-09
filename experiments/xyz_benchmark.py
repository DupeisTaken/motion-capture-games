"""Deterministic camera-free stereo comparison and stage-only timing harness."""

import argparse
import json
import os
import platform
import sys
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Set before importing NumPy; serialize small-matrix BLAS work on the developer machine.
for variable in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"):
    os.environ[variable] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services/vision"))
import numpy as np  # noqa: E402
from xyz.geometry import METHODS, Array, Camera, Method, project, triangulate  # noqa: E402
from xyz.reconstruction import Gates, View, reconstruct  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
JOINTS = (
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
)
OFFSETS = np.array(
    [
        (0, 0.77, 0),
        (-0.04, 0.8, 0),
        (0.04, 0.8, 0),
        (-0.09, 0.76, 0),
        (0.09, 0.76, 0),
        (-0.2, 0.5, 0),
        (0.2, 0.5, 0),
        (-0.38, 0.28, 0),
        (0.38, 0.28, 0),
        (-0.5, 0.2, 0),
        (0.5, 0.2, 0),
        (-0.13, 0, 0),
        (0.13, 0, 0),
        (-0.14, -0.45, 0),
        (0.14, -0.45, 0),
        (-0.15, -0.9, 0),
        (0.15, -0.9, 0),
    ]
)


@dataclass(frozen=True)
class Scenario:
    name: str
    sigma_px: float = 1.0
    baseline_m: float = 2.0
    skew_ms: float = 0.0
    uncertainty_ms: float = 0.5
    dropout: float = 0.0
    outliers: float = 0.0
    yaw_error_deg: float = 0.0
    scale_error: float = 0.0
    unknown_distortion: bool = False
    identity_confirmed: bool = True
    swapped: bool = False
    timestamp_verified: bool = True
    nominal: bool = False


SCENARIOS = (
    Scenario("ideal", sigma_px=0, nominal=True),
    Scenario("nominal_1px", nominal=True),
    Scenario("noise_3px", sigma_px=3),
    Scenario("short_baseline_1_2m", baseline_m=1.2),
    Scenario("wide_baseline_2_5m", baseline_m=2.5),
    Scenario("narrow_baseline_6cm", baseline_m=0.06),
    Scenario("skew_4ms", skew_ms=4),
    Scenario("skew_16ms", skew_ms=16),
    Scenario("uncertainty_10ms", uncertainty_ms=10),
    Scenario("host_arrival_only", timestamp_verified=False),
    Scenario("missing_20percent", dropout=0.2),
    Scenario("outliers_10percent", outliers=0.1),
    Scenario("calibration_yaw_1deg", yaw_error_deg=1),
    Scenario("calibration_scale_5percent", scale_error=0.05),
    Scenario("unmodeled_distortion", unknown_distortion=True),
    Scenario("flagged_identity_swap", swapped=True, identity_confirmed=False),
    Scenario("unflagged_identity_swap", swapped=True),
)


def cameras(
    baseline: float = 2.0, yaw_error: float = 0, scale_error: float = 0
) -> tuple[Camera, Camera]:
    # Synthetic stand height comes from the user. Baseline/intrinsics are illustrative only.
    intrinsic = np.array([[1000.0, 0, 960], [0, 1000.0, 540], [0, 0, 1]])
    # Cameras look into +rig Z. Camera X points opposite rig X to keep a proper rotation.
    rotation = np.diag([-1.0, -1.0, 1.0])
    result = []
    for i, x in enumerate((-baseline / 2, baseline / 2)):
        r = rotation.copy()
        if i == 1:
            angle = np.radians(yaw_error)
            r = (
                np.array(
                    [
                        [np.cos(angle), 0, np.sin(angle)],
                        [0, 1, 0],
                        [-np.sin(angle), 0, np.cos(angle)],
                    ]
                )
                @ r
            )
        center = np.array([x * (1 + scale_error), 1.4, 0])
        result.append(Camera(f"camera-{i}", intrinsic, r, -r @ center))
    return result[0], result[1]


def trajectory(t: float, person: int) -> Array:
    root = np.array(
        [0.75 * np.sin(0.7 * t + person * 2.1), 1.0, 3.5 + 1.3 * np.sin(0.4 * t + person * 1.7)]
    )
    points = OFFSETS + root
    for joint, phase in ((9, 0), (10, np.pi)):
        points[joint, 1] += 0.3 * np.sin(4 * t + phase)
        points[joint, 2] += 0.3 * np.cos(4 * t + phase)
    return np.asarray(points, dtype=float)


def make_views(
    truth: tuple[Camera, Camera],
    scenario: Scenario,
    frame: int,
    person: int,
    rng: np.random.Generator,
) -> tuple[tuple[View, View], Array]:
    t = frame / 60
    target = trajectory(t, person)
    views = []
    for i, camera in enumerate(truth):
        source_t = t + (scenario.skew_ms / 1000 if i else 0)
        other = (person + 1) % 3 if scenario.swapped and i else person
        uv = project(camera, trajectory(source_t, other))
        if scenario.unknown_distortion:
            norm = (uv - camera.K[:2, 2]) / np.diag(camera.K)[:2]
            uv += (norm * (0.15 * (norm**2).sum(1))[:, None]) * np.diag(camera.K)[:2]
        uv += rng.normal(0, scenario.sigma_px, uv.shape)
        outliers = rng.random(len(JOINTS)) < scenario.outliers
        uv[outliers] += rng.normal(0, 45, (int(outliers.sum()), 2))
        uv[rng.random(len(JOINTS)) < scenario.dropout] = np.nan
        views.append(
            View(
                camera.camera_id,
                frame,
                "synthetic-v1",
                "sync-1",
                "mapped-host",
                1_000_000_000 + int(source_t * 1e9),
                int(scenario.uncertainty_ms * 1e6),
                scenario.timestamp_verified,
                f"person-{person}",
                scenario.identity_confirmed,
                JOINTS,
                uv,
            )
        )
    return (views[0], views[1]), target


def percentiles(values: list[float] | Array) -> dict[str, float | None]:
    if not len(values):
        return {"p50": None, "p95": None, "p99": None}
    return dict(
        zip(
            ("p50", "p95", "p99"),
            (float(v) for v in np.percentile(values, [50, 95, 99])),
            strict=True,
        )
    )


def evaluate(scenario: Scenario, method: Method, config: dict[str, Any]) -> dict[str, Any]:
    rng = np.random.default_rng(config["seed"])
    truth = cameras(scenario.baseline_m)
    estimated = cameras(scenario.baseline_m, scenario.yaw_error_deg, scenario.scale_error)
    gates = Gates.from_dict(config["gates"])
    errors: list[float] = []
    raw_errors: list[float] = []
    root_errors: list[float] = []
    wrist_errors: list[float] = []
    reasons: Counter[str] = Counter()
    available = accepted = unsafe = roots = wrists = 0
    total = config["frames"] * 3 * len(JOINTS)
    for frame in range(config["frames"]):
        for person in range(3):
            views, target = make_views(truth, scenario, frame, person, rng)
            valid = np.isfinite(views[0].pixels).all(1) & np.isfinite(views[1].pixels).all(1)
            available += int(valid.sum())
            raw = triangulate(*estimated, views[0].pixels[valid], views[1].pixels[valid], method)
            raw_errors.extend(np.linalg.norm(raw - target[valid], axis=1).tolist())
            result = reconstruct(
                estimated,
                views,
                calibration_id="synthetic-v1",
                epoch="sync-1",
                clock_domain="mapped-host",
                now_ns=max(v.time_ns for v in views) + 10_000_000,
                gates=gates,
                method=method,
            )
            reasons.update(result.reasons)
            ok = np.asarray(np.isfinite(result.positions_m).all(axis=1), dtype=np.bool_)
            distance = np.linalg.norm(result.positions_m - target, axis=1)
            errors.extend(distance[ok].tolist())
            accepted += int(ok.sum())
            # Count spatially unsafe joints even when identity was misdeclared.
            tolerance = np.full(len(JOINTS), config["targets"]["torso_p95_m"])
            tolerance[[9, 10]] = config["targets"]["wrist_p95_m"]
            unsafe += int((ok & (distance > tolerance)).sum())
            for index in (9, 10):
                if ok[index]:
                    wrist_errors.append(float(distance[index]))
                    wrists += 1
            root = result.hip_midpoint()
            if root is not None:
                root_errors.append(float(np.linalg.norm(root - target[[11, 12]].mean(0))))
                roots += 1
    targets = config["targets"]
    root_stats, wrist_stats = percentiles(root_errors), percentiles(wrist_errors)
    root_coverage = roots / (config["frames"] * 3)
    wrist_coverage = wrists / (config["frames"] * 6)
    passes = (
        root_stats["p95"] is not None
        and wrist_stats["p95"] is not None
        and root_stats["p95"] <= targets["torso_p95_m"]
        and wrist_stats["p95"] <= targets["wrist_p95_m"]
        and min(root_coverage, wrist_coverage) >= targets["minimum_nominal_coverage"]
    )
    return {
        "scenario": scenario.name,
        "method": method,
        "nominal": scenario.nominal,
        "total_joints": total,
        "available_pairs": available,
        "accepted_joints": accepted,
        "coverage": accepted / total,
        "root_coverage": root_coverage,
        "wrist_coverage": wrist_coverage,
        "unsafe_accepted_joints": unsafe,
        "wrong_identity_accepted_joints": accepted if scenario.swapped else 0,
        "raw_error_m": percentiles(raw_errors),
        "accepted_error_m": percentiles(errors),
        "root_error_m": root_stats,
        "wrist_error_m": wrist_stats,
        "provisional_spatial_pass": bool(passes),
        "reasons": dict(reasons),
    }


def timing(method: Method, players: int, config: dict[str, Any]) -> dict[str, Any]:
    rig = cameras()
    scenario = SCENARIOS[1]
    rng = np.random.default_rng(config["seed"])
    frames = [
        [make_views(rig, scenario, frame, p, rng)[0] for p in range(players)] for frame in range(32)
    ]
    gates = Gates.from_dict(config["gates"])
    samples = []
    trial_stats = []
    for _ in range(config["timing_trials"]):
        trial = []
        for i in range(config["warmup"] + config["timing_repetitions"]):
            batch = frames[i % len(frames)]
            start = time.perf_counter_ns()
            for views in batch:
                reconstruct(
                    rig,
                    views,
                    calibration_id="synthetic-v1",
                    epoch="sync-1",
                    clock_domain="mapped-host",
                    now_ns=views[0].time_ns + 10_000_000,
                    gates=gates,
                    method=method,
                )
            elapsed_ms = (time.perf_counter_ns() - start) / 1e6
            if i >= config["warmup"]:
                trial.append(elapsed_ms)
        trial_stats.append(percentiles(trial))
        samples.extend(trial)
    stats = percentiles(samples)
    return {
        "method": method,
        "players": players,
        "joints_per_player": len(JOINTS),
        "samples": len(samples),
        "warmup": config["warmup"],
        "latency_ms": stats,
        "trials": trial_stats,
        "duration_s": sum(samples) / 1000,
        "provisional_stage_pass": stats["p95"] is not None
        and stats["p95"] < config["targets"]["reconstruction_p95_ms"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=ROOT / "configs/xyz-experiment.json")
    parser.add_argument("--output", type=Path, default=ROOT / "reports/xyz-results.json")
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    if config["version"] != 1 or config["frames"] < 1 or config["timing_repetitions"] < 1:
        parser.error("unsupported configuration version or nonpositive sample count")
    started = time.perf_counter()
    accuracy = []
    for scenario in SCENARIOS:
        for method in METHODS:
            accuracy.append(evaluate(scenario, method, config))
        print(f"evaluated {scenario.name}", flush=True)
    timings = [timing(method, players, config) for players in (1, 3) for method in METHODS]
    eligible = [
        method
        for method in METHODS
        if all(
            r["provisional_spatial_pass"]
            for r in accuracy
            if r["method"] == method and r["nominal"]
        )
        and all(r["provisional_stage_pass"] for r in timings if r["method"] == method)
    ]
    # Smallest worst-workload stage p95, only among methods that pass every nominal gate.
    selected = min(
        eligible,
        key=lambda m: max(r["latency_ms"]["p95"] for r in timings if r["method"] == m),
        default=None,
    )
    result = {
        "schema_version": 1,
        "evidence": "synthetic-only; hardware certification pending",
        "config": config,
        "environment": {
            "os": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "python": platform.python_version(),
            "numpy": np.__version__,
            "blas_threads": 1,
        },
        "synthetic_capture": {
            "image_size": [1920, 1080],
            "focal_px": 1000,
            "stand_height_m": 1.4,
            "reference_baseline_m": 2.0,
            "fps": 60,
            "note": "Illustrative geometry, not a 4K device mode",
        },
        "experiment_duration_s": time.perf_counter() - started,
        "accuracy": accuracy,
        "timing": timings,
        "selected_candidate": selected,
        "hardware_gate": "NOT RUN: no cameras connected or calibrated",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    print(f"Synthetic candidate: {selected}; results: {args.output}")


if __name__ == "__main__":
    main()
