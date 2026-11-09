import hashlib

import pytest
from motion_vision import models


def test_artifact_verification_is_offline_and_rejects_wrong_hash(tmp_path, monkeypatch):
    monkeypatch.setattr(models, "ARTIFACTS", tmp_path)
    monkeypatch.setattr(
        models,
        "manifest",
        lambda: {
            "models": {
                "test": {
                    "artifacts": {
                        "pose": {
                            "file": "weights.task",
                            "sha256": hashlib.sha256(b"expected").hexdigest(),
                        }
                    }
                }
            }
        },
    )
    with pytest.raises(RuntimeError, match="missing"):
        models.artifact_paths("test")
    (tmp_path / "weights.task").write_bytes(b"wrong")
    with pytest.raises(RuntimeError, match="checksum"):
        models.artifact_paths("test")
    (tmp_path / "weights.task").write_bytes(b"expected")
    assert models.artifact_paths("test")["pose"].read_bytes() == b"expected"
