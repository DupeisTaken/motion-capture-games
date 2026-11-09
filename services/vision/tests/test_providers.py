from types import SimpleNamespace

import numpy as np
import pytest
from motion_vision.providers import (
    MP_INDICES,
    decode_pose,
    detection_boxes,
    detector_input,
    joint,
    landmark_person,
    pose_input,
)


def test_mediapipe_uses_anatomical_indices_and_retains_out_of_frame():
    landmarks = [SimpleNamespace(x=0.5, y=0.5, visibility=0.95, presence=0.95) for _ in range(33)]
    landmarks[15].x = -0.1
    landmarks[16].x = 0.8
    person = landmark_person(landmarks)
    assert person is not None
    assert person["joints"]["left_wrist"]["x"] == -0.1
    assert person["joints"]["left_wrist"]["inFrame"] is False
    assert person["joints"]["right_wrist"]["x"] == 0.8
    assert len(MP_INDICES) == 17


def test_nonfinite_or_missing_joints_are_not_valid_coordinates():
    assert joint(float("nan"), 0.2, 0.9) == {
        "x": None,
        "y": None,
        "score": 0.0,
        "status": "missing",
        "inFrame": False,
    }
    assert joint(0.2, 0.3, 0)["status"] == "missing"
    assert joint(0.2, 0.3, 0.3)["status"] == "estimated"


@pytest.mark.parametrize(
    "field,value",
    [("presence", None), ("visibility", None), ("presence", float("nan")), ("x", None)],
)
def test_mediapipe_unknown_landmark_is_missing_without_losing_other_joints(field, value):
    landmarks = [SimpleNamespace(x=0.5, y=0.5, visibility=0.95, presence=0.95) for _ in range(33)]
    setattr(landmarks[15], field, value)
    person = landmark_person(landmarks)
    assert person is not None
    assert person["joints"]["left_wrist"]["status"] == "missing"
    assert person["joints"]["right_wrist"]["status"] == "observed"


def test_rtmdet_letterbox_inverse_and_person_score_filtering():
    image = np.zeros((540, 960, 3), dtype=np.uint8)
    tensor, scales = detector_input(image)
    assert tensor.shape == (1, 3, 320, 320)
    outputs = [
        np.array([[[32, 18, 160, 144, 0.9], [0, 0, 20, 20, 0.2], [1, 2, 30, 40, 0.8]]]),
        np.array([[0, 0, 1]]),
    ]
    boxes = detection_boxes(outputs, scales, image.shape)
    assert len(boxes) == 1
    assert boxes[0] == pytest.approx([96, 54, 480, 432])


def test_rtmdet_retains_bgr_while_pose_preprocessing_uses_rgb():
    image = np.zeros((256, 192, 3), dtype=np.uint8)
    image[:] = [10, 20, 30]
    detector, _ = detector_input(image)
    assert detector[0, 0, 0, 0] == pytest.approx((10 - 103.53) / 57.375)
    pose, _, _ = pose_input(image, [0, 0, 192, 256])
    assert pose[0, 0, 128, 96] == pytest.approx((30 - 123.675) / 58.395)


def test_simcc_decoding_restores_full_image_crop_location():
    image = np.zeros((540, 960, 3), dtype=np.uint8)
    tensor, center, scale = pose_input(image, [300, 100, 500, 400])
    assert tensor.shape == (1, 3, 256, 192)
    x = np.zeros((1, 17, 384), dtype=np.float32)
    y = np.zeros((1, 17, 512), dtype=np.float32)
    x[:, :, 192], y[:, :, 256] = 0.9, 0.8
    output = decode_pose([x, y], center, scale, image.shape)
    assert output["left_wrist"]["x"] == pytest.approx(400 / 960)
    assert output["left_wrist"]["y"] == pytest.approx(250 / 540)
    assert output["left_wrist"]["score"] == pytest.approx(0.8)
    assert output["left_wrist"]["status"] == "observed"


def test_unknown_export_shape_fails_instead_of_guessing_joints():
    with pytest.raises(RuntimeError, match="expected"):
        decode_pose(
            [np.zeros((1, 26, 384)), np.zeros((1, 26, 512))],
            np.array([10, 10]),
            np.array([20, 20]),
            (100, 100, 3),
        )
