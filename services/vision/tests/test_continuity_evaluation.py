import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from motion_vision.continuity_evaluation import evaluate_sequence, synthetic_sequences
from motion_vision.tracking import Tracker


def test_synthetic_continuity_counts_freezing_as_suspension_not_success():
    class Frozen(Tracker):
        def update(self, detections, timestamp_ns, epoch=None):
            return [
                {**detection, "trackId": None, "identity": "ambiguous"} for detection in detections
            ]

    metrics = evaluate_sequence(Frozen, synthetic_sequences()["side-back-turn"])
    assert metrics["continuityCoverage"] == 0
    assert metrics["ambiguousDurationMs"] == metrics["eligibleDurationMs"]
    assert metrics["maximumSuspensionMs"] == metrics["eligibleDurationMs"]
    assert metrics["wrongAssociationCount"] == 0


def test_confident_wrong_association_is_separate_from_continuity():
    class Switched(Tracker):
        def update(self, detections, timestamp_ns, epoch=None):
            # A wrong tracker gives the incumbent ID to a known bystander.
            return [
                {**detection, "trackId": "wrong", "identity": "confident"}
                for detection in detections
            ]

    frames = synthetic_sequences()["side-back-turn"]
    frames[3]["detections"][0]["subject"] = "spectator"
    metrics = evaluate_sequence(Switched, frames)
    assert metrics["wrongAssociationCount"] == 1
    assert metrics["wrongAssociationDurationMs"] == 33
    assert metrics["continuityCoverage"] < 1


def test_clear_short_gap_records_bounded_recovery_and_genuine_overlap_stays_unresolved():
    fixtures = synthetic_sequences()
    recovered = evaluate_sequence(Tracker, fixtures["spectators-during-gap"])
    assert recovered["wrongAssociationCount"] == 0
    assert recovered["recoveryDurationsMs"] == [99]
    assert recovered["unresolvedAtEnd"] == 0
    overlap = evaluate_sequence(Tracker, fixtures["genuine-overlap"])
    assert overlap["continuityCoverage"] == 0
    assert overlap["wrongAssociationCount"] == 0
    assert overlap["ambiguousDurationMs"] > 0
    assert overlap["unresolvedAtEnd"] == 1


def test_local_heldout_route_keeps_labels_and_coordinates_out_of_aggregate_output():
    root = Path(__file__).resolve().parents[3]
    local = root / ".local"
    local.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="tracking-test-", dir=local) as directory:
        source, output = Path(directory) / "input.json", Path(directory) / "output.json"
        source.write_text(
            json.dumps({"private-sequence-label": synthetic_sequences()["side-back-turn"]}),
            encoding="utf-8",
        )
        subprocess.run(
            [
                sys.executable,
                "services/vision/tools/tracking_continuity.py",
                "--input",
                str(source),
                "--output",
                str(output),
            ],
            cwd=root,
            check=True,
            capture_output=True,
        )
        payload = output.read_text(encoding="utf-8")
        assert "private-sequence-label" not in payload
        assert '"joints"' not in payload and '"player"' not in payload
        assert (
            json.loads(payload)["results"]["current"]["pose"]["heldout-0"]["continuityCoverage"]
            == 1
        )


def test_heldout_route_rejects_public_output_before_reading_input():
    root = Path(__file__).resolve().parents[3]
    result = subprocess.run(
        [
            sys.executable,
            "services/vision/tools/tracking_continuity.py",
            "--input",
            ".local/not-read.json",
            "--output",
            "reports/unsafe-heldout.json",
        ],
        cwd=root,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2
    assert "must stay under ignored" in result.stderr
    assert not (root / "reports/unsafe-heldout.json").exists()
