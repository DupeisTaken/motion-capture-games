"""Explicit, verified model setup. Inference never performs a network request."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MANIFEST_PATH = ROOT / "models/manifests/diagnostic-models.json"
ARTIFACTS = ROOT / "models/artifacts"


def manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text())


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(block)
    return checksum.hexdigest()


def artifact_paths(name: str, *, verify: bool = True) -> dict[str, Path]:
    spec = manifest()["models"][name]
    paths = {}
    for key, item in spec["artifacts"].items():
        path = ARTIFACTS / item["file"]
        if not path.is_file():
            raise RuntimeError(f"{name} model missing. Run pnpm models before using the camera.")
        if verify and digest(path) != item["sha256"]:
            raise RuntimeError(f"{name} model checksum mismatch. Run pnpm models to repair it.")
        paths[key] = path
    return paths


def availability() -> dict[str, bool]:
    # Startup verifies hashes; cheap status probes never repeatedly hash large models.
    return {
        name: all((ARTIFACTS / item["file"]).is_file() for item in spec["artifacts"].values())
        for name, spec in manifest()["models"].items()
    }


def setup(name: str) -> None:
    spec = manifest()["models"][name]
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    destination = ARTIFACTS / spec["download"]
    if not destination.is_file() or digest(destination) != spec["sha256"]:
        descriptor, temporary = tempfile.mkstemp(prefix="model-", suffix=".part", dir=ARTIFACTS)
        os.close(descriptor)
        temporary_path = Path(temporary)
        try:
            request = urllib.request.Request(
                spec["url"], headers={"User-Agent": "motion-capture-games-model-setup/1"}
            )
            with (
                urllib.request.urlopen(request, timeout=45) as response,
                temporary_path.open("wb") as output,
            ):
                total = 0
                while block := response.read(1024 * 1024):
                    total += len(block)
                    if total > 100_000_000:
                        raise RuntimeError("Model download exceeded the100MB setup limit.")
                    output.write(block)
            if digest(temporary_path) != spec["sha256"]:
                raise RuntimeError(
                    f"Checksum mismatch for {name}; downloaded file was not installed."
                )
            temporary_path.replace(destination)
        finally:
            temporary_path.unlink(missing_ok=True)
    if destination.suffix == ".zip":
        # Extract only exact allowlisted weights: no images, paths or executable files.
        with zipfile.ZipFile(destination) as archive:
            for item in spec["artifacts"].values():
                data = archive.read(item["archiveMember"])
                if hashlib.sha256(data).hexdigest() != item["sha256"]:
                    raise RuntimeError(f"Archive member checksum mismatch for {name}.")
                descriptor, temporary = tempfile.mkstemp(
                    prefix="weight-", suffix=".part", dir=ARTIFACTS
                )
                with os.fdopen(descriptor, "wb") as output:
                    output.write(data)
                Path(temporary).replace(ARTIFACTS / item["file"])
    artifact_paths(name)
    print(f"{name}: verified ({spec['modelId']})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="Verify local hashes without downloading"
    )
    parser.add_argument("--algorithm", choices=["all", "mediapipe", "rtmpose"], default="all")
    args = parser.parse_args()
    names = list(manifest()["models"]) if args.algorithm == "all" else [args.algorithm]
    for name in names:
        if args.check:
            artifact_paths(name)
            print(f"{name}: verified")
        else:
            setup(name)


if __name__ == "__main__":
    main()
