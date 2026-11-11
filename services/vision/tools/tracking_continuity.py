"""Evaluate synthetic fixtures or ignored, locally labelled held-out observations."""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "services/vision"))
from motion_vision.continuity_evaluation import evaluate_sequence, synthetic_sequences  # noqa: E402
from motion_vision.tracking import Tracker  # noqa: E402


def local_private(path: Path) -> bool:
    resolved = path.resolve()
    return any(
        resolved.is_relative_to(ROOT / parent) for parent in (".local", "datasets", "reports/local")
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Ignored local labelled JSON; never raw media")
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--baseline-ref", help="Compare an immutable local Git commit (synthetic only)"
    )
    args = parser.parse_args()
    output = args.output or ROOT / (
        ".local/heldout-tracking-results.json"
        if args.input
        else "reports/playtest-tracking-results.json"
    )
    if args.input:
        if not local_private(args.input) or not local_private(output):
            parser.error(
                "Held-out input and output must stay under ignored .local/, datasets/ or reports/local/."
            )
        if args.baseline_ref:
            parser.error("Baseline comparison is available for public synthetic fixtures only.")
        if args.input.stat().st_size > 16 * 1024 * 1024:
            parser.error("Held-out input exceeds the 16 MiB local evaluation bound.")
        sequences = json.loads(args.input.read_text(encoding="utf-8"))
        if (
            not isinstance(sequences, dict)
            or sum(len(frames) for frames in sequences.values()) > 10_000
        ):
            parser.error("Use a sequence object with at most 10,000 frames per evaluation batch.")
        # Keep participant/session labels out of even aggregate result names.
        sequences = {f"heldout-{index}": frames for index, frames in enumerate(sequences.values())}
    else:
        sequences = synthetic_sequences()
    variants = {"current": Tracker}
    baseline_sha = None
    if args.baseline_ref:
        baseline_sha = subprocess.check_output(
            ["git", "rev-parse", "--verify", f"{args.baseline_ref}^{{commit}}"], cwd=ROOT, text=True
        ).strip()
        source = subprocess.check_output(
            ["git", "show", f"{baseline_sha}:services/vision/motion_vision/tracking.py"], cwd=ROOT
        )
        temporary = ROOT / ".local/tracking-evaluation-baseline.py"
        temporary.parent.mkdir(exist_ok=True)
        temporary.write_bytes(source)
        spec = importlib.util.spec_from_file_location("tracking_evaluation_baseline", temporary)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        variants["baseline"] = module.Tracker
    results = {
        "kind": "local-heldout-observations" if args.input else "synthetic-regression-fixtures",
        "baselineRef": baseline_sha,
        "scope": "Tracker only. No camera/model, session scoring or physical accuracy measured.",
        "results": {
            version: {
                mode: {
                    name: evaluate_sequence(
                        lambda tracker=tracker, mode=mode: tracker(mode), frames
                    )
                    for name, frames in sequences.items()
                }
                for mode in ("iou", "pose")
            }
            for version, tracker in variants.items()
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote aggregate tracking evaluation to {output}")


if __name__ == "__main__":
    main()
