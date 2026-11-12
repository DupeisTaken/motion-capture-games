"""Calibration endpoints open no cameras in these synthetic boundary tests."""

import json

import pytest
from fastapi.testclient import TestClient
from motion_vision.runtime import VisionRuntime
from motion_vision.server import create_app


def payload():
    return {
        "widthM": 8,
        "depthM": 8,
        "imageCorners": {
            "nearLeft": [0.1, 0.9],
            "nearRight": [0.9, 0.9],
            "farRight": [0.9, 0.1],
            "farLeft": [0.1, 0.1],
        },
        "reference": {
            "lengthM": 1,
            "placements": [
                {"name": "near", "endpoints": [[0.15, 0.8], [0.25, 0.8]]},
                {"name": "centre", "endpoints": [[0.45, 0.5], [0.55, 0.5]]},
                {"name": "far", "endpoints": [[0.8, 0.25], [0.8, 0.15]]},
            ],
        },
    }


def test_floor_fit_is_camera_free_and_returns_independent_metrics(monkeypatch):
    vision = VisionRuntime()
    opened = []
    monkeypatch.setattr(vision, "start", lambda settings: opened.append(settings))
    with TestClient(create_app(vision), base_url="http://127.0.0.1:8765") as client:
        result = client.post("/api/calibration/floor", json=payload())
        assert result.status_code == 200
        assert result.json()["scope"] == "floor-only"
        assert result.json()["heldOut"]["maxErrorM"] < 0.00001
        assert opened == []
        assert client.get("/api/status").json()["state"] == "idle"


@pytest.mark.parametrize("body", [b"[]", b"null", b"{", b"{}", b'{"widthM": NaN}'])
def test_floor_api_rejects_malformed_inputs_with_actionable_detail(body):
    with TestClient(create_app(), base_url="http://127.0.0.1:8765") as client:
        result = client.post("/api/calibration/floor", content=body)
        assert result.status_code == 422
        assert isinstance(result.json()["detail"], str)


def test_floor_api_bounds_size_and_preserves_origin_guard():
    with TestClient(create_app(), base_url="http://127.0.0.1:8765") as client:
        assert client.post("/api/calibration/floor", content=b"x" * 32769).status_code == 413
        assert (
            client.post(
                "/api/calibration/floor", json=payload(), headers={"origin": "https://evil.example"}
            ).status_code
            == 403
        )
        bad = payload()
        bad["reference"]["placements"][2]["endpoints"][1][1] = 0.1
        response = client.post("/api/calibration/floor", json=bad)
        assert response.status_code == 422
        assert "disagrees" in response.json()["detail"]


def test_calibration_start_refuses_other_owner_and_synthetic_sources(monkeypatch):
    vision = VisionRuntime()
    opened = []

    def fake_start(settings):
        opened.append(settings)
        vision.state = "starting"
        return {"epoch": "test-owner", "state": "starting"}

    monkeypatch.setattr(vision, "start", fake_start)
    with TestClient(create_app(vision), base_url="http://127.0.0.1:8765") as client:
        assert client.post("/api/calibration/start", json={"source": "demo"}).status_code == 422
        assert opened == []
        first = client.post("/api/calibration/start", json={"source": "camera", "cameraIndex": 1})
        assert first.status_code == 200
        assert first.json()["epoch"] == "test-owner"
        second = client.post("/api/calibration/start", json={"source": "camera", "cameraIndex": 2})
        assert second.status_code == 409
        assert "owning page" in second.json()["detail"]
        assert len(opened) == 1
        assert json.loads(first.content)["state"] == "starting"
