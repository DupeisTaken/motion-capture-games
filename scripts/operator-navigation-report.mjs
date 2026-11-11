import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("reports/local/operator-navigation");
const after = JSON.parse(
  await readFile(resolve(output, "after-results.json"), "utf8"),
);
const before = JSON.parse(
  await readFile(resolve(output, "before-results.json"), "utf8"),
);
const validation = await readFile(resolve(output, "validation.json"), "utf8")
  .then(JSON.parse)
  .catch(() => null);
const prUrl = process.env.NAV_PR_URL;
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
async function screenshot(file, caption) {
  const data = await readFile(resolve(output, file));
  return `<figure><img src="data:image/png;base64,${data.toString("base64")}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>`;
}
let comparisons = "";
for (const [name, label] of [
  ["directory", "Game directory"],
  ["diagnostics", "Tracking console"],
  ["rig", "Two-camera workspace"],
  ["mole", "Slap a Mole"],
  ["dodgeball", "Dodgeball"],
  ["runner", "Motion Runner"],
  ["maze", "Virtual Maze"],
]) {
  comparisons += `<details${name === "diagnostics" ? " open" : ""}><summary>${label} · before / after</summary>`;
  for (const size of ["desktop", "mobile"])
    comparisons += `<h3>${size === "desktop" ? "1440 × 1000 desktop" : "390 × 844 mobile"}</h3><div class="pair">${await screenshot(`before-${name}-${size}.png`, `${label}: baseline ${size}`)}${await screenshot(`after-${name}-${size}.png`, `${label}: shared navigation expanded, ${size}`)}</div>`;
  comparisons += "</details>";
}
const acquisition = JSON.parse(
  await readFile(resolve(output, "acquisition-after.json"), "utf8"),
);
let acquisitionEvidence = "";
for (const [game, label] of [
  ["mole", "Slap a Mole"],
  ["dodgeball", "Dodgeball"],
]) {
  acquisitionEvidence += `<details><summary>${label} · acquisition before / after and recovery</summary>`;
  for (const size of ["desktop", "mobile"])
    acquisitionEvidence += `<h3>${size}</h3><div class="pair">${await screenshot(`acquisition-before-${game}-pending-${size}.png`, `${label}: before follow-up, Start re-enabled while its earlier acknowledgement remained pending.`)}${await screenshot(`acquisition-after-${game}-pending-${size}.png`, `${label}: after follow-up, source/camera selection and Start remain locked until acknowledgement and cleanup.`)}</div>`;
  acquisitionEvidence += `<div class="pair">${await screenshot(`acquisition-after-${game}-failed-release-mobile.png`, `${label}: failed late scoped release keeps Retry available and acquisition locked.`)}${await screenshot(`acquisition-after-${game}-unknown-mobile.png`, `${label}: missing-epoch success keeps acquisition locked with service-restart/reload guidance.`)}</div></details>`;
}
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Operator navigation playtest repair: source ownership, synthetic software checks and before/after screenshots."><title>Operator navigation · Playtest repair report</title>
<style>:root{font:16px/1.65 'Segoe UI',system-ui,sans-serif;color:#18332d;background:#f8f9f4}*{box-sizing:border-box}body{margin:0}main{max-width:1240px;margin:auto;padding:40px 28px}h1{font-size:clamp(32px,5vw,56px);line-height:1.1;letter-spacing:-1.5px}h2{margin-top:38px}h3{font-size:16px}p{max-width:90ch}a{color:#17624c;overflow-wrap:anywhere}.eyebrow{font-size:12px;letter-spacing:2px;text-transform:uppercase}.status{padding:18px;background:#e5eddd;border-radius:10px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;min-width:0}img{display:block;width:100%;height:auto;border:1px solid #bbcbbb;border-radius:8px}figcaption{font-size:13px;color:#4b6153;margin:8px 0 20px}summary{font-weight:650;cursor:pointer;padding:15px 0;border-bottom:1px solid #d2ddce}summary:focus-visible,a:focus-visible{outline:3px solid #216a53;outline-offset:3px}code{overflow-wrap:anywhere;font-size:.9em;background:#e9eee3;padding:2px 4px}li{margin-bottom:8px}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #cbd7c7;overflow-wrap:anywhere}th{background:#e7edde}@media(max-width:650px){main{padding:24px 16px}.pair{grid-template-columns:1fr}table{font-size:12px}th,td{padding:8px 4px}}</style></head>
<body><main><p class="eyebrow">Motion Studio · 11 November 2026 · User issue 7</p><h1>Every game. Every tool.<br>One way back.</h1>
<p class="status">All seven top-level routes now share an operator navigation bar: All games, a clear current location and Switch view. Capture ownership blocks application departure until the operator stops and confirms release. The destination never starts a camera automatically.</p>
<p><a href="https://github.com/DupeisTaken/motion-capture-games/issues/63">Issue #63</a> · ${prUrl ? `<a href="${escape(prUrl)}">Ready-for-review PR</a>` : "PR link is recorded after verification"} · Baseline <code>${after.baseline}</code></p>
<h2>What changed and why</h2><ul><li>One reusable component/CSS replaces inconsistent header link groups. Four games and both operator tools remain available at desktop and mobile sizes; the root game directory retains its static cards.</li><li>Current-page semantics, native anchors, a disclosure button, visible keyboard focus and 44-pixel controls make the route chooser usable with keyboard and touch. Escape closes it and restores focus.</li><li>Navigation stays outside game stages. Separate participant windows retain their existing game-only presentation. Return or close those windows before changing the operator page.</li><li>Read-only viewer blockers retain active, pending, release-unconfirmed and unknown ownership. A cancelled Start stays pending through its late acknowledgement and scoped cleanup. Failed release leaves the existing Retry controls available. Browser camera identification is included.</li><li>A cancelable app-local departure event lets the separate floor-calibration repair contribute its source ownership state. Game engines, session behavior, vision, model configuration and camera transport are unchanged.</li></ul>
<h2>Actual software evidence</h2><table><thead><tr><th>Check</th><th>Result and scope</th></tr></thead><tbody>
<tr><td>Focused Vitest run</td><td>138 tests passed across navigation, Mole, Dodgeball and Runner after the acquisition follow-up. Includes actual late-start wiring, failed-release retry and unknown acknowledgement. The initial focused run exposed a simulated browser-location leak in one test; the fixture now resets its location before each mount.</td></tr>
<tr><td>Real-server verification</td><td>${after.checks.map(escape).join("<br>")}. Headless installed browser ${escape(after.browser)}; ${before.screenshots.length + after.screenshots.length} before/after screenshots; zero uncaught page errors. HTTP and WebSocket boundaries are synthetic; no vision service or device capture runs.</td></tr>
<tr><td>pnpm check / pnpm build</td><td>${validation ? `${escape(validation.check)}; ${escape(validation.build)}. ${escape(validation.environment)}. Full output remains in ignored local check/build logs.` : "Pending the final full validation run; no passing result is claimed yet."}</td></tr>
<tr><td>Production directory browser check</td><td>Initial navigation delivery passed all six game/tool destinations plus the directory at 1440, 390 and 320 pixels; keyboard skip, zero root API requests, zero uncaught errors. Command: node scripts/verify-game-directory.mjs --production.</td></tr>
<tr><td>Independent review</td><td>Read-only implementation review confirmed pending-start and release barriers, current-route behavior and stage separation. It found the rig popup omission; a read-only workspace blocker now covers it.</td></tr>
<tr><td>Hosted CI</td><td>The latest PR commit's software-checks result must be verified before delivery; it is reported in the PR/chat. Hosted OS checks do not certify cameras. Branch protection settings were not inspected.</td></tr>
</tbody></table>
<h2>Acquisition ownership follow-up</h2><p>Combined review found that the initial navigation barrier still allowed another Start after local Stop while its first response remained pending. Mole and Dodgeball now share the pending/unknown barrier across direct acquisition guards and camera/source controls, and refresh ownership status after every startup finally path. A returned epoch is retained before handling a fast worker error. Round configuration locks remain intact. Runner/calibration source is untouched.</p><p>Synthetic real-server evidence against <code>${acquisition.baseline}</code>: each desktop/mobile game previously sent two Start requests in Start → Stop → forced Start; the corrected version sends one until acknowledged cleanup. All ${acquisition.cases.length} game/viewport combinations passed failed late release, acknowledged retry, explicit replacement after cleanup and missing-epoch restart guidance, with zero uncaught errors. ${acquisition.screenshots.length} after screenshots accompany four before screenshots. No camera or vision service ran. Twenty added unit regressions also cover lost/invalid-JSON/null responses and successful error-state bodies without epochs, repeated Stop, explicit rejection, error-with-epoch release and disposal.</p>${acquisitionEvidence}
<h2>Before / after on every route</h2><p>Captured from a real task-owned Vite server. Baseline TypeScript is served from the campaign commit. After images expand the shared chooser so every destination and operator label can be inspected. Game setup dialogs are closed without starting play. Device metadata is a synthetic fixture.</p>${comparisons}
<h2>Keyboard and honest recovery</h2><div class="pair">${await screenshot("after-keyboard-mobile.png", "Keyboard: Enter opened Switch view; Tab focused Slap a Mole; Escape returned focus to the button.")}${await screenshot("after-release-recovery-mobile.png", "Synthetic Stop failed: navigation retained the operator page and directed the operator to Retry camera stop. A successful scoped retry then permitted directory return.")}</div>
<h2>Cross-set integration</h2><p>The independent <a href="https://github.com/DupeisTaken/motion-capture-games/issues/60">floor-calibration repair (#60)</a> adds another source owner on Maze. This PR verifies a calibration-style veto through <code>motion-studio:navigation-check</code>, a cancelable bubbling event on <code>#app</code>, with <code>detail.reason</code>. The calibration controller must keep its veto active through pending/active/release-failed/unknown states. If combining viewer return objects, preserve both calibration and participant-window blockers with a null-coalescing combination. The unmerged controller itself was not exercised here; combined verification belongs to campaign integration.</p>
<h2>Limits and remaining physical evidence</h2><ul><li>Application-link guards preserve the owner page. Browser Back, address-bar changes, tab close and OS shutdown still rely on existing best-effort unload cleanup. Modified/new-tab links leave the owner open and keep ordinary browser behavior.</li><li>No camera, participant footage or private device identifier was used. Physical driver release, camera/GPU performance, input latency, model accuracy and physical calibration were not measured. This is software navigation evidence.</li><li>Changing pages ends in-memory rounds/settings. There is no cross-page session transfer. Live calibration remains unavailable in this baseline; the two-camera link opens existing planning and synthetic rehearsal.</li><li>Local checks use Node 24.16.0; hosted CI pins Node 24.21.0. Only English is supported. Screenshots cover 1440×1000 and 390×844; report layout is separately inspected at 1440, 390 and 320 pixels.</li></ul>
<p>Owning guide: <code>docs/operator-navigation.md</code>. Reproduce with <code>node scripts/verify-operator-navigation.mjs --baseline</code>, <code>node scripts/verify-operator-navigation.mjs</code>, <code>node scripts/operator-navigation-report.mjs</code> and <code>node scripts/verify-operator-navigation.mjs --report-only</code>. Use the shared serialized wrapper on the campaign machine. No external media or script is required to read this report offline.</p>
</main></body></html>`;
await writeFile("reports/playtest-operator-navigation.html", html);
console.log(
  `Wrote self-contained operator-navigation report (${html.length} bytes).`,
);
