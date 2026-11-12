"""Manual planar calibration; held-out lengths never participate in the fit.

Image coordinates are normalized to the same fixed image geometry for all clicks.
The caller owns capture/calibration revisions and invalidation after camera movement.
"""

import math
from typing import Any

import cv2
import numpy as np
from numpy.typing import NDArray

Array = NDArray[np.float64]
CORNER_NAMES = ("nearLeft", "nearRight", "farRight", "farLeft")
MIN_IMAGE_AREA = 0.02
MAX_ABSOLUTE_ERROR_M = 0.10
MAX_RELATIVE_ERROR = 0.05
MIN_REFERENCE_AXIS_COMPONENT = 0.5
MIN_REFERENCE_DIRECTION_SIN = 0.5


def _number(value: Any, label: str, minimum: float, maximum: float) -> float:
    if type(value) not in (int, float):
        raise ValueError(f"{label} must be a finite number in {minimum}..{maximum}")
    try:
        result = float(value)
    except OverflowError as exc:
        raise ValueError(f"{label} must be finite and bounded") from exc
    if not math.isfinite(result) or not minimum <= result <= maximum:
        raise ValueError(f"{label} must be a finite number in {minimum}..{maximum}")
    return result


def _point(value: Any, label: str) -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise ValueError(f"{label} must contain two normalized image coordinates [u, v]")
    return [_number(coordinate, label, 0, 1) for coordinate in value]


def _cross(a: Array, b: Array) -> Array:
    return a[..., 0] * b[..., 1] - a[..., 1] * b[..., 0]


def _map(homography: Array, points: Array) -> Array:
    homogeneous = np.column_stack((points, np.ones(len(points)))) @ homography.T
    if np.any(np.abs(homogeneous[:, 2]) < 1e-9):
        raise ValueError("Floor geometry approaches a projective horizon; choose a clearer view")
    result = homogeneous[:, :2] / homogeneous[:, 2:3]
    if not np.isfinite(result).all():
        raise ValueError("Floor geometry produced a nonfinite mapping; recheck corner clicks")
    return result


def fit_floor_calibration(payload: dict[str, Any]) -> dict[str, Any]:
    """Fit four named floor corners and independently screen a moved reference.

    Payload: widthM/depthM (5..10), imageCorners ({name: [u,v]}), and reference
    ({lengthM: 0.2..2, placements: [{name, endpoints: [[u,v],[u,v]]}, ...]}).
    At least three separated placements must span both floor dimensions and check
    both floor axes with meaningfully different reference directions. Rejection
    screens are provisional engineering choices, not physical accuracy guarantees.
    """
    if not isinstance(payload, dict):
        raise ValueError("Calibration must be an object containing floor corners and reference")
    width = _number(payload.get("widthM"), "widthM", 5, 10)
    depth = _number(payload.get("depthM"), "depthM", 5, 10)
    corners = payload.get("imageCorners")
    if not isinstance(corners, dict) or set(corners) != set(CORNER_NAMES):
        raise ValueError("imageCorners must name exactly nearLeft, nearRight, farRight, farLeft")
    image = np.asarray([_point(corners[name], name) for name in CORNER_NAMES], dtype=float)
    edges = np.roll(image, -1, axis=0) - image
    turns = _cross(edges, np.roll(edges, -1, axis=0))
    if not (np.all(turns > 1e-4) or np.all(turns < -1e-4)):
        raise ValueError("Floor corner order must form a convex, nondegenerate perimeter")
    area = float(abs(np.sum(_cross(image, np.roll(image, -1, axis=0)))) / 2)
    if area < MIN_IMAGE_AREA or np.any(np.linalg.norm(edges, axis=1) < 0.01):
        raise ValueError("Floor region is too small in the image; show the full measured rectangle")

    floor = np.asarray([[0, 0], [width, 0], [width, depth], [0, depth]], dtype=float)
    # Only floor corners enter this fit: fitting the reference would invalidate its check.
    try:
        raw_homography, _ = cv2.findHomography(image, floor, method=0)
    except cv2.error as exc:
        raise ValueError(
            "Cannot fit floor corners; recheck their order and image coverage"
        ) from exc
    if raw_homography is None:
        raise ValueError("Cannot fit floor corners; choose a nondegenerate view")
    homography = np.asarray(raw_homography, dtype=float)
    if not np.isfinite(homography).all() or np.linalg.cond(homography) > 1e8:
        raise ValueError("Floor mapping is ill-conditioned; choose a clearer view")
    corner_errors = np.linalg.norm(_map(homography, image) - floor, axis=1)
    if float(corner_errors.max()) > 1e-4:
        raise ValueError("Floor corner fit is unstable; recheck corner geometry")

    reference = payload.get("reference")
    if not isinstance(reference, dict):
        raise ValueError("reference must contain an independently measured length and placements")
    length = _number(reference.get("lengthM"), "reference.lengthM", 0.2, 2)
    placements = reference.get("placements")
    if not isinstance(placements, list) or not 3 <= len(placements) <= 32:
        raise ValueError(
            "Move the reference to 3..32 named positions across near, middle and far floor"
        )
    tolerance = min(MAX_ABSOLUTE_ERROR_M, MAX_RELATIVE_ERROR * length)
    names: set[str] = set()
    centers: list[Array] = []
    measurements: list[dict[str, Any]] = []
    errors: list[float] = []
    displacements: list[Array] = []
    for index, placement in enumerate(placements):
        label = f"reference.placements[{index}]"
        if not isinstance(placement, dict):
            raise ValueError(f"{label} must contain a name and two endpoints")
        name = placement.get("name")
        if not isinstance(name, str) or not name.strip() or len(name) > 80:
            raise ValueError(f"{label}.name must be a nonempty name of at most 80 characters")
        name = name.strip()
        if name in names:
            raise ValueError("Reference placement names must be distinct")
        names.add(name)
        endpoints = placement.get("endpoints")
        if not isinstance(endpoints, (list, tuple)) or len(endpoints) != 2:
            raise ValueError(f"{label}.endpoints must contain two normalized floor-contact points")
        points = np.asarray([_point(point, label) for point in endpoints], dtype=float)
        if float(np.linalg.norm(points[1] - points[0])) < 0.005:
            raise ValueError(f"Reference at {name} is too small in the image; use a clearer view")
        # Test containment before mapping; extrapolation cannot validate an unseen floor region.
        sides = _cross(edges[None, :, :], points[:, None, :] - image[None, :, :])
        winding = 1 if turns[0] > 0 else -1
        if np.any(sides * winding < -1e-9):
            raise ValueError(
                f"Reference endpoints at {name} must lie inside the labelled floor region"
            )
        mapped = _map(homography, points)
        measured = float(np.linalg.norm(mapped[1] - mapped[0]))
        error = abs(measured - length)
        if error > tolerance + 1e-8:
            raise ValueError(
                f"Reference at {name} disagrees by {error:.3f} m; maximum is {tolerance:.3f} m "
                "(both 0.10 m and 5%). Recheck clicks, measured lengths and lens distortion"
            )
        center = mapped.mean(axis=0)
        if any(
            float(np.linalg.norm(center - previous)) < min(width, depth) * 0.15
            for previous in centers
        ):
            raise ValueError(
                "Reference positions must be separated by at least 15% of the shorter floor side"
            )
        centers.append(center)
        errors.append(error)
        displacements.append(mapped[1] - mapped[0])
        measurements.append(
            {
                "name": name,
                "floorEndpointsM": mapped.tolist(),
                "centerM": center.tolist(),
                "measuredLengthM": measured,
                "errorM": error,
                "relativeError": error / length,
            }
        )
    extent = np.ptp(np.asarray(centers), axis=0)
    if extent[0] < width * 0.4 - 1e-8 or extent[1] < depth * 0.4 - 1e-8:
        raise ValueError(
            "Spread reference positions across at least 40% of both floor width and depth"
        )
    # Separated centers alone cannot test depth scale if every ruler points along X.
    # Diagonal parallel rulers also leave an orthogonal scale combination unchecked.
    vectors = np.asarray(displacements)
    axis_coverage = np.max(np.abs(vectors), axis=0) / length
    directions = vectors / np.linalg.norm(vectors, axis=1, keepdims=True)
    direction_separation = np.abs(_cross(directions[:, None, :], directions[None, :, :]))
    if (
        np.any(axis_coverage < MIN_REFERENCE_AXIS_COMPONENT - 1e-8)
        or float(direction_separation.max()) < MIN_REFERENCE_DIRECTION_SIN - 1e-8
    ):
        raise ValueError(
            "Rotate the reference across floor directions: near along width, middle diagonally, "
            "far along depth. Check both axes and use directions at least 30 degrees apart"
        )
    return {
        "schemaVersion": "floor-calibration/v1",
        "scope": "floor-only",
        "homography": homography.tolist(),
        "floor": {"widthM": width, "depthM": depth},
        "fit": {
            "cornerMaxErrorM": float(corner_errors.max()),
            "cornerRmseM": float(np.sqrt(np.mean(corner_errors**2))),
            "imageAreaFraction": area,
        },
        "heldOut": {
            "maxErrorM": max(errors),
            "rmseM": float(np.sqrt(np.mean(np.square(errors)))),
            "maxRelativeError": max(errors) / length,
            "referenceLengthM": length,
            "toleranceM": tolerance,
            "placements": measurements,
        },
        "limits": {
            "minImageAreaFraction": MIN_IMAGE_AREA,
            "maxAbsoluteErrorM": MAX_ABSOLUTE_ERROR_M,
            "maxRelativeError": MAX_RELATIVE_ERROR,
            "minPlacementSeparationM": min(width, depth) * 0.15,
            "minPlacementSpanFraction": 0.4,
            "minReferenceAxisComponentFraction": MIN_REFERENCE_AXIS_COMPONENT,
            "minReferenceDirectionSin": MIN_REFERENCE_DIRECTION_SIN,
        },
        "limitations": [
            "Manual floor-plane X/Z mapping only; not root XYZ, height, head or torso orientation.",
            "Requires a planar floor and consistent pinhole image geometry; lens distortion is not corrected.",
            "Held-out length checks are provisional and do not certify physical accuracy or safe gameplay.",
            "Corner names and independent physical measurements are operator evidence, not machine verified.",
            "Camera movement, image crop/resize changes or moved floor markers invalidate this mapping.",
        ],
    }
