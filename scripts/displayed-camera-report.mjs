import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const evidence = JSON.parse(
  await readFile("reports/displayed-camera-results.json", "utf8"),
);
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const table = (headers, rows) =>
  `<div class="table-wrap" tabindex="0" role="region" aria-label="${escape(headers.join(", "))}"><table><thead><tr>${headers.map((header) => `<th>${escape(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, i) => `<${i ? "td" : "th"}>${escape(cell)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table></div>`;
const figures = [];
for (const item of evidence.images) {
  if (!/^[a-z0-9-]+\.png$/.test(item.file))
    throw new Error("Report images must be owned PNG evidence filenames.");
  const bytes = await readFile(
    resolve("reports/local/displayed-camera", item.file),
  );
  figures.push(
    `<figure><img src="data:image/png;base64,${bytes.toString("base64")}" alt="${escape(item.title)}"><figcaption><strong>${escape(item.title)}</strong><br>${escape(item.caption)}</figcaption></figure>`,
  );
}
const reviews = evidence.reviews
  .map(
    (item) =>
      `<article><h3>${escape(item.name)} · ${escape(item.score)}/10</h3><p>${escape(item.scope)}</p><p>${escape(item.evidence)}</p></article>`,
  )
  .join("");
const hosted = evidence.hosted
  ? `<p><a href="${escape(evidence.hosted.url)}">Hosted verification</a>: ${escape(evidence.hosted.result)} for <code>${escape(evidence.hosted.head)}</code>. Latest-head <code>software-checks</code> must pass before merge.</p>`
  : `<p>Hosted results for the current commit are tracked on ${evidence.pullRequest ? `<a href="${escape(evidence.pullRequest)}/checks">the PR Checks tab</a>` : "the implementation PR"}. This static report records local verification; latest-head <code>software-checks</code> must pass before merge.</p>`;
const pr = evidence.pullRequest
  ? `<a href="${escape(evidence.pullRequest)}">Implementation PR</a> · `
  : "";
// Zero-minimum tracks let image cards and long evidence tokens shrink on phones;
// measurement tables retain their own horizontal scrolling instead of clipping data.
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Displayed camera · Synthetic rig output</title><style>
th:first-child,td:first-child{min-width:160px}th:nth-child(2),td:nth-child(2){min-width:90px}
:root{font-family:system-ui,sans-serif;color:#20344b;background:#edf3f7}*{box-sizing:border-box}body{margin:0;line-height:1.65;overflow-wrap:anywhere}main{max-width:1140px;margin:auto;padding:48px 28px}header{background:#143849;color:#f3fbff;padding:32px;border-radius:16px}header a{color:#c3ecff}h1{font-size:clamp(32px,5vw,52px);letter-spacing:-.035em;line-height:1.12;margin:18px 0}h2{font-size:27px;line-height:1.3;margin-top:36px}h3{font-size:18px;margin:0 0 10px}p{max-width:90ch}a{color:#1a6087}code{overflow-wrap:anywhere}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.12em}nav{display:flex;flex-wrap:wrap;gap:16px;margin:24px 0}.cards,.figures{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-items:start}article,figure{min-width:0;padding:20px;margin:0;background:white;border:1px solid #cbd8e3;border-radius:12px}img{display:block;width:100%;max-width:100%;height:auto;border:1px solid #d7e1e8}figcaption{font-size:13px;color:#435e75;margin-top:12px}.note{padding:16px 20px;background:#fff3d7;border-left:4px solid #ad7416}.table-wrap{min-width:0;max-width:100%;overflow:auto;border:1px solid #cbd8e3;border-radius:9px;background:white;margin:20px 0}table{width:100%;min-width:620px;border-collapse:collapse;font-size:13px}th,td{text-align:left;vertical-align:top;padding:11px 12px;border-bottom:1px solid #d5dfe8}thead{background:#dce9f1}footer{font-size:12px;color:#4e667a;border-top:1px solid #cbd8e3;margin-top:36px;padding-top:20px}@media(max-width:700px){main{padding:20px 14px}header{padding:24px 20px}.cards,.figures{grid-template-columns:minmax(0,1fr)}h2{font-size:24px}figure{padding:12px}}
</style></head><body><main><header><p class="eyebrow">Motion capture games / ${escape(evidence.date)} / English</p><h1>Choose the displayed camera.<br>Keep one rig space.</h1><p>A selected output view for recorded synthetic observations, with a separate display window and the original two-view diagnostics retained.</p><p>${pr}<a href="https://github.com/DupeisTaken/motion-capture-games/issues/38">Issue #38</a> · <a href="https://github.com/DupeisTaken/motion-capture-games/pull/37">Rig workspace PR #37</a></p></header>
<nav aria-label="Report sections"><a href="#change">Change</a><a href="#checks">Checks and reviews</a><a href="#screenshots">Before and after</a><a href="#limits">Limits</a></nav>
<section id="change"><h2>Presentation choice, stable reconstruction</h2><div class="cards"><article><h3>One selected output</h3><p>The operator chooses which recorded camera supplies the selected diagram and its matching joint overlay and source context. The selected camera is identified explicitly. Missing, stale or unresolved selected input produces an unavailable state rather than silently displaying another camera.</p><p>The selection is a display preference. It does not change the reference/supporting roles, source pairing, reconstructed XYZ, calibration, rig association or player ownership.</p></article><article><h3>Operator diagnostics stay available</h3><p>Both original camera observations, the rig map, accepted-joint information and rejection reasons remain available for diagnosis. A separate display window follows the same selected camera and recorded sample; closing it returns the output to the operator workspace.</p><p>The preference survives reload when local storage is available. Physical planning keeps synthetic output separate, and none of these controls starts acquisition.</p></article></div><div class="note"><p>This is a camera-free presentation change. The selected source is a recorded synthetic view from the existing solver fixture, not a live RGB camera stream. Physical XYZ and maze input remain unavailable.</p></div></section>
<section id="checks"><h2>Actual verification and independent review</h2>${table(
  ["Check", "Result", "Actual scope"],
  evidence.checks.map((item) => [item.name, item.result, item.detail]),
)}${hosted}<p>Local environment: ${escape(evidence.environment)}. Tables scroll horizontally on narrow screens.</p><p>${escape(evidence.browserSummary)}</p><div class="cards" id="reviews">${reviews}</div><p>Review ratings concern the declared synthetic presentation scope and reported checks. They do not certify physical calibration, exposure timing, live capture, participant identity or latency.</p></section>
<section id="screenshots"><h2>Before and after, served locally</h2><p>${escape(evidence.baselineNote || "Baseline rig entry, stylesheet and renderer are loaded from the recorded commit with current shared imports and the actual recorded solver fixture. After captures use the current Vite-served application. All observations and planning device names are synthetic.")}</p><div class="figures">${figures.join("")}</div></section>
<section id="limits"><h2>Remaining physical and browser limits</h2><p>The existing rig experiment does not acquire two live cameras, calibrate them or verify exposure synchronization and cross-view identity. A live implementation still needs device-scoped capture ownership, bounded pairing, source timing, calibrated transforms, explicit association/recovery and independent physical accuracy/latency evidence. A display preference cannot supply those gates.</p><p>Popup behavior follows browser policy: a browser can open a tab or block a window. The inline output must remain usable, and closing a separate window must not restart capture or reconstruction. Preference persistence depends on local storage availability; blocked storage retains the current page’s selection.</p><p>Synthetic source-time checks describe recorded evaluation time. They do not turn playback into a live exposure measurement or prove camera performance. No participant data, credentials or real device identifiers are included.</p></section><footer>Self-contained static HTML generated by scripts/displayed-camera-report.mjs. CSS and screenshots are embedded; no external rendering assets. Synthetic examples only. Date uses Asia/Shanghai.</footer></main></body></html>`;
await writeFile("reports/displayed-camera.html", html);
console.log(
  `Wrote displayed-camera report (${Buffer.byteLength(html)} bytes).`,
);
