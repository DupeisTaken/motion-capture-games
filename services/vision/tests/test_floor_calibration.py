"""Synthetic projective fixtures: no photographs, cameras or physical accuracy claims."""

import copy
import json

import numpy as np
import pytest
from motion_vision.floor_calibration import CORNER_NAMES, fit_floor_calibration

CENTERS = ((1, 1), (4, 3), (7, 5))
DIRECTIONS = ((1, 0), (2**-0.5, 2**-0.5), (0, 1))


def reference_points(center, direction, length=1, perspective=False):
    half = np.asarray(direction) * length / 2
    points = [np.asarray(center) - half, np.asarray(center) + half]
    return image_points(points, perspective)


def image_points(points, perspective=False):
    matrix = (
        [[0.08, 0.015, 0.1], [0.01, -0.08, 0.85], [0.005, 0.02, 1]]
        if perspective
        else [[0.1, 0, 0.1], [0, -0.1, 0.9], [0, 0, 1]]
    )
    homogeneous = np.column_stack((points, np.ones(len(points)))) @ np.asarray(matrix).T
    return (homogeneous[:, :2] / homogeneous[:, 2:]).tolist()


def calibration(perspective=False):
    corners = image_points([[0, 0], [8, 0], [8, 6], [0, 6]], perspective)
    placements = [
        {"name": name, "endpoints": reference_points(center, direction, perspective=perspective)}
        for name, center, direction in zip(
            ("near", "middle", "far"), CENTERS, DIRECTIONS, strict=True
        )
    ]
    return {
        "widthM": 8,
        "depthM": 6,
        "imageCorners": dict(zip(CORNER_NAMES, corners, strict=True)),
        "reference": {"lengthM": 1, "placements": placements},
    }


@pytest.mark.parametrize("perspective", [False, True])
def test_independent_reference_and_unfitted_floor_point_roundtrip(perspective):
    payload = calibration(perspective)
    original = copy.deepcopy(payload)
    result = fit_floor_calibration(payload)
    assert payload == original
    assert result["schemaVersion"] == "floor-calibration/v1"
    assert result["scope"] == "floor-only"
    assert result["floor"] == {"widthM": 8, "depthM": 6}
    assert result["fit"]["cornerMaxErrorM"] < 1e-5
    assert result["heldOut"]["maxErrorM"] < 1e-5
    assert result["heldOut"]["toleranceM"] == pytest.approx(0.05)
    assert [item["name"] for item in result["heldOut"]["placements"]] == ["near", "middle", "far"]
    homography = np.asarray(result["homography"])
    point = np.asarray([*image_points([[2.3, 4.1]], perspective)[0], 1])
    mapped = homography @ point
    np.testing.assert_allclose(mapped[:2] / mapped[2], [2.3, 4.1], atol=1e-5)
    assert any("not root XYZ" in limitation for limitation in result["limitations"])
    assert any("distortion" in limitation for limitation in result["limitations"])
    json.dumps(result, allow_nan=False)


def test_reference_measurements_do_not_refit_homography():
    payload = calibration()
    baseline = fit_floor_calibration(payload)
    payload["reference"]["placements"][0]["endpoints"][1][0] += 0.003
    changed = fit_floor_calibration(payload)
    assert changed["homography"] == baseline["homography"]
    assert changed["heldOut"]["maxErrorM"] == pytest.approx(0.03, abs=1e-5)
    assert changed["fit"] == baseline["fit"]


@pytest.mark.parametrize("length", [0.2, 1, 2])
def test_reference_size_boundaries_and_strict_relative_tolerance(length):
    payload = calibration()
    payload["reference"]["lengthM"] = length
    for index, (center, direction) in enumerate(zip(CENTERS, DIRECTIONS, strict=True)):
        payload["reference"]["placements"][index]["endpoints"] = reference_points(
            center, direction, length
        )
    result = fit_floor_calibration(payload)
    assert result["heldOut"]["maxErrorM"] < 1e-5
    # This fails the 5% bound even when the absolute discrepancy is below 0.10 m.
    payload["reference"]["placements"][0]["endpoints"][1][0] += length * 0.006
    with pytest.raises(ValueError, match="disagrees"):
        fit_floor_calibration(payload)


def test_incorrect_known_distance_is_not_hidden_by_exact_corner_fit():
    payload = calibration()
    payload["reference"]["lengthM"] = 0.8
    with pytest.raises(ValueError, match="disagrees"):
        fit_floor_calibration(payload)


@pytest.mark.parametrize("field", ["widthM", "depthM"])
@pytest.mark.parametrize(
    "value", [4.99, 10.01, None, True, "8", float("nan"), float("inf"), 10**400]
)
def test_invalid_measured_floor_dimensions(field, value):
    payload = calibration()
    payload[field] = value
    with pytest.raises(ValueError, match=field):
        fit_floor_calibration(payload)


@pytest.mark.parametrize("value", [0.19, 2.01, None, True, "1", float("nan"), float("inf")])
def test_invalid_independent_reference_length(value):
    payload = calibration()
    payload["reference"]["lengthM"] = value
    with pytest.raises(ValueError, match="lengthM"):
        fit_floor_calibration(payload)


@pytest.mark.parametrize(
    "value", [[-0.01, 0.4], [1.01, 0.4], [0.4], [None, 0.4], [True, 0.4], [0.4, float("nan")]]
)
def test_corner_coordinates_must_be_finite_normalized_pairs(value):
    payload = calibration()
    payload["imageCorners"]["nearLeft"] = value
    with pytest.raises(ValueError):
        fit_floor_calibration(payload)


@pytest.mark.parametrize(
    "mutation", ["missing", "extra", "duplicate", "crossed", "concave", "collinear", "tiny"]
)
def test_reject_bad_corner_geometry(mutation):
    payload = calibration()
    corners = payload["imageCorners"]
    if mutation == "missing":
        del corners["nearLeft"]
    elif mutation == "extra":
        corners["unknown"] = [0.5, 0.5]
    elif mutation == "duplicate":
        corners["nearLeft"] = corners["nearRight"]
    elif mutation == "crossed":
        corners["nearRight"], corners["farRight"] = corners["farRight"], corners["nearRight"]
    elif mutation == "concave":
        corners["farRight"] = [0.3, 0.7]
    elif mutation == "collinear":
        corners["farRight"] = [0.9, 0.6]
        corners["farLeft"] = [0.9, 0.3]
    else:
        for key, point in corners.items():
            corners[key] = [0.45 + coordinate * 0.1 for coordinate in point]
    with pytest.raises(ValueError, match="(?i)corner|floor"):
        fit_floor_calibration(payload)


@pytest.mark.parametrize("value", [None, [], [{"name": "one"}] * 2, [{"name": "many"}] * 33])
def test_requires_bounded_number_of_heldout_placements(value):
    payload = calibration()
    payload["reference"]["placements"] = value
    with pytest.raises(ValueError, match="3..32"):
        fit_floor_calibration(payload)


@pytest.mark.parametrize("name", ["near", " near ", "", "  ", None, "x" * 81])
def test_placement_names_are_explicit_and_distinct(name):
    payload = calibration()
    payload["reference"]["placements"][1]["name"] = name
    with pytest.raises(ValueError, match="name"):
        fit_floor_calibration(payload)


@pytest.mark.parametrize(
    "value", [None, [], [[0.2, 0.4]], [[False, 0.4], [0.5, 0.4]], [[float("inf"), 0.4], [0.5, 0.4]]]
)
def test_invalid_reference_endpoints(value):
    payload = calibration()
    payload["reference"]["placements"][0]["endpoints"] = value
    with pytest.raises(ValueError):
        fit_floor_calibration(payload)


def test_reference_must_lie_inside_floor_not_merely_inside_image():
    payload = calibration()
    payload["reference"]["placements"][0]["endpoints"] = image_points([[-0.5, 1], [0.5, 1]])
    with pytest.raises(ValueError, match="inside the labelled floor"):
        fit_floor_calibration(payload)


def test_reference_can_touch_floor_boundary_without_being_clamped():
    payload = calibration()
    payload["reference"]["placements"][0]["endpoints"] = image_points([[0, 1], [1, 1]])
    result = fit_floor_calibration(payload)
    assert result["heldOut"]["placements"][0]["floorEndpointsM"][0][0] == pytest.approx(0, abs=1e-5)


def test_tiny_reference_image_extent_rejected_before_distance_screen():
    payload = calibration()
    payload["reference"]["placements"][0]["endpoints"] = [[0.2, 0.8], [0.201, 0.8]]
    with pytest.raises(ValueError, match="too small in the image"):
        fit_floor_calibration(payload)


def test_renaming_same_reference_position_does_not_count_as_moving_it():
    payload = calibration()
    payload["reference"]["placements"][1]["endpoints"] = copy.deepcopy(
        payload["reference"]["placements"][0]["endpoints"]
    )
    with pytest.raises(ValueError, match="separated"):
        fit_floor_calibration(payload)


@pytest.mark.parametrize("centers", [[(1, 3), (4, 3), (7, 3)], [(4, 1), (4, 3), (4, 5)]])
def test_reference_positions_must_span_both_floor_axes(centers):
    payload = calibration()
    for placement, (x, z) in zip(payload["reference"]["placements"], centers, strict=True):
        placement["endpoints"] = image_points([[x - 0.5, z], [x + 0.5, z]])
    with pytest.raises(ValueError, match="40% of both"):
        fit_floor_calibration(payload)


@pytest.mark.parametrize("angle", [0, np.pi / 2, np.pi / 4])
def test_spread_centers_with_parallel_reference_directions_are_rejected(angle):
    payload = calibration()
    direction = (np.cos(angle), np.sin(angle))
    for placement, center in zip(payload["reference"]["placements"], CENTERS, strict=True):
        placement["endpoints"] = reference_points(center, direction)
    with pytest.raises(ValueError, match="Rotate the reference across floor directions"):
        fit_floor_calibration(payload)


def test_nearly_parallel_diagonals_do_not_provide_independent_direction_checks():
    payload = calibration()
    for placement, center, angle in zip(
        payload["reference"]["placements"], CENTERS, np.deg2rad([40, 45, 50]), strict=True
    ):
        placement["endpoints"] = reference_points(center, (np.cos(angle), np.sin(angle)))
    with pytest.raises(ValueError, match="30 degrees apart"):
        fit_floor_calibration(payload)


def test_wrong_depth_scale_cannot_hide_behind_width_only_references():
    payload = calibration()
    payload["depthM"] = 8
    for placement, center in zip(payload["reference"]["placements"], CENTERS, strict=True):
        placement["endpoints"] = reference_points(center, (1, 0))
    with pytest.raises(ValueError, match="Rotate the reference"):
        fit_floor_calibration(payload)


def test_independent_depth_reference_rejects_wrong_depth_scale():
    payload = calibration()
    payload["depthM"] = 8
    with pytest.raises(ValueError, match="disagrees"):
        fit_floor_calibration(payload)


@pytest.mark.parametrize("value", [None, [], True])
def test_malformed_payload_fails_with_actionable_value_error(value):
    with pytest.raises(ValueError, match="object"):
        fit_floor_calibration(value)


@pytest.mark.parametrize("value", [None, [], {}])
def test_reference_is_required(value):
    payload = calibration()
    payload["reference"] = value
    with pytest.raises(ValueError, match="reference"):
        fit_floor_calibration(payload)
