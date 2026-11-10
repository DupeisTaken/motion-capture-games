import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const evidence = JSON.parse(
  await readFile("reports/vision-issues-results.json", "utf8"),
);
const xyz = JSON.parse(await readFile("reports/xyz-results.json", "utf8"));
const folder = resolve("reports/local/vision-issues");
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const number = (value, digits = 2) =>
  value == null ? "unavailable" : Number(value).toFixed(digits);
const percentage = (value) => `${number(value * 100, 1)}%`;
const rows = (items) =>
  items
    .map(
      (cells) =>
        `<tr>${cells.map((cell, i) => `<${i ? "td" : "th"}>${escape(cell)}</${i ? "td" : "th"}>`).join("")}</tr>`,
    )
    .join("");
const table = (headers, items) =>
  `<div class="table-wrap" tabindex="0" role="region" aria-label="${escape(headers.join(", "))}"><table><thead><tr>${headers.map((name) => `<th>${escape(name)}</th>`).join("")}</tr></thead><tbody>${rows(items)}</tbody></table></div>`;
const figures = [];
for (const entry of evidence.images) {
  const image = await readFile(resolve(folder, entry.file));
  figures.push(
    `<figure><img src="data:image/png;base64,${image.toString("base64")}" alt="${escape(entry.title)}"><figcaption><strong>${escape(entry.title)}</strong><br>${escape(entry.caption)}</figcaption></figure>`,
  );
}
const nominal = xyz.accuracy.filter((item) => item.scenario === "nominal_1px");
const spatial = nominal.map((item) => [
  item.method,
  number(item.root_error_m.p95 * 100),
  number(item.wrist_error_m.p95 * 100),
  percentage(item.root_coverage),
  percentage(item.wrist_coverage),
  item.unsafe_accepted_joints,
]);
const timing = xyz.timing.map((item) => [
  item.method,
  item.players,
  item.samples,
  number(item.latency_ms.p50, 3),
  number(item.latency_ms.p95, 3),
  number(item.latency_ms.p99, 3),
  item.provisional_stage_pass ? "Pass" : "Misses provisional target",
]);
const failures = xyz.accuracy.map((item) => [
  item.scenario,
  item.method,
  percentage(item.coverage),
  percentage(item.root_coverage),
  percentage(item.wrist_coverage),
  item.unsafe_accepted_joints,
  item.wrong_identity_accepted_joints,
  number(
    item.accepted_error_m.p95 == null ? null : item.accepted_error_m.p95 * 100,
  ),
]);
const checks = evidence.checks.map((item) => [
  item.name,
  item.result,
  item.detail,
]);
const reviews = evidence.reviews
  .map(
    (item) =>
      `<article><h3>${escape(item.name)} · ${escape(item.score)}/10</h3><p>${escape(item.scope)}</p><p>${escape(item.evidence)}</p></article>`,
  )
  .join("");
const hosted = evidence.hosted
  ? `<p><a href="${escape(evidence.hosted.url)}">Hosted software-checks</a>: ${escape(evidence.hosted.result)} for <code>${escape(evidence.hosted.head)}</code>. Latest-head CI must pass before merge.</p>`
  : "<p>Hosted CI has not yet been verified. Latest-head software-checks must pass before merge.</p>";
const pr = evidence.pullRequest
  ? `<a href="${escape(evidence.pullRequest)}">Implementation PR</a> · `
  : "";
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>Vision issues 3 and 4 · Software completion report</title><style>
:root{font-family:system-ui,sans-serif;color:#1c3145;background:#edf3f7}*{box-sizing:border-box}body{margin:0;line-height:1.65}main{max-width:1160px;margin:auto;padding:48px 32px}header{padding:32px;background:#123447;color:#f4fbff;border-radius:16px}header a{color:#b5e8ff}h1{font-size:clamp(32px,5vw,54px);line-height:1.12;letter-spacing:-.035em;margin:16px 0}h2{font-size:28px;line-height:1.25;margin-top:40px}h3{font-size:18px;margin:0 0 10px}a{color:#185b85}code{font-size:.9em;overflow-wrap:anywhere}p{max-width:90ch}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.14em}.cards,.figures,.reviews{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.cards article,.reviews article,figure{background:white;border:1px solid #cbd8e3;border-radius:12px;padding:20px;margin:0}.metric{font-size:30px;font-weight:750;line-height:1.2}.note{border-left:4px solid #a9700c;padding:16px 20px;background:#fff4d9}.figures{align-items:start}img{max-width:100%;height:auto;display:block;border:1px solid #d4dee7}figcaption{font-size:13px;color:#40576c;margin-top:12px}.table-wrap{overflow-x:auto;border:1px solid #c8d5e1;border-radius:9px;background:#fff;margin:20px 0}table{width:100%;border-collapse:collapse;font-size:13px;min-width:650px}th,td{vertical-align:top;text-align:left;padding:10px 12px;border-bottom:1px solid #d6e0e8}thead{background:#dce9f1}tbody th{font-weight:600}td{font-variant-numeric:tabular-nums}nav{display:flex;gap:16px;flex-wrap:wrap;margin:24px 0}details{margin:20px 0}summary{font-weight:650;cursor:pointer}footer{font-size:12px;border-top:1px solid #c8d5e1;margin-top:36px;padding-top:20px;color:#4c6174}@media(max-width:700px){main{padding:20px 14px}header{padding:24px 20px}.cards,.figures,.reviews{grid-template-columns:1fr}h2{font-size:25px}.metric{font-size:26px}figure{padding:12px}}
</style></head><body><main><header><p class="eyebrow">Motion capture games / 10 November 2026 / English</p><h1>Fresh previews.<br>Measured reconstruction.</h1><p>Complete the diagnostic software slice, reject stale decoded images, and evaluate calibrated two-view XYZ without opening cameras or enabling depth scoring.</p><p>${pr}<a href="https://github.com/DupeisTaken/motion-capture-games/issues/3">Issue #3</a> · <a href="https://github.com/DupeisTaken/motion-capture-games/issues/4">Issue #4</a></p></header>
<nav aria-label="Report sections"><a href="#changes">Changes</a><a href="#xyz">XYZ measurements</a><a href="#checks">Checks and reviews</a><a href="#screenshots">Screenshots</a><a href="#limits">Limits</a></nav><p>On narrow screens, scroll tables horizontally to inspect every column.</p>
<section id="changes"><h2>What changed and why</h2><div class="cards"><article><h3>#3 · Diagnostic acceptance</h3><p>The existing viewer already supplies named anatomical skeletons, mirrored contain-fit transforms, separate current-detection counts/capacity, two model adapters, two association modes, bounded pull streams and explicit ownership/recovery. A fresh audit found a decode-freshness defect: a slow JPEG decode renewed an old image's lifetime.</p><p>Freshness now starts at packet receipt, includes decoding, disposes expired bitmaps and guards control/resize redraws. Explicit stale feedback remains recoverable through the next fresh packet. Source and browser clocks stay separate.</p></article><article><h3>#4 · Isolated XYZ experiment</h3><p>The prior experiment in PR #7 was reverted in PR #9; the available history gives no reason. Reviewed reconstruction code returns under the current pnpm/uv checks rather than restoring the obsolete toolchain. DLT, closest-ray midpoint and bounded reprojection refinement share gates and fixtures.</p><p>Strict metadata validates nanosecond times, calibration/image geometry, clocks and identity. Output retains provenance. Per-point refinement prevents a degenerate joint from disabling valid neighbors. Games, capture and canonical wire messages are outside this experiment.</p></article></div><p>The work is coordinated in one chat with separate subagent ownership for the viewer, geometry and real-service verification. An isolated checkout preserves unrelated camera-default edits in the original workspace.</p></section>
<section id="xyz"><h2>XYZ: accuracy and coverage together</h2><p>All results use generated 17-joint observations: ${xyz.config.frames} frames per scenario, three synthetic people, seed ${xyz.config.seed}, and ${xyz.accuracy.length / 3} scenarios per method. Camera assumptions: ideal 1920 × 1080 images, 1000 px focal length, 1.4 m stand height and 2 m reference baseline. These are illustrative geometry, not tested camera settings.</p><p>Nominal 1 px noise. Root is the midpoint of two accepted hips. Errors below are accepted-only p95 in centimeters, shown beside requested root/wrist coverage so abstention cannot hide unusable input.</p>${table(["Method", "Root p95 cm", "Wrist p95 cm", "Root coverage", "Wrist coverage", "Unsafe accepted joints"], spatial)}<p>Provisional targets: root ≤10 cm, wrist ≤15 cm, nominal coverage ≥95%. “Unsafe accepted” counts a published joint above 10 cm for non-wrist joints or 15 cm for wrists; it is separate from a p95 acceptance target. Candidate selected for this run: <strong>${escape(xyz.selected_candidate ?? "none")}</strong>. This selects no production model or certified rig.</p>
<h3>Serial reconstruction stage</h3><p>Host: ${escape(xyz.environment.os)} ${escape(xyz.environment.release)}, ${escape(xyz.environment.machine)}, Python ${escape(xyz.environment.python)}, NumPy ${escape(xyz.environment.numpy)}. Bounded single-thread native pools; fixture generation is excluded. Each workload has ${xyz.config.timing_trials} trials × ${xyz.config.timing_repetitions} measured batches after ${xyz.config.warmup} warmups per trial. Measurements include validation, reconstruction, allocation and rejection gates for sequential people.</p>${table(["Method", "People", "Samples", "p50 ms", "p95 ms", "p99 ms", "p95 <5 ms"], timing)}<p>Excluded: camera capture, inference, cross-view matching, pairing waits, media transport, rendering and physical display. Stage percentiles are not end-to-end latency. Benchmark duration: ${number(xyz.experiment_duration_s, 1)} s.</p>
<details><summary>Every scenario, including unsafe acceptance</summary><p>Coverage uses all requested joints, including missing/rejected inputs. A zero-coverage scenario has no accepted-error percentile. Wrong identity marked confirmed and unknown calibration bias can pass geometry; those failures remain visible below.</p>${table(["Scenario", "Method", "Joint coverage", "Root coverage", "Wrist coverage", "Unsafe accepted", "Wrong identity accepted", "Accepted p95 cm"], failures)}</details></section>
<section id="checks"><h2>Actual checks and independent review</h2>${table(["Check", "Result", "Evidence and scope"], checks)}${hosted}<p>Local environment: ${escape(evidence.environment)}. Frozen pnpm and locked uv installation use the existing manifests; no new dependencies or distributable packages. The CI component/build table includes source-only XYZ under the Python service.</p><div class="reviews">${reviews}</div><p>A 10/10 score means the declared camera-free software acceptance criteria have no outstanding reviewer deductions after corrections and demonstrated checks. It is an independent engineering assessment of this scope, not proof of hardware accuracy or universal correctness. Reviews were not instructed to inflate scores.</p><h3>Regression evidence</h3><p>${escape(evidence.regression)}</p><h3>Real-service browser acceptance</h3><p>${escape(evidence.browserSummary)}</p><p>Unexpected page/console errors: ${escape(evidence.browser.errors.length)}. Expected deliberate-outage errors are recorded separately. The test starts only its own Python/Vite/browser processes and closes those resources. Generated bodies bypass pose inference; no participant data, camera serials or credentials appear in this report.</p></section>
<section id="screenshots"><h2>Real local-server evidence</h2><p>English desktop, mobile and narrow layouts use actual served application code and styles. Static appearance is retained; before/after evidence focuses on the stale-image behavior. Any artificial browser decode delay is labeled in the caption.</p><div class="figures">${figures.join("")}</div></section>
<section id="limits"><h2>Remaining limits and physical gates</h2><div class="note"><p>No physical camera was used or calibrated for this work. Actual joint accuracy, simultaneous USB modes, exposure synchronization, model throughput, participant identity through crossings and externally measured motion-to-visible feedback remain unverified. Synthetic error gates cannot detect every wrong confirmed association or calibration bias. Authoritative depth scoring remains disabled.</p></div><p>The viewer intentionally permits a 0–150 ms presentation-only overlay hold under ADR 0006. It is not a same-exposure guarantee. Host read completion is not verified exposure time; browser arrival age is not exposure age. A lost startup acknowledgment still requires the documented shared-service restart/reload recovery because the protocol cannot safely guess ownership.</p><p>The owning XYZ design specifies held-out metric calibration references, exposure offset/drift measurement, static grids and independent dynamic ground truth, one-/three-participant crossings, per-location coverage and external feedback timing. M1 hardware certification remains open in the roadmap. No finite test suite is exhaustive over all devices and real-world motion.</p><p><a href="https://github.com/DupeisTaken/motion-capture-games/blob/codex/vision-issue-completion/docs/player-xyz-experiment.md">XYZ design and physical protocol</a> · <a href="https://github.com/DupeisTaken/motion-capture-games/blob/codex/vision-issue-completion/reports/xyz-results.json">Full measurements</a> · <a href="https://github.com/DupeisTaken/motion-capture-games/blob/codex/vision-issue-completion/reports/vision-issues-results.json">Verification record</a></p></section><footer>Self-contained static HTML generated by scripts/vision-issues-report.mjs. CSS and all screenshot bytes embedded; no external rendering dependencies. Synthetic examples only. Date uses Asia/Shanghai.</footer></main></body></html>`;
await writeFile("reports/vision-issues.html", html);
console.log(`Wrote vision issues report (${Buffer.byteLength(html)} bytes).`);
