"""Native camera metadata only. Discovery never opens a capture or reads an image."""

from __future__ import annotations

import hashlib
import importlib
import json
import platform
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any

import cv2

SCAN_LOCK = threading.Lock()
MAX_CAMERAS = 32


def _linux_identity(path: str) -> str:
    node = Path(path)
    # /dev/videoN is an acquisition index, not identity. Prefer udev's stable
    # device links; topology + interface index is a same-port fallback.
    for directory in (Path("/dev/v4l/by-id"), Path("/dev/v4l/by-path")):
        for link in sorted(directory.glob("*")):
            if link.resolve() == node.resolve():
                return str(link)
    entry = Path("/sys/class/video4linux") / node.name
    try:
        return f"{(entry / 'device').resolve(strict=True)}:{(entry / 'index').read_text().strip()}"
    except OSError:
        return ""  # No stable reference: use the explicitly selected manual fallback.


def _native_devices() -> list[tuple[int, str, str, int]]:
    system = platform.system()
    if system == "Darwin":
        av: Any = importlib.import_module("AVFoundation")

        # Match the pinned OpenCV 4.11 AVFoundation backend's video+muxed list and
        # uniqueID sort, rather than assuming browser or discovery-session order.
        devices = list(av.AVCaptureDevice.devicesWithMediaType_(av.AVMediaTypeVideo))
        devices += list(av.AVCaptureDevice.devicesWithMediaType_(av.AVMediaTypeMuxed))
        devices.sort(key=lambda device: str(device.uniqueID()))
        return [
            (index, str(device.localizedName()), str(device.uniqueID()), cv2.CAP_AVFOUNDATION)
            for index, device in enumerate(devices)
        ]
    if system in {"Windows", "Linux"}:
        from cv2_enumerate_cameras import enumerate_cameras

        backend = cv2.CAP_MSMF if system == "Windows" else cv2.CAP_V4L2
        return [
            (
                device.index,
                device.name,
                _linux_identity(device.path)
                if system == "Linux" and device.path
                else device.path or "",
                backend,
            )
            for device in enumerate_cameras(backend)
        ]
    raise RuntimeError(
        "Named camera discovery supports Windows, macOS and Linux. Use the manual index."
    )


def _scan() -> list[dict[str, Any]]:
    result = []
    for index, name, path, backend in _native_devices()[:MAX_CAMERAS]:
        if not path:
            continue  # A name/index alone cannot distinguish identical hot-plugged devices.
        identity = hashlib.sha256(f"{backend}:{path}".encode()).hexdigest()
        result.append({"id": identity, "name": name[:160], "index": backend + index})
    return result


def discover_cameras() -> list[dict[str, Any]]:
    # A fresh process avoids cached OS device lists after USB reconnects. Serialize
    # bounded scans; never probe a range by opening every camera.
    with SCAN_LOCK:
        try:
            output = subprocess.run(
                [sys.executable, "-m", "motion_vision.cameras"],
                capture_output=True,
                text=True,
                timeout=10,
                check=True,
            ).stdout
            if len(output) > 32_768:
                raise ValueError("Oversized device list")
            devices = json.loads(output)
            if not isinstance(devices, list) or len(devices) > MAX_CAMERAS:
                raise ValueError("Invalid device list")
            for device in devices:
                if (
                    not isinstance(device, dict)
                    or set(device) != {"id", "name", "index"}
                    or not isinstance(device["id"], str)
                    or len(device["id"]) != 64
                    or not isinstance(device["name"], str)
                    or not 0 < len(device["name"]) <= 160
                    or type(device["index"]) is not int
                    or not 0 <= device["index"] < 10_000
                ):
                    raise ValueError("Invalid camera metadata")
            return devices
        except (OSError, subprocess.SubprocessError, ValueError) as error:
            raise RuntimeError(
                "Camera discovery unavailable. Refresh again or use the advanced manual index. "
                "Check USB connections and OS camera/accessory permission."
            ) from error


def resolve_camera(camera_id: str) -> int:
    for device in discover_cameras():
        if device["id"] == camera_id:
            return device["index"]
    raise RuntimeError("Selected camera is no longer connected. Refresh cameras and choose again.")


if __name__ == "__main__":
    print(json.dumps(_scan(), ensure_ascii=True))
