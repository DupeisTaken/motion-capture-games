import json
from copy import deepcopy

import numpy as np
import pytest
from tools.rig_rehearsal import OUTPUT, build_rehearsal, same_data


@pytest.fixture(scope="module")
def dataset():
    return build_rehearsal()


def scenario(dataset, case_id):
    return next(case for case in dataset["cases"] if case["id"] == case_id)


def test_recorded_fixture_is_bounded_finite_and_matches_solver(dataset):
    assert dataset["origin"] == "synthetic-rehearsal"
    assert dataset["recorded"] is True
    assert dataset["version"] == 1
    assert dataset["coordinateSpace"] == "calibrated-rig-meters"
    assert len(dataset["cases"]) == 9
    assert all(len(case["frames"]) == 12 for case in dataset["cases"])
    encoded = json.dumps(dataset, allow_nan=False, separators=(",", ":"))
    assert len(encoded) < 1_000_000
    committed = json.loads(OUTPUT.read_text(encoding="utf-8"))
    assert same_data(committed, dataset)


def test_roles_source_metadata_and_reference_are_explicit(dataset):
    for case in dataset["cases"]:
        for frame in case["frames"]:
            primary, secondary = frame["views"]
            assert [view["role"] for view in frame["views"]] == ["primary", "secondary"]
            assert primary["cameraId"] != secondary["cameraId"]
            assert primary["cameraTrackId"] != secondary["cameraTrackId"]
            assert all(view["timestampKind"] == "synthetic-exposure" for view in frame["views"])
            assert all(view["epoch"] == "sync-1" for view in frame["views"])
            assert frame["reference"]["root"] is not None
            assert frame["reconstruction"]["method"] == "midpoint"
            assert frame["timing"]["skewNs"] == str(
                abs(int(primary["timeNs"]) - int(secondary["timeNs"]))
            )


def test_nominal_root_and_motion_path_come_from_solver(dataset):
    frames = scenario(dataset, "nominal")["frames"]
    for frame in frames:
        result = frame["reconstruction"]
        assert all(joint["reason"] == "observed" for joint in result["joints"])
        hips = [joint for joint in result["joints"] if joint["name"] in ("left_hip", "right_hip")]
        for axis in ("x", "y", "z"):
            assert result["root"][axis] == pytest.approx(
                np.mean([hip[axis] for hip in hips]), abs=0.0000011
            )
    assert abs(frames[-1]["reference"]["root"]["x"] - frames[0]["reference"]["root"]["x"]) > 0.5


def test_missing_hip_never_invents_root(dataset):
    for frame in scenario(dataset, "missing-hip")["frames"]:
        assert frame["reconstruction"]["root"] is None
        hip = next(j for j in frame["reconstruction"]["joints"] if j["name"] == "left_hip")
        assert hip == {"name": "left_hip", "x": None, "y": None, "z": None, "reason": "missing"}
        assert any(j["reason"] == "observed" for j in frame["reconstruction"]["joints"])


@pytest.mark.parametrize(
    "case_id,reason",
    [
        ("stale-input", "stale_input"),
        ("uncertain-identity", "identity_uncertain"),
        ("exposure-skew", "pair_skew"),
        ("time-uncertain", "time_uncertain"),
        ("weak-geometry", "weak_geometry"),
        ("calibration-changed", "calibration_mismatch"),
    ],
)
def test_rejected_cases_expose_reasons_and_null_positions(dataset, case_id, reason):
    for frame in scenario(dataset, case_id)["frames"]:
        assert frame["reconstruction"]["root"] is None
        assert frame["reconstruction"]["rigTrackId"] is None if case_id != "weak-geometry" else True
        for joint in frame["reconstruction"]["joints"]:
            assert joint["reason"] == reason
            assert joint["x"] is joint["y"] is joint["z"] is None


def test_scale_bias_retains_accepted_wrong_xyz_with_independent_reference(dataset):
    for frame in scenario(dataset, "scale-bias")["frames"]:
        reconstructed = frame["reconstruction"]["root"]
        reference = frame["reference"]["root"]
        assert reconstructed is not None
        distance = np.linalg.norm(
            [reconstructed[axis] - reference[axis] for axis in ("x", "y", "z")]
        )
        assert distance > 0.15
        assert frame["calibration"]["baselineM"] == pytest.approx(
            1.05 * frame["calibration"]["referenceBaselineM"]
        )
        assert any(joint["reason"] == "observed" for joint in frame["reconstruction"]["joints"])


def test_drift_check_tolerates_only_declared_float_rounding(dataset):
    actual = deepcopy(dataset)
    actual["cases"][0]["frames"][0]["reference"]["root"]["x"] += 0.000001
    assert same_data(actual, dataset)
    actual["cases"][0]["frames"][0]["reference"]["root"]["x"] += 0.001
    assert not same_data(actual, dataset)
    actual = deepcopy(dataset)
    actual["cases"][0]["frames"][0]["views"][0]["timeVerified"] = False
    assert not same_data(actual, dataset)
    actual = deepcopy(dataset)
    actual["cases"][0]["frames"][0]["reconstruction"]["root"] = None
    assert not same_data(actual, dataset)
