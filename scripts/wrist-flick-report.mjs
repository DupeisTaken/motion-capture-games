import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const folder = resolve("reports/local/wrist-flick");
const evidence = JSON.parse(
  await readFile("reports/wrist-flick-results.json", "utf8"),
);
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const figures = [];
for (const [file, title, caption] of [
  [
    "before-desktop.jpg",
    "Before · Touch and Push",
    "Main revision 15a56dc served locally; camera setup selected manually. Wrist contact needed to enter the target. No Flick interaction.",
  ],
  [
    "after-desktop.jpg",
    "After · Flick selected",
    "1440 × 1000 viewport. Wrist-flap guidance, accessible selected state and existing camera controls.",
  ],
  [
    "after-camera-whack.jpg",
    "A flap scores 100",
    "Generated camera packets pass through the real decoder, single-player session and game. No physical camera or participant footage.",
  ],
  [
    "after-game-window.jpg",
    "One round, separate display",
    "The same live stage and score move to the player window. No extra capture or inference.",
  ],
  [
    "before-mobile.jpg",
    "Before · Mobile",
    "390 × 844 viewport; unchanged-main baseline.",
  ],
  [
    "after-mobile.jpg",
    "After · Mobile",
    "390 × 844 viewport; all three interaction choices and wrist guidance fit without horizontal overflow.",
  ],
  [
    "after-narrow.jpg",
    "After · Narrow screen",
    "320 × 740 viewport; responsive controls, English (the only supported language).",
  ],
]) {
  const bytes = await readFile(resolve(folder, file));
  figures.push(
    `<figure><h3>${esc(title)}</h3><img src="data:image/jpeg;base64,${bytes.toString("base64")}" alt="${esc(title)}"><figcaption>${esc(caption)}</figcaption></figure>`,
  );
}
const rows = evidence.checks
  .map(
    ([check, result, scope]) =>
      `<tr><th>${esc(check)}</th><td>${esc(result)}</td><td>${esc(scope)}</td></tr>`,
  )
  .join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mole Motion · Wrist flicks</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7f6f0;color:#203f35;font:16px/1.65 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:48px 28px}h1{font-size:clamp(36px,6vw,66px);line-height:1.06;letter-spacing:-.05em;margin:18px 0}h2{font-size:26px;margin-top:42px}h3{font-size:18px;margin:0 0 14px}a{color:#286548}header{border-bottom:1px solid #cfd8c9;padding-bottom:28px}.eyebrow{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c705b}.note{padding:20px 24px;border-left:4px solid #b77d43;background:#eeeedf}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:13px 10px;border-bottom:1px solid #cfd8c9;vertical-align:top}.media{display:grid;grid-template-columns:1fr 1fr;gap:22px}figure{margin:0;background:#fffefa;border:1px solid #d6dfd0;padding:16px;border-radius:12px;overflow:hidden}img{width:100%;height:auto;display:block}figcaption{color:#52664f;font-size:13px;margin-top:12px}code{background:#e9ecdf;border-radius:4px;padding:2px 5px;overflow-wrap:anywhere}footer{border-top:1px solid #cfd8c9;margin-top:36px;padding-top:20px;font-size:13px}@media(max-width:680px){main{padding:28px 16px}.media{grid-template-columns:1fr}table{font-size:12px}th,td{padding:10px 5px}}</style></head><body><main>
<header><p class="eyebrow">Motion capture games / 10 November 2026</p><h1>A quick flap.<br>A satisfying whack.</h1><p>Mole Motion adds an optional <strong>Flick</strong> interaction: hold a wrist near a mole, make a short quick movement, then settle briefly before the next whack.</p><p><a href="https://github.com/DupeisTaken/motion-capture-games/issues/29">Issue #29</a>${evidence.pullRequest ? ` · <a href="${esc(evidence.pullRequest)}">Ready-for-review PR</a>` : " · PR link pending creation"}</p></header>
<section><h2>What changed and why</h2><p>Touch scores on a fresh target entry. Small flaps near a target and rapid motion between tracking samples need a different rule. Flick checks the recent wrist path against a small margin around the mole, with speed and travel thresholds to reject ordinary drift. The existing Touch and calibrated-depth Push rules stay available.</p><p>Either anatomical wrist can flick. Hand/wrist aliases share one limb history, with wrist preference when both are present. A miss, countdown flap or expired-target flap consumes the gesture; a held hand cannot score again. Missing limbs, source gaps, alias changes, pauses and invalid identity/framing/time reset history.</p><p>The source-only game owns detection and collision. No new camera, inference dependency, wire field, package or buffering queue was added. Replay version 1 supports the new interaction value; old touch/push replay behavior remains compatible. The CI component/build table remains accurate.</p></section>
<section><h2>Proposed tuning, with explicit units</h2><table><thead><tr><th>Rule</th><th>Default</th><th>Purpose</th></tr></thead><tbody><tr><th>Minimum movement</th><td>0.018 image units at ≥0.35 units/s</td><td>Reject jitter and slow drift using source intervals.</td></tr><tr><th>Motion window</th><td>120ms; at most 16 samples per limb</td><td>Accumulate high-rate motion without bridging a long gap.</td></tr><tr><th>Maximum path</th><td>0.12 image units</td><td>Reject tracking jumps.</td></tr><tr><th>Target margin</th><td>Radius + 0.035 image units</td><td>Allow a near-mole wrist flap and swept movement.</td></tr><tr><th>Rearm</th><td>180ms within radius 0.008</td><td>One deliberate movement per settled-hand cycle.</td></tr></tbody></table><p>Image units are normalized upright, unmirrored camera coordinates, not meters. Defaults live together in <code>TUNING.flick</code>. Presentation applies the existing single mirror transform.</p></section>
<section><h2>Verification actually performed</h2><table><thead><tr><th>Check</th><th>Result</th><th>Scope</th></tr></thead><tbody>${rows}</tbody></table><p>${esc(evidence.environment)}</p><p>Reproduce screenshots with <code>node scripts/verify-wrist-flick.mjs --baseline</code> and <code>node scripts/verify-wrist-flick.mjs</code>; regenerate this report with <code>node scripts/wrist-flick-report.mjs</code>. Browser evidence uses a task-owned local Vite server, generated JPEG/pose packets and an isolated headless browser. No live camera is opened.</p></section>
<p class="note"><strong>Physical sensitivity remains unmeasured.</strong> Body tracking sees wrist position. Finger-only flapping or rotation with a stationary wrist needs additional hand-orientation observations and cannot trigger this detector. Pose noise, motion blur, viewing distance and low inference rates may affect recognition. No hardware accuracy, latency or participant gameplay result is claimed.</p>
<section><h2>Before and after</h2><div class="media">${figures.join("")}</div></section><footer>Synthetic evidence only. No credentials, participant footage or private participant data. Pending camera-default edits in the original checkout are excluded from this feature commit. Hosted CI must pass on the latest PR commit before merge; this task does not merge the PR.</footer></main></body></html>`;
await writeFile("reports/wrist-flick.html", html + "\n");
console.log("Wrote reports/wrist-flick.html with seven embedded screenshots.");
