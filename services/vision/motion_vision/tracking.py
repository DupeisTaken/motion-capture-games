"""Bounded camera-local association with an explicit option to abstain.

These diagnostic trackers are not ByteTrack, personal identification, or game
player-slot assignment. Only current detections are returned; retained tracks
and predicted boxes are association evidence, never synthetic observations.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from functools import cache
from math import exp, hypot, isfinite
from typing import Any, Literal

Detection = dict[str, Any]
TrackingMode = Literal["iou", "pose"]
# Body geometry supports this diagnostic association; face shape is not a
# fallback identity feature when the actual body is hidden.
BODY_JOINTS = frozenset(
    (
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
)


@dataclass(frozen=True)
class TrackingConfig:
    """Provisional diagnostic tuning, not hardware-certified thresholds.

    Spatial distances use normalized camera-image units, so a resolution change
    does not change them. They still require validation for camera aspect ratio,
    subject scale, motion, and the installation's capture/inference rate.
    """

    max_detections: int = 6
    max_tracks: int = 12
    lost_after_s: float = 0.45
    confirmations: int = 3
    minimum_pose_joints: int = 4
    joint_score_threshold: float = 0.45
    minimum_pose_extent: float = 0.15  # body-point span / person-box diagonal
    base_center_gate: float = 0.08
    center_speed_gate: float = 1.2  # normalized image units per second
    maximum_center_gate: float = 0.30
    prediction_limit_s: float = 0.15
    velocity_time_constant_s: float = 0.15  # source-time smoothing, provisional seconds
    maximum_speed: float = 1.5  # association velocity bound, image units/second
    max_match_cost: float = 0.78
    ambiguity_margin: float = 0.08
    overlap_iou: float = 0.40

    def __post_init__(self) -> None:
        if not 1 <= self.max_detections <= 6:
            raise ValueError("max_detections must be between 1 and 6")
        if not self.max_detections <= self.max_tracks <= 12:
            raise ValueError("max_tracks must fit detection capacity and be <= 12")
        if self.confirmations < 1 or self.minimum_pose_joints < 1:
            raise ValueError("confirmation and joint counts must be positive")
        for name in (
            "lost_after_s",
            "base_center_gate",
            "center_speed_gate",
            "maximum_center_gate",
            "prediction_limit_s",
            "velocity_time_constant_s",
            "maximum_speed",
        ):
            value = getattr(self, name)
            if not isfinite(value) or value <= 0:
                raise ValueError(f"{name} must be finite and positive")
        for name in (
            "joint_score_threshold",
            "minimum_pose_extent",
            "max_match_cost",
            "ambiguity_margin",
            "overlap_iou",
        ):
            value = getattr(self, name)
            if not isfinite(value) or not 0 < value <= 1:
                raise ValueError(f"{name} must be in (0, 1]")


@dataclass
class _Track:
    track_id: str
    detection: Detection
    timestamp_ns: int
    hits: int = 1
    misses: int = 0
    velocity: tuple[float, float] = (0.0, 0.0)


def _box(detection: Detection) -> tuple[float, float, float, float]:
    box = detection["box"]
    return float(box["x"]), float(box["y"]), float(box["width"]), float(box["height"])


def _valid_detection(detection: Detection) -> bool:
    try:
        values = _box(detection)
        return all(isfinite(value) for value in values) and values[2] > 0 and values[3] > 0
    except (KeyError, TypeError, ValueError, OverflowError):
        return False


def _center(box: tuple[float, float, float, float]) -> tuple[float, float]:
    x, y, width, height = box
    return x + width / 2, y + height / 2


def _iou(
    first: tuple[float, float, float, float],
    second: tuple[float, float, float, float],
) -> float:
    ax, ay, aw, ah = first
    bx, by, bw, bh = second
    intersection = max(0.0, min(ax + aw, bx + bw) - max(ax, bx)) * max(
        0.0, min(ay + ah, by + bh) - max(ay, by)
    )
    union = aw * ah + bw * bh - intersection
    return intersection / union if union > 0 else 0.0


def _reliable_joint(joint: Any, threshold: float) -> bool:
    if not isinstance(joint, dict):
        return False
    if joint.get("status") != "observed" or not joint.get("inFrame", True):
        return False
    values = (joint.get("x"), joint.get("y"), joint.get("score"))
    return (
        all(isinstance(value, (int, float)) and isfinite(value) for value in values)
        and joint["score"] >= threshold
    )


def _pose_distance(first: Detection, second: Detection, config: TrackingConfig) -> float | None:
    """Compare visible body shape after centering/scaling, without personal re-ID."""
    first_joints = first.get("joints", {})
    second_joints = second.get("joints", {})
    first_box, second_box = _box(first), _box(second)
    first_center, second_center = _center(first_box), _center(second_box)
    first_scale = max(hypot(first_box[2], first_box[3]), 1e-6)
    second_scale = max(hypot(second_box[2], second_box[3]), 1e-6)
    distances = []
    first_points: list[tuple[float, float]] = []
    second_points: list[tuple[float, float]] = []
    for name in first_joints.keys() & second_joints.keys() & BODY_JOINTS:
        first_joint, second_joint = first_joints[name], second_joints[name]
        if not _reliable_joint(first_joint, config.joint_score_threshold) or not _reliable_joint(
            second_joint, config.joint_score_threshold
        ):
            continue
        ax = (first_joint["x"] - first_center[0]) / first_scale
        ay = (first_joint["y"] - first_center[1]) / first_scale
        bx = (second_joint["x"] - second_center[0]) / second_scale
        by = (second_joint["y"] - second_center[1]) / second_scale
        distances.append(hypot(ax - bx, ay - by))
        first_points.append((ax, ay))
        second_points.append((bx, by))
    if len(distances) < config.minimum_pose_joints:
        return None
    for points in (first_points, second_points):
        span = hypot(
            max(x for x, _ in points) - min(x for x, _ in points),
            max(y for _, y in points) - min(y for _, y in points),
        )
        if span < config.minimum_pose_extent:
            # Coincident or almost collapsed keypoints are not pose evidence,
            # regardless of how many high source scores the model returned.
            return None
    return min(1.0, sum(distances) / len(distances))


class Tracker:
    """Associate up to six current detections; return no person for a missing box.

    IDs are scoped to this camera-local stream epoch. Ambiguity retires implicated
    IDs: once people separate, they get tentative new IDs instead of a guessed
    recovery. A session layer must never equate these IDs with score ownership.
    """

    def __init__(self, mode: TrackingMode = "pose", config: TrackingConfig | None = None):
        if mode not in ("iou", "pose"):
            raise ValueError("tracking mode must be 'iou' or 'pose'")
        self.mode = mode
        self.config = config or TrackingConfig()
        self._tracks: list[_Track] = []
        self._epoch: str | None = None
        self._generation = 0
        self._next_id = 1
        self._last_timestamp_ns: int | None = None

    def reset(self, epoch: str | None = None) -> None:
        self._tracks.clear()
        self._epoch = epoch
        self._generation += 1
        self._next_id = 1
        self._last_timestamp_ns = None

    def _cost(self, track: _Track, detection: Detection, timestamp_ns: int) -> float | None:
        return self._geometry_cost(track, detection, timestamp_ns, predict=True)

    def _geometry_cost(
        self, track: _Track, detection: Detection, timestamp_ns: int, *, predict: bool
    ) -> float | None:
        config = self.config
        elapsed_s = (timestamp_ns - track.timestamp_ns) / 1e9
        prediction_s = min(elapsed_s, config.prediction_limit_s) if predict else 0.0
        x, y, width, height = _box(track.detection)
        predicted = (
            x + track.velocity[0] * prediction_s,
            y + track.velocity[1] * prediction_s,
            width,
            height,
        )
        current = _box(detection)
        px, py = _center(predicted)
        cx, cy = _center(current)
        distance = hypot(cx - px, cy - py)
        gate = min(
            config.maximum_center_gate,
            config.base_center_gate + config.center_speed_gate * elapsed_s,
        )
        if distance > gate:
            return None
        overlap_cost = 1.0 - _iou(predicted, current)
        motion_cost = distance / gate
        shape_cost = (
            _pose_distance(track.detection, detection, config) if self.mode == "pose" else None
        )
        if shape_cost is None:
            cost = 0.70 * overlap_cost + 0.30 * motion_cost
        else:
            cost = 0.50 * overlap_cost + 0.30 * motion_cost + 0.20 * shape_cost
        return cost if cost <= config.max_match_cost else None

    def update(
        self,
        detections: list[Detection],
        timestamp_ns: int,
        epoch: str | None = None,
    ) -> list[Detection]:
        if not isinstance(timestamp_ns, int) or isinstance(timestamp_ns, bool) or timestamp_ns < 0:
            raise ValueError("timestamp_ns must be a nonnegative integer")
        if len(detections) > self.config.max_detections:
            raise ValueError("detections exceed the configured diagnostic capacity")
        if epoch is not None and epoch != self._epoch:
            self.reset(epoch)
        if self._last_timestamp_ns is not None and timestamp_ns <= self._last_timestamp_ns:
            raise ValueError("tracking timestamps must increase within a stream epoch")
        self._last_timestamp_ns = timestamp_ns
        config = self.config
        current = [deepcopy(detection) for detection in detections if _valid_detection(detection)]
        self._tracks = [
            track
            for track in self._tracks
            if (timestamp_ns - track.timestamp_ns) / 1e9 <= config.lost_after_s
        ]
        costs = [
            [self._cost(track, detection, timestamp_ns) for detection in current]
            for track in self._tracks
        ]
        observed_costs = [
            [
                self._geometry_cost(track, detection, timestamp_ns, predict=False)
                for detection in current
            ]
            for track in self._tracks
        ]
        ambiguous: set[int] = set()
        # Close body overlap is observable uncertainty even with no previous IDs.
        for index, detection in enumerate(current):
            for other_index in range(index):
                if _iou(_box(detection), _box(current[other_index])) >= config.overlap_iou:
                    ambiguous.update((index, other_index))
        # Row and column near-ties capture both two people competing for one
        # merged detection and one old track competing for two similar detections.
        for column in range(len(current)):
            candidates = sorted(
                cost for row in range(len(costs)) if (cost := costs[row][column]) is not None
            )
            if len(candidates) > 1 and candidates[1] - candidates[0] <= config.ambiguity_margin:
                ambiguous.add(column)
        for row in costs:
            candidates_with_indices = sorted(
                (cost, index) for index, cost in enumerate(row) if cost is not None
            )
            if (
                len(candidates_with_indices) > 1
                and candidates_with_indices[1][0] - candidates_with_indices[0][0]
                <= config.ambiguity_margin
            ):
                best = candidates_with_indices[0][0]
                ambiguous.update(
                    index
                    for cost, index in candidates_with_indices
                    if cost - best <= config.ambiguity_margin
                )

        def retired_rows() -> set[int]:
            retired: set[int] = set()
            for row, track in enumerate(self._tracks):
                old_box = _box(track.detection)
                old_center = _center(old_box)
                for column in ambiguous:
                    new_box = _box(current[column])
                    new_center = _center(new_box)
                    if (
                        costs[row][column] is not None
                        or _iou(old_box, new_box) > 0
                        or hypot(old_center[0] - new_center[0], old_center[1] - new_center[1])
                        <= config.maximum_center_gate
                    ):
                        retired.add(row)
                        break
            return retired

        def assign(
            matrix: list[list[float | None]],
            usable_rows: list[int],
            usable_columns: list[int],
            forbidden: tuple[int, int] | None = None,
        ) -> tuple[float, tuple[int | None, ...]]:
            @cache
            def solve(index: int, used_mask: int) -> tuple[float, tuple[int | None, ...]]:
                if index == len(usable_columns):
                    return 0.0, ()
                column = usable_columns[index]
                tail_cost, tail = solve(index + 1, used_mask)
                best = (config.max_match_cost + 0.01 + tail_cost, (None, *tail))
                for bit, row in enumerate(usable_rows):
                    cost = matrix[row][column]
                    if used_mask & (1 << bit) or cost is None or forbidden == (column, row):
                        continue
                    tail_cost, tail = solve(index + 1, used_mask | (1 << bit))
                    candidate = (cost + tail_cost, (row, *tail))
                    if candidate[0] < best[0]:
                        best = candidate
                return best

            result = solve(0, 0)
            solve.cache_clear()
            return result

        def conflicts(
            columns: list[int], first: tuple[int | None, ...], second: tuple[int | None, ...]
        ) -> set[int]:
            conflicting = {
                column
                for column, first_row, second_row in zip(columns, first, second, strict=True)
                if first_row is not None and second_row is not None and first_row != second_row
            }
            first_columns = {
                row: column for column, row in zip(columns, first, strict=True) if row is not None
            }
            second_columns = {
                row: column for column, row in zip(columns, second, strict=True) if row is not None
            }
            for row in first_columns.keys() & second_columns.keys():
                if first_columns[row] != second_columns[row]:
                    conflicting.update((first_columns[row], second_columns[row]))
            return conflicting

        # A globally tied assignment can exist even when every row/column has
        # a unique best candidate. Forbid each chosen edge in turn to measure
        # that identity's actual assignment margin, including unmatched options.
        # Every retry retires at least one column, so work remains bounded.
        while True:
            retired = retired_rows()
            usable_rows = [row for row in range(len(costs)) if row not in retired]
            usable_columns = [column for column in range(len(current)) if column not in ambiguous]
            best_cost, chosen = assign(costs, usable_rows, usable_columns)
            uncertain: set[int] = set()
            for index, row in enumerate(chosen):
                if row is None:
                    continue
                alternative_cost, alternative = assign(
                    costs, usable_rows, usable_columns, forbidden=(usable_columns[index], row)
                )
                if alternative_cost - best_cost <= config.ambiguity_margin:
                    uncertain.update(
                        column
                        for column, first, second in zip(
                            usable_columns, chosen, alternative, strict=True
                        )
                        if first != second
                    )
            # A disturbed box can create velocity that predicts an old ID onto
            # another person. Prediction cannot overrule a feasible conflicting
            # assignment from the last measured boxes. An isolated predicted
            # match remains usable when measured geometry has no competitor.
            prediction_changed = any(
                costs[row][column] != observed_costs[row][column]
                for row in usable_rows
                for column in usable_columns
            )
            if prediction_changed and len(usable_rows) * len(usable_columns) > 1:
                observed_cost, observed = assign(observed_costs, usable_rows, usable_columns)
                uncertain.update(conflicts(usable_columns, chosen, observed))
                row_choices = {
                    row: sum(observed_costs[row][column] is not None for column in usable_columns)
                    for row in usable_rows
                }
                column_choices = {
                    column: sum(observed_costs[row][column] is not None for row in usable_rows)
                    for column in usable_columns
                }
                for index, row in enumerate(observed):
                    if row is None:
                        continue
                    column = usable_columns[index]
                    if row_choices[row] == 1 and column_choices[column] == 1:
                        continue  # Removing an isolated edge only leaves it unmatched.
                    alternative_cost, alternative = assign(
                        observed_costs,
                        usable_rows,
                        usable_columns,
                        forbidden=(column, row),
                    )
                    if alternative_cost - observed_cost <= config.ambiguity_margin:
                        # A measured tie is competing evidence too; solver order
                        # must not decide whether prediction's identity survives.
                        uncertain.update(conflicts(usable_columns, chosen, alternative))
            if not uncertain:
                break
            ambiguous.update(uncertain)
        assignments = dict(zip(usable_columns, chosen, strict=True))
        retained = [track for row, track in enumerate(self._tracks) if row not in retired]
        matched: set[str] = set()
        for column, detection in enumerate(current):
            if column in ambiguous:
                detection.update(trackId=None, identity="ambiguous")
                continue
            row = assignments.get(column)
            if row is None:
                track_id = f"g{self._generation}-t{self._next_id}"
                self._next_id += 1
                track = _Track(track_id, deepcopy(detection), timestamp_ns)
                retained.append(track)
            else:
                track = self._tracks[row]
                elapsed_s = (timestamp_ns - track.timestamp_ns) / 1e9
                old_x, old_y = _center(_box(track.detection))
                new_x, new_y = _center(_box(detection))
                vx = max(
                    -config.maximum_speed, min(config.maximum_speed, (new_x - old_x) / elapsed_s)
                )
                vy = max(
                    -config.maximum_speed, min(config.maximum_speed, (new_y - old_y) / elapsed_s)
                )
                # Weight velocity by source elapsed time, not frame count: a
                # short noisy step must not dominate a later long prediction.
                alpha = 1.0 - exp(-elapsed_s / config.velocity_time_constant_s)
                track.velocity = (
                    track.velocity[0] + alpha * (vx - track.velocity[0]),
                    track.velocity[1] + alpha * (vy - track.velocity[1]),
                )
                track.hits = track.hits + 1 if track.misses == 0 else 1
                track.misses = 0
                track.detection = deepcopy(detection)
                track.timestamp_ns = timestamp_ns
            matched.add(track.track_id)
            state = "confident" if track.hits >= config.confirmations else "tentative"
            detection.update(trackId=track.track_id, identity=state)
        for track in retained:
            if track.track_id not in matched:
                track.misses += 1
        if ambiguous:
            # An unseen old track could be hidden in the ambiguous group. Only
            # clear current associations survive; absence is not recovery proof.
            retained = [track for track in retained if track.track_id in matched]
        # Missing tracks remain internal and bounded. They never inflate count.
        retained.sort(key=lambda track: track.timestamp_ns, reverse=True)
        self._tracks = retained[: config.max_tracks]
        return current
