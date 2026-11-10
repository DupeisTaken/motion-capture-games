import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const evidence = resolve(root, "reports/local/virtual-maze");
const browser = JSON.parse(
  await readFile(resolve(evidence, "results.json"), "utf8"),
);
const validation = JSON.parse(
  await readFile(resolve(root, "reports/virtual-maze-results.json"), "utf8"),
);
if (!browser.passed || !validation.checkPassed || !validation.buildPassed)
  throw new Error(
    "Generate the report only after the recorded checks/build/browser pass.",
  );
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
async function figure(filename, caption) {
  const png = await readFile(resolve(evidence, filename));
  return `<figure><img src="data:image/png;base64,${png.toString("base64")}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>`;
}
const figures = await Promise.all([
  figure(
    "before-rig-desktop.png",
    "Before: the existing two-camera rehearsal shows geometry diagnostics; it has no maze game. This unchanged route represents the baseline software.",
  ),
  figure(
    "admin-desktop.png",
    "After: the admin generates an 8×8 m maze, sees position/facing and receives the same normalized cue as the participant. Synthetic boundary-contact example.",
  ),
  figure(
    "admin-mobile.png",
    "After: the operator workspace at 390 px. Controls stack without horizontal overflow; the map keeps equal meter scale.",
  ),
  figure(
    "participant-mobile.png",
    "After: the participant display at 390 px exposes intensity and state without a maze, position or solution.",
  ),
  figure(
    "corners-desktop.png",
    "Manual corner workflow: four named image labels on a synthetic screenshot used as the local reference image. Image labels remain non-metric planning information.",
  ),
]);
const reviews = validation.reviews || [];
const pr = validation.prUrl
  ? `<a href="${escape(validation.prUrl)}">Ready-for-review pull request</a>`
  : "Pull request publication pending.";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Virtual Maze · delivery report</title><style>
:root{font:16px/1.65 system-ui,sans-serif;color:#24344b;background:#eef3f8}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:40px 24px 70px}header{padding:30px 0;border-bottom:1px solid #ccd8e5}h1{font-size:clamp(32px,5vw,52px);line-height:1.12;letter-spacing:-1.5px;margin:12px 0}h2{font-size:24px;margin:38px 0 12px}h3{font-size:18px}p{max-width:86ch}a{color:#235ac4;overflow-wrap:anywhere}code{background:#e3ebf5;padding:2px 5px;border-radius:3px;font-size:.9em}.kicker{color:#235ac4;font-weight:700;letter-spacing:2px;font-size:12px;text-transform:uppercase}.badge{display:inline-block;color:#216755;background:#dfefe9;border:1px solid #a6cdbf;border-radius:30px;padding:5px 12px;font-size:13px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:25px 0}.card{background:white;border:1px solid #d1dce8;border-radius:10px;padding:19px}.card strong{display:block;font-size:28px;color:#235ac4}.card span{font-size:13px;color:#52647a}table{border-collapse:collapse;width:100%;background:white;font-size:14px}th,td{padding:11px 13px;text-align:left;border:1px solid #d4deeb;vertical-align:top;overflow-wrap:anywhere}th{background:#e5edf6}.table-wrap{overflow:auto}figure{margin:20px 0;background:white;border:1px solid #d1dce8;border-radius:10px;overflow:hidden}figure img{display:block;width:100%;height:auto}figcaption{padding:13px 17px;font-size:13px;color:#52647a}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.pair figure{margin:0}.pair img{max-height:650px;object-fit:contain;object-position:top}.note{padding:18px;border-left:4px solid #c68d32;background:#fff7e6}li{margin:7px 0}.muted{font-size:13px;color:#52647a}@media(max-width:600px){main{padding:20px 12px 40px}.cards,.pair{grid-template-columns:1fr}.card{padding:13px}.pair img{max-height:none}h2{font-size:21px}th,td{padding:8px;font-size:12px}}
</style></head><body><main><header><p class="kicker">Motion Studio / M7 software slice</p><h1>Virtual Maze</h1><p>Configurable metric mazes with directional sound, an operator map and a map-free participant display.</p><span class="badge">Verified camera-free rehearsal</span><p class="muted">11 November 2026 · Asia/Shanghai · synthetic examples only · <a href="https://github.com/DupeisTaken/motion-capture-games/issues/40">Issue #40</a> · ${pr}</p></header>
<div class="cards"><div class="card"><strong>5–10 m</strong><span>Independent width and depth</span></div><div class="card"><strong>Head / Torso</strong><span>Explicit selection; no fallback</span></div><div class="card"><strong>2 hand rules</strong><span>Verified to fail in loop mode</span></div></div>
<h2>What changed and why</h2><p>The existing workspace could inspect recorded two-view XYZ but had no maze game. The new <code>/maze.html</code> route generates reproducible layouts, renders the admin’s metric map and converts selected-facing wall clearance into one normalized visual/audio signal. Participants see intensity and input/round state without seeing the maze or route.</p><ul><li>Easy/Medium/Hard control grid density; dimensions remain independently configurable from 5 to 10 m. Seeded perfect mazes are connected; loop-mode mazes retain a valid BFS solution while both declared canonical hand followers miss the interior goal.</li><li>Independent head and torso sliders rehearse the orientation toggle. Invalid selected direction, identity, position or timing pauses feedback and requires explicit recovery; no silent source substitution occurs.</li><li>Browser sound requires explicit activation, squares the normalized intensity and caps software gain at 0.12 × master volume. Pause/input loss/background presentation silence it immediately. Sound-pressure levels and speaker audibility were not measured.</li><li>Four named corners can be labelled on a local-only photo with pointer or keyboard percentages. A separately-tested rigid registration API accepts already-calibrated rig-floor coordinates. Photo pixels never become metric XYZ automatically.</li></ul>
<p>The loop-mode check starts at cell 0 facing +Z. The left follower prefers left/straight/right/back; the right follower prefers right/straight/left/back. Each stops on a repeated (cell, heading), while BFS reaches the selected interior goal. The guarantee does not cover different starting headings, remembered routes or general search.</p><h2>Runtime boundaries</h2><p>The pure game owns generation, wall geometry and endpoint goal/contact queries. The motion layer owns pose validation and rig-to-maze registration helpers. The app owns UI, audio and lifecycle. No cameras or inference libraries are opened or imported by the game. The current UI uses an aligned synthetic frame and an explicit monotonic synthetic clock; physical-origin samples are unconditionally rejected. Live input integration must bind metric registration to a verified calibration and session identity.</p><p class="note">Physical maze navigation remains gated. Simultaneous camera acquisition, exposure pairing, cross-view identity, measured XYZ and Head/Torso accuracy, cone-floor detection, supervised participant trials and a hardware buzzer interface remain future work. Endpoint rehearsal allows dragging across walls; it is not swept traversal or a physically verified route.</p>
<h2>Actual verification</h2><div class="table-wrap"><table><thead><tr><th>Check</th><th>Result</th><th>Evidence and limits</th></tr></thead><tbody><tr><td><code>pnpm check</code></td><td>Passed</td><td>${validation.typescriptTests} TypeScript tests; ${validation.pythonTests} Python tests; schema drift, types, lint, formatting and tracked docs/whitespace passed.</td></tr><tr><td><code>pnpm build</code></td><td>Passed</td><td>Five Vite HTML entries and emitted asset references verified; maze JS ${validation.mazeJsKB} kB (${validation.mazeJsGzipKB} kB gzip). Source-only modules introduce no distributable package.</td></tr><tr><td><code>pnpm verify:maze</code></td><td>Passed</td><td>Real Vite server and installed Chromium browser at 1440×1050, 390×844 and 320×740; English; zero browser errors and camera/API requests.</td></tr><tr><td>New focused coverage</td><td>${validation.newTests} tests</td><td>Generation 28 (including 150 fractional seeded cases and forced bounded fallback), input/registration 56, viewer/audio ${validation.viewerTests}.</td></tr><tr><td>Report rendering</td><td>${validation.reportVerified ? "Passed" : "Pending final report-render verification"}</td><td><code>pnpm verify:maze --report-only</code> checks desktop/mobile/narrow layout. Embedded CSS/PNG assets; no external rendering dependency.</td></tr><tr><td>Hosted latest-head gate</td><td>${escape(validation.ciState || "Pending PR publication")}</td><td>Require latest-commit <code>software-checks</code> before merge. No merge performed.</td></tr></tbody></table></div>
<p class="muted">Local environment: ${escape(validation.node)}, pnpm ${escape(validation.pnpm)}, Python ${escape(validation.python)}, Windows. Local Node is 24.16.0; repository pin is 24.21.0, which hosted CI provisions. These are software results, not physical latency or hardware certification. Final recorded local checks: ${escape(validation.checkedAt)}.</p><ul>${browser.checks.map((check) => `<li>${escape(check)}</li>`).join("")}</ul>
<h2>Independent review and repairs</h2><p>Three delegated workstreams built/reviewed the engine, input and design. Review found real integration gaps: cached-page disposal, suspended-audio status/retry, transient popup guidance, repeated synthetic clock times, invalid XYZ readouts and ambiguous documentation. These were fixed and covered by targeted tests and browser checks. The lead inspected the integrated code and real screenshots.</p><div class="table-wrap"><table><thead><tr><th>Reviewer</th><th>Dimensions</th><th>Rating</th></tr></thead><tbody>${reviews.map((review) => `<tr><td>${escape(review.name)}</td><td>${escape(review.dimensions)}</td><td>${escape(review.score)}</td></tr>`).join("") || '<tr><td colspan="3">Final review ratings pending.</td></tr>'}</tbody></table></div><p class="muted">Scores apply to the declared camera-free rehearsal, not production physical navigation. They do not substitute for tests or measurements.</p>
<h2>Before and after</h2>${figures[0]}${figures[1]}<div class="pair">${figures[2]}${figures[3]}</div>${figures[4]}
<h2>Cones and the physical follow-up</h2><p>Cone colors remain undecided. Human labels establish corner correspondence first. Future recognition can evaluate HSV thresholding, morphology/contours and calibrated cone floor-contact points under actual lighting. A floor homography applies to floor points, not elevated hips or heads. Photos and algorithm plausibility cannot certify scale, synchronized exposure or orientation.</p><p>The owning <a href="https://github.com/DupeisTaken/motion-capture-games/blob/codex/virtual-maze/docs/games/virtual-maze.md">game design</a> documents the primary OpenCV sources, metric corner convention, rejection screens and physical gates. M7-P1 through P4 in the roadmap retain issue-ready work for trusted capture/input, corner evidence, facing capability and supervised installation measurements.</p>
<h2>Reproduce</h2><p>Install with the pinned local environment and <code>pnpm install --frozen-lockfile</code>. Serve rehearsal using <code>pnpm exec vite --host 127.0.0.1</code>, then open <code>http://127.0.0.1:5173/maze.html</code>. Run <code>pnpm verify:maze</code>, <code>pnpm check</code> and <code>pnpm build</code>. Browser verification uses an already-installed Chrome/Edge; <code>--chrome-executable</code> selects another installation. Screenshots/results stay ignored under <code>reports/local/virtual-maze/</code>; this report embeds only synthetic examples.</p><p class="muted">Remaining limitations: no automatic cone detector, simultaneous live two-camera gameplay, physical head/torso estimator, hardware buzzer protocol, measured end-to-end latency, swept-path validation, native packaging or physical player trial. The separate participant page is a presentation boundary, not authentication for an untrusted operator.</p></main></body></html>`;
await writeFile(resolve(root, "reports/virtual-maze.html"), html);
console.log(
  "Generated self-contained Virtual Maze report from recorded passing evidence.",
);
