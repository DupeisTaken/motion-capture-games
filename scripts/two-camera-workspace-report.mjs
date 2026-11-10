import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const evidence = JSON.parse(
  await readFile("reports/two-camera-workspace-results.json", "utf8"),
);
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const table = (headings, rows) =>
  `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(headings.join(", "))}"><table><thead><tr>${headings.map((heading) => `<th>${esc(heading)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, i) => `<${i ? "td" : "th"}>${esc(cell)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const figures = [];
for (const item of evidence.images) {
  const bytes = await readFile(
    resolve("reports/local/two-camera-workspace", item.file),
  );
  figures.push(
    `<figure><img src="data:image/png;base64,${bytes.toString("base64")}" alt="${esc(item.title)}"><figcaption><strong>${esc(item.title)}</strong><br>${esc(item.caption)}</figcaption></figure>`,
  );
}
const hosted = evidence.hosted
  ? `<p><a href="${esc(evidence.hosted.url)}">Hosted verification</a>: ${esc(evidence.hosted.result)} for <code>${esc(evidence.hosted.head)}</code>. Latest-head <code>software-checks</code> must pass before merge.</p>`
  : "<p>Hosted checks have not yet been verified. Latest-head software-checks must pass before merge.</p>";
const reviews = evidence.reviews
  .map(
    (item) =>
      `<article><h3>${esc(item.name)} · ${esc(item.score)}/10</h3><p>${esc(item.scope)}</p><p>${esc(item.evidence)}</p></article>`,
  )
  .join("");
const pr = evidence.pullRequest
  ? `<a href="${esc(evidence.pullRequest)}">Implementation PR</a> · `
  : "";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Two-camera operator workspace · XYZ rehearsal</title><style>
:root{font-family:system-ui,sans-serif;background:#edf3f7;color:#20344b}*{box-sizing:border-box}body{margin:0;line-height:1.65}main{max-width:1140px;margin:auto;padding:48px 28px}header{padding:32px;background:#143849;color:#f3fbff;border-radius:16px}header a{color:#c3ecff}h1{font-size:clamp(32px,5vw,52px);line-height:1.12;letter-spacing:-.035em;margin:18px 0}h2{font-size:27px;margin-top:36px;line-height:1.3}h3{font-size:18px;margin:0 0 10px}p{max-width:90ch}a{color:#1a6087}code{overflow-wrap:anywhere}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.12em}nav{display:flex;flex-wrap:wrap;gap:16px;margin:24px 0}.cards,.figures{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-items:start}article,figure{margin:0;padding:20px;background:white;border:1px solid #cbd8e3;border-radius:12px}img{display:block;width:100%;height:auto;border:1px solid #d7e1e8}figcaption{font-size:13px;color:#435e75;margin-top:12px}.note{padding:16px 20px;border-left:4px solid #ad7416;background:#fff3d7}.table-wrap{overflow:auto;background:#fff;border:1px solid #cbd8e3;border-radius:9px;margin:20px 0}table{width:100%;min-width:620px;border-collapse:collapse;font-size:13px}th,td{text-align:left;vertical-align:top;padding:11px 12px;border-bottom:1px solid #d5dfe8}thead{background:#dce9f1}footer{border-top:1px solid #cbd8e3;margin-top:36px;padding-top:20px;color:#4e667a;font-size:12px}@media(max-width:700px){main{padding:20px 14px}header{padding:24px 20px}.cards,.figures{grid-template-columns:1fr}h2{font-size:24px}figure{padding:12px}}
</style></head><body><main><header><p class="eyebrow">Motion capture games / ${esc(evidence.date)} / English</p><h1>Two views.<br>One rig-space position.</h1><p>An operator workspace for understanding paired-camera XYZ, inspecting rejection reasons and preparing a physical rig for possible future maze input.</p><p>${pr}<a href="https://github.com/DupeisTaken/motion-capture-games/issues/34">Issue #34</a> · <a href="https://github.com/DupeisTaken/motion-capture-games/pull/31">Merged foundation PR #31</a></p></header>
<nav aria-label="Report sections"><a href="#change">Change</a><a href="#evidence">Behavior and evidence</a><a href="#checks">Checks and reviews</a><a href="#screenshots">Screenshots</a><a href="#limits">Physical follow-up</a></nav>
<section id="change"><h2>From a single-camera console to a rig workspace</h2><p>The existing console answers single-view questions: what was detected, how fresh it is and whether its camera-local identity is usable. Coordinating a second angle adds distinct camera roles, metric geometry, exposure alignment and cross-view association. Placing all of that inside the existing console would make ordinary diagnostics harder to scan.</p><div class="cards"><article><h3>Recorded synthetic rehearsal</h3><p>The new <code>/rig.html</code> page shows reference and supporting observations, their named anatomical joints, reconstructed X/Y/Z, a floor map and explicit unavailable states. Scenario and sample controls let an operator compare accepted estimates, rejection reasons and separate synthetic reference truth.</p><p>The committed dataset is generated by the existing Python XYZ solver, with semantic drift tests. Playback presents bounded recorded samples; browser animation is not pose inference or live capture.</p></article><article><h3>Physical planning</h3><p>Two independent named-device selectors assign stable camera roles, reject duplicate selections and recover from reordering or disconnection. Discovery is explicit and metadata-only. Existing selectors retain their default IDs and behavior.</p><p>Notes, intended placement and role-plan checks remain operator records. Switching out of rehearsal removes synthetic diagnostics; planning cannot make calibration, exposure timing, identity or maze input physically valid.</p></article></div><p>The work follows the user’s explicit choice of operator UI and synthetic rehearsal first. PR #31 was merged only after its latest-head checks were confirmed green. This follow-up uses a new branch and issue; it implements no maze gameplay or simultaneous live acquisition.</p></section>
<section id="evidence"><h2>Actual solver outputs, explicit limits</h2><p>${esc(evidence.datasetSummary)}</p>${table(["Recorded case", "Observed software behavior", "Operator implication"], evidence.cases)}<div class="note"><p>A plausible two-view result can still have the wrong metric scale or identity. The hidden-bias case keeps this visible. A synthetic accepted sample is never labelled as physically validated or ready to control a maze.</p></div><p>${esc(evidence.browserSummary)}</p><p>Tables scroll horizontally on narrow screens. All examples and device names in screenshots are synthetic.</p></section>
<section id="checks"><h2>Checks and independent review</h2>${table(
  ["Check", "Result", "Actual scope"],
  evidence.checks.map((item) => [item.name, item.result, item.detail]),
)}${hosted}<p>Local environment: ${esc(evidence.environment)}. No new dependencies or distributable packages were added. The fourth application entry is included in the production build and artifact checks.</p><div class="cards">${reviews}</div><p>Ratings apply to the declared operator UI and camera-free rehearsal scope. They do not certify physical accuracy, exposure synchronization, camera compatibility, participant identity or motion-to-visible latency.</p></section>
<section id="screenshots"><h2>Before and after, served locally</h2><p>English desktop, mobile and narrow captures use actual Vite-served application code and styles. The baseline console entry source comes from merged commit <code>4bd2070</code>, rendered with the current shared styles and runtime imports. Planning interactions use synthetic device metadata; no camera is opened.</p><div class="figures">${figures.join("")}</div></section>
<section id="limits"><h2>What a physical maze input still needs</h2><p>The current service supports one live source. A second call to its Start endpoint replaces that source; it does not create a calibrated camera pair. This workspace calls no capture endpoint and cannot convert existing host-read timestamps into verified exposure times.</p><p>A live implementation needs one owner per device, bounded pairing and source timing, scoped group lifecycle and partial-start cleanup, calibrated transforms tied to camera identities/image geometry, cross-view association and explicit missing/stale/recovery behavior. Independent held-out metric references, dynamic ground truth, overlap/play-boundary trials, useful update rate and external latency measurements must establish the declared rig’s limits before root XYZ controls a maze.</p><p><a href="https://github.com/DupeisTaken/motion-capture-games/blob/codex/two-camera-workspace/docs/two-camera-workspace.md">Owning workspace guide</a> · <a href="https://github.com/DupeisTaken/motion-capture-games/blob/codex/two-camera-workspace/docs/player-xyz-experiment.md">XYZ physical validation protocol</a> · <a href="https://github.com/DupeisTaken/motion-capture-games/blob/codex/two-camera-workspace/reports/two-camera-workspace-results.json">Verification record</a></p></section><footer>Self-contained static HTML generated by scripts/two-camera-workspace-report.mjs. All CSS and screenshot bytes embedded; no external rendering assets. Synthetic examples only, with no credentials, private participant footage or real device identifiers. Date uses Asia/Shanghai.</footer></main></body></html>`;
await writeFile("reports/two-camera-workspace.html", html);
console.log(
  `Wrote offline two-camera report (${Buffer.byteLength(html)} bytes).`,
);
