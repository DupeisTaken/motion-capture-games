"""Replaceable CPU pose adapters; all exported joints use anatomical names."""

from __future__ import annotations

import math
import os
from collections.abc import Sequence
from typing import Any, Protocol

import cv2
import numpy as np
from numpy.typing import NDArray

from .models import artifact_paths, manifest

Image = NDArray[np.uint8]
Person = dict[str, Any]
COCO17 = (
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
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
MP_INDICES = (0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28)
MP_FINGERS = (
    ("left_index_finger", 19),
    ("right_index_finger", 20),
    ("left_pinky_finger", 17),
    ("right_pinky_finger", 18),
)
# Provisional unitless diagnostic thresholds, versioned here with the adapter.
# A score above this line labels a joint observed; it is not a spatial-error probability.
JOINT_OBSERVED_SCORE = 0.5
# Filter low-scoring RTMDet candidates before the more expensive per-person pose step.
DETECTION_SCORE = 0.4
DETECTOR_MEAN = np.array([103.53, 116.28, 123.675], dtype=np.float32)
DETECTOR_STD = np.array([57.375, 57.12, 58.395], dtype=np.float32)
POSE_MEAN = np.array([123.675, 116.28, 103.53], dtype=np.float32)
POSE_STD = np.array([58.395, 57.12, 57.375], dtype=np.float32)


class PoseProvider(Protocol):
    model_id: str

    def infer(self, image: Image, timestamp_ns: int) -> list[Person]: ...
    def close(self) -> None: ...


def joint(x: Any, y: Any, score: Any) -> dict[str, Any]:
    try:
        x, y, score = float(x), float(y), float(score)
    except (TypeError, ValueError):
        x, y, score = math.nan, math.nan, 0.0
    if not all(math.isfinite(value) for value in (x, y, score)) or score <= 0:
        return {"x": None, "y": None, "score": 0.0, "status": "missing", "inFrame": False}
    score = min(1.0, max(0.0, score))
    return {
        "x": x,
        "y": y,
        "score": score,
        "status": "observed" if score >= JOINT_OBSERVED_SCORE else "estimated",
        "inFrame": 0 <= x <= 1 and 0 <= y <= 1,
    }


def landmark_joint(item: Any) -> dict[str, Any]:
    # Optional Tasks fields can be absent: unknown quality is not a measured confidence.
    quality = (item.visibility, item.presence)
    score = (
        min(quality)
        if all(value is not None and math.isfinite(value) for value in quality)
        else None
    )
    return joint(item.x, item.y, score)


def landmark_person(landmarks: list[Any]) -> Person | None:
    joints = {
        name: landmark_joint(landmarks[index])
        for name, index in zip(COCO17, MP_INDICES, strict=True)
    }
    usable = [item for item in joints.values() if item["score"] >= 0.25 and item["x"] is not None]
    if len(usable) < 3:
        return None
    xs, ys = [item["x"] for item in usable], [item["y"] for item in usable]
    x, y = min(xs), min(ys)
    # Optional finger evidence does not change body bounds or person admission.
    joints.update((name, landmark_joint(landmarks[index])) for name, index in MP_FINGERS)
    return {
        "box": {"x": x, "y": y, "width": max(max(xs) - x, 0.01), "height": max(max(ys) - y, 0.01)},
        "joints": joints,
    }


class MediaPipeProvider:
    def __init__(self, capacity: int):
        import mediapipe as mp

        paths = artifact_paths("mediapipe")
        self.model_id = manifest()["models"]["mediapipe"]["modelId"]
        self.mp = mp
        self.last_ms = -1
        options = mp.tasks.vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(paths["pose"])),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_poses=capacity,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_segmentation_masks=False,
        )
        self.landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(options)

    def infer(self, image: Image, timestamp_ns: int) -> list[Person]:
        # Tasks requires strictly increasing milliseconds even at irregular source intervals.
        timestamp_ms = max(self.last_ms + 1, timestamp_ns // 1_000_000)
        self.last_ms = timestamp_ms
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        result = self.landmarker.detect_for_video(
            self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=rgb), timestamp_ms
        )
        people = [landmark_person(points) for points in result.pose_landmarks]
        return [person for person in people if person is not None]

    def close(self) -> None:
        self.landmarker.close()


def detector_input(image: Image) -> tuple[NDArray[np.float32], tuple[float, float]]:
    height, width = image.shape[:2]
    ratio = min(320 / width, 320 / height)
    resized_width, resized_height = round(width * ratio), round(height * ratio)
    padded = np.full((320, 320, 3), 114, dtype=np.uint8)
    padded[:resized_height, :resized_width] = cv2.resize(image, (resized_width, resized_height))
    # The selected archive's pipeline explicitly uses BGR (to_rgb=false).
    values = (padded.astype(np.float32) - DETECTOR_MEAN) / DETECTOR_STD
    return np.ascontiguousarray(values.transpose(2, 0, 1)[None]), (
        resized_width / width,
        resized_height / height,
    )


def detection_boxes(
    outputs: Sequence[Any], scales: tuple[float, float], shape: tuple[int, ...]
) -> list[list[float]]:
    detections = np.asarray(outputs[0])
    if detections.ndim != 3 or detections.shape[-1] != 5:
        raise RuntimeError(
            "Selected RTMDet export does not have expected [batch, detections, xyxy+score] outputs."
        )
    labels = np.asarray(outputs[1]).reshape(-1) if len(outputs) > 1 else None
    height, width = shape[:2]
    result = []
    rows = detections[0]
    accepted = np.isfinite(rows).all(axis=1) & (rows[:, 4] >= DETECTION_SCORE)
    if labels is not None:
        accepted &= labels == 0
    # Filter the padded detector output in NumPy before crossing into Python per person.
    for row in rows[accepted]:
        x1, y1, x2, y2 = (
            float(row[0] / scales[0]),
            float(row[1] / scales[1]),
            float(row[2] / scales[0]),
            float(row[3] / scales[1]),
        )
        x1, y1, x2, y2 = max(0.0, x1), max(0.0, y1), min(float(width), x2), min(float(height), y2)
        if x2 - x1 >= 2 and y2 - y1 >= 2:
            result.append([x1, y1, x2, y2])
    return result


def pose_input(
    image: Image, box: list[float]
) -> tuple[NDArray[np.float32], NDArray[np.float32], NDArray[np.float32]]:
    x1, y1, x2, y2 = box
    center = np.array([(x1 + x2) / 2, (y1 + y2) / 2], dtype=np.float32)
    width, height = x2 - x1, y2 - y1
    aspect = 192 / 256
    if width > height * aspect:
        height = width / aspect
    else:
        width = height * aspect
    scale = np.array([width, height], dtype=np.float32) * 1.25
    # No rotation: this affine maps the padded box center to the192x256 input center.
    transform = np.array(
        [
            [192 / scale[0], 0, 96 - center[0] * 192 / scale[0]],
            [0, 256 / scale[1], 128 - center[1] * 256 / scale[1]],
        ],
        dtype=np.float32,
    )
    cropped = cv2.warpAffine(image, transform, (192, 256), flags=cv2.INTER_LINEAR)
    rgb = cv2.cvtColor(cropped, cv2.COLOR_BGR2RGB).astype(np.float32)
    values = (rgb - POSE_MEAN) / POSE_STD
    return np.ascontiguousarray(values.transpose(2, 0, 1)[None]), center, scale


def decode_pose(
    outputs: Sequence[Any],
    center: NDArray[np.float32],
    scale: NDArray[np.float32],
    shape: tuple[int, ...],
) -> dict[str, dict[str, Any]]:
    simcc_x, simcc_y = np.asarray(outputs[0])[0], np.asarray(outputs[1])[0]
    if simcc_x.shape != (17, 384) or simcc_y.shape != (17, 512):
        raise RuntimeError(
            "Selected RTMPose export does not have the expected COCO17 SimCC outputs."
        )
    positions = (
        np.stack([simcc_x.argmax(axis=1), simcc_y.argmax(axis=1)], axis=-1).astype(np.float32) / 2
    )
    scores = np.minimum(simcc_x.max(axis=1), simcc_y.max(axis=1))
    pixels = positions / np.array([192, 256]) * scale + center - scale / 2
    height, width = shape[:2]
    return {
        name: joint(float(point[0] / width), float(point[1] / height), float(score))
        for name, point, score in zip(COCO17, pixels, scores, strict=True)
    }


class RTMPoseProvider:
    def __init__(self, capacity: int):
        import onnxruntime as ort

        paths = artifact_paths("rtmpose")
        options = ort.SessionOptions()
        # Pose crops run once per person. Reserve CPU for capture, JPEG and the browser.
        options.intra_op_num_threads = min(4, max(1, (os.cpu_count() or 2) // 2))
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        # The two sessions run in series; idle workers must not compete with the active one.
        options.add_session_config_entry("session.intra_op.allow_spinning", "0")
        self.detector = ort.InferenceSession(
            str(paths["detector"]), sess_options=options, providers=["CPUExecutionProvider"]
        )
        self.pose = ort.InferenceSession(
            str(paths["pose"]), sess_options=options, providers=["CPUExecutionProvider"]
        )
        self.model_id = manifest()["models"]["rtmpose"]["modelId"]
        self.capacity = capacity
        self.detector_input_name = self.detector.get_inputs()[0].name
        self.pose_input_name = self.pose.get_inputs()[0].name

    def infer(self, image: Image, timestamp_ns: int) -> list[Person]:
        tensor, scales = detector_input(image)
        detected = self.detector.run(None, {self.detector_input_name: tensor})
        boxes = detection_boxes(detected, scales, image.shape)
        people = []
        for box in boxes[: self.capacity]:
            tensor, center, scale = pose_input(image, box)
            output = self.pose.run(None, {self.pose_input_name: tensor})
            joints = decode_pose(output, center, scale, image.shape)
            height, width = image.shape[:2]
            x1, y1, x2, y2 = box
            people.append(
                {
                    "box": {
                        "x": x1 / width,
                        "y": y1 / height,
                        "width": (x2 - x1) / width,
                        "height": (y2 - y1) / height,
                    },
                    "joints": joints,
                }
            )
        return people

    def close(self) -> None:
        pass


def create_provider(algorithm: str, capacity: int) -> PoseProvider:
    if algorithm == "mediapipe":
        return MediaPipeProvider(capacity)
    if algorithm == "rtmpose":
        return RTMPoseProvider(capacity)
    raise ValueError("Unknown pose algorithm")
