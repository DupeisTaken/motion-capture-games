import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const mediaFolder = resolve(
  root,
  process.argv[2] || "reports/local/runner-motion-pace",
);
const output = resolve(root, "reports/runner-motion-pace.html");
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
async function json(path) {
  try {
    return JSON.parse(await readFile(resolve(root, path), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
const [simulation, renderEvidence, verification, review, poses] =
  await Promise.all([
    json("reports/runner-motion-pace-results.json"),
    json("reports/runner-motion-pace-render-results.json"),
    json("reports/runner-motion-pace-verification.json"),
    json("reports/runner-motion-pace-review.json"),
    json("reports/local/runner-motion-pace/stride-poses.json"),
  ]);
const pending = (copy) =>
  `<p class="notice pending"><strong>Pending evidence.</strong> ${esc(copy)}</p>`;
const inspect = (label, value) =>
  value
    ? `<details class="evidence"><summary>${esc(label)}</summary><pre>${esc(JSON.stringify(value, null, 2))}</pre></details>`
    : "";
const number = (value, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : "Not recorded";
async function figure(file, title, copy, extra = "") {
  try {
    const data = await readFile(resolve(mediaFolder, file));
    const mime = file.endsWith(".gif") ? "image/gif" : "image/jpeg";
    return `<figure class="${esc(extra)}"><img src="data:${mime};base64,${data.toString("base64")}" alt="${esc(title)}"><figcaption><strong>${esc(title)}</strong><span>${esc(copy)}</span></figcaption></figure>`;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return `<figure><figcaption><strong>${esc(title)}</strong><span>Screenshot pending: ${esc(file)}. No visual result is claimed for this missing capture.</span></figcaption></figure>`;
  }
}
const images = await Promise.all([
  figure(
    "before-desktop.jpg",
    "Before · rigid limb swing",
    "Historical baseline captured before this follow-up: straight limbs swung as whole groups, without knee or elbow articulation. This image is retained only as before evidence.",
  ),
  figure(
    "after-standard-desktop.jpg",
    "After · Standard opening pace",
    "Fresh real local-server desktop capture with the articulated runner and Fast start switched off. Standard remains the default opening pace of 10 m/s.",
  ),
  figure(
    "after-fast-playing-desktop.jpg",
    "After · Fast start in play",
    "Fresh real local-server desktop capture during synthetic rehearsal play. The optional Fast switch starts at 14 m/s; the HUD identifies Fast and the switch is locked during the active run.",
  ),
  figure(
    "after-fast-mobile-setup.jpg",
    "Mobile · choose the opening pace",
    "Fresh local-server phone-size setup view. Fast is an explicit opt-in switch; the default on a fresh page is off. Camera-free rehearsal is selected.",
    "phone",
  ),
  figure(
    "after-fast-playing-mobile.jpg",
    "Mobile · an active Fast run",
    "Fresh local-server phone-size gameplay view with the in-stage Pause button and fixed lane / Jump / Roll dock. This is synthetic touch/keyboard rehearsal, not physical-camera play.",
    "phone",
  ),
  figure(
    "stride-contact-sheet.jpg",
    "A full stride · eight visible phase panels",
    "Eight deterministic real-renderer panels from 0/8 through 7/8 at 14 m/s show stance, toe-off, folded recovery and alternating contact. A ninth recorded source pose at 8/8 repeats the initial heel strike and is retained in the embedded JSON.",
  ),
  figure(
    "stride-inspection.gif",
    "Animated inspection · eight phase samples",
    "Synthetic eight-phase, 420 ms looping GIF assembled from renderer inspections. The source cycle is approximately 423.7 ms at 14 m/s; GIF playback is an illustration, not measured real-time gameplay footage or display FPS.",
  ),
]);

const cases = Array.isArray(simulation?.cases) ? simulation.cases : [];
const passed = cases.filter(
  (row) => row.hits === 0 && row.alternatePlayerFreeze === true,
).length;
const groups = [];
for (const variant of ["rail", "gold"])
  for (const fastStart of [false, true]) {
    const subset = cases.filter(
      (row) => row.variant === variant && row.fastStart === fastStart,
    );
    if (!subset.length) continue;
    const distances = subset
      .map((row) => row.distanceM)
      .filter(Number.isFinite);
    groups.push(
      `<tr><th scope="row">${variant === "rail" ? "Neon Rails" : "Gold Rush"}</th><td>${fastStart ? "Fast · 14 m/s" : "Standard · 10 m/s"}</td><td>${subset.length}</td><td>${subset.reduce((sum, row) => sum + row.hits, 0)}</td><td>${subset.filter((row) => row.alternatePlayerFreeze === true).length} / ${subset.length}</td><td>${number(Math.min(...distances), 3)}–${number(Math.max(...distances), 3)} m</td></tr>`,
    );
  }
const simulationSection = cases.length
  ? `<div class="stats"><div><strong>${passed} / ${cases.length}</strong><span>declared oracle cases with zero hits and exact alternate-player freeze</span></div><div><strong>2 opening paces</strong><span>Standard and Fast tested in both worlds</span></div><div><strong>30 / 60 / 120 Hz</strong><span>synthetic control rates across four seeds</span></div></div><p>${esc(simulation.workload || "See the declared workload below.")}. The oracle selects known open lanes. This demonstrates authored pattern solvability and pause invariants; it does not measure human reaction difficulty, motion accuracy or participant safety.</p><div class="table-wrap"><table><thead><tr><th>World</th><th>Opening pace</th><th>Cases</th><th>Hits</th><th>Exact freeze</th><th>Distance after ~60 active seconds</th></tr></thead><tbody>${groups.join("")}</tbody></table></div><p class="small">Distances are virtual simulation units, not participant travel. Reproduce the declared workload with <code>pnpm benchmark:runner</code>. The committed JSON is the evidence used here.</p>${inspect("Inspect the committed simulation workload and results", simulation)}`
  : pending(
      "The both-pace simulation JSON has not been supplied. No simulation pass result is claimed.",
    );
const renderRows = Array.isArray(renderEvidence?.results)
  ? renderEvidence.results
  : [];
const renderComplete =
  renderEvidence?.complete === true && renderRows.length === 6;
const renderSection = renderComplete
  ? `<p>Six serial camera-free renderer cases are recorded below. Scheduler intervals describe browser callbacks; CPU submission time excludes GPU completion and verified display presentation. These measurements do not establish physical action-to-display latency.</p><div class="table-wrap"><table><thead><tr><th>World / pace</th><th>Canvas CSS pixels</th><th>Samples</th><th>rAF interval p95</th><th>CPU submission p95</th><th>Intervals &gt; 33.4 ms</th></tr></thead><tbody>${renderRows.map((row) => `<tr><th scope="row">${esc(row.variant)} · ${row.fastStart ? "Fast" : "Standard"}</th><td>${esc(row.canvasCss?.width ?? "?")} × ${esc(row.canvasCss?.height ?? "?")}</td><td>${esc(row.samples ?? "Not recorded")}</td><td>${number(row.frameIntervalMs?.p95)} ms</td><td>${number(row.renderSubmissionMs?.p95)} ms</td><td>${esc(row.framesOver33_4ms ?? "Not recorded")}</td></tr>`).join("")}</tbody></table></div><p class="small">${esc(renderEvidence.limits || "Renderer-only browser scheduling/submission samples exclude camera acquisition, inference, full-GUI overhead, actual presentation and physical motion latency.")}</p>${inspect("Inspect the complete renderer benchmark metadata", renderEvidence)}`
  : `${pending(`The six-case renderer benchmark is not final${renderRows.length ? ` (${renderRows.length} interim cases recorded)` : ""}. Timing is pending until the JSON marks complete: true and contains all six cases.`)}${inspect("Inspect the unfinished benchmark record", renderEvidence)}`;
const checks = Array.isArray(verification?.checks) ? verification.checks : [];
const checkSection = checks.length
  ? `<div class="table-wrap"><table><thead><tr><th>Executed check</th><th>Recorded status</th><th>Actual result</th></tr></thead><tbody>${checks.map((row) => `<tr><th scope="row"><code>${esc(row.command || row.name || "Unnamed check")}</code></th><td>${esc(row.status || "See actual result")}</td><td>${esc(row.result || "No result supplied")}</td></tr>`).join("")}</tbody></table></div>${verification.complete === false ? pending("The verification record is still marked incomplete. Listed results must not be read as a completed full gate.") : ""}${inspect("Inspect the complete verification record", verification)}`
  : `${pending("The follow-up verification record has not been supplied. Required repository, TypeScript, Python, build and hosted checks are not reported as passing here.")}${inspect("Inspect available verification metadata", verification)}`;
const browser = verification?.browser;
const browserSection = browser
  ? `<div class="table-wrap"><table><thead><tr><th>Browser evidence</th><th>Recorded result</th></tr></thead><tbody><tr><th scope="row">Desktop viewport</th><td>${esc(browser.desktop?.width ?? "Not recorded")} × ${esc(browser.desktop?.height ?? "Not recorded")} · horizontal overflow: ${esc(browser.desktop?.horizontalOverflow ?? "not recorded")}</td></tr><tr><th scope="row">Mobile viewport</th><td>${esc(browser.mobile?.width ?? "Not recorded")} × ${esc(browser.mobile?.height ?? "Not recorded")} · horizontal overflow: ${esc(browser.mobile?.horizontalOverflow ?? "not recorded")}</td></tr><tr><th scope="row">Inspected source poses</th><td>${esc(browser.sourcePoseCount ?? "Not recorded")}</td></tr><tr><th scope="row">Paused JPEG exact equality</th><td>${esc(browser.pausedJpegExactEquality ?? "Not recorded")}</td></tr><tr><th scope="row">Camera started during this follow-up</th><td>${esc(browser.cameraStarted ?? "Not recorded")}</td></tr></tbody></table></div>`
  : pending(
      "Browser dimensions, overflow and exact paused-frame equality await the final verification record. Screenshots below are the captured visual evidence; they alone cannot establish timing or physical control accuracy.",
    );
const reviewRows = Array.isArray(review?.ratings) ? review.ratings : [];
const reviewSection = review
  ? `<p>${esc(review.verdict || review.summary || "An independent follow-up review record is available below.")}</p>${reviewRows.length ? `<div class="table-wrap"><table><thead><tr><th>Reviewed dimension</th><th>Score</th><th>Evidence and limits</th></tr></thead><tbody>${reviewRows.map((row) => `<tr><th scope="row">${esc(row.dimension || row.name)}</th><td>${number(row.scoreOutOf10, 1)} / 10</td><td>${esc(row.basis || row.evidence || row.comment || "See the complete review record.")}</td></tr>`).join("")}</tbody></table></div>` : ""}${inspect("Inspect the independent follow-up review record", review)}`
  : pending(
      "The independent follow-up review has not yet been supplied. No review acceptance or rating is invented.",
    );
const sourceCycle =
  Array.isArray(poses) && poses.length > 1
    ? poses.at(-1).elapsedMs - poses[0].elapsedMs
    : null;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Motion Runner follow-up: articulated game-clock running, optional Fast start, real-server visual evidence and bounded software verification."><title>Motion Runner · motion and opening pace</title><style>
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#233c3d;background:#f4f4ee;color-scheme:light}*{box-sizing:border-box}body{margin:0}main{max-width:1220px;margin:auto;padding:38px 30px 66px}a{color:#1a675f;text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:3px solid #bd703d;outline-offset:4px}.skip{position:absolute;top:-80px;left:20px;padding:12px;background:white;z-index:2}.skip:focus{top:8px}header{background:#173d45;color:#f2f8ed;border-radius:22px;padding:40px;position:relative;overflow:hidden}header .eyebrow{color:#a4cebd}header a{color:#d5f19d}.eyebrow{font-size:11px;letter-spacing:.18em;font-weight:700;text-transform:uppercase;margin:0 0 15px}h1{font-size:clamp(36px,5vw,62px);line-height:1.04;letter-spacing:-2px;margin:0 0 20px;max-width:800px}header>p{color:#cee1db;max-width:850px}h2{font-size:28px;letter-spacing:-.8px;line-height:1.2;margin:43px 0 17px}h3{font-size:18px;line-height:1.4}p,li{font-size:15px;line-height:1.75}p{margin:13px 0}strong{font-weight:700}.pill{display:inline-block;border:1px solid #98c59a77;background:#234e4b;color:#e0efc9;padding:7px 12px;border-radius:24px;font-size:11px;letter-spacing:.06em;margin:6px 6px 0 0}.pill.primary{background:#d0ee9c;color:#294432;border-color:#d0ee9c}.lead{font-size:17px;line-height:1.7;max-width:980px}.notice{background:#fff3df;border-left:4px solid #c58a4b;padding:16px 20px;border-radius:6px;font-size:14px}.notice.pending{background:#f8eedf;color:#725234}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}.phone-grid{grid-template-columns:1fr 1fr;max-width:850px;margin:0 auto}.phone img{max-height:790px;object-fit:contain;background:#f5f5ef}figure{margin:0;border:1px solid #d7dfd3;border-radius:13px;overflow:hidden;background:#fffefa}figure img{display:block;width:100%;height:auto}figcaption{padding:17px 19px;font-size:13px;line-height:1.65}figcaption strong,figcaption span{display:block}figcaption strong{font-size:15px;margin-bottom:6px}figcaption span{color:#5a6e62}.table-wrap{overflow:auto;border:1px solid #d5ded1;border-radius:11px}table{width:100%;border-collapse:collapse;background:#fffefa;font-size:13px}td,th{padding:13px 15px;text-align:left;vertical-align:top;line-height:1.65;border-bottom:1px solid #e0e7da}thead th{background:#e7edde;font-weight:700}tbody th{font-weight:650}tr:last-child td,tr:last-child th{border-bottom:0}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:22px 0}.stats>div{background:#fffefa;border:1px solid #d7e0cf;border-radius:12px;padding:20px}.stats strong{font-size:27px;display:block;letter-spacing:-.7px;line-height:1.2;margin-bottom:9px}.stats span{font-size:12px;line-height:1.6;color:#5a7062}.small{font-size:12px;color:#627468;line-height:1.7}code{font-family:ui-monospace,Consolas,monospace;font-size:.87em;overflow-wrap:anywhere}.evidence{margin-top:15px;padding:13px 17px;background:#eaf0e3;border:1px solid #d2dec9;border-radius:8px}.evidence summary,.motion-preview summary{cursor:pointer;font-size:13px;font-weight:650;line-height:1.7}.evidence pre{font:11px/1.65 ui-monospace,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;margin-bottom:0}.motion-preview{border:1px solid #cfdcc8;border-radius:12px;background:#f9fbf3;padding:16px;margin-top:18px}.motion-preview[open] summary{margin-bottom:16px}.motion-preview figure{max-width:960px;margin:auto}.steps{padding-left:22px}.steps li{padding-left:5px;margin:8px 0}.split-callout{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:19px 0}.split-callout>div{padding:19px 22px;border-radius:11px;background:#e8efde;border:1px solid #d3dfc6}.split-callout h3{margin:0 0 8px}.split-callout p{font-size:13px;margin:0}.rule-list li{margin:8px 0}footer{border-top:1px solid #cfdcca;margin-top:40px;padding-top:20px;font-size:12px;line-height:1.75;color:#5f7365}@media(max-width:720px){main{padding:20px 15px 40px}header{padding:28px 23px;border-radius:16px}h1{letter-spacing:-1.3px}h2{font-size:25px;margin-top:33px}.grid,.split-callout,.phone-grid{grid-template-columns:1fr}.phone-grid{max-width:430px}.stats{grid-template-columns:1fr}.stats strong{font-size:25px}p,li{font-size:14px}td,th{padding:10px 11px}.lead{font-size:16px}.phone img{max-height:800px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body><a class="skip" href="#changes">Skip to report</a><main><header><p class="eyebrow">Motion Studio / follow-up / 2026-11-11</p><h1>A more convincing stride.<br>A faster start, by choice.</h1><p>Articulated running, ground-matched foot contact and a restrained sense of speed. Standard stays at 10 m/s; Fast is a deliberate switch to a 14 m/s opening. The game remains single player, with the same fair pause and identity rules.</p><span class="pill primary">FAST START DEFAULTS OFF</span><span class="pill">ORIGINAL 3D CHARACTERS</span><span class="pill">CAMERA-FREE EVIDENCE</span><p><a href="https://github.com/DupeisTaken/motion-capture-games/issues/39">Issue #39</a> · <a href="https://github.com/DupeisTaken/motion-capture-games/pull/44">PR #44</a> · <a href="motion-runner-game.html">Original implementation and reference-footage report</a></p></header>
<section id="changes" aria-labelledby="changes-title"><h2 id="changes-title">What changed and why</h2><p class="lead">The first runner moved straight limbs as rigid pendulums. This follow-up gives the character separate hips, knees, ankles, shoulders and elbows, with a planted stance, toe-off and folded recovery. The faster opening is optional so the existing Standard pace stays available for learning and later physical trials.</p><div class="grid">${images[0]}${images[1]}</div><p class="small">Both screenshots come from the actual local-server application. The before image is historical. New captures use synthetic controls; no participant footage or private camera image is included.</p></section>
<section aria-labelledby="pace-title"><h2 id="pace-title">Fast is an explicit setup choice</h2><div class="split-callout"><div><h3>Standard · default</h3><p>Fast start off. Begin at <strong>10 m/s</strong> and increase by <strong>0.035 m/s each active second</strong>, capped at <strong>18 m/s</strong>.</p></div><div><h3>Fast · opt in</h3><p>Fast start on. Begin at <strong>14 m/s</strong> with the same gradual increase and <strong>18 m/s</strong> cap. Obstacle rules, skins and player admission remain the same.</p></div></div><ul class="rule-list"><li>The switch is locked during countdown, play and pause. Change it before starting a new run.</li><li><strong>New run</strong> retains the chosen pace on the current page. A fresh page or reload resets Fast to off; the choice is not persisted.</li><li>The HUD identifies Fast during play. Rehearsal remains usable without Python, camera capture or inference.</li></ul>${images[2]}<p>Small speed-responsive camera framing and lane follow add energy without camera shake or visual effects covering hazards. System reduced-motion preferences remove optional camera follow/FOV changes, decorative coin spin/bursts and hit flicker while preserving the essential game actions.</p></section>
<section aria-labelledby="stride-title"><h2 id="stride-title">Inspect the full running cycle</h2><p>A single still cannot show gait quality. The following contact sheet shows eight phase panels from the real Three.js renderer at 14 m/s, spanning 0/8 through 7/8 of a full cycle. Nine source poses were recorded, including the repeated 8/8 boundary retained in the embedded JSON. Each visible pose is derived from the paused game clock and distance; changing the phase to paused cannot snap the runner to idle.</p>${images[5]}<details class="motion-preview"><summary>Open the animated stride inspection · contains motion</summary>${images[6]}</details><p class="small">The source cycle is ${number(sourceCycle, 1)} ms at 14 m/s (cadence 2.36 full cycles/s). The illustrated GIF repeats eight phase samples in approximately 420 ms. It is a synthetic pose sequence, not a recording of display FPS, sensor latency or a participant’s running cadence.</p><ol class="steps"><li><strong>Contact and toe-off:</strong> each stance travels 0.76 m relative to the advancing avatar. Its contact duration follows the current speed, matching the visible scrolling track instead of skating over it. Finite shoe corners stay above the ground.</li><li><strong>Recovery and opposing arms:</strong> two-bone leg geometry folds the knee and swings the foot through; separate elbow joints keep the arms bent and alternating. The belt and shoulders counter-rotate while the spine leans forward.</li><li><strong>Continuous timing:</strong> cycle = 1.8 × active seconds + 0.04 × traveled meters. The cadence changes continuously with speed; it is not recalculated by dividing distance by a changing stride length.</li><li><strong>Fair pause:</strong> pose, scenery and camera functions use game state. There is no wall-clock animation or per-render settling that could keep moving while tracking is paused. Jump and the compact tucked roll remain separate actions.</li></ol><p class="small">This is a stylized procedural animation with qualitative running cues, not a biomechanical model. Foot-plant tests include constant speeds of 10 / 14 / 18 m/s, the bounded acceleration ramp, actual transformed foot positions, cycle-boundary rounding, first-frame pause equality and three skin envelopes. The final check record below states which tests actually ran.</p>${inspect("Inspect the nine source-pose records", poses)}</section>
<section aria-labelledby="mobile-title"><h2 id="mobile-title">The setup choice survives a small screen</h2><div class="grid phone-grid">${images[3]}${images[4]}</div><p>The in-stage Pause control and fixed lane / Jump / Roll dock keep the main actions available during phone-size play. Setup fields reflow without changing the one-player rule. New run returns to clear setup guidance; it must not retain an old paused warning.</p>${browserSection}</section>
<section aria-labelledby="simulation-title"><h2 id="simulation-title">Both opening paces, checked in simulation</h2>${simulationSection}<p class="small">Source: <a href="runner-motion-pace-results.json">both-pace simulation JSON</a>. The complete data is also embedded above so this HTML remains inspectable offline.</p></section>
<section aria-labelledby="render-title"><h2 id="render-title">Fresh renderer timing, with limits</h2>${renderSection}<p class="small">The six-case record covers both worlds at desktop Standard and Fast pace, plus Standard at phone size. It is separate from the original implementation’s historical render record. Source: <a href="runner-motion-pace-render-results.json">follow-up render JSON</a>.</p></section>
<section aria-labelledby="checks-title"><h2 id="checks-title">Actual software checks</h2>${checkSection}<p class="small">Hosted status: ${esc(verification?.hostedStatus || "Pending final hosted-check record.")}. Latest-commit CI remains a separate merge gate; local checks do not certify physical input or hardware capacity.</p></section>
<section aria-labelledby="review-title"><h2 id="review-title">Independent critical review</h2>${reviewSection}<p class="notice">This follow-up makes no perfect-score or commercial-parity claim. The original commercial-game reference frames and their bounded comparison remain in <a href="motion-runner-game.html">the original implementation report</a>; no new reference-game frame timing or reaction-time measurement was performed here.</p></section>
<section aria-labelledby="limits-title"><h2 id="limits-title">Physical work is still ahead</h2><p>Camera capture stayed off for this follow-up. Physical trials are planned for <strong>2026-11-12</strong>, tomorrow relative to this report’s 2026-11-11 work date, and have not been performed here. Comfortable lane reach, jump/duck recognition across heights, spectator occlusion, actual identity stability and externally observed action-to-display latency remain unverified.</p><p>The game continues to use one anonymous joined slot. Another detected person freezes movement, hazards, time and score; identity or camera-space changes require a fresh run. Skins remain cosmetic and do not change scoring or collision behavior.</p></section>
<footer>English is the supported language. All new game evidence uses synthetic rehearsal or deterministic renderer inspection, with no participant data, credentials or camera footage. Images, animation, CSS and recorded evidence are embedded; the report needs no network to render. Optional links navigate to repository evidence or GitHub. <a href="motion-runner-game.html">Original report</a> · <a href="../docs/games/motion-runner.md">Owning runner design</a></footer></main></body></html>`;
if (Buffer.byteLength(html) > 5_000_000)
  throw new Error("Follow-up report exceeds the 5MB delivery budget.");
await writeFile(output, html);
console.log(
  `Wrote reports/runner-motion-pace.html (${(Buffer.byteLength(html) / 1_000_000).toFixed(2)} MB; simulation ${passed}/${cases.length}; render ${renderComplete ? "complete" : "pending"}; checks ${checks.length ? "recorded" : "pending"}; review ${review ? "recorded" : "pending"}).`,
);
