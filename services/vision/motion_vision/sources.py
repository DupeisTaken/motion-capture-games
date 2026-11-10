"""Single-owner camera acquisition and an explicitly synthetic diagnostic source."""

from __future__ import annotations

import math
import threading
from dataclasses import dataclass
from typing import Any, cast

import cv2
import numpy as np

from .providers import COCO17, Image, Person, joint
from .timing import host_time_ns


@dataclass(frozen=True)
class CapturedFrame:
    sequence: int
    captured_at_ns: int
    image: Image


class CameraSource:
    """Capture replaces one pending frame; inference never queues camera history."""

    def __init__(self, index: int):
        self.index = index
        self.condition = threading.Condition()
        self.stop_event = threading.Event()
        self.latest: CapturedFrame | None = None
        self.error: str | None = None
        self.thread = threading.Thread(target=self._capture, name="motion-camera", daemon=True)

    def start(self) -> None:
        self.thread.start()

    def _capture(self) -> None:
        capture = None
        try:
            if self.stop_event.is_set():
                return
            capture = cv2.VideoCapture(self.index)
            if not capture.isOpened():
                raise RuntimeError(
                    f"Camera {self.index} could not be opened. Check its index and camera permission, then retry."
                )
            capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            capture.set(cv2.CAP_PROP_FPS, 30)
            # A driver hint, not a guarantee: application pending storage is always one frame.
            capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            sequence = 0
            while not self.stop_event.is_set():
                ok, image = capture.read()
                captured_at_ns = host_time_ns()
                if not ok or image is None:
                    raise RuntimeError(
                        "Camera stopped delivering frames. Stop, reconnect the camera and retry."
                    )
                if (
                    image.dtype != np.uint8
                    or image.ndim != 3
                    or image.shape[2] != 3
                    or min(image.shape[:2]) <= 0
                ):
                    raise RuntimeError(
                        "Camera format is unsupported. Select an 8-bit BGR camera mode and retry."
                    )
                # The runtime boundary checked dtype/shape before narrowing OpenCV's broad MatLike.
                image = cast(Image, image)
                sequence += 1
                with self.condition:
                    self.latest = CapturedFrame(sequence, captured_at_ns, image)
                    self.condition.notify_all()
        except Exception as error:
            with self.condition:
                self.error = str(error)
                self.latest = None
                self.condition.notify_all()
        finally:
            # The same capture owner opens, reads and releases the device.
            if capture is not None:
                capture.release()

    def next(self, after: int, timeout: float = 0.5) -> CapturedFrame | None:
        with self.condition:
            self.condition.wait_for(
                lambda: (
                    self.error is not None
                    or self.stop_event.is_set()
                    or (self.latest is not None and self.latest.sequence > after)
                ),
                timeout,
            )
            if self.error:
                raise RuntimeError(self.error)
            if self.stop_event.is_set():
                return None
            return self.latest if self.latest is not None and self.latest.sequence > after else None

    def close(self) -> bool:
        self.stop_event.set()
        with self.condition:
            self.latest = None
            self.condition.notify_all()
        if self.thread.is_alive() and self.thread is not threading.current_thread():
            self.thread.join(timeout=2)
        return not self.thread.is_alive()


# Anatomical left/right here are from the figure's perspective, independent of mirroring.
BASE_POINTS = {
    "nose": (0, -0.30),
    "left_eye": (0.015, -0.314),
    "right_eye": (-0.015, -0.314),
    "left_ear": (0.033, -0.305),
    "right_ear": (-0.033, -0.305),
    "left_shoulder": (0.060, -0.20),
    "right_shoulder": (-0.060, -0.20),
    "left_elbow": (0.090, -0.08),
    "right_elbow": (-0.10, -0.15),
    "left_wrist": (0.12, 0.02),
    "right_wrist": (-0.15, -0.22),
    "left_hip": (0.045, 0.04),
    "right_hip": (-0.045, 0.04),
    "left_knee": (0.06, 0.22),
    "right_knee": (-0.07, 0.22),
    "left_ankle": (0.08, 0.39),
    "right_ankle": (-0.09, 0.39),
}
DEMO_BONES = [
    ("left_shoulder", "right_shoulder"),
    ("left_shoulder", "left_elbow"),
    ("left_elbow", "left_wrist"),
    ("right_shoulder", "right_elbow"),
    ("right_elbow", "right_wrist"),
    ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"),
    ("left_hip", "right_hip"),
    ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"),
    ("right_hip", "right_knee"),
    ("right_knee", "right_ankle"),
]


def demo_frame(elapsed: float, scenario: str) -> tuple[Image, list[Person]]:
    width, height = 960, 540
    image = np.full((height, width, 3), (226, 232, 235), dtype=np.uint8)
    cv2.rectangle(image, (0, 414), (width, height), (204, 214, 220), -1)
    cv2.line(image, (0, 414), (width, 414), (181, 195, 204), 1)
    for x in range(80, width, 160):
        cv2.line(image, (x, 0), (x, 414), (215, 224, 230), 1)
    count = (
        0
        if scenario == "empty"
        else 3
        if scenario == "three"
        else [0, 1, 2, 3][min(3, int(elapsed % 24 / 6))]
    )
    centers = {1: [0.5], 2: [0.33, 0.67], 3: [0.24, 0.5, 0.76]}.get(count, [])
    people = []
    for index, base_x in enumerate(centers):
        center_x = base_x + 0.025 * math.sin(elapsed * 0.65 + index)
        center_y = 0.46 + 0.01 * math.cos(elapsed * 0.8 + index)
        scale = 0.88 if index == 1 else 0.92
        points: dict[str, Any] = {}
        for name in COCO17:
            x, y = BASE_POINTS[name]
            if name == "right_elbow":
                y -= 0.035 * math.sin(elapsed * 1.8 + index)
            if name == "right_wrist":
                x += 0.025 * math.sin(elapsed * 1.8 + index)
                y -= 0.08 * math.sin(elapsed * 1.8 + index)
            if name == "left_wrist":
                x += 0.025 * math.cos(elapsed * 1.3 + index)
            points[name] = joint(center_x + x * scale, center_y + y * scale, 0.96)

        def pixel(name: str, person_points: dict[str, Any] = points) -> tuple[int, int]:
            return round(person_points[name]["x"] * width), round(person_points[name]["y"] * height)

        torso = np.array(
            [pixel(name) for name in ("left_shoulder", "right_shoulder", "right_hip", "left_hip")],
            dtype=np.int32,
        )
        silhouette = [(142, 163, 179), (154, 160, 178), (154, 178, 165)][index]
        cv2.fillConvexPoly(image, torso, silhouette)
        for a, b in DEMO_BONES:
            cv2.line(image, pixel(a), pixel(b), silhouette, 23, cv2.LINE_AA)
        cv2.circle(image, pixel("nose"), 21, silhouette, -1, cv2.LINE_AA)
        xs, ys = [item["x"] for item in points.values()], [item["y"] for item in points.values()]
        people.append(
            {
                "box": {
                    "x": min(xs),
                    "y": min(ys) - 0.03,
                    "width": max(xs) - min(xs),
                    "height": max(ys) - min(ys) + 0.05,
                },
                "joints": points,
            }
        )
    return image, people
