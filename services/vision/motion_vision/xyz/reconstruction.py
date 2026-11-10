"""Camera-free boundary; no association, clock mapping, calibration or buffering.

These experiment types are separate from the single-view wire protocol.
"""

from dataclasses import dataclass
from typing import Any

import numpy as np

from .geometry import (
    METHODS,
    Array,
    Camera,
    Method,
    project,
    ray_geometry,
    reprojection_jacobian,
    triangulate,
)

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


def _integer(value: object, name: str) -> None:
    # bool and floating-point NaN must not bypass timestamp comparisons.
    if type(value) is not int or value < 0:
        raise ValueError(f"{name} must be a nonnegative integer")


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
        for name in ("max_pair_skew_ns", "max_time_uncertainty_ns", "max_age_ns"):
            _integer(getattr(self, name), name)
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
        if not all(not isinstance(x, bool) and np.isfinite(x) and x > 0 for x in scalars):
            raise ValueError("quality limits must be finite and positive")
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
    camera_track_id: str
    model_id: str
    transform_revision: str
    timestamp_kind: str
    undistorted: bool
    image_size: tuple[int, int]

    def __post_init__(self) -> None:
        if not isinstance(self.joint_names, tuple) or not 1 <= len(self.joint_names) <= len(JOINTS):
            raise ValueError("one to seventeen anatomical joint names required")
        if len(set(self.joint_names)) != len(self.joint_names) or any(
            n not in JOINTS for n in self.joint_names
        ):
            raise ValueError("joint names must be unique supported anatomical names")
        pixels = np.array(self.pixels, dtype=float, copy=True)
        if pixels.shape != (len(self.joint_names), 2) or np.isinf(pixels).any():
            raise ValueError(
                "pixels must match named joints; NaN denotes missing, infinity is invalid"
            )
        pixels.setflags(write=False)
        object.__setattr__(self, "pixels", pixels)
        for name in ("frame_id", "time_ns", "uncertainty_ns"):
            _integer(getattr(self, name), name)
        if (
            not isinstance(self.image_size, tuple)
            or len(self.image_size) != 2
            or any(type(x) is not int or x <= 0 for x in self.image_size)
        ):
            raise ValueError("positive integer image dimensions required")
        for name in (
            "camera_id",
            "calibration_id",
            "epoch",
            "clock_domain",
            "camera_track_id",
            "model_id",
            "transform_revision",
        ):
            value = getattr(self, name)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{name} must be explicit")
        if self.rig_track_id is not None and (
            not isinstance(self.rig_track_id, str) or not self.rig_track_id.strip()
        ):
            raise ValueError("rig track ID must be explicit or None")
        if any(
            type(x) is not bool
            for x in (self.time_verified, self.identity_confirmed, self.undistorted)
        ):
            raise ValueError("verification flags must be booleans")
        if self.timestamp_kind not in (
            "synthetic-exposure",
            "device-exposure",
            "host-read-completion",
        ):
            raise ValueError("unsupported timestamp provenance")


@dataclass(frozen=True)
class SourceProvenance:
    camera_id: str
    camera_track_id: str
    frame_id: int
    time_ns: int
    clock_domain: str
    uncertainty_ns: int
    time_verified: bool
    timestamp_kind: str
    calibration_id: str
    epoch: str
    model_id: str
    transform_revision: str
    image_size: tuple[int, int]
    undistorted: bool
    identity_confirmed: bool
    rig_track_id: str | None

    @classmethod
    def from_view(cls, view: View) -> "SourceProvenance":
        return cls(**{name: getattr(view, name) for name in cls.__dataclass_fields__})


@dataclass(frozen=True)
class Reconstruction:
    joint_names: tuple[str, ...]
    positions_m: Array
    reasons: tuple[str, ...]
    sources: tuple[SourceProvenance, SourceProvenance]
    calibration_id: str
    epoch: str
    clock_domain: str
    generated_at_ns: int
    rig_track_id: str | None
    method: Method

    @property
    def source_frame_ids(self) -> tuple[int, int]:
        return self.sources[0].frame_id, self.sources[1].frame_id

    @property
    def source_times_ns(self) -> tuple[int, int]:
        return self.sources[0].time_ns, self.sources[1].time_ns

    def hip_midpoint(self) -> Array | None:
        """Metric root exists only when both anatomical hips were accepted as observed."""
        indices = [
            self.joint_names.index(n) for n in ("left_hip", "right_hip") if n in self.joint_names
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
    _integer(now_ns, "now_ns")
    if method not in METHODS:
        raise ValueError("unknown reconstruction method")
    if any(not isinstance(x, str) or not x.strip() for x in (calibration_id, epoch, clock_domain)):
        raise ValueError("expected calibration, epoch and clock domain must be explicit")
    a, b = views
    ca, cb = cameras
    if ca.camera_id == cb.camera_id or (a.camera_id, b.camera_id) != (ca.camera_id, cb.camera_id):
        raise ValueError("two distinct camera IDs must match the calibration")
    names = tuple(n for n in JOINTS if n in a.joint_names or n in b.joint_names)
    reason = ""
    if any(x.calibration_id != calibration_id for x in (a, b, ca, cb)):
        reason = "calibration_mismatch"
    elif a.image_size != ca.image_size or b.image_size != cb.image_size:
        reason = "image_geometry_mismatch"
    elif (
        a.transform_revision != ca.transform_revision
        or b.transform_revision != cb.transform_revision
    ):
        reason = "transform_mismatch"
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
    elif (
        not a.time_verified
        or not b.time_verified
        or any(v.timestamp_kind == "host-read-completion" for v in views)
    ):
        reason = "unverified_exposure_time"
    elif a.uncertainty_ns + b.uncertainty_ns > gates.max_time_uncertainty_ns:
        reason = "time_uncertain"
    elif abs(a.time_ns - b.time_ns) + a.uncertainty_ns + b.uncertainty_ns > gates.max_pair_skew_ns:
        reason = "pair_skew"
    elif max(a.time_ns + a.uncertainty_ns, b.time_ns + b.uncertainty_ns) > now_ns:
        reason = "future_input"
    elif (
        now_ns - min(a.time_ns - a.uncertainty_ns, b.time_ns - b.uncertainty_ns) > gates.max_age_ns
    ):
        reason = "stale_input"

    positions = np.full((len(names), 3), np.nan)
    reasons = np.full(len(names), reason or "missing", dtype=object)
    if not reason:
        pixels = []
        for view in views:
            lookup = dict(zip(view.joint_names, view.pixels, strict=True))
            pixels.append(np.array([lookup.get(n, [np.nan, np.nan]) for n in names]))
        pa, pb = pixels
        finite_pixels = np.isfinite(pa).all(1) & np.isfinite(pb).all(1)
        in_frame = ((pa >= 0) & (pa < a.image_size)).all(1) & ((pb >= 0) & (pb < b.image_size)).all(
            1
        )
        reasons[finite_pixels & ~in_frame] = "outside_image"
        valid = finite_pixels & in_frame
        indices = np.flatnonzero(valid)
        if len(indices):
            ua, ub = pa[valid], pb[valid]
            with np.errstate(invalid="ignore", divide="ignore", over="ignore"):
                try:
                    points = triangulate(ca, cb, ua, ub, method)
                    _, angles, gap = ray_geometry(ca, cb, ua, ub)
                    reprojection = np.maximum(
                        np.linalg.norm(project(ca, points) - ua, axis=1),
                        np.linalg.norm(project(cb, points) - ub, axis=1),
                    )
                    linear_error = _linearized_error(ca, cb, a, b, points, angles, gates)
                except np.linalg.LinAlgError:
                    points = np.full((len(indices), 3), np.nan)
                    angles = gap = reprojection = linear_error = np.full(len(indices), np.nan)
            finite_points = np.isfinite(points).all(1)
            front = np.zeros(len(points), dtype=bool)
            front[finite_points] = (points[finite_points] @ ca.R[2] + ca.t[2] > 0) & (
                points[finite_points] @ cb.R[2] + cb.t[2] > 0
            )
            checks = [
                (finite_points, "degenerate"),
                (front, "behind_camera"),
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
    positions.setflags(write=False)
    return Reconstruction(
        names,
        positions,
        tuple(str(x) for x in reasons),
        (SourceProvenance.from_view(a), SourceProvenance.from_view(b)),
        calibration_id,
        epoch,
        clock_domain,
        now_ns,
        a.rig_track_id if not reason else None,
        method,
    )


def _linearized_error(
    ca: Camera, cb: Camera, a: View, b: View, points: Array, angles: Array, gates: Gates
) -> Array:
    error = np.full(len(points), np.inf)
    usable = (
        np.isfinite(points).all(1)
        & (np.abs(points @ ca.R[2] + ca.t[2]) > 1e-9)
        & (np.abs(points @ cb.R[2] + cb.t[2]) > 1e-9)
        & (angles >= gates.min_ray_angle_deg)
    )
    if usable.any():
        jac = np.concatenate(
            (reprojection_jacobian(ca, points[usable]), reprojection_jacobian(cb, points[usable])),
            axis=1,
        )
        singular = np.linalg.svd(jac, compute_uv=False)[:, -1]
        inverse = np.linalg.pinv(jac)
        # Timing perturbations amplify depth error; speed * skew alone misses the geometry.
        motion_gain = np.maximum(
            np.linalg.norm(inverse[:, :, :2] @ jac[:, :2, :], ord=2, axis=(1, 2)),
            np.linalg.norm(inverse[:, :, 2:] @ jac[:, 2:, :], ord=2, axis=(1, 2)),
        )
        timing_s = (abs(a.time_ns - b.time_ns) + a.uncertainty_ns + b.uncertainty_ns) / 1e9
        # Approximate radius, not a certified confidence interval or calibration bound.
        error[usable] = (
            2.8 * gates.assumed_pixel_sigma / singular
            + motion_gain * gates.motion_speed_bound_m_s * timing_s
        )
    return error
