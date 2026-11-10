"""Synthetic native inventory; no cameras or participant images are accessed."""

import json
import subprocess
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from motion_vision import cameras, runtime, server


def test_native_choices_distinguish_identical_names_without_exposing_paths(monkeypatch):
    monkeypatch.setattr(
        cameras,
        "_native_devices",
        lambda: [(0, "USB Camera", "private-A", 1200), (1, "USB Camera", "private-B", 1200)],
    )
    result = cameras._scan()
    assert result[0]["id"] != result[1]["id"]
    assert [device["index"] for device in result] == [1200, 1201]
    assert "private" not in json.dumps(result)


def test_start_resolves_current_device_identity_after_reordering(monkeypatch):
    monkeypatch.setattr(
        cameras, "discover_cameras", lambda: [{"id": "a" * 64, "name": "USB Camera", "index": 1201}]
    )
    assert cameras.resolve_camera("a" * 64) == 1201
    monkeypatch.setattr(
        cameras, "discover_cameras", lambda: [{"id": "b" * 64, "name": "USB Camera", "index": 1201}]
    )
    with pytest.raises(RuntimeError, match="no longer connected"):
        cameras.resolve_camera("a" * 64)


def test_unplugged_choice_does_not_stop_existing_source(monkeypatch):
    vision = runtime.VisionRuntime()
    stop = Mock()
    monkeypatch.setattr(vision, "_stop", stop)
    monkeypatch.setattr(
        runtime, "resolve_camera", Mock(side_effect=RuntimeError("Camera disconnected"))
    )
    with pytest.raises(RuntimeError, match="disconnected"):
        vision.start(runtime.StartRequest(source="camera", cameraId="a" * 64))
    stop.assert_not_called()


@pytest.mark.parametrize(
    "failure",
    [
        subprocess.TimeoutExpired("enumerate", 6),
        subprocess.CalledProcessError(1, "enumerate"),
        OSError("driver unavailable"),
    ],
)
def test_discovery_timeout_and_driver_failure_are_actionable(monkeypatch, failure):
    monkeypatch.setattr(cameras.subprocess, "run", Mock(side_effect=failure))
    with pytest.raises(RuntimeError, match="advanced manual index"):
        cameras.discover_cameras()


@pytest.mark.parametrize(
    "body",
    [
        "not json",
        "{}",
        '[{"id":"bad"}]',
        json.dumps([{"id": "a" * 64, "name": "Camera", "index": True}]),
    ],
)
def test_discovery_rejects_malformed_metadata(monkeypatch, body):
    monkeypatch.setattr(
        cameras.subprocess, "run", lambda *args, **kwargs: SimpleNamespace(stdout=body)
    )
    with pytest.raises(RuntimeError):
        cameras.discover_cameras()


def test_camera_list_endpoint_is_read_only_and_hides_capture_indices(monkeypatch):
    vision = runtime.VisionRuntime()
    monkeypatch.setattr(
        server, "discover_cameras", lambda: [{"id": "a" * 64, "name": "USB Camera", "index": 1201}]
    )
    with TestClient(server.create_app(vision), base_url="http://127.0.0.1:8765") as client:
        assert client.get("/api/cameras").json() == {
            "cameras": [{"id": "a" * 64, "name": "USB Camera"}]
        }
        assert vision.camera is None and vision.worker is None
        assert (
            client.get("/api/cameras", headers={"Origin": "https://outside.example"}).status_code
            == 403
        )
        monkeypatch.setattr(
            server, "discover_cameras", Mock(side_effect=RuntimeError("Refresh cameras"))
        )
        assert client.get("/api/cameras").status_code == 503


def test_named_capture_rechecks_index_after_model_load(monkeypatch):
    from threading import Event

    opened = Event()
    indices = []

    class Camera:
        def __init__(self, index):
            indices.append(index)
            opened.set()

        def start(self):
            pass

        def next(self, _after):
            raise RuntimeError("Synthetic driver finished")

        def close(self):
            return True

    lookup = Mock(side_effect=[1200, 1201])
    monkeypatch.setattr(runtime, "resolve_camera", lookup)
    monkeypatch.setattr(runtime, "CameraSource", Camera)
    monkeypatch.setattr(runtime, "create_provider", lambda *_: Mock())
    vision = runtime.VisionRuntime()
    try:
        vision.start(runtime.StartRequest(source="camera", cameraId="a" * 64))
        assert opened.wait(1)
        assert indices == [1201]
        assert lookup.call_count == 2
    finally:
        vision.stop()
