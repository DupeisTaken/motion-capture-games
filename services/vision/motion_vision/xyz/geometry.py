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
    calibration_id: str
    image_size: tuple[int, int]
    transform_revision: str

    def __post_init__(self) -> None:
        for name, shape in (("K", (3, 3)), ("R", (3, 3)), ("t", (3,))):
            value = np.array(getattr(self, name), dtype=float, copy=True)
            if value.shape != shape or not np.isfinite(value).all():
                raise ValueError(f"{name} must be finite with shape {shape}")
            value.setflags(write=False)
            object.__setattr__(self, name, value)
        if not all(
            isinstance(x, str) and x.strip()
            for x in (self.camera_id, self.calibration_id, self.transform_revision)
        ):
            raise ValueError("camera and calibration IDs must be explicit")
        if (
            not isinstance(self.image_size, tuple)
            or len(self.image_size) != 2
            or any(type(x) is not int or x <= 0 for x in self.image_size)
        ):
            raise ValueError("image geometry must be two positive integer dimensions")
        if self.K[0, 0] <= 0 or self.K[1, 1] <= 0:
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
    try:
        _, _, vt = np.linalg.svd(equations)
    except np.linalg.LinAlgError:
        # A failed small SVD must not invalidate the rest of this bounded joint set.
        vt = np.full((len(equations), 4, 4), np.nan)
        for index, equation in enumerate(equations):
            try:
                vt[index] = np.linalg.svd(equation)[2]
            except np.linalg.LinAlgError:
                pass
    with np.errstate(divide="ignore", invalid="ignore"):
        points = vt[:, -1, :3] / vt[:, -1, 3:4]
    if method == "refined":
        # Fixed work, no temporal buffer. Refine geometric pixel error, not DLT algebraic error.
        for _ in range(5):
            # One degenerate joint must not disable refinement of its valid neighbors.
            usable = np.isfinite(points).all(1)
            usable &= np.isfinite(project(a, points)).all(1) & np.isfinite(project(b, points)).all(
                1
            )
            indices = np.flatnonzero(usable)
            if not len(indices):
                break
            current = points[indices]
            residual = np.concatenate(
                (project(a, current) - uv_a[indices], project(b, current) - uv_b[indices]), 1
            )
            jac = np.concatenate(
                (reprojection_jacobian(a, current), reprojection_jacobian(b, current)), 1
            )
            usable_jacobian = np.isfinite(jac).all(axis=(1, 2)) & np.isfinite(residual).all(1)
            indices = indices[usable_jacobian]
            current, jac, residual = (
                current[usable_jacobian],
                jac[usable_jacobian],
                residual[usable_jacobian],
            )
            if not len(indices):
                break
            hessian = np.einsum("nki,nkj->nij", jac, jac)
            scale = np.maximum(np.trace(hessian, axis1=1, axis2=2) / 3, 1)
            hessian += np.eye(3) * (scale * 1e-6)[:, None, None]
            gradient = np.einsum("nki,nk->ni", jac, residual)
            try:
                step = np.linalg.solve(hessian, gradient[..., None])[..., 0]
            except np.linalg.LinAlgError:
                step = np.full_like(gradient, np.nan)
                for index in range(len(indices)):
                    try:
                        step[index] = np.linalg.solve(hessian[index], gradient[index])
                    except np.linalg.LinAlgError:
                        pass
            candidate = current - step
            candidate_error = np.sum(
                np.concatenate(
                    (project(a, candidate) - uv_a[indices], project(b, candidate) - uv_b[indices]),
                    1,
                )
                ** 2,
                1,
            )
            improves = np.isfinite(candidate).all(1) & (candidate_error <= (residual**2).sum(1))
            points[indices[improves]] = candidate[improves]
    return np.asarray(points, dtype=float)
