import json
from dataclasses import replace

import numpy as np
import pytest
from motion_vision.xyz.geometry import METHODS, Camera, project, reprojection_jacobian, triangulate
from motion_vision.xyz.reconstruction import Gates, reconstruct
from tools.xyz_benchmark import (
    JOINTS,
    ROOT,
    SCENARIOS,
    Scenario,
    cameras,
    evaluate,
    make_views,
    trajectory,
    validate_config,
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
    b = Camera(
        "oblique",
        a.K,
        r,
        -r @ np.array([1.2, 1.4, 0.3]),
        a.calibration_id,
        a.image_size,
        a.transform_revision,
    )
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


@pytest.mark.parametrize("field", ("time_ns", "frame_id", "uncertainty_ns"))
@pytest.mark.parametrize("value", (float("nan"), float("inf"), 1.5, True, -1))
def test_invalid_integer_source_metadata_is_rejected(pair, field, value):
    with pytest.raises(ValueError):
        replace(pair[0], **{field: value})


@pytest.mark.parametrize("value", (float("nan"), float("inf"), 1.5, True, -1))
def test_invalid_now_cannot_bypass_freshness(pair, config, value):
    with pytest.raises(ValueError):
        reconstruct(
            cameras(),
            pair,
            calibration_id="synthetic-v1",
            epoch="sync-1",
            clock_domain="mapped-host",
            now_ns=value,
            gates=Gates.from_dict(config["gates"]),
        )


def test_uncertainty_intervals_cannot_cross_timing_limits(pair, config):
    # Nominal timestamps can pass while their declared exposure interval fails.
    skewed = (pair[0], replace(pair[1], time_ns=pair[1].time_ns - 7_500_001))
    assert set(run(skewed, config).reasons) == {"pair_skew"}
    for delta, expected in ((60_000_000, "stale_input"), (0, "future_input")):
        result = reconstruct(
            cameras(),
            pair,
            calibration_id="synthetic-v1",
            epoch="sync-1",
            clock_domain="mapped-host",
            now_ns=pair[0].time_ns + delta,
            gates=Gates.from_dict(config["gates"]),
        )
        assert set(result.reasons) == {expected}


@pytest.mark.parametrize(
    "change,reason",
    [
        ({"image_size": (3840, 2160)}, "image_geometry_mismatch"),
        ({"transform_revision": "new-crop"}, "transform_mismatch"),
        # A caller must not turn host read completion into exposure evidence via a boolean.
        (
            {"timestamp_kind": "host-read-completion", "time_verified": True},
            "unverified_exposure_time",
        ),
    ],
)
def test_calibration_geometry_and_timestamp_provenance_are_bound(pair, config, change, reason):
    result = run((pair[0], replace(pair[1], **change)), config)
    assert set(result.reasons) == {reason}
    assert np.isnan(result.positions_m).all()


def test_calibration_object_revision_is_bound_to_input(pair, config):
    rig = (cameras()[0], replace(cameras()[1], calibration_id="another-calibration"))
    result = reconstruct(
        rig,
        pair,
        calibration_id="synthetic-v1",
        epoch="sync-1",
        clock_domain="mapped-host",
        now_ns=pair[0].time_ns + 10_000_000,
        gates=Gates.from_dict(config["gates"]),
    )
    assert set(result.reasons) == {"calibration_mismatch"}


def test_reconstruction_preserves_full_source_metadata(pair, config):
    result = run(pair, config)
    for source, view in zip(result.sources, pair, strict=True):
        for name in source.__dataclass_fields__:
            assert getattr(source, name) == getattr(view, name)
    assert result.clock_domain == "mapped-host"
    assert result.generated_at_ns == pair[0].time_ns + 10_000_000
    assert not result.positions_m.flags.writeable


def test_names_determine_correspondence_and_absent_names_stay_missing(pair, config):
    reordered = replace(pair[1], joint_names=pair[1].joint_names[::-1], pixels=pair[1].pixels[::-1])
    result = run((pair[0], reordered), config)
    np.testing.assert_allclose(result.positions_m, trajectory(10 / 60, 0), atol=1e-10)
    omitted = replace(pair[1], joint_names=pair[1].joint_names[:11], pixels=pair[1].pixels[:11])
    result = run((pair[0], omitted), config)
    assert result.hip_midpoint() is None
    assert result.reasons[11:] == ("missing",) * 6
    assert result.reasons[9] == "observed"


def test_view_copies_pixels_to_keep_provenance_stable(pair):
    pixels = pair[0].pixels.copy()
    view = replace(pair[0], pixels=pixels)
    pixels[:] = np.nan
    assert np.isfinite(view.pixels).all()
    assert not view.pixels.flags.writeable


def test_refinement_of_valid_joint_survives_parallel_neighbor():
    a, b = cameras()
    points = trajectory(0.8, 0)
    rng = np.random.default_rng(16)
    ua, ub = (project(c, points) + rng.normal(0, 4, (len(JOINTS), 2)) for c in (a, b))
    ua[0] = ub[0] = [960, 540]  # Parallel rays give a point at infinity.
    with np.errstate(invalid="ignore", divide="ignore"):
        together = triangulate(a, b, ua, ub, "refined")
        separate = triangulate(a, b, ua[1:], ub[1:], "refined")
        dlt = triangulate(a, b, ua[1:], ub[1:], "dlt")
    assert not np.isfinite(together[0]).all()
    np.testing.assert_allclose(together[1:], separate, atol=1e-10)
    assert np.linalg.norm(separate - dlt) > 1e-8


@pytest.mark.parametrize(
    "scenario,expected",
    [
        ("flagged_identity_swap", "identity_uncertain"),
        ("flagged_distortion", "distorted_input"),
        ("stale_pair", "stale_input"),
        ("calibration_revision_mismatch", "calibration_mismatch"),
        ("clock_domain_mismatch", "clock_mismatch"),
        ("transform_revision_mismatch", "transform_mismatch"),
    ],
)
def test_negative_control_counts_all_rejections(config, scenario, expected):
    config["frames"] = 2
    row = evaluate(next(s for s in SCENARIOS if s.name == scenario), "midpoint", config)
    assert row["accepted_joints"] == 0
    assert row["coverage"] == row["root_coverage"] == row["wrist_coverage"] == 0
    assert row["reasons"] == {expected: 2 * 3 * len(JOINTS)}
    assert row["accepted_error_m"]["p95"] is None
    assert not row["provisional_spatial_pass"]


def test_benchmark_is_reproducible_and_exposes_hidden_bias(config):
    config["frames"] = 8
    scenario = next(s for s in SCENARIOS if s.name == "calibration_scale_5percent")
    first = evaluate(scenario, "midpoint", config)
    assert first == evaluate(scenario, "midpoint", config)
    assert first["unsafe_accepted_joints"] > 0
    assert first["root_error_m"]["p95"] > config["targets"]["torso_p95_m"]


def test_false_confirmed_identity_is_not_proved_by_geometry(config):
    config["frames"] = 8
    scenario = next(s for s in SCENARIOS if s.name == "unflagged_identity_swap")
    row = evaluate(scenario, "midpoint", config)
    assert row["wrong_identity_accepted_joints"] > 0
    assert row["wrong_identity_accepted_joints"] == row["accepted_joints"]


def test_allowed_skew_can_fail_geometry_amplified_motion_error(pair, config):
    rig = cameras()
    points = np.tile([0.0, 1.0, 5.0], (len(JOINTS), 1))
    views = tuple(
        replace(view, pixels=project(camera, points))
        for camera, view in zip(rig, pair, strict=True)
    )
    assert set(run(views, config).reasons) == {"observed"}
    skewed = (views[0], replace(views[1], time_ns=views[1].time_ns - 4_000_000))

    gates = Gates.from_dict(config["gates"])
    timing_ns = 4_000_000 + sum(view.uncertainty_ns for view in views)
    assert timing_ns < gates.max_pair_skew_ns
    jacobian = np.concatenate([reprojection_jacobian(camera, points[:1]) for camera in rig], axis=1)
    weakest = np.linalg.svd(jacobian, compute_uv=False)[0, -1]
    naive_error = (
        2.8 * gates.assumed_pixel_sigma / weakest + gates.motion_speed_bound_m_s * timing_ns / 1e9
    )
    assert naive_error < gates.max_linearized_error_m
    # The stereo depth geometry amplifies timing enough to invalidate this otherwise exact pair.
    assert set(run(skewed, config).reasons) == {"estimated_error"}
    config["gates"]["motion_speed_bound_m_s"] = 0.1
    assert set(run(skewed, config).reasons) == {"observed"}


@pytest.mark.parametrize(
    "key,value",
    [
        ("frames", True),
        ("frames", 1000000),
        ("warmup", -1),
        ("timing_trials", 0),
        ("timing_repetitions", 1.5),
    ],
)
def test_benchmark_configuration_bounds_work(config, key, value):
    config[key] = value
    with pytest.raises(ValueError):
        validate_config(config)
