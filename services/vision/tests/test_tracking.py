"""Synthetic behavioral checks for counting and conservative association."""

from copy import deepcopy
from math import nan

import pytest
from motion_vision.tracking import Tracker, TrackingConfig


def person(x: float, y: float = 0.15, width: float = 0.16) -> dict:
    """A named-joint synthetic observation, not a frame of a participant."""
    joints = {}
    for name, dx, dy in (
        ("left_shoulder", 0.28, 0.22),
        ("right_shoulder", 0.72, 0.22),
        ("left_elbow", 0.18, 0.38),
        ("right_elbow", 0.82, 0.38),
        ("left_wrist", 0.08, 0.50),
        ("right_wrist", 0.92, 0.50),
        ("left_hip", 0.36, 0.57),
        ("right_hip", 0.64, 0.57),
    ):
        joints[name] = {
            "x": x + width * dx,
            "y": y + 0.65 * dy,
            "score": 0.95,
            "status": "observed",
            "inFrame": True,
        }
    return {"box": {"x": x, "y": y, "width": width, "height": 0.65}, "joints": joints}


def id_for(people: list[dict], x: float) -> str:
    return next(item["trackId"] for item in people if item["box"]["x"] == x)


@pytest.mark.parametrize("mode", ["iou", "pose"])
def test_count_is_current_detections_not_retained_tracks(mode: str) -> None:
    tracker = Tracker(mode)
    assert tracker.update([], 0, "camera-a") == []
    one = tracker.update([person(0.1)], 33_000_000)
    assert len(one) == 1
    three = tracker.update([person(0.1), person(0.4), person(0.7)], 66_000_000)
    assert len(three) == 3
    assert tracker.update([], 99_000_000) == []
    assert len(tracker.update([person(0.7)], 132_000_000)) == 1


@pytest.mark.parametrize("mode", ["iou", "pose"])
def test_detection_array_reordering_does_not_exchange_ids(mode: str) -> None:
    tracker = Tracker(mode)
    first = tracker.update([person(0.1), person(0.7)], 0)
    second = tracker.update([person(0.7), person(0.1)], 33_000_000)
    assert id_for(first, 0.1) == id_for(second, 0.1)
    assert id_for(first, 0.7) == id_for(second, 0.7)
    assert all(item["identity"] == "tentative" for item in second)
    third = tracker.update([person(0.7), person(0.1)], 66_000_000)
    assert all(item["identity"] == "confident" for item in third)


@pytest.mark.parametrize("mode", ["iou", "pose"])
def test_overlap_abstains_and_separation_does_not_guess_old_identity(mode: str) -> None:
    tracker = Tracker(mode)
    old = tracker.update([person(0.25), person(0.55)], 0)
    overlap = tracker.update([person(0.39), person(0.40)], 100_000_000)
    assert len(overlap) == 2
    assert all(item["trackId"] is None and item["identity"] == "ambiguous" for item in overlap)
    separated = tracker.update([person(0.25), person(0.55)], 200_000_000)
    assert not {item["trackId"] for item in old} & {item["trackId"] for item in separated}
    assert all(item["identity"] == "tentative" for item in separated)


@pytest.mark.parametrize("mode", ["iou", "pose"])
def test_one_merged_detection_is_one_observation_and_ambiguous(mode: str) -> None:
    tracker = Tracker(mode)
    tracker.update([person(0.3), person(0.5)], 0)
    merged = person(0.3, width=0.36)
    # With no reliable skeleton distinction, both previous people support the
    # single detector result. It cannot authorize either prior identity.
    merged["joints"] = {}
    output = tracker.update([merged], 100_000_000)
    assert len(output) == 1
    assert output[0]["identity"] == "ambiguous"
    assert output[0]["trackId"] is None


@pytest.mark.parametrize("mode", ["iou", "pose"])
def test_missing_track_does_not_publish_predicted_person(mode: str) -> None:
    tracker = Tracker(mode)
    tracker.update([person(0.1), person(0.7)], 0)
    observed = tracker.update([person(0.7)], 33_000_000)
    assert len(observed) == 1
    assert observed[0]["box"]["x"] == 0.7
    assert tracker.update([], 66_000_000) == []


@pytest.mark.parametrize("mode", ["iou", "pose"])
def test_short_clear_absence_recovery_is_tentative(mode: str) -> None:
    tracker = Tracker(mode)
    tracker.update([person(0.1)], 0)
    tracker.update([person(0.1)], 33_000_000)
    established = tracker.update([person(0.1)], 66_000_000)[0]
    assert established["identity"] == "confident"
    tracker.update([], 99_000_000)
    recovered = tracker.update([person(0.1)], 132_000_000)[0]
    assert recovered["trackId"] == established["trackId"]
    assert recovered["identity"] == "tentative"


@pytest.mark.parametrize("mode", ["iou", "pose"])
def test_long_absence_and_epoch_change_require_new_identity(mode: str) -> None:
    tracker = Tracker(mode)
    first = tracker.update([person(0.1)], 0, epoch="one")[0]
    after_gap = tracker.update([person(0.1)], 1_000_000_000)[0]
    assert after_gap["trackId"] != first["trackId"]
    after_restart = tracker.update([person(0.1)], 0, epoch="two")[0]
    assert after_restart["trackId"] != after_gap["trackId"]
    assert after_restart["identity"] == "tentative"


@pytest.mark.parametrize("mode", ["iou", "pose"])
def test_ambiguity_ties_never_resolve_by_list_order(mode: str) -> None:
    def run(order: list[float]) -> list[dict]:
        tracker = Tracker(mode)
        tracker.update([person(x) for x in order], 0)
        # Equidistant merged observation; the single result lacks pose evidence.
        current = person(0.38, width=0.20)
        current["joints"] = {}
        return tracker.update([current], 100_000_000)

    for order in ([0.3, 0.5], [0.5, 0.3]):
        output = run(order)
        assert output[0]["identity"] == "ambiguous"
        assert output[0]["trackId"] is None


def test_pose_strategy_ignores_missing_out_of_frame_and_uncertain_joints() -> None:
    tracker = Tracker("pose")
    tracker.update([person(0.1)], 0)
    observation = person(0.11)
    observation["joints"]["left_shoulder"].update(x=None, y=None, status="missing", score=0)
    observation["joints"]["right_shoulder"].update(x=nan, score=0.9)
    observation["joints"]["left_elbow"].update(inFrame=False)
    observation["joints"]["right_elbow"].update(score=0.1)
    observation["joints"]["left_hip"].update(status="estimated")
    output = tracker.update([observation], 33_000_000)
    assert len(output) == 1
    assert output[0]["trackId"] is not None
    assert output[0]["joints"]["left_shoulder"]["x"] is None
    assert output[0]["joints"]["right_elbow"]["score"] == 0.1


def test_tracker_does_not_mutate_provider_detections() -> None:
    observation = person(0.2)
    before = deepcopy(observation)
    tracker = Tracker()
    tracker.update([observation], 0)
    assert observation == before
    assert "trackId" not in observation


def test_rejects_out_of_order_without_advancing_track_state() -> None:
    tracker = Tracker()
    first = tracker.update([person(0.2)], 100)[0]
    with pytest.raises(ValueError, match="increase"):
        tracker.update([person(0.5)], 99)
    with pytest.raises(ValueError, match="increase"):
        tracker.update([person(0.5)], 100)
    next_person = tracker.update([person(0.2)], 200)[0]
    assert first["trackId"] == next_person["trackId"]
    assert next_person["identity"] == "tentative"


def test_invalid_boxes_are_not_counted_or_clamped_into_frame() -> None:
    tracker = Tracker()
    valid = person(-0.04)
    invalid = person(0.5)
    invalid["box"]["width"] = 0
    nonfinite = person(0.7)
    nonfinite["box"]["x"] = nan
    output = tracker.update([valid, invalid, nonfinite], 0)
    assert len(output) == 1
    assert output[0]["box"]["x"] == -0.04


def test_capacity_is_an_explicit_error_not_silent_truncation() -> None:
    tracker = Tracker(config=TrackingConfig(max_detections=3))
    with pytest.raises(ValueError, match="capacity"):
        tracker.update([person(0.1)] * 4, 0)


@pytest.mark.parametrize("timestamp", [-1, 1.5, True])
def test_timestamp_requires_nonnegative_integer_nanoseconds(timestamp: int) -> None:
    with pytest.raises(ValueError, match="nonnegative integer"):
        Tracker().update([], timestamp)


def test_configuration_rejects_unbounded_work_and_invalid_thresholds() -> None:
    with pytest.raises(ValueError, match="max_detections"):
        TrackingConfig(max_detections=7)
    with pytest.raises(ValueError, match="max_tracks"):
        TrackingConfig(max_tracks=100)
    with pytest.raises(ValueError, match="finite and positive"):
        TrackingConfig(lost_after_s=nan)
    with pytest.raises(ValueError, match="mode"):
        Tracker("unknown")


@pytest.mark.parametrize("mode", ["iou", "pose"])
@pytest.mark.parametrize("last_cost", [0.40, 0.45])
def test_global_assignment_tie_abstains_even_with_clear_local_minima(
    mode: str, last_cost: float, monkeypatch: pytest.MonkeyPatch
) -> None:
    tracker = Tracker(mode)
    tracker.update([person(0.1), person(0.7)], 0)
    # The two assignment sums are equal or 0.05 apart, but every row and
    # column has a local margin larger than 0.08. Array order is not evidence.
    costs = {(0.1, 0.1): 0.10, (0.1, 0.7): 0.30, (0.7, 0.1): 0.20, (0.7, 0.7): last_cost}
    monkeypatch.setattr(
        tracker,
        "_cost",
        lambda track, detection, timestamp: costs[
            (track.detection["box"]["x"], detection["box"]["x"])
        ],
    )
    output = tracker.update([person(0.1), person(0.7)], 33_000_000)
    assert all(item["identity"] == "ambiguous" for item in output)
    assert all(item["trackId"] is None for item in output)


@pytest.mark.parametrize("face_only", [False, True])
def test_collapsed_or_face_only_landmarks_do_not_supply_pose_evidence(face_only: bool) -> None:
    def degenerate(x: float) -> dict:
        detection = person(x)
        for joint in detection["joints"].values():
            joint.update(x=x + 0.08, y=0.50)
            if face_only:
                joint.update(x=None, y=None, score=0, status="missing", inFrame=False)
        if face_only:
            for name in ("nose", "left_eye", "right_eye", "left_ear", "right_ear"):
                detection["joints"][name] = {
                    "x": x + 0.08,
                    "y": 0.25,
                    "score": 0.95,
                    "status": "observed",
                    "inFrame": True,
                }
        return detection

    tracker = Tracker("pose")
    tracker.update([degenerate(0.1)], 0)
    # This displacement has weak box support. Degenerate high-score landmarks
    # must not boost it into an apparently clear same-person association.
    output = tracker.update([degenerate(0.19)], 33_000_000)
    assert len(output) == 1
    assert output[0]["trackId"] is None
    assert output[0]["identity"] == "ambiguous"
