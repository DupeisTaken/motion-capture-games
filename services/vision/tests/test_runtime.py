import json
import struct
import time
from copy import deepcopy

import cv2
import numpy as np
import pytest
from motion_vision import runtime
from motion_vision.runtime import MAX_CAPTURE_AGE_NS, StartRequest, VisionRuntime, encode_packet
from motion_vision.sources import CapturedFrame, demo_frame
from pydantic import ValidationError


def unpack(packet):
    length = struct.unpack(">I", packet[:4])[0]
    return json.loads(packet[4 : 4 + length]), packet[4 + length :]


def test_demo_counts_current_observations_including_zero_without_camera():
    for elapsed, expected in [(0, 0), (7, 1), (13, 2), (19, 3)]:
        image, people = demo_frame(elapsed, "cycle")
        assert image.shape == (540, 960, 3)
        assert len(people) == expected
    assert len(demo_frame(0, "three")[1]) == 3
    assert demo_frame(3, "empty")[1] == []


def test_start_request_rejects_unbounded_capacity_and_invalid_source():
    for invalid in [
        {"maxPeople": 1000},
        {"cameraIndex": -1},
        {"maxPeople": True},
        {"source": "network"},
        {"unexpected": 1},
    ]:
        with pytest.raises(ValidationError):
            StartRequest(**invalid)


def test_latest_paired_frame_and_restart_epoch(monkeypatch):
    def forbidden_camera(*args):
        raise AssertionError("Synthetic source opened a camera")

    monkeypatch.setattr(runtime, "CameraSource", forbidden_camera)
    vision = VisionRuntime()
    try:
        vision.start(StartRequest(source="demo", demoScenario="three", maxPeople=3))
        sequence, first = vision.next_packet(0)
        assert first is not None
        observation, jpeg = unpack(first)
        decoded = cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
        assert observation["detectedCount"] == len(observation["people"]) == 3
        assert observation["capacityReached"] is True
        assert observation["algorithm"] == "synthetic"
        assert observation["clock"]["quality"] == "synthetic"
        assert decoded.shape[:2] == (observation["image"]["height"], observation["image"]["width"])
        assert int(observation["processedAtNs"]) >= int(observation["capturedAtNs"])
        time.sleep(0.12)
        newer_sequence, newer = vision.next_packet(sequence)
        assert newer is not None and newer_sequence > sequence
        assert vision.packet is newer  # A slow reader gets current state, no historical queue.
        vision.start(StartRequest(source="demo", demoScenario="empty"))
        _, empty_packet = vision.next_packet(0)
        assert empty_packet is not None
        empty, _ = unpack(empty_packet)
        assert empty["epoch"] != observation["epoch"]
        assert empty["detectedCount"] == 0
    finally:
        vision.stop()
    assert vision.status()["state"] == "idle"
    assert vision.next_packet(0)[1] is None


def test_provider_failure_clears_previous_frame(monkeypatch):
    def fail(*args):
        raise RuntimeError("Test model unavailable")

    vision = VisionRuntime()
    vision.start(StartRequest(source="demo", demoScenario="three"))
    assert vision.next_packet(0)[1] is not None
    monkeypatch.setattr(runtime, "create_provider", fail)
    try:
        vision.start(StartRequest(source="camera"))
        for _ in range(100):
            if vision.status()["state"] == "error":
                break
            time.sleep(0.01)
        assert vision.status()["state"] == "error"
        assert vision.status()["detectedCount"] == 0
        assert vision.next_packet(0)[1] is None
    finally:
        vision.stop()


def test_slow_inference_discards_old_camera_observation(monkeypatch):
    now = 1_000_000_000
    image, people = demo_frame(0, "three")
    calls = []

    class Camera:
        def __init__(self, _index):
            pass

        def start(self):
            pass

        def next(self, after):
            if after == 0:
                return CapturedFrame(1, now, image)
            time.sleep(0.01)
            return None

        def close(self):
            return True

    class SlowProvider:
        model_id = "fake-slow-provider"

        def infer(self, _image, timestamp_ns):
            nonlocal now
            calls.append(timestamp_ns)
            now += MAX_CAPTURE_AGE_NS + 1
            return people

        def close(self):
            pass

    monkeypatch.setattr(runtime, "CameraSource", Camera)
    monkeypatch.setattr(runtime, "create_provider", lambda *_: SlowProvider())
    vision = VisionRuntime(clock_ns=lambda: now)
    try:
        vision.start(StartRequest(source="camera"))
        assert vision.next_packet(0)[1] is None
        assert calls == [1_000_000_000]
        assert vision.status()["state"] == "stale"
        assert vision.status()["detectedCount"] == 0
    finally:
        vision.stop()


def test_late_reader_cannot_reuse_expired_camera_packet():
    now = 1_000_000_000
    vision = VisionRuntime(clock_ns=lambda: now)
    vision.state = "running"
    vision.packet = b"previous-camera-frame"
    vision.packet_number = 1
    vision.packet_capture_at = now
    vision.detected_count = 1

    now += MAX_CAPTURE_AGE_NS + 1

    assert vision.next_packet(0) == (1, None)
    assert vision.status()["state"] == "stale"
    assert vision.status()["detectedCount"] == 0


def test_blocked_capture_owner_prevents_new_source():
    class BlockedCamera:
        def close(self):
            return False

    vision = VisionRuntime()
    owner = BlockedCamera()
    vision.camera = owner
    with pytest.raises(RuntimeError, match="camera driver is still stopping"):
        vision.start(StartRequest(source="demo"))
    assert vision.camera is owner
    assert vision.worker is None


def test_encoder_rejects_wrong_capacity_and_duplicate_identity():
    observation = json.loads(
        (runtime.ROOT / "contracts/examples/synthetic-observation.json").read_text()
    )
    jpeg = b"\xff\xd8\xff\xd9"
    encode_packet(observation, jpeg)
    wrong_capacity = deepcopy(observation)
    wrong_capacity["capacityReached"] = True
    with pytest.raises(ValueError, match="capacity flag"):
        encode_packet(wrong_capacity, jpeg)
    duplicate = deepcopy(observation)
    duplicate["people"].append(deepcopy(duplicate["people"][0]))
    duplicate["detectedCount"] = 2
    with pytest.raises(ValueError, match="multiple detections"):
        encode_packet(duplicate, jpeg)
