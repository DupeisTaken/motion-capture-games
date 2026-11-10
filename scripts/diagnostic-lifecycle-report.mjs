import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const evidence = JSON.parse(
  await readFile("reports/diagnostic-capture-lifecycle-results.json", "utf8"),
);
const folder = resolve(
  process.argv[2] || "reports/local/diagnostic-capture-lifecycle",
);
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const images = [
  [
    "before-release-desktop.png",
    "Before: release failed, replacement unlocked",
    "Baseline main 0cc88f7, 1440 × 1050. A simulated HTTP 409 produces generic service advice while Start and source controls unlock. There is no release retry.",
  ],
  [
    "after-release-desktop.png",
    "After: ownership remains explicit",
    "Fixed viewer, 1440 × 1050. Driver detail and Retry camera stop remain visible. Start and source controls stay locked until scoped release succeeds.",
  ],
  [
    "after-release-mobile.png",
    "After: retry at mobile width",
    "390 × 844 viewport, full-page capture. The same warning, action and control locks fit without horizontal overflow.",
  ],
  [
    "after-recovered-mobile.png",
    "After: confirmed release",
    "390 × 844 viewport. Successful retry clears the warning and unlocks a fresh explicit Start. No automatic restart occurs.",
  ],
];
const figures = [];
for (const [file, title, caption] of images) {
  const bytes = await readFile(resolve(folder, file));
  figures.push(
    `<figure><h3>${esc(title)}</h3><img src="data:image/png;base64,${bytes.toString("base64")}" alt="${esc(title)}"><figcaption>${esc(caption)}</figcaption></figure>`,
  );
}
const checks = evidence.checks
  .map(
    ([name, result, detail]) =>
      `<tr><th>${esc(name)}</th><td>${esc(result)}</td><td>${esc(detail)}</td></tr>`,
  )
  .join("");
const pr = evidence.pullRequest
  ? ` · <a href="${esc(evidence.pullRequest)}">Implementation PR</a>`
  : "";
const hosted = evidence.hosted
  ? `<p><a href="${esc(evidence.hosted.url)}">Hosted verification</a>: ${esc(evidence.hosted.result)} for <code>${esc(evidence.hosted.head.slice(0, 7))}</code>. The latest PR commit must pass <code>software-checks</code> before merge.</p>`
  : "<p>Hosted CI has not yet been verified. The latest PR commit must pass <code>software-checks</code> before merge.</p>";
const review =
  evidence.review ||
  "Independent correctness review found and verified the rendering-failure cleanup correction; no remaining actionable code findings. Review was read-only and did not run tests.";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Diagnostic capture lifecycle · Scoped release and recovery</title><style>
:root{font-family:system-ui,sans-serif;color:#20364d;background:#f0f4f8}*{box-sizing:border-box}body{margin:0;line-height:1.6}main{max-width:1120px;margin:auto;padding:50px 28px}header{border-bottom:1px solid #cad5e1;padding-bottom:28px}h1{font-size:clamp(30px,5vw,54px);line-height:1.08;letter-spacing:-.035em}h2{font-size:26px;margin:36px 0 14px}h3{font-size:18px;margin:0 0 12px}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px;color:#4c6480}a{color:#235b9b}code{background:#e0e8f1;padding:2px 4px;border-radius:3px}table{table-layout:fixed;width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;overflow-wrap:anywhere;padding:12px 10px;border-bottom:1px solid #cad5e1}th{font-weight:650}.callout{padding:18px 22px;background:#fff3d9;border-left:4px solid #a97216}.figures{display:grid;grid-template-columns:1fr 1fr;gap:22px}figure{margin:0;padding:18px;background:white;border:1px solid #cad5e1;border-radius:10px}img{display:block;max-width:100%;height:auto;border:1px solid #dde4eb}figcaption{font-size:12px;color:#486079;margin-top:12px}footer{font-size:12px;color:#486079;border-top:1px solid #cad5e1;margin-top:32px;padding-top:18px}@media(max-width:700px){main{padding:28px 16px}.figures{grid-template-columns:1fr}table{font-size:12px}th,td{padding:9px 5px}}
</style></head><body><main><header><p class="eyebrow">Motion capture games / 10 November 2026</p><h1>Stop the preview.<br>Keep ownership until release.</h1><p>The diagnostic console now releases only an acknowledged source epoch, waits for cancelled startup to settle, and keeps failed release visible and retryable.</p><p><a href="https://github.com/DupeisTaken/motion-capture-games/issues/26">Issue #26</a>${pr}</p></header>
<section><h2>Problem and correction</h2><p>A named camera can disappear before startup. The service correctly rejects that choice before replacing its existing source, but the console previously followed the rejection with an epoch-less stop. That stopped another tab's source. Stop also discarded late startup acknowledgments, while pagehide allowed pending startup to create new sockets. Failed release unlocked replacement controls and exposed no retry.</p><p>Startup, active display and acknowledged release now have separate state. A cancelled start remains pending until its result is known. Accepted epochs are retained before error or obsolete-generation handling. The shared CameraReleases helper scopes and deduplicates cleanup, preserves failed epochs and retries serially. Neither a failed start nor global status authorizes stopping an unknown owner.</p><p>One generation owns its preview/observation sockets and animation. Stop, hidden visibility, pagehide and either stream's failure invalidate that generation, close the pair, clear current imagery and reject late decoded bitmaps. Release is registered before display reset, so a renderer failure cannot lose cleanup. Delayed setup/fullscreen/status callbacks cannot hide ownership warnings or unlock controls.</p></section>
<section><h2>Measured browser behavior</h2><p>Edge ${esc(evidence.after.browser)}, headless, actual Vite-served viewer and CSS; synthetic HTTP/WebSocket boundaries, English only. No vision service, camera, inference or participant footage was used. Baseline source is pinned to <a href="https://github.com/DupeisTaken/motion-capture-games/commit/${esc(evidence.before.baselineRef)}">${esc(evidence.before.baselineRef.slice(0, 7))}</a>. These are deterministic control/resource observations, not latency measurements.</p><table><thead><tr><th>Scenario</th><th>Before</th><th>After</th></tr></thead><tbody><tr><th>Rejected named camera</th><td>Simulated other tab's source stopped</td><td>Other source preserved</td></tr><tr><th>Stop before late acknowledgment</th><td>Acknowledged source left unreleased</td><td>Scoped release; zero sockets created</td></tr><tr><th>Pagehide before late acknowledgment</th><td>Source unreleased; two sockets created</td><td>Scoped release; zero sockets created</td></tr><tr><th>HTTP 409 release</th><td>Replacement unlocked; no retry</td><td>Replacement locked; retry preserves epoch</td></tr><tr><th>Unscoped stops across scripted scenarios</th><td>${evidence.before.unscopedStops}</td><td>${evidence.after.unscopedStops}</td></tr></tbody></table><p>No browser page errors or horizontal overflow at the captured desktop/mobile sizes. Successful retry unlocks an explicit fresh Start.</p></section>
<section><h2>Verification and independent review</h2><table><thead><tr><th>Check</th><th>Result</th><th>Scope</th></tr></thead><tbody>${checks}</tbody></table>${hosted}<p>${esc(review)}</p><p>Regression coverage includes rejected startup, late accepted/error acknowledgments, Stop/visibility/pagehide cancellation, 409 and synchronous/asynchronous transport failure, repeated cleanup, delayed callbacks, socket construction/send failure, bitmap disposal and rendering failure. The Python integration regression verifies the named-device guard preserves an unrelated synthetic source. Existing epoch replacement guards remain unchanged.</p></section>
<section><h2>Before and after</h2><p>Real local-server screenshots use synthetic failure responses. All image bytes and styles are embedded for offline reading.</p><div class="figures">${figures.join("")}</div></section>
<section><h2>Protocol and hardware limits</h2><div class="callout"><p>If startup succeeds but its response is lost, the current protocol cannot safely identify that tab's epoch. The console reports unknown ownership and blocks replacement. Recovery requires restarting the shared local vision service and then reloading the page; this affects other tabs. A request token or lease is separate future protocol work.</p></div><p>Page destruction before acknowledgment and browser keepalive delivery remain best-effort limits. Local preview shutdown and socket closure do not prove physical driver release. This change makes no USB camera, Windows/macOS/Linux driver, browser unload, inference, physical latency or multiplayer certification claim. The optional unscoped service stop API remains compatible, but the console never uses it.</p></section><footer>Generated by scripts/diagnostic-lifecycle-report.mjs from inspectable results and scripts/verify-diagnostic-lifecycle.mjs screenshots. Synthetic fixtures only; no credentials or private device/participant data. Date uses Asia/Shanghai.</footer></main></body></html>`;
await writeFile("reports/diagnostic-capture-lifecycle.html", html);
console.log(
  `Wrote offline lifecycle report (${Buffer.byteLength(html)} bytes).`,
);
