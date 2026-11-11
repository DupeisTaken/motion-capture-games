"""Opt-in real-transport browser fixture. Never opens a camera or loads a model."""

import json
import struct
import time
import uuid

import cv2
import numpy as np
import uvicorn
from fastapi import Request
from motion_vision import server
from motion_vision.runtime import VisionRuntime


class FixtureRuntime(VisionRuntime):
    width = 640
    height = 480
    sequence = 0

    def status(self):
        return {
            "state": self.state,
            "epoch": self.epoch,
            "message": "Synthetic camera fixture; no hardware",
            "source": "camera",
        }

    def start(self, settings):
        with self.condition:
            self.settings = settings
            self.epoch = str(uuid.uuid4())
            self.state = "running"
            self.sequence = 0
        return self.status()

    def stop(self):
        with self.condition:
            self.state = "idle"
        return self.status()

    def stop_if_epoch(self, epoch):
        with self.condition:
            if self.epoch == epoch:
                self.stop()

    def next_preview(self, after, timeout=2):
        time.sleep(0.04)
        # The control endpoint may change format/source while OpenCV releases the GIL.
        # Snapshot once; never mix the in-flight image with a later frame's metadata.
        with self.condition:
            if self.state != "running":
                return self.sequence, None
            self.sequence += 1
            width, height = self.width, self.height
            epoch, sequence = self.epoch, self.sequence
            captured_at = time.monotonic_ns()
        image = np.full((height, width, 3), (49, 40, 27), dtype=np.uint8)
        for i in range(9):
            x = round(width * (0.1 + i * 0.1))
            y = round(height * (0.1 + i * 0.1))
            cv2.line(
                image,
                (x, round(height * 0.1)),
                (x, round(height * 0.9)),
                (110, 110, 90),
                1,
            )
            cv2.line(image, (round(width * 0.1), y), (round(width * 0.9), y), (110, 110, 90), 1)
        cv2.putText(
            image,
            "SYNTHETIC CAMERA",
            (95, round(height * 0.46)),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.1,
            (70, 220, 255),
            2,
        )
        cv2.putText(
            image,
            "NO HARDWARE / 8 x 8 m TEST GRID",
            (80, round(height * 0.54)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (230, 230, 230),
            1,
        )
        for label, x, z in [("NL", 0, 0), ("NR", 8, 0), ("FR", 8, 8), ("FL", 0, 8)]:
            pixel = (round(width * (0.1 + x * 0.1)), round(height * (0.9 - z * 0.1)))
            cv2.circle(image, pixel, 7, (70, 220, 255), -1)
            cv2.putText(
                image,
                label,
                (pixel[0] + 8, pixel[1] - 8),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1,
            )
        header = json.dumps(
            {
                "version": 1,
                "epoch": epoch,
                "sequence": sequence,
                "source": "camera",
                "image": {"width": width, "height": height},
                "capturedAtNs": str(captured_at),
                "clockDomain": "host-monotonic",
                "clockQuality": "host-read-completion",
                "captureFps": 25,
            }
        ).encode()
        _, jpeg = cv2.imencode(".jpg", image)
        return sequence, struct.pack(">I", len(header)) + header + jpeg.tobytes()


def create_fixture_app():
    # Importing packet fixtures in pytest must not mutate production server discovery.
    runtime = FixtureRuntime()
    server.ALLOWED_ORIGINS.add("http://127.0.0.1:5194")
    server.discover_cameras = lambda: []
    app = server.create_app(runtime)

    @app.post("/fixture/geometry")
    async def geometry(request: Request):
        values = await request.json()
        with runtime.condition:
            runtime.width, runtime.height = values["width"], values["height"]
        return {"ok": True}

    return app


if __name__ == "__main__":
    uvicorn.run(create_fixture_app(), host="127.0.0.1", port=8774, ws_max_size=4096, ws_max_queue=1)
