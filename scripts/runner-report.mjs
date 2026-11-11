import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const folder = resolve(process.argv[2] || "reports/local/motion-runner");
const results = JSON.parse(
  await readFile("reports/motion-runner-results.json", "utf8"),
);
const renderEvidence = JSON.parse(
  await readFile("reports/motion-runner-render-results.json", "utf8"),
);
const verification = JSON.parse(
  await readFile("reports/motion-runner-verification.json", "utf8"),
);
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
async function figure(file, title, copy) {
  const data = await readFile(resolve(folder, file));
  return `<figure><img src="data:image/jpeg;base64,${data.toString("base64")}" alt="${esc(title)}"><figcaption><strong>${esc(title)}</strong><span>${esc(copy)}</span></figcaption></figure>`;
}
const cards = await Promise.all([
  figure(
    "final-rail-desktop.jpg",
    "Neon Rails · Nova",
    "Real Vite server, 1440 × 1000 viewport. A running original character, three rail lanes, distinct trains/hurdles/gates, coin trails and a readable score HUD. Camera-free synthetic controls.",
  ),
  figure(
    "final-gold-mobile.jpg",
    "Gold Rush · Ember",
    "Real Vite server, 390 × 844 viewport. Original warm-town world and a different character silhouette. The compact touch dock keeps controls in view during play.",
  ),
  figure(
    "07-jump-paused-desktop.jpg",
    "Inspecting an actual jump",
    "Paused immediately after real keyboard takeoff; JUMPING and the airborne pose remain frozen together. This is a paused animation inspection, not a measured physical jump.",
  ),
  figure(
    "08-roll-paused-desktop.jpg",
    "Inspecting an actual roll",
    "Native held-Down input, paused while ROLLING. The tucked model fits below the overhead opening across its entire rotation; real Three.js vertex bounds are tested over 41 poses.",
  ),
  figure(
    "final-extra-player-mobile.jpg",
    "One runner at a time",
    "Synthetic alternate-person input in the real app. World, score and distance freeze; same-owner fresh standing input recovers through a countdown. This is not a physical camera detection trial.",
  ),
  figure(
    "09-gold-moss-desktop.jpg",
    "Gold Rush · Moss",
    "The Moss skin adds ears and a forest palette; Ember adds a pompom/scarf. All skins share the same abilities and collision rules.",
  ),
]);
const references = await Promise.all([
  figure(
    "ref-subway-18s-gameplay.jpg",
    "Reference · Subway Surfers",
    "Official SYBO World Tour Hollywood 2024 trailer, approximately 00:18. Gameplay-only crop of the browser screenshot: rear chase view, rail lanes, tall trains and foreshortening.",
  ),
  figure(
    "ref-gold-29s-gameplay.jpg",
    "Reference · Talking Tom Gold Run",
    "Official Talking Tom 10-year gameplay trailer, approximately 00:29. Gameplay-only crop: rear character, low barriers, road lanes and a gold trail. No reference media was downloaded.",
  ),
]);
const changes = await Promise.all([
  figure(
    "hud-first-pass.jpg",
    "Before review · first implementation",
    "The initial light-sky HUD labels had insufficient contrast. This is an intermediate implementation screenshot, not the pre-feature baseline.",
  ),
  figure(
    "hud-final.jpg",
    "After review · contrast correction",
    "Dark backplates make world, source, score, coin, distance and shield labels readable over both palettes.",
  ),
]);
const maxObjects = Math.max(
  ...results.cases.map((row) => row.maximumObstacles),
);
const allChecks = verification.checks
  .map(
    (row) =>
      `<tr><td><code>${esc(row.command)}</code></td><td>${esc(row.result)}</td></tr>`,
  )
  .join("");
const reviewRows = verification.review.ratings
  .map(
    (row) =>
      `<tr><td>${esc(row.dimension)}</td><td>${esc(row.rating)}</td><td>${esc(row.evidence)}</td></tr>`,
  )
  .join("");
const renderRows = renderEvidence.results
  .map(
    (row) =>
      `<tr><td>${esc(row.variant)}</td><td>${row.canvasCss.width} × ${row.canvasCss.height}</td><td>${row.samples}</td><td>${row.frameIntervalMs.p95.toFixed(2)}</td><td>${row.renderSubmissionMs.p95.toFixed(2)}</td><td>${row.framesOver33_4ms}</td></tr>`,
  )
  .join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Motion Runner · implementation and verification</title><style>
:root{color-scheme:light;font-family:system-ui,sans-serif;color:#203c3d;background:#f3f4ed}*{box-sizing:border-box}body{margin:0}main{max-width:1240px;padding:52px 30px 70px;margin:auto}header{background:#173d45;color:#edf9ef;padding:38px;border-radius:22px}header p{color:#b9d9d0;max-width:850px}h1{font-size:clamp(32px,5vw,55px);line-height:1.06;letter-spacing:-2px;margin:15px 0}h2{font-size:28px;letter-spacing:-.7px;margin:42px 0 16px}h3{font-size:18px}p,li{line-height:1.75;font-size:15px}a{color:#146b64}header a{color:#cef199}.eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:11px;font-weight:700}.pill{display:inline-block;background:#ceee99;color:#244332;border-radius:30px;font-size:12px;font-weight:700;padding:8px 13px;margin:6px 5px 0 0}.notice{padding:17px 21px;border-left:4px solid #c78050;background:#fff3df;border-radius:5px;line-height:1.7}.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}figure{margin:0;background:#fffefa;border:1px solid #d7dfd4;border-radius:12px;overflow:hidden}figure img{width:100%;height:auto;display:block}figcaption{padding:16px 18px;font-size:13px;line-height:1.65}figcaption strong,figcaption span{display:block}figcaption strong{font-size:15px;margin-bottom:6px}.table-wrap{overflow:auto;border:1px solid #d5ddd2;border-radius:10px}table{border-collapse:collapse;width:100%;font-size:13px;background:#fffefa}th,td{padding:13px 16px;border-bottom:1px solid #e2e8de;vertical-align:top;text-align:left;line-height:1.65}th{background:#e6eddf}code{font-size:12px;overflow-wrap:anywhere}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}.stats div{border:1px solid #d6e0d0;border-radius:12px;padding:18px;background:#fffefa}.stats strong{font-size:26px;display:block}.stats span{font-size:12px;color:#59706a}footer{margin-top:35px;border-top:1px solid #cfdbcf;padding-top:20px;font-size:12px;color:#5c7064}@media(max-width:700px){main{padding:22px 15px 40px}header{padding:25px 22px}h1{letter-spacing:-1px}.grid{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}th,td{padding:10px}h2{font-size:24px}}
</style></head><body><main><header><div class="eyebrow">Motion Studio / experimental game 03 / 2026-11-11</div><h1>Two worlds.<br>One runner. Your movement.</h1><p>A playable three-lane runner with original 3D models, skins and two environments. Move left, center or right, jump low hurdles and duck into a roll. Gameplay replaces the camera picture.</p><span class="pill">NEON RAILS + GOLD RUSH</span><span class="pill">ONE PLAYER</span><span class="pill">LOCAL + CAMERA-FREE REHEARSAL</span><p><a href="https://github.com/DupeisTaken/motion-capture-games/issues/39">Issue #39</a> · <a href="${esc(verification.prUrl || "https://github.com/DupeisTaken/motion-capture-games/tree/codex/motion-runner")}">${verification.prUrl ? "Ready-for-review pull request" : "Implementation branch"}</a></p></header>
<h2>What changed and why</h2><p>The previous runner was a documentation-only brief, with no playable entry point. <code>runner.html</code> now composes a source-only game runtime, calibrated canonical-joint controls, the existing one-player session boundary and a bundled Three.js renderer. Neon Rails and Gold Rush share rules but use distinct original environments. Nova, Moss and Ember change palette and silhouette without changing abilities.</p><p>Vision continues to own capture and inference. The game owns lanes, jump/duck interpretation, obstacle collisions, seeded generation, coins and score. The application never creates a camera-image bitmap or draws video. A detected second person, missing/stale evidence or uncertain identity suspends hazards, movement, timers and scoring on the same timeline.</p>
<div class="grid">${cards[0]}${cards[1]}</div>
<h2>Movement, recovery and ownership</h2><ol><li><strong>Rehearsal:</strong> Start without Python or a camera. Left / C / Right select absolute lanes, Space or Up jumps, and held Down or Roll stays crouched. Mobile touch controls remain visible while playing.</li><li><strong>Camera:</strong> Explicitly choose/start a named device, set a comfortable standing center and rehearse left, center, right, jump, roll and a grounded return to standing. Named shoulders, hips, knees and ankles must be observed confidently.</li><li><strong>One player:</strong> An extra person freezes the world even when the original track remains confident. Same-owner, fresh standing evidence permits a two-second recovery countdown and a cleared hazard window. A changed/uncertain track, epoch, geometry or broken continuity requires a new run; a spectator cannot inherit the score.</li><li><strong>Rendering failures:</strong> WebGL initialization errors give recovery instructions. Context loss, hidden tabs and long display gaps pause play. A restored graphics context needs an explicit Resume.</li></ol>
<div class="grid">${cards[2]}${cards[3]}</div>
<h2>Single-player pause evidence</h2><p>In the live browser, toggling another player held the HUD exactly at <strong>87 points, 0 coins and 87 m</strong> across separate observations. Removing the extra person showed the recovery countdown. Unit/integration tests also cover actual canonical camera packets with synthetic joints, unchanged owner recovery and replacement refusal. Those packet tests do not certify real person detection.</p><div class="grid">${cards[4]}${cards[5]}</div>
<h2>Benchmark against official gameplay footage</h2><p>The independent reviewer played the official trailers in a browser and inspected accepted frames. Comparison is at the visible mechanic/composition level. No reference frame rate, reaction timing or human difficulty was measured. Artwork is intentionally original; this is an experimental runner slice rather than a content-complete recreation.</p><div class="grid">${references.join("")}</div><p>Sources: <a href="https://www.youtube.com/watch?v=yyRHfdq9vD0">SYBO Hollywood 2024 trailer</a>, <a href="https://www.youtube.com/watch?v=31TH0htM6I0">official Talking Tom Gold Run gameplay trailer</a>, <a href="https://subwaysurfers.com/">Subway Surfers official site</a>.</p>
<div class="table-wrap"><table><thead><tr><th>Dimension</th><th>Observed reference</th><th>This implementation and limits</th></tr></thead><tbody><tr><td>Camera / lanes</td><td>Rear chase character, clear three-lane foreshortening</td><td>Perspective camera, absolute lanes, interpolated lateral movement and a stable rear avatar</td></tr><tr><td>Hazards / rewards</td><td>Large vehicle blockers, low barriers, overhead hazards and trails</td><td>Continuous train/cart volumes, jump hurdles, roll gates, five-coin trails, one guaranteed open lane per row</td></tr><tr><td>Action silhouette</td><td>Readable run, takeoff and compact duck/roll</td><td>Articulated running, parabolic jump and bounded tucked roll; geometry tests align models with collision clearance</td></tr><tr><td>Progression</td><td>Fast continuous play, varied world content, character rewards</td><td>Seeded endless rows, gradual speed growth, score/coins, three shields, practice and three immediately available skins</td></tr><tr><td>Content parity</td><td>Commercial animation/audio, missions, powerups and much broader authored routes</td><td>Those systems are outside this experimental slice; commercial parity is not claimed</td></tr></tbody></table></div>
<h2>Simulation evidence</h2><div class="stats"><div><strong>24</strong><span>world / seed / input-rate cases</span></div><div><strong>0</strong><span>safe-lane oracle hits</span></div><div><strong>${maxObjects}</strong><span>maximum active world objects observed</span></div><div><strong>30–120 Hz</strong><span>synthetic input rates</span></div></div><p>${esc(results.workload)}. All cases retained exactly frozen distance, score and game time during an alternate-person pause. A 60-second run advanced approximately 663.009 virtual meters; these are simulation units, not participant travel or motion accuracy. <code>pnpm benchmark:runner</code> reproduces the committed JSON results. The declared oracle selects the known open lane, so the result demonstrates authored pattern solvability, not human skill or sensor reliability.</p>
<h2>Camera-free render timing</h2><p>Four serial cases each used a five-second warm-up and approximately 15 seconds of sampling in the visible in-app Chromium 157 browser, DPR 1. All sampled game phases were playing; no tab-hide events or simulation interruptions occurred in the qualified run. Actual CSS and buffer dimensions matched the declared sizes.</p><div class="table-wrap"><table><thead><tr><th>World</th><th>Canvas CSS pixels</th><th>Samples</th><th>rAF interval p95 (ms)</th><th>CPU state-copy + submission p95 (ms)</th><th>Intervals &gt; 33.4 ms</th></tr></thead><tbody>${renderRows}</tbody></table></div><p>The approximately 174 callbacks per second describe this browser's scheduler, not verified display FPS. These short renderer-only samples exclude the full GUI, camera acquisition and inference; GPU model, monitor refresh, actual presentation and physical action-to-display latency remain unverified. An initial unqualified pass had a 1,004.8 ms scheduler gap and four interruptions; it also admitted a warm-up-crossing interval, so it was rejected and retained locally. The corrected harness requires both interval endpoints after warm-up and records every sampled game phase. The committed JSON retains qualified measurements and the rejected-pass explanation.</p>
<h2>Review corrections and actual checks</h2><p>The critical reviewer rejected premature gameplay/jump screenshots and found mismatched train length, an untucked roll model, weak HUD contrast, below-fold mobile controls, graphics-loss behavior and missing explicit grounded evidence. Corrections include an approximately eight-meter train contact volume, a tucked roll tested across 41 poses, dark label backplates, a mobile dock, context-loss pause and explicit standing evidence for admission/recovery.</p><div class="grid">${changes.join("")}</div><div class="table-wrap"><table><thead><tr><th>Executed command / check</th><th>Actual result</th></tr></thead><tbody>${allChecks}</tbody></table></div><p>Local checks used Node 24.16.0, pnpm 11.25.0 and Python 3.12.14 from the existing local environment. Repository pins are Node 24.21.0 / Python 3.12.16 and are exercised by hosted CI. The production build emitted a 545.06 kB runner chunk (144.41 kB gzip), including Three.js; Vite reported its 500 kB advisory. Short renderer scheduling/submission timings are recorded above; sustained GPU/display performance is not established. Independent source-only packages have no build outputs; all five consuming application entries were built.</p>
<h2>Independent harsh review</h2><p>${esc(verification.review.verdict)}</p><div class="table-wrap"><table><thead><tr><th>Dimension</th><th>Rating / 10</th><th>Evidence and boundary</th></tr></thead><tbody>${reviewRows}</tbody></table></div><p class="notice"><strong>The requested perfect 10/10 across all dimensions has not been established.</strong> The review is recorded honestly. Physical tracking accuracy, varied heights/reach, comfortable jump/squat trials, spectator occlusion with actual cameras, GPU/OS capacity and externally measured action-to-display latency remain open M1/M6 gates. Passing synthetic tests or inspecting footage cannot establish them.</p>
<footer>English is the only supported language. All local gameplay evidence uses synthetic controls or synthetic canonical joints. Reference images are limited browser-screenshot crops with source attribution. No credentials, participant footage or private participant data are embedded. This report is self-contained: CSS and images are embedded and require no network for rendering. ${esc(verification.hostedStatus)}</footer></main></body></html>`;
await writeFile("reports/motion-runner-game.html", html);
console.log("Wrote self-contained reports/motion-runner-game.html");
