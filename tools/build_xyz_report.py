"""Generate a standalone, data-driven report with optional embedded verification captures."""

import base64
import html
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def number(value: float | None, factor: float = 1) -> str:
    return "—" if value is None else f"{value * factor:.2f}"


def main() -> None:
    results = json.loads((ROOT / "reports/xyz-results.json").read_text())
    candidate = results["selected_candidate"]
    display_method = candidate or "midpoint"
    nominal = {r["method"]: r for r in results["accuracy"] if r["scenario"] == "nominal_1px"}
    method_rows = []
    for method, row in nominal.items():
        timing = next(r for r in results["timing"] if r["method"] == method and r["players"] == 3)
        method_rows.append(
            f"<tr><th>{method}</th><td>{number(row['root_error_m']['p95'], 100)}</td>"
            f"<td>{number(row['wrist_error_m']['p95'], 100)}</td>"
            f"<td>{number(min(row['root_coverage'], row['wrist_coverage']), 100)}%</td>"
            f"<td>{number(timing['latency_ms']['p95'])}</td></tr>"
        )
    scenario_rows = []
    for row in results["accuracy"]:
        if row["method"] != display_method:
            continue
        scenario_rows.append(
            f"<tr><th>{html.escape(row['scenario'])}</th>"
            f"<td>{number(row['raw_error_m']['p95'], 100)}</td>"
            f"<td>{number(row['root_error_m']['p95'], 100)}</td>"
            f"<td>{number(row['wrist_error_m']['p95'], 100)}</td>"
            f"<td>{number(row['coverage'], 100)}%</td>"
            f"<td>{row['unsafe_accepted_joints']:,}</td>"
            f"<td>{row['wrong_identity_accepted_joints']:,}</td></tr>"
        )
    timing_rows = []
    for row in results["timing"]:
        stats = row["latency_ms"]
        timing_rows.append(
            f"<tr><th>{row['method']} / {row['players']} player(s)</th>"
            + "".join(f"<td>{number(stats[p])}</td>" for p in ("p50", "p95", "p99"))
            + f"<td>{row['samples']:,}</td><td>{number(row['duration_s'])}</td></tr>"
        )
    captures = []
    for filename, label in (
        ("xyz-desktop.jpg", "Desktop report, 1440 × 1000"),
        ("xyz-mobile.jpg", "Mobile report, 390 × 844"),
    ):
        path = ROOT / "reports/evidence" / filename
        if path.exists():
            data = base64.b64encode(path.read_bytes()).decode()
            captures.append(
                f'<figure><img src="data:image/jpeg;base64,{data}" '
                f'alt="{label}"><figcaption>{label}; actual local-server '
                "render captured before embedding these previews.</figcaption></figure>"
            )
    verification_path = ROOT / "reports/xyz-verification.json"
    verification: dict[str, Any] = (
        json.loads(verification_path.read_text()) if verification_path.exists() else {}
    )
    checks = "".join(f"<li>{html.escape(check)}</li>" for check in verification.get("checks", []))
    pr = verification.get("pr_url")
    pr_link = f'<a href="{html.escape(pr)}">Pull request</a>' if pr else "PR link pending."
    prior = json.loads((ROOT / "reports/xyz-prior-timing.json").read_text())
    prior_rows = "".join(
        f"<tr><th>{row['method']} / {row['players']} player(s)</th>"
        f"<td>{number(row['latency_ms']['p95'])}</td>"
        f"<td>{number(row['latency_ms']['p99'])}</td></tr>"
        for row in prior["timing"]
    )
    selected = nominal.get(display_method)
    root_p95 = number(selected["root_error_m"]["p95"], 100) if selected else "—"
    wrist_p95 = number(selected["wrist_error_m"]["p95"], 100) if selected else "—"
    stage = next(
        (r for r in results["timing"] if r["method"] == display_method and r["players"] == 3), None
    )
    stage_p95 = number(stage["latency_ms"]["p95"]) if stage else "—"
    output = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Player XYZ — two-camera experiment</title>
<style>
:root{{color-scheme:light;--ink:#182a32;--muted:#455963;--line:#becacc;--paper:#f5f3ed;
--accent:#00695d;--warn:#79441b}}*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);
color:var(--ink);font:17px/1.65 system-ui,sans-serif}}main{{max-width:1160px;margin:auto;
padding:58px 32px}}.eyebrow{{font-size:13px;font-weight:750;letter-spacing:.14em;color:var(--accent)}}
h1{{font-size:clamp(38px,6vw,74px);line-height:1.04;letter-spacing:-.05em;max-width:850px;
margin:20px 0 26px}}h2{{font-size:28px;line-height:1.2;margin:0 0 22px}}h3{{font-size:20px}}
p{{max-width:850px}}.lede{{font-size:21px;max-width:780px}}.notice{{border-left:5px solid var(--warn);
padding:12px 20px;background:#ede3d4}}.metrics{{display:grid;grid-template-columns:repeat(3,1fr);
gap:25px;margin:38px 0}}.metric{{border-top:2px solid var(--accent);padding-top:14px}}
.value{{font-size:42px;font-weight:700;letter-spacing:-.04em;line-height:1.2}}
.label{{font-size:14px;color:var(--muted)}}section{{padding:38px 0;border-top:1px solid var(--line)}}
a{{color:#005c53;text-underline-offset:3px}}.scroll{{overflow:auto;max-width:100%}}
table{{border-collapse:collapse;width:100%;font-size:14px;line-height:1.45;text-align:right}}
th,td{{padding:12px 10px;border-bottom:1px solid var(--line);white-space:nowrap}}
th:first-child{{text-align:left}}thead{{background:#e4e9e3}}tbody th{{font-weight:550}}
caption{{text-align:left;font-size:13px;color:var(--muted);padding:12px 0}}
.two{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}}
code,pre{{font-size:13px}}
pre{{padding:20px;background:#e4e9e3;overflow:auto}}svg{{width:100%;height:auto;display:block}}
figure{{margin:0 0 24px}}img{{display:block;width:100%;border:1px solid var(--line)}}
figcaption,small{{font-size:13px;color:var(--muted)}}li{{margin:8px 0}}footer{{font-size:14px;
color:var(--muted)}}details{{margin:16px 0}}summary{{cursor:pointer;font-weight:650}}
@media(max-width:620px){{main{{padding:30px 20px}}.lede{{font-size:18px}}
.metrics,.two{{grid-template-columns:minmax(0,1fr);gap:22px}}.value{{font-size:36px}}
section{{padding:30px 0}}h2{{font-size:25px}}}}
</style></head><body><main>
<header><div class="eyebrow">MOTION CAPTURE GAMES · M1 EXPERIMENT · 09 NOV 2026</div>
<h1>Where players are,<br>in three dimensions.</h1>
<p class="lede">Three stereo methods, one reproducible experiment. Metric player and joint
coordinates alongside motion tracking, with explicit rejection when evidence is weak.</p>
<p class="notice"><strong>Synthetic evidence only.</strong> Cameras are not connected or calibrated.
Physical accuracy, dynamic identity and motion-to-visible latency: <strong>NOT RUN</strong>.</p>
<div class="metrics"><div class="metric"><div class="value">{root_p95} cm</div>
<div class="label">Nominal torso position error · p95 · target ≤10 cm</div></div>
<div class="metric"><div class="value">{wrist_p95} cm</div>
<div class="label">Nominal wrist error · p95 · target ≤15 cm</div></div>
<div class="metric"><div class="value">{stage_p95} ms</div>
<div class="label">Three-player reconstruction · p95 · target &lt;5 ms</div></div></div>
<p>Selected synthetic candidate: <strong>{html.escape(str(candidate))}</strong>.
The least costly method passing every nominal accuracy, coverage and stage-latency gate.
If none passes, midpoint is shown for inspection and selection remains open.</p></header>
<section><h2>From image motion to rig-space XYZ</h2><div class="two"><div>
<h3>Before this branch</h3><p>Documentation defines two cameras and optional rig coordinates.
There is no executable stereo reconstruction or measured geometry comparison.</p>
<h3>After this branch</h3><p>An isolated vision module triangulates named joints, computes
the hip-midpoint root, and preserves source/calibration/clock metadata. Invalid timing,
geometry or identity produces missing XYZ. Games and scores are outside this experiment.</p>
<p>Stand height: user-reported 1.4 m. The 2 m baseline, 1000 px focal length and 1920×1080
processed images below are synthetic assumptions, not validated 4K camera settings.</p></div>
<svg viewBox="0 0 500 360" role="img" aria-label="Top view of two illustrative cameras triangulating a player">
<rect x="1" y="1" width="498" height="358" fill="#e4e9e3"/>
<path d="M70 72H430" stroke="#182a32" stroke-width="5"/>
<text x="250" y="43" text-anchor="middle" font-size="16">DISPLAY / RIG ORIGIN</text>
<path d="M90 86L300 272L410 86M90 86L410 86" fill="none" stroke="#00695d" stroke-width="2"/>
<rect x="76" y="72" width="28" height="22" fill="#182a32"/>
<rect x="396" y="72" width="28" height="22" fill="#182a32"/>
<circle cx="300" cy="272" r="13" fill="#00695d"/>
<text x="250" y="117" text-anchor="middle" font-size="15">2 m illustrative baseline</text>
<path d="M160 170H100M160 170V232" fill="none" stroke="#182a32" stroke-width="2"/>
<text x="88" y="164" font-size="16">+X</text><text x="167" y="230" font-size="16">+Z</text>
<text x="300" y="316" text-anchor="middle" font-size="16">PLAYER · XYZ IN METERS</text>
<text x="35" y="340" font-size="13">Top view · +Y up · schematic, not to scale</text></svg></div></section>
<section><h2>Accuracy and cost, compared</h2>
<p>Identical seeded 1 px Gaussian observations, calibrated 2 m baseline, three players.
Torso and wrist coverage must each reach 95%; missing output never counts as an accurate sample.</p>
<div class="scroll" tabindex="0" role="region" aria-label="Algorithm comparison table">
<table><caption>Nominal p95 error in cm; complete three-player reconstruction stage in ms.</caption>
<thead><tr><th>Method</th><th>Torso cm</th><th>Wrist cm</th><th>Min. root/wrist coverage</th>
<th>Stage ms</th></tr></thead><tbody>{"".join(method_rows)}</tbody></table></div>
<p>DLT solves a linear SVD system. Midpoint finds the closest points on the two rays.
Refinement adds five damped iterations to lower pixel reprojection error; that improvement
does not establish better metric accuracy or repair biased calibration.</p></section>
<section><h2>Failure cases are part of the result</h2>
<p>Each scenario contains 9,180 requested joint pairs per method: 180 synthetic frames,
three people and 17 anatomical joints. This table shows the selected candidate; full results
for all methods are embedded below. Coverage includes missing and rejected input.</p>
<div class="scroll" tabindex="0" role="region" aria-label="Stress scenario table"><table>
<caption>Errors in cm. “Above target” counts accepted joints exceeding their individual threshold;
the release target itself is p95. An em dash means no accepted sample.</caption>
<thead><tr><th>Scenario</th><th>Raw p95</th><th>Torso p95</th><th>Wrist p95</th><th>Coverage</th>
<th>Above target</th><th>Wrong identity accepted</th></tr></thead>
<tbody>{"".join(scenario_rows)}</tbody></table></div>
<p class="notice"><strong>Low residuals can still be wrong.</strong> A biased baseline scale,
bad extrinsics, unmodeled lens distortion or a cross-person match falsely marked confirmed can
pass geometric checks. The large errors in these negative controls keep hardware certification
and authoritative 3D gameplay open.</p>
<p>A wider baseline can improve depth precision but reduce shared coverage and complicate
identity matching. Stand height alone does not determine accuracy. No physical mounting change
has been selected from this synthetic experiment.</p></section>
<section><h2>Latency is a stage measurement</h2>
<p>Three trials per workload, 30 warm-up batches discarded per trial, 1,000 measured batches per
trial. One BLAS thread. Includes metadata gates, reconstruction, quality checks and allocations.
Excludes capture, decoding, inference, pairing, association, delivery, rendering and display.</p>
<div class="scroll" tabindex="0" role="region" aria-label="Latency table"><table>
<caption>Pooled stage percentiles in milliseconds. Short repeated workloads, not real camera streams.</caption>
<thead><tr><th>Workload</th><th>p50 ms</th><th>p95 ms</th><th>p99 ms</th><th>Samples</th>
<th>Measured duration s</th></tr></thead><tbody>{"".join(timing_rows)}</tbody></table></div>
<p>Environment: {html.escape(json.dumps(results["environment"]))}.
Full experiment duration: {results["experiment_duration_s"]:.1f} s.
The &lt;100 ms p95 visible-feedback target is unmeasured. Stage percentiles cannot be added
to claim end-to-end latency. No Windows, RTX 3070, USB or integrated-graphics profile is certified.</p></section>
<section><h2>Earlier timing tails, retained</h2>
<p>An earlier full run had large wall-clock tails. Background CPU activity was observed;
causation is not isolated. No unrelated workloads were stopped. The current comparison does
not erase this evidence or establish a hard scheduling guarantee.</p>
<div class="scroll" tabindex="0" role="region" aria-label="Earlier latency evidence"><table>
<caption>Earlier stage timing, 3,000 samples per workload, ms. Same reconstruction gates.</caption>
<thead><tr><th>Workload</th><th>p95 ms</th><th>p99 ms</th></tr></thead>
<tbody>{prior_rows}</tbody></table></div>
<p>The 2.5 m layout was initially classified nominal; it became a sensitivity case after
image-bound checks exposed wrist coverage below 95%. The reference nominal layout remains
2 m. No quality or latency threshold was relaxed.</p>
<details><summary>Earlier timing source data</summary>
<pre>{html.escape(json.dumps(prior, indent=2))}</pre></details></section>
<section><h2>Reproduce and review</h2><div class="two"><div>
<pre>python3 tools/project.py setup
python3 tools/project.py check
python3 tools/project.py experiment
python3 tools/project.py build
python3 tools/project.py dev</pre>
<p>Windows: use <code>python</code>. Setup pins uv 0.9.26, CPython 3.12.12 and a locked
repository-local environment. No global configuration change. Build produces this report;
dev serves it on loopback port 8765.</p></div><div><h3>Actual verification</h3>
<ul>{checks or "<li>Final verification pending.</li>"}</ul>
<p><a href="https://github.com/DupeisTaken/motion-capture-games/issues/4">Issue #4</a> · {pr_link}</p>
<p>Branch: <code>codex/player-xyz-experiments</code>. Independent of the camera/skeleton
viewer work. All committed observations are synthetic; no participant footage or credentials.</p></div></div>
<details><summary>Full configuration and measured results</summary>
<pre>{html.escape(json.dumps(results, indent=2))}</pre></details></section>
<section><h2>Physical validation remains the release gate</h2>
<ol><li>Identify camera models, spacing, room coverage, USB modes, exposure timing and the host rig.</li>
<li>Calibrate exact lens/image geometry and metric scale. Validate with held-out physical positions,
including at least 27 locations × 30 samples × three calibration/remount repetitions.</li>
<li>Verify exposure alignment using a shared timing reference; uncertain host arrival times
cannot certify synchronized fast-motion XYZ.</li>
<li>Measure dynamic hips/wrists against synchronized independent ground truth. Repeat reaches,
depth changes, fast reversals, three-player crossings and recovery at least ten times each.</li>
<li>Measure useful update intervals, whole-pipeline load and externally observed motion-to-visible
feedback. Meet agreed error/coverage targets and &lt;100 ms p95 on the declared rig.</li></ol>
<p>Calibration and identity algorithms must pass their own evidence gates. First-order uncertainty
screens assume a localization-noise and speed model; they are not verified spatial confidence intervals.
If the geometry or exposure timing fails, revise placement or sensors before enabling depth scoring.</p></section>
<section><h2>Report rendering evidence</h2><p>The desktop capture shows the English report on
a local server. Mobile screenshot verification is pending because local browser access was disabled
before that check. The experiment has no gameplay interface to capture.</p>
<div class="two">{"".join(captures) or "<p>Screenshot verification pending.</p>"}</div></section>
<footer>Sources: <a href="https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html">OpenCV
calibration/reconstruction</a>, <a href="https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Python">
MediaPipe pose output semantics</a>, <a href="https://docs.astral.sh/uv/concepts/projects/sync/">uv locking</a>.
This file contains its styles, diagram, data and verification captures; it is readable offline.</footer>
</main></body></html>"""
    (ROOT / "reports/xyz-experiment.html").write_text(output)
    print("Built reports/xyz-experiment.html")


if __name__ == "__main__":
    main()
