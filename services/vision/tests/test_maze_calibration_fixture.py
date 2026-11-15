"""Deterministic packet-format changes; no camera, model or timing benchmark."""

import json
import struct

import cv2
import numpy as np
import pytest
from motion_vision.runtime import StartRequest
from tools import maze_calibration_fixture as fixture


def decode(packet):
    length = struct.unpack(">I", packet[:4])[0]
    header = json.loads(packet[4 : 4 + length])
    image = cv2.imdecode(np.frombuffer(packet[4 + length :], dtype=np.uint8), cv2.IMREAD_COLOR)
    assert image is not None
    assert header["image"] == {"width": image.shape[1], "height": image.shape[0]}
    return header


@pytest.mark.parametrize("change_during", ["drawing", "encoding"])
def test_in_flight_packet_keeps_its_geometry_and_provenance(monkeypatch, change_during):
    runtime = fixture.FixtureRuntime()
    runtime.start(StartRequest(source="camera"))
    original_epoch = runtime.epoch
    source_time = [100]
    monkeypatch.setattr(fixture.time, "sleep", lambda _: None)
    monkeypatch.setattr(fixture.time, "monotonic_ns", lambda: source_time[0])
    original_line, original_encode = cv2.line, cv2.imencode
    changed = False
    lines = []

    def change_source():
        nonlocal changed
        if changed:
            return
        changed = True
        with runtime.condition:
            runtime.width, runtime.height = 800, 600
        runtime.start(StartRequest(source="camera", cameraIndex=1))
        source_time[0] = 200

    def draw_line(image, first, second, *args):
        lines.append((first, second))
        if change_during == "drawing":
            change_source()
        return original_line(image, first, second, *args)

    def encode_image(extension, image, *args):
        if change_during == "encoding":
            change_source()
        return original_encode(extension, image, *args)

    monkeypatch.setattr(cv2, "line", draw_line)
    monkeypatch.setattr(cv2, "imencode", encode_image)
    sequence, packet = runtime.next_preview(0)
    assert changed
    first = decode(packet)
    assert first["image"] == {"width": 640, "height": 480}
    assert sequence == first["sequence"] == 1
    assert first["epoch"] == original_epoch
    assert first["capturedAtNs"] == "100"
    expected_lines = []
    for index in range(9):
        x, y = round(640 * (0.1 + index * 0.1)), round(480 * (0.1 + index * 0.1))
        expected_lines.extend([((x, 48), (x, 432)), ((64, y), (576, y))])
    assert lines == expected_lines

    next_sequence, next_packet = runtime.next_preview(0)
    following = decode(next_packet)
    assert following["image"] == {"width": 800, "height": 600}
    assert next_sequence == following["sequence"] == 1
    assert following["epoch"] == runtime.epoch != original_epoch
    assert following["capturedAtNs"] == "200"
