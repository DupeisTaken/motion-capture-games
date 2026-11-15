import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("reports/local/operator-navigation");
const read = async (name) =>
  JSON.parse(await readFile(resolve(output, name), "utf8"));
const navigation = await read("after-results.json");
const acquisition = [
  ...(await read("acquisition-after.json")).cases,
  ...(await read("acquisition-runner-after.json")).cases,
];
const validation = await read("integration-validation.json").catch(() => null);
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
async function picture(file, caption, folder = output) {
  const image = await readFile(resolve(folder, file));
  return `<figure><img alt="${escape(caption)}" src="data:image/png;base64,${image.toString("base64")}"><figcaption>${escape(caption)}</figcaption></figure>`;
}
let comparisons = "";
for (const name of [
  "directory",
  "diagnostics",
  "rig",
  "mole",
  "dodgeball",
  "runner",
  "maze",
]) {
  comparisons += `<details${name === "maze" ? " open" : ""}><summary>${name} · before / after</summary>`;
  for (const size of ["desktop", "mobile"])
    comparisons += `<h3>${size}</h3><div class="pair">${await picture(`before-${name}-${size}.png`, `${name}: main 6974c68, ${size}`)}${await picture(`after-${name}-${size}.png`, `${name}: integrated navigation, ${size}`)}</div>`;
  comparisons += "</details>";
}
let ownership = "";
for (const game of ["mole", "dodgeball", "runner"])
  ownership += await picture(
    `acquisition-after-${game}-pending-mobile.png`,
    `${game}: Start remains locked after Stop while acknowledgement is pending.`,
  );
const pages = validation?.pages
  ? `<h2>Built Pages navigation</h2><p>Five shipped destinations stay under /motion-capture-games/. The shared chooser switches between games and returns to the directory; operator tools are omitted. Four rehearsal rounds start at each tested size without API, WebSocket or asset errors.</p><div class="pair">${await picture("navigation-mole-1440.png", "Production Pages: chooser on a running rehearsal, desktop.", resolve("reports/local/github-pages"))}${await picture("navigation-maze-390.png", "Production Pages: only shipped destinations, mobile.", resolve("reports/local/github-pages"))}</div>`
  : "";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PR 67 · integrated navigation and ownership</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7f0;color:#18332d;font:16px/1.65 system-ui,sans-serif}main{max-width:1180px;margin:auto;padding:36px 24px 70px}header{padding:30px;border-radius:16px;background:#0d1f1a;color:#f5f7f0}header a{color:#c8f03a}h1{font-size:clamp(30px,5vw,52px);line-height:1.1;margin:12px 0}h2{margin-top:38px}h3{font-size:16px}a{color:#1e6749;overflow-wrap:anywhere}p,li{max-width:90ch}code{font-size:.9em;overflow-wrap:anywhere}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;min-width:0}img{display:block;width:100%;height:auto;border:1px solid #b7cabb;border-radius:9px}figcaption{font-size:13px;color:#455b4e;margin:8px 0 18px}summary{font-weight:700;cursor:pointer;padding:14px 0;border-bottom:1px solid #c5d4c5}details{margin:16px 0}.note{padding:16px;background:#e7efda;border-left:4px solid #658b17}td,th{text-align:left;vertical-align:top;padding:12px 8px;border-bottom:1px solid #c5d4c5;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:14px}.scroll{overflow-x:auto}footer{margin-top:36px;padding-top:20px;border-top:1px solid #c5d4c5;font-size:13px}@media(max-width:650px){main{padding:20px 14px}header{padding:22px}.pair{grid-template-columns:1fr}td,th{padding:10px 4px}}
</style></head><body><main><header><p>Motion Studio · 15 November 2026 · English</p><h1>One navigation. Combined safeguards.</h1><p>PR #67 resolves against the current arcade and Pages mainline while retaining each camera owner's recovery rules.</p><a href="https://github.com/DupeisTaken/motion-capture-games/pull/67">PR #67</a> · <a href="https://github.com/DupeisTaken/motion-capture-games/issues/63">Issue #63</a></header>
<h2>What changed and why</h2><p>Resolved nine conflicting files against main 6974c68. Combined imports in all four game viewers, kept Maze's callable blocker for actual calibration and participant-window ownership, retained both Runner startup finally operations, preserved both sets of late-start assertions, and combined current game documentation with the startup policy. Directory verification targets the actual cards/tool links using current relative URLs.</p><p>Automatic merging alone would have left the new chooser pointing to root URLs and omitted operator pages on GitHub Pages. Navigation now preserves the project directory, detects its current page (including index.html), and offers only the five shipped static destinations in Pages mode. The local build retains all seven destinations. Tests cover both modes and blocked project-path departures.</p><p>Current main's multiplayer, spectator recovery, camera preview, calibrated Runner lanes and UI effects remain present. No game engine, session, vision, schema, dependency or distributable changes are included in this PR's diff against main. Source queues and ownership attribution are unchanged.</p>
<h2>Actual checks</h2><p class="note">${validation ? escape(validation.check) + "; " + escape(validation.build) + "; " + escape(validation.pages) : "Final software/build validation is being collected. This draft does not claim those checks passed."}</p><p>Installed headless Chromium ${escape(navigation.browser)} through real Vite: all seven routes at 1440×1000, 390×844 and 320×740; measured viewport width and no page overflow. The before snapshot loads TypeScript from immutable main 6974c68 with the same current theme. The after snapshot shows Switch view expanded. All navigation runs reported zero uncaught page errors.</p><ul>${navigation.checks.map((check) => `<li>${escape(check)}</li>`).join("")}</ul><p>Acquisition: ${acquisition.length} desktop/mobile game cases passed. Forced Start after Stop sent exactly one acquisition request while its earlier acknowledgement was pending; failed late release kept retry and locks; acknowledged retry enabled an explicit replacement; malformed successful ownership retained restart/reload guidance. All HTTP/WebSocket boundaries are synthetic, with no camera or vision service.</p><div class="scroll"><table><thead><tr><th>Integration boundary</th><th>Verified behavior</th></tr></thead><tbody><tr><td>Runner</td><td>Both pendingStarts and NavigationStartup survive cancellation; finally removes the generation and finishes navigation ownership. Preview, standing reference and current recovery tests remain.</td></tr><tr><td>Maze</td><td>The actual controller blocks departure through pending cancellation, failed late scoped release and unknown success. A successful retry permits navigation; participant windows remain a separate blocker.</td></tr><tr><td>Local and Pages navigation</td><td>Accessible current location, Enter/Tab/Escape, relative links, directory index alias and mode-specific destinations. Navigation never acquires a camera or transfers a score.</td></tr><tr><td>Hosted merge gate</td><td>Require this revision's <a href="https://github.com/DupeisTaken/motion-capture-games/pull/67/checks">software-checks and Pages build</a> before merging. Local checks do not pre-claim hosted results.</td></tr></tbody></table></div>
<h2>Actual calibration recovery</h2><div class="pair">${await picture("after-calibration-release-mobile.png", "Late calibration acknowledgement: failed scoped release retains the operator page and retry.")}${await picture("after-calibration-unknown-mobile.png", "Successful response without ownership: restart/reload remains necessary and departure stays blocked.")}</div><h2>Acquisition remains locked while pending</h2><div class="pair">${ownership}</div>${pages}
<h2>Before / after on all seven routes</h2>${comparisons}<h2>Remaining limits</h2><p>${escape(validation?.environment ?? "Local environment versions will be recorded with final validation.")} Tests, builds and browser verification run serially. The existing large Runner chunk warning remains. Camera drivers, hardware/GPU capacity, physical calibration accuracy, participant tracking and action-to-display latency were not tested.</p><p>App links preserve the owner page and its recovery controls. Browser Back, address-bar changes, tab close and OS shutdown still use best-effort cleanup; ordinary new-tab links do not transfer ownership. Physical maze gameplay remains gated. The earlier <a href="https://github.com/DupeisTaken/motion-capture-games/blob/6e92e8afc0a60a9576c08cb6188ff6060049f9f6/reports/playtest-operator-navigation.html">standalone report</a> is a historical snapshot, including its older counts and unmerged-calibration limitation.</p><footer>Reproduce: node scripts/verify-operator-navigation.mjs --baseline; the same command without --baseline; node scripts/verify-game-acquisition.mjs; the same with --runner; pnpm check; pnpm build; pnpm build:pages; pnpm verify:pages; node scripts/pr67-integration-report.mjs; node scripts/verify-operator-navigation.mjs --report-only. Source media and CSS are embedded for offline use. No participant footage, private device identifiers or credentials are included.</footer></main></body></html>`;
await writeFile("reports/pr67-integration.html", html);
console.log(`Wrote integrated PR 67 report (${html.length} characters).`);
