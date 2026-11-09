"""Fail-closed experiment boundary for already associated, undistorted joint pairs."""

from dataclasses import dataclass
from typing import Any

import numpy as np

from .geometry import (
    Array,
    Camera,
    Method,
    project,
    ray_geometry,
    reprojection_jacobian,
    triangulate,
)


@dataclass(frozen=True)
class Gates:
    max_pair_skew_ns: int
    max_time_uncertainty_ns: int
    max_age_ns: int
    max_reprojection_px: float
    min_ray_angle_deg: float
    max_ray_gap_m: float
    max_linearized_error_m: float
    assumed_pixel_sigma: float
    motion_speed_bound_m_s: float
    min_world_m: tuple[float, float, float]
    max_world_m: tuple[float, float, float]

    @classmethod
    def from_dict(cls, values: dict[str, Any]) -> "Gates":
        return cls(**values)

    def __post_init__(self) -> None:
        scalars = [
            self.max_pair_skew_ns,
            self.max_time_uncertainty_ns,
            self.max_age_ns,
            self.max_reprojection_px,
            self.min_ray_angle_deg,
            self.max_ray_gap_m,
            self.max_linearized_error_m,
            self.assumed_pixel_sigma,
            self.motion_speed_bound_m_s,
        ]
        if not all(np.isfinite(x) and x > 0 for x in scalars):
            raise ValueError("all quality limits must be finite and positive")
        if self.min_ray_angle_deg >= 90:
            raise ValueError("minimum ray angle must be below 90 degrees")
        lo, hi = np.asarray(self.min_world_m), np.asarray(self.max_world_m)
        if lo.shape != (3,) or hi.shape != (3,) or not np.isfinite([lo, hi]).all():
            raise ValueError("world bounds must be finite XYZ triples")
        if not (lo < hi).all():
            raise ValueError("minimum world bounds must precede maximum")


@dataclass(frozen=True)
class View:
    camera_id: str
    frame_id: int
    calibration_id: str
    epoch: str
    clock_domain: str
    time_ns: int
    uncertainty_ns: int
    time_verified: bool
    rig_track_id: str | None
    identity_confirmed: bool
    joint_names: tuple[str, ...]
    pixels: Array
    undistorted: bool = True
    image_size: tuple[int, int] = (1920, 1080)

    def __post_init__(self) -> None:
        if self.pixels.shape != (len(self.joint_names), 2):
            raise ValueError("pixels must match the named joint count")
        if len(set(self.joint_names)) != len(self.joint_names):
            raise ValueError("joint names must be unique")
        if self.frame_id < 0 or self.time_ns < 0 or self.uncertainty_ns < 0:
            raise ValueError("frame IDs and time fields must be nonnegative")
        if len(self.image_size) != 2 or min(self.image_size) <= 0:
            raise ValueError("positive image dimensions required")
        if not all((self.camera_id, self.calibration_id, self.epoch, self.clock_domain)):
            raise ValueError("source provenance must be explicit")


@dataclass(frozen=True)
class Reconstruction:
    joint_names: tuple[str, ...]
    positions_m: Array
    reasons: tuple[str, ...]
    source_frame_ids: tuple[int, int]
    source_times_ns: tuple[int, int]
    calibration_id: str
    epoch: str
    rig_track_id: str | None

    def hip_midpoint(self) -> Array | None:
        """Root XYZ is defined as the hip midpoint, never as a floor-projected hand."""
        indices = [
            self.joint_names.index(name)
            for name in ("left_hip", "right_hip")
            if name in self.joint_names
        ]
        if len(indices) != 2 or any(self.reasons[i] != "observed" for i in indices):
            return None
        return np.asarray(self.positions_m[indices].mean(axis=0), dtype=float)


def reconstruct(
    cameras: tuple[Camera, Camera],
    views: tuple[View, View],
    *,
    calibration_id: str,
    epoch: str,
    clock_domain: str,
    now_ns: int,
    gates: Gates,
    method: Method = "dlt",
) -> Reconstruction:
    a, b = views
    ca, cb = cameras
    if a.joint_names != b.joint_names:
        raise ValueError("views must have the same ordered anatomical joint names")
    if ca.camera_id == cb.camera_id or (a.camera_id, b.camera_id) != (ca.camera_id, cb.camera_id):
        raise ValueError("two distinct camera IDs must match the calibration")
    reason = ""
    if a.calibration_id != calibration_id or b.calibration_id != calibration_id:
        reason = "calibration_mismatch"
    elif a.epoch != epoch or b.epoch != epoch:
        reason = "epoch_mismatch"
    elif a.clock_domain != clock_domain or b.clock_domain != clock_domain:
        reason = "clock_mismatch"
    elif not a.undistorted or not b.undistorted:
        reason = "distorted_input"
    elif not (
        a.identity_confirmed
        and b.identity_confirmed
        and a.rig_track_id
        and a.rig_track_id == b.rig_track_id
    ):
        reason = "identity_uncertain"
    elif not a.time_verified or not b.time_verified:
        reason = "unverified_exposure_time"
    elif a.uncertainty_ns + b.uncertainty_ns > gates.max_time_uncertainty_ns:
        reason = "time_uncertain"
    elif abs(a.time_ns - b.time_ns) > gates.max_pair_skew_ns:
        reason = "pair_skew"
    elif max(a.time_ns, b.time_ns) > now_ns:
        reason = "future_input"
    elif now_ns - min(a.time_ns, b.time_ns) > gates.max_age_ns:
        reason = "stale_input"

    n = len(a.joint_names)
    positions = np.full((n, 3), np.nan)
    reasons = np.full(n, reason or "missing", dtype=object)
    if not reason:
        finite_pixels = np.isfinite(a.pixels).all(1) & np.isfinite(b.pixels).all(1)
        in_frame = ((a.pixels >= 0) & (a.pixels < a.image_size)).all(1) & (
            (b.pixels >= 0) & (b.pixels < b.image_size)
        ).all(1)
        reasons[finite_pixels & ~in_frame] = "outside_image"
        valid = finite_pixels & in_frame
        indices = np.flatnonzero(valid)
        if len(indices):
            ua, ub = a.pixels[valid], b.pixels[valid]
            # Geometry is vectorized over this pair, never queued or temporally interpolated.
            with np.errstate(invalid="ignore", divide="ignore"):
                points = triangulate(ca, cb, ua, ub, method)
                _, angles, gap = ray_geometry(ca, cb, ua, ub)
                reprojection = np.maximum(
                    np.linalg.norm(project(ca, points) - ua, axis=1),
                    np.linalg.norm(project(cb, points) - ub, axis=1),
                )
            finite = np.isfinite(points).all(1)
            linear_error = np.full(len(points), np.inf)
            linearizable = (
                finite
                & (np.abs(points @ ca.R[2] + ca.t[2]) > 1e-9)
                & (np.abs(points @ cb.R[2] + cb.t[2]) > 1e-9)
                & (angles >= gates.min_ray_angle_deg)
            )
            if linearizable.any():
                jac = np.concatenate(
                    (
                        reprojection_jacobian(ca, points[linearizable]),
                        reprojection_jacobian(cb, points[linearizable]),
                    ),
                    axis=1,
                )
                singular = np.linalg.svd(jac, compute_uv=False)[:, -1]
                inverse = np.linalg.pinv(jac)
                # Asynchrony can amplify depth error. Propagate a moving point in either view
                # through the stereo Jacobian instead of just adding speed * skew in world space.
                motion_gain = np.maximum(
                    np.linalg.norm(inverse[:, :, :2] @ jac[:, :2, :], ord=2, axis=(1, 2)),
                    np.linalg.norm(inverse[:, :, 2:] @ jac[:, 2:, :], ord=2, axis=(1, 2)),
                )
                timing_s = (abs(a.time_ns - b.time_ns) + a.uncertainty_ns + b.uncertainty_ns) / 1e9
                with np.errstate(divide="ignore"):
                    # Approximate Gaussian 3D radius + motion bound; excludes calibration bias.
                    linear_error[linearizable] = (
                        2.8 * gates.assumed_pixel_sigma / singular
                        + motion_gain * gates.motion_speed_bound_m_s * timing_s
                    )
            checks = [
                (finite, "degenerate"),
                (
                    (points @ ca.R[2] + ca.t[2] > 0) & (points @ cb.R[2] + cb.t[2] > 0),
                    "behind_camera",
                ),
                (angles >= gates.min_ray_angle_deg, "weak_geometry"),
                (gap <= gates.max_ray_gap_m, "ray_gap"),
                (reprojection <= gates.max_reprojection_px, "reprojection"),
                (linear_error <= gates.max_linearized_error_m, "estimated_error"),
                (
                    ((points >= gates.min_world_m) & (points <= gates.max_world_m)).all(1),
                    "outside_volume",
                ),
            ]
            accepted = np.ones(len(points), dtype=bool)
            reasons[indices] = "observed"
            for passes, failure in checks:
                reasons[indices[accepted & ~passes]] = failure
                accepted &= passes
            positions[indices[accepted]] = points[accepted]
    return Reconstruction(
        a.joint_names,
        positions,
        tuple(str(x) for x in reasons),
        (a.frame_id, b.frame_id),
        (a.time_ns, b.time_ns),
        calibration_id,
        epoch,
        a.rig_track_id if not reason else None,
    )
