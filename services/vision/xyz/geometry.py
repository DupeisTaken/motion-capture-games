"""Calibrated pinhole stereo, with inputs already undistorted into ideal pixels."""

from dataclasses import dataclass
from typing import Literal

import numpy as np
from numpy.typing import NDArray

Array = NDArray[np.float64]
Method = Literal["dlt", "midpoint", "refined"]
METHODS: tuple[Method, ...] = ("dlt", "midpoint", "refined")


@dataclass(frozen=True)
class Camera:
    camera_id: str
    K: Array
    R: Array
    t: Array

    def __post_init__(self) -> None:
        for name, shape in (("K", (3, 3)), ("R", (3, 3)), ("t", (3,))):
            value = np.array(getattr(self, name), dtype=float, copy=True)
            if value.shape != shape or not np.isfinite(value).all():
                raise ValueError(f"{name} must be finite with shape {shape}")
            value.setflags(write=False)
            object.__setattr__(self, name, value)
        if not self.camera_id or self.K[0, 0] <= 0 or self.K[1, 1] <= 0:
            raise ValueError("camera ID and positive focal lengths required")
        if not np.allclose(self.K[2], [0, 0, 1]) or abs(np.linalg.det(self.K)) < 1e-9:
            raise ValueError("invalid intrinsic matrix")
        if not np.allclose(self.R @ self.R.T, np.eye(3), atol=1e-7) or not np.isclose(
            np.linalg.det(self.R), 1.0
        ):
            raise ValueError("R must be a proper rotation")

    @property
    def projection(self) -> Array:
        return self.K @ np.column_stack((self.R, self.t))

    @property
    def center(self) -> Array:
        return -self.R.T @ self.t


def project(camera: Camera, points: Array) -> Array:
    homogeneous = points @ camera.projection[:, :3].T + camera.projection[:, 3]
    with np.errstate(divide="ignore", invalid="ignore"):
        return homogeneous[:, :2] / homogeneous[:, 2:3]


def rays(camera: Camera, pixels: Array) -> Array:
    directions = np.column_stack((pixels, np.ones(len(pixels)))) @ np.linalg.inv(camera.K).T
    directions = directions @ camera.R
    return np.asarray(directions / np.linalg.norm(directions, axis=1, keepdims=True), dtype=float)


def ray_geometry(a: Camera, b: Camera, uv_a: Array, uv_b: Array) -> tuple[Array, Array, Array]:
    da, db = rays(a, uv_a), rays(b, uv_b)
    cosine = np.einsum("ij,ij->i", da, db)
    separation = b.center - a.center
    q = da @ separation
    r = db @ separation
    denominator = 1.0 - cosine**2
    with np.errstate(divide="ignore", invalid="ignore"):
        ta = (q - cosine * r) / denominator
        tb = (cosine * q - r) / denominator
    pa, pb = a.center + ta[:, None] * da, b.center + tb[:, None] * db
    angle = np.degrees(np.arccos(np.clip(np.abs(cosine), 0, 1)))
    return (pa + pb) / 2, angle, np.linalg.norm(pa - pb, axis=1)


def reprojection_jacobian(camera: Camera, points: Array) -> Array:
    p = camera.projection
    h = points @ p[:, :3].T + p[:, 3]
    with np.errstate(divide="ignore", invalid="ignore"):
        return (p[None, :2, :3] * h[:, 2, None, None] - h[:, :2, None] * p[None, 2:3, :3]) / h[
            :, 2, None, None
        ] ** 2


def triangulate(a: Camera, b: Camera, uv_a: Array, uv_b: Array, method: Method) -> Array:
    if uv_a.ndim != 2 or uv_a.shape[1] != 2 or uv_a.shape != uv_b.shape:
        raise ValueError("corresponding pixels must have matching N x 2 shape")
    if not np.isfinite(uv_a).all() or not np.isfinite(uv_b).all():
        raise ValueError("triangulate accepts finite pixels only")
    if method not in METHODS:
        raise ValueError(f"unknown method {method}")
    if not len(uv_a):
        return np.empty((0, 3))
    if method == "midpoint":
        return ray_geometry(a, b, uv_a, uv_b)[0]
    pa, pb = a.projection, b.projection
    equations = np.stack(
        (
            uv_a[:, 0, None] * pa[2] - pa[0],
            uv_a[:, 1, None] * pa[2] - pa[1],
            uv_b[:, 0, None] * pb[2] - pb[0],
            uv_b[:, 1, None] * pb[2] - pb[1],
        ),
        axis=1,
    )
    _, _, vt = np.linalg.svd(equations)
    with np.errstate(divide="ignore", invalid="ignore"):
        points = vt[:, -1, :3] / vt[:, -1, 3:4]
    if (
        method == "refined"
        and np.isfinite(points).all()
        and np.isfinite(project(a, points)).all()
        and np.isfinite(project(b, points)).all()
    ):
        # Fixed work, no temporal buffer. Refine geometric pixel error, not DLT algebraic error.
        for _ in range(5):
            residual = np.concatenate((project(a, points) - uv_a, project(b, points) - uv_b), 1)
            jac = np.concatenate(
                (reprojection_jacobian(a, points), reprojection_jacobian(b, points)), 1
            )
            hessian = np.einsum("nki,nkj->nij", jac, jac) + np.eye(3) * 1e-6
            gradient = np.einsum("nki,nk->ni", jac, residual)
            step = np.linalg.solve(hessian, gradient[..., None])[..., 0]
            candidate = points - step
            candidate_error = np.sum(
                np.concatenate((project(a, candidate) - uv_a, project(b, candidate) - uv_b), 1)
                ** 2,
                1,
            )
            improves = np.isfinite(candidate).all(1) & (candidate_error <= (residual**2).sum(1))
            points[improves] = candidate[improves]
    return np.asarray(points, dtype=float)
