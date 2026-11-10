import json
import struct
import time

import pytest
from fastapi.testclient import TestClient
from motion_vision.runtime import VisionRuntime
from motion_vision.server import create_app
from starlette.websockets import WebSocketDisconnect


def test_control_validation_origin_and_host_protection():
    with TestClient(create_app(), base_url="http://127.0.0.1:8765") as client:
        for _ in range(100):
            if client.get("/api/status").json()["state"] == "idle":
                break
            time.sleep(0.01)
        assert client.get("/api/status").json()["state"] == "idle"
        assert client.post("/api/start", json={"maxPeople": 999}).status_code == 422
        assert (
            client.post(
                "/api/start", json={"source": "demo"}, headers={"Origin": "https://evil.example"}
            ).status_code
            == 403
        )
        assert client.get("/api/status", headers={"Host": "evil.example"}).status_code == 400


def test_pull_stream_auto_count_and_final_viewer_release():
    vision = VisionRuntime()
    with TestClient(create_app(vision), base_url="http://127.0.0.1:8765") as client:
        started = client.post("/api/start", json={"source": "demo", "demoScenario": "three"})
        assert started.status_code == 200
        with client.websocket_connect(
            "ws://127.0.0.1:8765/api/stream", headers={"origin": "http://127.0.0.1:5173"}
        ) as socket:
            socket.send_json({"type": "next"})
            packet = socket.receive_bytes()
            length = struct.unpack(">I", packet[:4])[0]
            observation = json.loads(packet[4 : 4 + length])
            assert observation["detectedCount"] == 3
            socket.send_json({"type": "next"})
            next_packet = socket.receive_bytes()
            next_length = struct.unpack(">I", next_packet[:4])[0]
            next_observation = json.loads(next_packet[4 : 4 + next_length])
            assert next_observation["sequence"] > observation["sequence"]
        assert client.get("/api/status").json()["state"] == "idle"


def test_websocket_rejects_remote_origin_and_invalid_commands():
    with TestClient(create_app(), base_url="http://127.0.0.1:8765") as client:
        with pytest.raises(WebSocketDisconnect) as denied:
            with client.websocket_connect(
                "ws://127.0.0.1:8765/api/stream", headers={"origin": "https://evil.example"}
            ):
                pass
        assert denied.value.code == 1008
        with client.websocket_connect("ws://127.0.0.1:8765/api/stream") as socket:
            socket.send_json({"type": "open-camera"})
            with pytest.raises(WebSocketDisconnect) as invalid:
                socket.receive_json()
            assert invalid.value.code == 1008


def test_disconnecting_an_old_viewer_does_not_stop_a_new_source():
    vision = VisionRuntime()
    with TestClient(create_app(vision), base_url="http://127.0.0.1:8765") as client:
        old = client.post("/api/start", json={"source": "demo", "demoScenario": "three"}).json()
        with client.websocket_connect("ws://127.0.0.1:8765/api/stream") as socket:
            socket.send_json({"type": "next"})
            socket.receive_bytes()
            new = client.post("/api/start", json={"source": "demo", "demoScenario": "empty"}).json()
            assert old["epoch"] != new["epoch"]
        current = client.get("/api/status").json()
        assert current["epoch"] == new["epoch"]
        assert current["state"] in ("starting", "running")
        late_stop = client.post("/api/stop", json={"epoch": old["epoch"]}).json()
        assert late_stop["epoch"] == new["epoch"]
        assert late_stop["state"] in ("starting", "running")
        assert client.post("/api/stop", json={"epoch": new["epoch"]}).json()["state"] == "idle"


def test_independent_streams_share_one_owner_and_only_final_disconnect_stops():
    vision = VisionRuntime()
    with TestClient(create_app(vision), base_url="http://127.0.0.1:8765") as client:
        client.post("/api/start", json={"source": "demo", "demoScenario": "three"})
        with client.websocket_connect("ws://127.0.0.1:8765/api/observations") as poses:
            with client.websocket_connect("ws://127.0.0.1:8765/api/preview") as images:
                poses.send_json({"type": "next"})
                observation = poses.receive_json()
                assert observation["detectedCount"] == 3
                images.send_json({"type": "next"})
                packet = images.receive_bytes()
                length = struct.unpack(">I", packet[:4])[0]
                metadata = json.loads(packet[4 : 4 + length])
                assert metadata["epoch"] == observation["epoch"]
                assert "people" not in metadata
                assert metadata["clockQuality"] == "synthetic"
            assert client.get("/api/status").json()["state"] == "running"
            poses.send_json({"type": "next"})
            assert poses.receive_json()["sequence"] > observation["sequence"]
        for _ in range(100):
            if client.get("/api/status").json()["state"] == "idle":
                break
            time.sleep(0.01)
        assert client.get("/api/status").json()["state"] == "idle"


def test_delayed_old_epoch_handshake_cannot_own_or_stop_replacement():
    with TestClient(create_app(), base_url="http://127.0.0.1:8765") as client:
        old = client.post("/api/start", json={"source": "demo"}).json()
        current = client.post("/api/start", json={"source": "demo"}).json()
        for kind in ("preview", "observations"):
            with pytest.raises(WebSocketDisconnect) as rejected:
                with client.websocket_connect(
                    f"ws://127.0.0.1:8765/api/{kind}?epoch={old['epoch']}"
                ):
                    pass
            assert rejected.value.code == 1008
        status = client.get("/api/status").json()
        assert status["epoch"] == current["epoch"]
        assert status["state"] in ("starting", "running")
