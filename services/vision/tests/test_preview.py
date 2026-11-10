"""Preview freshness and inference independence, with no physical camera or model."""

import json
import threading
import time
from copy import deepcopy

import fastjsonschema
import pytest
from motion_vision import runtime
from motion_vision.runtime import MAX_CAPTURE_AGE_NS, StartRequest, VisionRuntime
from motion_vision.sources import CapturedFrame, demo_frame


def test_preview_advances_while_inference_is_blocked(monkeypatch):
    image, people = demo_frame(0, "three")
    entered = threading.Event()
    release = threading.Event()

    class Camera:
        def __init__(self, _index):
            self.latest = CapturedFrame(1, time.monotonic_ns(), image)
            self.condition = threading.Condition()
            self.closed = False

        def start(self):
            pass

        def next(self, after):
            with self.condition:
                self.condition.wait_for(
                    lambda: self.closed or self.latest.sequence > after, timeout=0.1
                )
                return self.latest if not self.closed and self.latest.sequence > after else None

        def advance(self):
            with self.condition:
                self.latest = CapturedFrame(2, time.monotonic_ns(), image)
                self.condition.notify_all()

        def close(self):
            with self.condition:
                self.closed = True
                self.condition.notify_all()
            return True

    class Provider:
        model_id = "synthetic-blocked-provider"

        def infer(self, _image, _timestamp):
            entered.set()
            assert release.wait(2)
            return people

        def close(self):
            pass

    monkeypatch.setattr(runtime, "CameraSource", Camera)
    monkeypatch.setattr(runtime, "create_provider", lambda *_: Provider())
    vision = VisionRuntime()
    try:
        assert StartRequest().algorithm == "rtmpose"
        vision.start(StartRequest(source="camera"))
        assert entered.wait(1)
        first, packet = vision.next_preview(0, timeout=1)
        assert first == 1 and packet is not None
        assert vision.next_observation(0, timeout=0.01)[1] is None
        vision.camera.advance()
        second, next_packet = vision.next_preview(first, timeout=1)
        assert second == 2 and next_packet is not None
        assert vision.preview is next_packet  # exactly one current published image
        assert vision.observation is None
        release.set()
        _, observation = vision.next_observation(0, timeout=1)
        assert observation is not None and observation["algorithm"] == "rtmpose"
    finally:
        release.set()
        vision.stop()
    assert vision.next_preview(0, timeout=0)[1] is None
    assert vision.preview_worker is None


def test_late_preview_reader_cannot_reuse_old_image():
    now = 1_000_000_000
    vision = VisionRuntime(clock_ns=lambda: now)
    vision.state = "running"
    vision.preview = b"old-image"
    vision.preview_number = 9
    vision.preview_capture_at = now
    now += MAX_CAPTURE_AGE_NS + 1
    assert vision.next_preview(0, timeout=0) == (9, None)


def test_compiled_observation_schema_agrees_with_reference_on_boundary_values():
    valid = json.loads((runtime.ROOT / "contracts/examples/synthetic-observation.json").read_text())
    cases = [valid]
    for field, value in [
        ("version", 2),
        ("sequence", True),
        ("capacity", 99),
        ("capturedAtNs", "1.5"),
        ("source", "unknown"),
    ]:
        item = deepcopy(valid)
        item[field] = value
        cases.append(item)
    missing = deepcopy(valid)
    missing["people"][0]["joints"]["left_wrist"] = {
        "x": None,
        "y": None,
        "score": 0,
        "status": "missing",
        "inFrame": False,
    }
    cases.append(missing)
    invalid_missing = deepcopy(missing)
    invalid_missing["people"][0]["joints"]["left_wrist"]["x"] = 0.5
    cases.append(invalid_missing)
    for item in cases:
        expected = runtime.VALIDATOR.is_valid(item)
        if expected:
            runtime.VALIDATE_OBSERVATION(item)
        else:
            with pytest.raises(fastjsonschema.JsonSchemaException):
                runtime.VALIDATE_OBSERVATION(item)
