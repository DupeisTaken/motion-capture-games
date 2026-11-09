import json
from dataclasses import replace

import numpy as np
import pytest
from xyz.geometry import METHODS, Camera, project, reprojection_jacobian, triangulate
from xyz.reconstruction import Gates, reconstruct
from xyz_benchmark import (
    JOINTS,
    ROOT,
    SCENARIOS,
    Scenario,
    cameras,
    evaluate,
    make_views,
    trajectory,
)


@pytest.fixture
def config():
    return json.loads((ROOT / "configs/xyz-experiment.json").read_text())


@pytest.fixture
def pair():
    return make_views(cameras(), Scenario("test", sigma_px=0), 10, 0, np.random.default_rng(1))[0]


def run(pair, config, **kwargs):
    return reconstruct(
        cameras(),
        pair,
        calibration_id="synthetic-v1",
        epoch="sync-1",
        clock_domain="mapped-host",
        now_ns=pair[0].time_ns + 10_000_000,
        gates=Gates.from_dict(config["gates"]),
        **kwargs,
    )


@pytest.mark.parametrize("method", METHODS)
def test_metric_roundtrip_and_anatomical_root(pair, config, method):
    result = run(pair, config, method=method)
    assert set(result.reasons) == {"observed"}
    np.testing.assert_allclose(result.positions_m, trajectory(10 / 60, 0), atol=1e-10)
    np.testing.assert_allclose(result.hip_midpoint(), trajectory(10 / 60, 0)[[11, 12]].mean(0))
    assert result.source_frame_ids == (10, 10)
    assert result.source_times_ns == (pair[0].time_ns, pair[1].time_ns)
    assert result.rig_track_id == "person-0"
    assert result.joint_names[9:11] == ("left_wrist", "right_wrist")


@pytest.mark.parametrize(
    "change,reason",
    [
        ({"calibration_id": "moved"}, "calibration_mismatch"),
        ({"epoch": "reset"}, "epoch_mismatch"),
        ({"clock_domain": "device-clock"}, "clock_mismatch"),
        ({"identity_confirmed": False}, "identity_uncertain"),
        ({"rig_track_id": "another-person"}, "identity_uncertain"),
        ({"rig_track_id": None}, "identity_uncertain"),
        ({"time_verified": False}, "unverified_exposure_time"),
        ({"uncertainty_ns": 10_000_000}, "time_uncertain"),
        ({"undistorted": False}, "distorted_input"),
    ],
)
def test_pair_rejection_preserves_missingness(pair, config, change, reason):
    result = run((pair[0], replace(pair[1], **change)), config)
    assert set(result.reasons) == {reason}
    assert np.isnan(result.positions_m).all()
    assert result.hip_midpoint() is None
    assert result.rig_track_id is None


def test_skew_stale_and_future(pair, config):
    skew = (pair[0], replace(pair[1], time_ns=pair[1].time_ns - 16_000_000))
    assert set(run(skew, config).reasons) == {"pair_skew"}
    for offset, reason in ((-100_000_000, "stale_input"), (20_000_000, "future_input")):
        adjusted = tuple(replace(v, time_ns=v.time_ns + offset) for v in pair)
        result = reconstruct(
            cameras(),
            adjusted,
            calibration_id="synthetic-v1",
            epoch="sync-1",
            clock_domain="mapped-host",
            now_ns=pair[0].time_ns + 10_000_000,
            gates=Gates.from_dict(config["gates"]),
        )
        assert set(result.reasons) == {reason}


def test_single_missing_hip_suppresses_root_without_losing_other_joints(pair, config):
    pixels = pair[1].pixels.copy()
    pixels[11] = np.nan
    result = run((pair[0], replace(pair[1], pixels=pixels)), config)
    assert result.reasons[11] == "missing"
    assert result.reasons[9] == "observed"
    assert result.hip_midpoint() is None
    assert sum(r == "observed" for r in result.reasons) == len(JOINTS) - 1


@pytest.mark.parametrize("method", METHODS)
def test_weak_geometry_is_rejected(config, method):
    rig = cameras(0.06)
    pair, _ = make_views(rig, Scenario("narrow", sigma_px=0), 0, 0, np.random.default_rng(1))
    result = reconstruct(
        rig,
        pair,
        calibration_id="synthetic-v1",
        epoch="sync-1",
        clock_domain="mapped-host",
        now_ns=pair[0].time_ns + 10_000_000,
        gates=Gates.from_dict(config["gates"]),
        method=method,
    )
    assert set(result.reasons) == {"weak_geometry"}


def test_outlier_rejected(pair, config):
    pixels = pair[1].pixels.copy()
    pixels[9, 1] += 80
    result = run((pair[0], replace(pair[1], pixels=pixels)), config)
    assert result.reasons[9] in {"ray_gap", "reprojection"}
    assert result.reasons[10] == "observed"


def test_outside_image_is_not_clamped(pair, config):
    pixels = pair[1].pixels.copy()
    pixels[9] = [-1, 500]
    result = run((pair[0], replace(pair[1], pixels=pixels)), config)
    assert result.reasons[9] == "outside_image"
    assert np.isnan(result.positions_m[9]).all()


@pytest.mark.parametrize("method", METHODS)
def test_coincident_cameras_fail_closed(pair, config, method):
    rig = cameras(0)
    pixels = project(rig[0], trajectory(10 / 60, 0))
    views = tuple(replace(v, pixels=pixels) for v in pair)
    result = reconstruct(
        rig,
        views,
        calibration_id="synthetic-v1",
        epoch="sync-1",
        clock_domain="mapped-host",
        now_ns=pair[0].time_ns + 10_000_000,
        gates=Gates.from_dict(config["gates"]),
        method=method,
    )
    assert np.isnan(result.positions_m).all()


def test_behind_camera_and_outside_volume(pair, config):
    for point, reason in (([0, 1, -3], "behind_camera"), ([0, 2.7, 5], "outside_volume")):
        points = np.tile(point, (len(JOINTS), 1)).astype(float)
        views = tuple(
            replace(v, pixels=project(c, points)) for c, v in zip(cameras(), pair, strict=True)
        )
        assert set(run(views, config).reasons) == {reason}


def test_configuration_and_provenance_fail_early(pair, config):
    for value in (-1, float("nan")):
        with pytest.raises(ValueError):
            Gates.from_dict({**config["gates"], "max_age_ns": value})
    with pytest.raises(ValueError):
        replace(pair[0], joint_names=("hip", "hip"), pixels=np.ones((2, 2)))
    with pytest.raises(ValueError):
        replace(pair[0], uncertainty_ns=-1)
    with pytest.raises(ValueError):
        replace(cameras()[0], R=np.eye(3) * 2)
    with pytest.raises(ValueError):
        run((replace(pair[0], camera_id="wrong"), pair[1]), config)


@pytest.mark.parametrize("method", METHODS)
def test_general_rotated_camera_geometry(method):
    a, _ = cameras()
    angle = 0.3
    r = (
        np.array([[np.cos(angle), 0, np.sin(angle)], [0, 1, 0], [-np.sin(angle), 0, np.cos(angle)]])
        @ a.R
    )
    b = Camera("oblique", a.K, r, -r @ np.array([1.2, 1.4, 0.3]))
    points = trajectory(0.5, 0)
    actual = triangulate(a, b, project(a, points), project(b, points), method)
    np.testing.assert_allclose(actual, points, atol=1e-10)


def test_jacobian_matches_numerical_derivative():
    a = cameras()[0]
    points = trajectory(0.3, 1)
    expected = []
    for axis in np.eye(3) * 1e-5:
        expected.append((project(a, points + axis) - project(a, points - axis)) / 2e-5)
    np.testing.assert_allclose(
        reprojection_jacobian(a, points), np.stack(expected, axis=2), rtol=1e-7, atol=1e-7
    )


def test_refinement_reduces_geometric_pixel_error():
    a, b = cameras(1.2, yaw_error=15)
    points = trajectory(0.8, 0)
    rng = np.random.default_rng(16)
    ua, ub = (project(c, points) + rng.normal(0, 4, (len(JOINTS), 2)) for c in (a, b))
    errors = []
    for method in ("dlt", "refined"):
        xyz = triangulate(a, b, ua, ub, method)
        errors.append(((project(a, xyz) - ua) ** 2).sum() + ((project(b, xyz) - ub) ** 2).sum())
    assert errors[1] < errors[0]


def test_scale_bias_is_not_certified_by_small_reprojection(pair, config):
    # Same images and low residuals can hide a wrong metric baseline. Hardware ground truth matters.
    rig = cameras(scale_error=0.1)
    result = reconstruct(
        rig,
        pair,
        calibration_id="synthetic-v1",
        epoch="sync-1",
        clock_domain="mapped-host",
        now_ns=pair[0].time_ns + 10_000_000,
        gates=Gates.from_dict(config["gates"]),
    )
    assert sum(r == "observed" for r in result.reasons) > 0
    error = np.linalg.norm(result.positions_m - trajectory(10 / 60, 0), axis=1)
    assert np.nanmedian(error) > 0.2


@pytest.mark.parametrize("method", METHODS)
def test_nominal_accuracy_and_coverage(config, method):
    config["frames"] = 12
    result = evaluate(SCENARIOS[1], method, config)
    assert result["provisional_spatial_pass"]
    assert result["coverage"] >= 0.95
    assert result["total_joints"] == 12 * 3 * len(JOINTS)
