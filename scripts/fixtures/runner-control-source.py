"""Synthetic camera-shaped HTTP/WebSocket fixture; never opens a camera or model."""

import asyncio
import copy
import io
import json
import struct
import sys
import time
from pathlib import Path

import uvicorn
from PIL import Image, ImageDraw
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocketDisconnect

BASE = json.loads(
    (Path(__file__).parents[2] / "contracts/examples/synthetic-observation.json").read_text()
)
state = {"x": 0.5, "dy": 0.0, "spectator": False, "turned": False, "stale": False, "missing": False}
stats = {"starts": 0, "stops": 0, "packets": 0}
epoch = ""
body = {
    "nose": (0, -0.3),
    "left_shoulder": (-0.09, -0.2),
    "right_shoulder": (0.09, -0.2),
    "left_hip": (-0.06, 0.02),
    "right_hip": (0.06, 0.02),
    "left_knee": (-0.07, 0.2),
    "right_knee": (0.07, 0.2),
    "left_ankle": (-0.085, 0.38),
    "right_ankle": (0.085, 0.38),
}


async def cameras(_request):
    return JSONResponse({"cameras": []})


async def start(request):
    global epoch
    assert (await request.json())["source"] == "camera"
    stats["starts"] += 1
    epoch = f"synthetic-runner-{stats['starts']}"
    return JSONResponse({"epoch": epoch, "state": "running"})


async def stop(request):
    assert (await request.json())["epoch"] == epoch
    stats["stops"] += 1
    return JSONResponse({"state": "idle"})


async def control(request):
    state.update(await request.json())
    return JSONResponse({"state": state, "stats": stats})


async def status(_request):
    return JSONResponse({"state": state, "stats": stats})


async def stream(websocket):
    await websocket.accept()
    sequence = 0
    try:
        while True:
            await websocket.receive_text()
            await asyncio.sleep(0.05)
            if state["stale"]:
                await websocket.send_json({"state": "stale"})
                continue
            sequence += 1
            captured = time.monotonic_ns()
            value = copy.deepcopy(BASE)
            value.update(
                source="camera",
                epoch=epoch,
                sequence=sequence,
                frameId=f"synthetic-{sequence}",
                capturedAtNs=str(captured),
                processedAtNs=str(captured),
                algorithm="rtmpose",
                image={"width": 640, "height": 480},
                clock={
                    "domain": "host-monotonic",
                    "quality": "host-read-completion",
                    "uncertaintyNs": None,
                },
            )
            person = {
                "trackId": "synthetic-runner",
                "identity": "confident",
                "box": {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8},
                "joints": {},
            }
            for name, (dx, y) in body.items():
                if state["turned"] and name in [
                    "nose",
                    "left_shoulder",
                    "left_knee",
                    "right_knee",
                    "left_ankle",
                    "right_ankle",
                ]:
                    continue
                person["joints"][name] = {
                    "x": state["x"] + dx,
                    "y": 0.5 + y + state["dy"],
                    "score": 0.95,
                    "status": "observed",
                    "inFrame": True,
                }
            value["people"] = [] if state["missing"] else [person]
            if state["spectator"]:
                spectator = copy.deepcopy(person)
                spectator["trackId"] = "synthetic-spectator"
                value["people"].insert(0, spectator)
            value["detectedCount"] = len(value["people"])
            image = Image.new("RGB", (640, 480), "#183545")
            draw = ImageDraw.Draw(image)
            draw.text((20, 450), "SYNTHETIC CAMERA FIXTURE - NO PARTICIPANT", fill="white")
            for left, right in [
                ("left_shoulder", "right_shoulder"),
                ("left_shoulder", "left_hip"),
                ("right_shoulder", "right_hip"),
                ("left_hip", "right_hip"),
                ("left_hip", "left_knee"),
                ("left_knee", "left_ankle"),
                ("right_hip", "right_knee"),
                ("right_knee", "right_ankle"),
            ]:
                a, b = person["joints"].get(left), person["joints"].get(right)
                if a and b:
                    draw.line(
                        (a["x"] * 640, a["y"] * 480, b["x"] * 640, b["y"] * 480),
                        fill="#9ff4c6",
                        width=9,
                    )
            for point in person["joints"].values():
                x, y = point["x"] * 640, point["y"] * 480
                draw.ellipse((x - 6, y - 6, x + 6, y + 6), fill="#efffa7")
            jpeg = io.BytesIO()
            image.save(jpeg, format="JPEG")
            metadata = json.dumps(value).encode()
            await websocket.send_bytes(
                struct.pack(">I", len(metadata)) + metadata + jpeg.getvalue()
            )
            stats["packets"] += 1
    except WebSocketDisconnect:
        pass


app = Starlette(
    routes=[
        Route("/api/cameras", cameras),
        Route("/api/start", start, methods=["POST"]),
        Route("/api/stop", stop, methods=["POST"]),
        Route("/fixture/control", control, methods=["POST"]),
        Route("/fixture/status", status),
        WebSocketRoute("/api/stream", stream),
    ]
)
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]), log_level="warning")
