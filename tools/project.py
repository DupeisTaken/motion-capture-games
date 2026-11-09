"""Cross-platform root commands for the standalone XYZ experiment."""

import argparse
import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WINDOWS = sys.platform == "win32"
BOOTSTRAP = ROOT / ".local/bootstrap" / ("Scripts" if WINDOWS else "bin")
PYTHON = BOOTSTRAP / ("python.exe" if WINDOWS else "python")
UV = BOOTSTRAP / ("uv.exe" if WINDOWS else "uv")
ENV = dict(
    os.environ,
    UV_PYTHON_INSTALL_DIR=str(ROOT / ".local/python"),
    UV_CACHE_DIR=str(ROOT / ".cache/uv"),
    OPENBLAS_NUM_THREADS="1",
    OMP_NUM_THREADS="1",
    VECLIB_MAXIMUM_THREADS="1",
)


def execute(args: list[str]) -> None:
    subprocess.run(args, cwd=ROOT, env=ENV, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=(
            "setup",
            "format",
            "lint",
            "typecheck",
            "test",
            "check",
            "experiment",
            "build",
            "dev",
        ),
    )
    parser.add_argument("--port", type=int, default=8765, help="loopback report-server port")
    args = parser.parse_args()
    if args.command == "setup":
        if not UV.exists():
            venv.create(ROOT / ".local/bootstrap", with_pip=True)
            execute([str(PYTHON), "-m", "pip", "install", "--no-cache-dir", "uv==0.9.26"])
        execute([str(UV), "sync", "--locked"])
        return
    uv = str(UV) if UV.exists() else shutil.which("uv")
    if not uv:
        parser.error("run python tools/project.py setup first")

    def run(*arguments: str) -> None:
        execute([uv, "run", "--locked", *arguments])

    paths = ("services/vision/xyz", "experiments", "tools", "tests/vision")
    if args.command in ("lint", "check"):
        run("ruff", "check", *paths)
        run("ruff", "format", "--check", *paths)
    if args.command == "format":
        run("ruff", "format", *paths)
    if args.command in ("typecheck", "check"):
        run("mypy", "services/vision/xyz", "experiments", "tools")
    if args.command in ("test", "check"):
        run("pytest", "-q")
    if args.command == "check":
        run("python", "tools/check_documents.py")
    if args.command == "experiment":
        run("python", "experiments/xyz_benchmark.py")
    if args.command == "build":
        run("python", "tools/build_xyz_report.py")
        run("python", "tools/check_documents.py")
    if args.command == "dev":
        run("python", "-m", "http.server", str(args.port), "--bind", "127.0.0.1")


if __name__ == "__main__":
    main()
