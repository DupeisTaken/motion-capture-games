"""Bounded diagnostic pipeline: one capture, one inference worker, one published packet."""

from __future__ import annotations

import json
import logging
import struct
import threading
import time
import uuid
from collections.abc import Callable
from typing import Any, Literal, cast

import cv2
import fastjsonschema
from jsonschema import Draft7Validator
from pydantic import BaseModel, ConfigDict, Field

from .cameras import resolve_camera
from .models import ROOT, availability
from .providers import Image, PoseProvider, create_provider
from .sources import CameraSource, demo_frame
from .timing import SourceRate, host_time_ns, next_preview_tick
from .tracking import Tracker

MAX_METADATA = 64 * 1024
MAX_PREVIEW = 2 * 1024 * 1024
SCHEMA = json.loads((ROOT / "contracts/schemas/observation.schema.json").read_text())
Draft7Validator.check_schema(SCHEMA)
VALIDATOR = Draft7Validator(SCHEMA)
VALIDATE_OBSERVATION = fastjsonschema.compile(SCHEMA, use_default=False)
PREVIEW_SCHEMA = json.loads((ROOT / "contracts/schemas/preview.schema.json").read_text())
VALIDATE_PREVIEW = fastjsonschema.compile(PREVIEW_SCHEMA, use_default=False)
# Provisional diagnostic guard, not an accepted gameplay freshness/performance target.
MAX_CAPTURE_AGE_NS = 500_000_000


class StartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    source: Literal["camera", "demo"] = "demo"
    algorithm: Literal["mediapipe", "rtmpose"] = "rtmpose"
    tracker: Literal["iou", "pose"] = "pose"
    cameraIndex: int = Field(default=0, ge=0, le=9)
    cameraId: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    maxPeople: int = Field(default=6, ge=1, le=6)
    demoScenario: Literal["cycle", "three", "empty"] = "cycle"


def encode_packet(observation: dict[str, Any], jpeg: bytes) -> bytes:
    VALIDATE_OBSERVATION(observation)
    count = observation["detectedCount"]
    if count != len(observation["people"]) or count > observation["capacity"]:
        raise ValueError("Person count does not match bounded observations")
    if observation["capacityReached"] != (count == observation["capacity"]):
        raise ValueError("Detection capacity flag is inconsistent")
    if int(observation["processedAtNs"]) < int(observation["capturedAtNs"]):
        raise ValueError("Processing precedes capture in the source clock")
    demo = observation["source"] == "demo"
    if demo != (observation["algorithm"] == "synthetic"):
        raise ValueError("Synthetic observations must be labeled as demo input")
    if demo != (observation["clock"]["quality"] == "synthetic"):
        raise ValueError("Source timestamp quality is mislabeled")
    used_ids = set()
    for person in observation["people"]:
        track_id = person["trackId"]
        if person["identity"] == "confident" and track_id is None:
            raise ValueError("Confident identity requires a camera track")
        if track_id is not None:
            if track_id in used_ids:
                raise ValueError("Camera track is assigned to multiple detections")
            used_ids.add(track_id)
        for point in person["joints"].values():
            if point["inFrame"] and (
                point["x"] is None
                or point["y"] is None
                or not 0 <= point["x"] <= 1
                or not 0 <= point["y"] <= 1
            ):
                raise ValueError("In-frame joint is outside normalized image bounds")
    metadata = json.dumps(observation, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if len(metadata) > MAX_METADATA or not 0 < len(jpeg) <= MAX_PREVIEW:
        raise ValueError("Diagnostic packet exceeds transport limit")
    return struct.pack(">I", len(metadata)) + metadata + jpeg


class VisionRuntime:
    def __init__(self, clock_ns: Callable[[], int] = host_time_ns) -> None:
        self.clock_ns = clock_ns
        self.condition = threading.Condition()
        self.control_lock = threading.Lock()
        self.stop_event = threading.Event()
        self.worker: threading.Thread | None = None
        self.preview_worker: threading.Thread | None = None
        self.camera: CameraSource | None = None
        self.packet: bytes | None = None
        self.packet_number = 0
        self.packet_capture_at: int | None = None
        self.state = "idle"
        self.message = "Choose a camera or try the synthetic scene."
        self.settings: StartRequest | None = None
        self.epoch: str | None = None
        self.detected_count = 0
        self.observation: dict[str, Any] | None = None
        self.preview: bytes | None = None
        self.preview_number = 0
        self.preview_capture_at: int | None = None

    def status(self) -> dict[str, Any]:
        with self.condition:
            self._expire_packet()
            settings = self.settings
            return {
                "state": self.state,
                "message": self.message,
                "source": settings.source if settings else None,
                "algorithm": ("synthetic" if settings.source == "demo" else settings.algorithm)
                if settings
                else None,
                "tracker": settings.tracker if settings else None,
                "epoch": self.epoch,
                "cameraIndex": settings.cameraIndex if settings else 0,
                "maxPeople": settings.maxPeople if settings else 6,
                "detectedCount": self.detected_count,
                "models": availability(),
            }

    def start(self, settings: StartRequest) -> dict[str, Any]:
        with self.control_lock:
            if settings.source == "camera" and settings.cameraId:
                resolve_camera(
                    settings.cameraId
                )  # Reject vanished choices before stopping a source.
            self._stop()
            with self.condition:
                self.settings = settings
                self.epoch = str(uuid.uuid4())
                self.packet = None
                self.packet_capture_at = None
                self.packet_number = 0
                self.observation = None
                self.preview = None
                self.preview_number = 0
                self.preview_capture_at = None
                self.state = "starting"
                self.message = (
                    "Loading local models…"
                    if settings.source == "camera"
                    else "Starting synthetic scene…"
                )
                self.stop_event = threading.Event()
                self.worker = threading.Thread(
                    target=self._run,
                    args=(settings, self.epoch, self.stop_event),
                    name="motion-inference",
                    daemon=True,
                )
                self.worker.start()
            return self.status()

    def stop(self) -> dict[str, Any]:
        with self.control_lock:
            self._stop()
            return self.status()

    def stop_if_epoch(self, epoch: str | None) -> None:
        # A viewer from an older run cannot stop a newly started source.
        with self.control_lock:
            with self.condition:
                if self.epoch != epoch:
                    return
            self._stop()

    def _stop(self) -> None:
        self.stop_event.set()
        with self.condition:
            self.packet = None
            self.packet_capture_at = None
            self.detected_count = 0
            self.observation = None
            self.preview = None
            self.condition.notify_all()
            camera = self.camera
        if camera is not None and not camera.close():
            raise RuntimeError(
                "The camera driver is still stopping. Wait a moment and retry; another capture has not been opened."
            )
        worker = self.worker
        if worker is not None and worker is not threading.current_thread():
            worker.join(timeout=5)
            if worker.is_alive():
                raise RuntimeError("The vision worker is still stopping. Wait a moment and retry.")
        if self.preview_worker is not None:
            self.preview_worker.join(timeout=3)
            if self.preview_worker.is_alive():
                raise RuntimeError("The preview worker is still stopping. Wait and retry.")
            self.preview_worker = None
        # Re-read after joining too: never discard an owner whose driver still holds a device.
        camera = self.camera
        if camera is not None and not camera.close():
            raise RuntimeError(
                "The camera driver is still stopping. Wait and retry; capture ownership is retained."
            )
        with self.condition:
            self.camera = None
            self.worker = None
            self.state = "idle"
            self.message = "Capture stopped. No camera is open."
            self.condition.notify_all()

    def next_packet(self, after: int, timeout: float = 2.0) -> tuple[int, bytes | None]:
        with self.condition:
            self.condition.wait_for(
                lambda: self.packet_number > after or self.state in ("idle", "error", "stale"),
                timeout=timeout,
            )
            self._expire_packet()
            if self.state != "running" or self.packet is None or self.packet_number <= after:
                return self.packet_number, None
            return self.packet_number, self.packet

    def _mark_stale(self) -> None:
        with self.condition:
            if self.stop_event.is_set():
                return
            self.packet = None
            self.packet_capture_at = None
            self.detected_count = 0
            self.observation = None
            self.state = "stale"
            self.message = "Camera observations are too old. Improve lighting or try another model; stale joints are hidden."
            self.condition.notify_all()

    def _capture_fresh(self, captured_at: int) -> bool:
        return 0 <= self.clock_ns() - captured_at <= MAX_CAPTURE_AGE_NS

    def _expire_packet(self) -> None:
        # A pull client may arrive long after the last completed inference.
        if self.packet_capture_at is not None and not self._capture_fresh(self.packet_capture_at):
            self._mark_stale()

    def next_observation(
        self, after: int, timeout: float = 2.0
    ) -> tuple[int, dict[str, Any] | None]:
        with self.condition:
            self.condition.wait_for(
                lambda: self.packet_number > after or self.state in ("idle", "error", "stale"),
                timeout=timeout,
            )
            self._expire_packet()
            if self.state != "running" or self.packet_number <= after:
                return self.packet_number, None
            return self.packet_number, self.observation

    def next_preview(self, after: int, timeout: float = 2.0) -> tuple[int, bytes | None]:
        with self.condition:
            self.condition.wait_for(
                lambda: self.preview_number > after or self.state in ("idle", "error"),
                timeout=timeout,
            )
            if (
                self.state in ("idle", "error")
                or self.preview_number <= after
                or self.preview_capture_at is None
                or not self._capture_fresh(self.preview_capture_at)
            ):
                return self.preview_number, None
            return self.preview_number, self.preview

    @staticmethod
    def _resize(image: Image) -> Image:
        if image.shape[1] > 960:
            return cast(
                Image, cv2.resize(image, (960, round(image.shape[0] * 960 / image.shape[1])))
            )
        return image

    def _publish_preview(
        self,
        image: Image,
        sequence: int,
        captured_at: int,
        settings: StartRequest,
        epoch: str,
        fps: float,
    ) -> None:
        ok, jpeg = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 78])
        if not ok or not 0 < jpeg.nbytes <= MAX_PREVIEW:
            raise RuntimeError("Could not encode a bounded camera preview.")
        metadata = {
            "version": 1,
            "epoch": epoch,
            "sequence": sequence,
            "source": settings.source,
            "image": {"width": image.shape[1], "height": image.shape[0]},
            "capturedAtNs": str(captured_at),
            "clockDomain": "host-monotonic",
            "clockQuality": "synthetic" if settings.source == "demo" else "host-read-completion",
            "captureFps": fps,
        }
        VALIDATE_PREVIEW(metadata)
        header = json.dumps(metadata, separators=(",", ":"), allow_nan=False).encode()
        with self.condition:
            if not self.stop_event.is_set() and self._capture_fresh(captured_at):
                self.preview = struct.pack(">I", len(header)) + header + jpeg.tobytes()
                self.preview_number = sequence
                self.preview_capture_at = captured_at
                self.condition.notify_all()

    def _preview_camera(
        self, camera: CameraSource, settings: StartRequest, epoch: str, stop: threading.Event
    ) -> None:
        after = 0
        rate = SourceRate()
        try:
            while not stop.is_set():
                captured = camera.next(after)
                if captured is None:
                    continue
                after = captured.sequence
                fps = rate.record(after, captured.captured_at_ns)
                if self._capture_fresh(captured.captured_at_ns):
                    self._publish_preview(
                        self._resize(captured.image),
                        after,
                        captured.captured_at_ns,
                        settings,
                        epoch,
                        fps,
                    )
        except Exception:
            logging.getLogger(__name__).exception("Camera preview stopped")
            with self.condition:
                if not stop.is_set():
                    self.state = "error"
                    self.message = "Camera preview failed. Stop and retry; inspect the service log if it persists."
                    self.packet = self.preview = None
                    self.observation = None
                    self.detected_count = 0
                    stop.set()
                    self.condition.notify_all()

    def _run(self, settings: StartRequest, epoch: str, stop: threading.Event) -> None:
        provider: PoseProvider | None = None
        camera: CameraSource | None = None
        tracker = Tracker(mode=settings.tracker)
        previous_capture = 0
        last_capture_at: int | None = None
        dropped = 0
        demo_rate = SourceRate()
        started = time.monotonic()
        demo_tick = self.clock_ns()
        try:
            cv2.setNumThreads(1)
            if settings.source == "camera":
                provider = create_provider(settings.algorithm, settings.maxPeople)
                if stop.is_set():
                    return
                # Re-resolve after model loading: hot-plugging can reorder native indices.
                index = (
                    resolve_camera(settings.cameraId) if settings.cameraId else settings.cameraIndex
                )
                camera = CameraSource(index)
                with self.condition:
                    if stop.is_set():
                        return
                    self.camera = camera
                    camera.start()
                    self.preview_worker = threading.Thread(
                        target=self._preview_camera,
                        args=(camera, settings, epoch, stop),
                        name="motion-preview",
                        daemon=True,
                    )
                    self.preview_worker.start()
            while not stop.is_set():
                processing_started = self.clock_ns()
                if camera is not None:
                    captured = camera.next(previous_capture)
                    if captured is None:
                        if last_capture_at is not None and not self._capture_fresh(last_capture_at):
                            self._mark_stale()
                        continue
                    dropped += max(0, captured.sequence - previous_capture - 1)
                    previous_capture = captured.sequence
                    image, captured_at = captured.image, captured.captured_at_ns
                    last_capture_at = captured_at
                    if not self._capture_fresh(captured_at):
                        self._mark_stale()
                        continue
                    processing_started = self.clock_ns()
                    # Inference and preview use the exact same resized image geometry.
                    image = self._resize(image)
                    inference_started = self.clock_ns()
                    assert provider is not None
                    detections = provider.infer(image, captured_at)
                    inference_ms = (self.clock_ns() - inference_started) / 1e6
                else:
                    captured_at = self.clock_ns()
                    image, detections = demo_frame(
                        time.monotonic() - started, settings.demoScenario
                    )
                    previous_capture += 1
                    inference_ms = 0.0
                if stop.is_set():
                    break
                if camera is not None and not self._capture_fresh(captured_at):
                    self._mark_stale()
                    continue
                people = tracker.update(detections[: settings.maxPeople], captured_at, epoch=epoch)
                ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 78])
                if not ok:
                    raise RuntimeError("Could not encode the diagnostic preview.")
                processed_at = self.clock_ns()
                if camera is not None and not self._capture_fresh(captured_at):
                    self._mark_stale()
                    continue
                observation = {
                    "version": 1,
                    "epoch": epoch,
                    "sequence": previous_capture,
                    "frameId": f"{epoch}:{previous_capture}",
                    "source": settings.source,
                    "cameraId": (settings.cameraId or f"camera:{settings.cameraIndex}")
                    if camera is not None
                    else "synthetic-scene",
                    "image": {"width": image.shape[1], "height": image.shape[0]},
                    "coordinateSpace": "normalized-camera",
                    "transformRevision": "1",
                    "calibrationId": None,
                    "modelId": provider.model_id if provider else "synthetic-coco17-v1",
                    "capturedAtNs": str(captured_at),
                    "processedAtNs": str(processed_at),
                    "clock": {
                        "domain": "host-monotonic",
                        "quality": "host-read-completion" if camera else "synthetic",
                        "uncertaintyNs": None,
                    },
                    "algorithm": settings.algorithm if camera else "synthetic",
                    "tracker": settings.tracker,
                    "people": people,
                    "detectedCount": len(people),
                    "capacity": settings.maxPeople,
                    "capacityReached": len(people) == settings.maxPeople,
                    "metrics": {
                        "inferenceMs": inference_ms,
                        "captureDrops": dropped,
                        "processingMs": (processed_at - processing_started) / 1e6,
                    },
                }
                packet = encode_packet(observation, encoded.tobytes())
                with self.condition:
                    if stop.is_set():
                        break
                    if camera is not None and not self._capture_fresh(captured_at):
                        self._mark_stale()
                        continue
                    self.packet = packet
                    self.observation = observation
                    self.packet_number = previous_capture
                    self.packet_capture_at = captured_at if camera is not None else None
                    self.detected_count = len(people)
                    self.state = "running"
                    self.message = (
                        "Synthetic observations. No camera is open."
                        if camera is None
                        else "Camera active. Positions are image estimates; IDs are diagnostic tracks."
                    )
                    self.condition.notify_all()
                if camera is None:
                    self._publish_preview(
                        image,
                        previous_capture,
                        captured_at,
                        settings,
                        epoch,
                        demo_rate.record(previous_capture, captured_at),
                    )
                    now = self.clock_ns()
                    demo_tick = next_preview_tick(demo_tick, now)
                    stop.wait((demo_tick - now) / 1e9)
        except Exception as error:
            logging.getLogger(__name__).exception("Diagnostic vision source failed")
            with self.condition:
                if not stop.is_set():
                    self.state = "error"
                    self.message = (
                        str(error)
                        if isinstance(error, RuntimeError)
                        else "Vision processing failed. Stop and retry; inspect the local service log if it persists."
                    )
                    self.packet = None
                    self.observation = None
                    self.preview = None
                    self.packet_capture_at = None
                    self.detected_count = 0
                    self.condition.notify_all()
        finally:
            # A failed inference owner must also stop the independent preview worker.
            stop.set()
            if camera is not None:
                camera.close()
            if provider is not None:
                provider.close()
