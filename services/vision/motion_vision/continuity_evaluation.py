"""Camera-free labelled-observation evaluation; no media, inference or score claims."""

from collections.abc import Callable
from typing import Any

from .tracking import Tracker


def evaluate_sequence(
    factory: Callable[[], Tracker], frames: list[dict[str, Any]]
) -> dict[str, Any]:
    """Time-weighted continuity includes absence and abstention in its denominator.

    Subject labels are external reference truth, never features seen by tracking.
    Frames marked evaluate=False establish identity before the scored interval.
    New IDs lose incumbent continuity; a confident ID reused for another subject
    is measured separately as a wrong association, never as successful recovery.
    """
    tracker = factory()
    owners: dict[str, str] = {}
    incumbent: dict[str, str] = {}
    suspended: dict[str, float] = {}
    recoveries: list[float] = []
    eligible = continuous = wrong_ms = ambiguous_ms = suspension_ms = 0.0
    wrong_count = 0
    for frame in frames:
        labelled = frame["detections"]
        subjects = [item["subject"] for item in labelled if item["subject"] is not None]
        expected = frame["expected"]
        if len(subjects) != len(set(subjects)) or len(expected) != len(set(expected)):
            raise ValueError("Reference subjects must be unique within a frame")
        duration = float(frame["durationMs"])
        if not 0 < duration <= 1000:
            raise ValueError("Frame duration must be in (0, 1000] ms")
        # Tracker rejects capacity, non-increasing time, invalid boxes and expired history.
        output = tracker.update(
            [item["detection"] for item in labelled],
            round(float(frame["atMs"]) * 1e6),
            epoch=frame.get("epoch", "evaluation"),
        )
        if len(output) != len(labelled):
            raise ValueError("Evaluation input must contain valid detection boxes")
        current = {}
        for reference, observed in zip(labelled, output, strict=True):
            subject, track_id = reference["subject"], observed["trackId"]
            if subject is None:
                continue
            previous_owner = owners.get(track_id) if track_id else None
            wrong = observed["identity"] == "confident" and previous_owner not in (None, subject)
            if wrong and frame.get("evaluate", True):
                # Count a stolen incumbent ID even if its new subject is a
                # spectator outside the continuity target set.
                wrong_ms += duration
                wrong_count += 1
            if track_id and previous_owner is None:
                owners[track_id] = subject
            if observed["identity"] == "confident" and not wrong:
                incumbent.setdefault(subject, track_id)
            current[subject] = (observed, wrong)
        if frame.get("evaluate", True) is False:
            continue
        for subject in expected:
            eligible += duration
            item = current.get(subject)
            good = (
                item is not None
                and item[0]["identity"] == "confident"
                and item[0]["trackId"] == incumbent.get(subject)
                and not item[1]
            )
            if good:
                continuous += duration
                if subject in suspended:
                    recoveries.append(suspended.pop(subject))
            else:
                suspension_ms += duration
                suspended[subject] = suspended.get(subject, 0.0) + duration
            if item and item[0]["identity"] == "ambiguous":
                ambiguous_ms += duration
    return {
        "eligibleDurationMs": eligible,
        "continuousDurationMs": continuous,
        "continuityCoverage": continuous / eligible if eligible else 0.0,
        "wrongAssociationCount": wrong_count,
        "wrongAssociationDurationMs": wrong_ms,
        "ambiguousDurationMs": ambiguous_ms,
        "suspendedDurationMs": suspension_ms,
        "maximumSuspensionMs": max([*recoveries, *suspended.values()], default=0.0),
        "recoveryDurationsMs": recoveries,
        "unresolvedAtEnd": len(suspended),
    }


def synthetic_detection(x: float, width: float = 0.10, *, side: bool = False) -> dict[str, Any]:
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
        hidden = side and name.startswith("right_")
        joints[name] = {
            "x": None if hidden else x + width * dx,
            "y": None if hidden else 0.15 + 0.65 * dy,
            "score": 0.0 if hidden else 0.95,
            "status": "missing" if hidden else "observed",
            "inFrame": not hidden,
        }
    if side:
        joints["left_wrist"]["status"] = "estimated"
    return {"box": {"x": x, "y": 0.15, "width": width, "height": 0.65}, "joints": joints}


def synthetic_sequences() -> dict[str, list[dict[str, Any]]]:
    """Small deterministic failure fixtures, not a held-out accuracy dataset."""
    sequences = {}
    for scenario in ("spectators", "spectators-during-gap", "side-back-turn", "genuine-overlap"):
        frames = []
        for index in range(15):
            player = synthetic_detection(0.35)
            detections = [{"subject": "player", "detection": player}]
            if 3 <= index <= 6:
                if scenario == "side-back-turn":
                    width = (0.08, 0.06, 0.08, 0.10)[index - 3]
                    detections = [
                        {
                            "subject": "player",
                            "detection": synthetic_detection(0.40 - width / 2, width, side=True),
                        }
                    ]
                elif scenario == "genuine-overlap":
                    detections.append(
                        {"subject": "spectator-a", "detection": synthetic_detection(0.37)}
                    )
                else:
                    if scenario == "spectators-during-gap" and index == 3:
                        detections = []
                    detections.extend(
                        [
                            {"subject": "spectator-a", "detection": synthetic_detection(0.57)},
                            {"subject": "spectator-b", "detection": synthetic_detection(0.59)},
                        ]
                    )
            if index % 2:
                detections.reverse()
            frames.append(
                {
                    "atMs": index * 33,
                    "durationMs": 33,
                    "evaluate": index >= 3,
                    "expected": ["player"],
                    "detections": detections,
                }
            )
        sequences[scenario] = frames
    return sequences
