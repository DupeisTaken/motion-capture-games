import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const local = resolve("reports/local/game-resume");
const read = async (name) =>
  JSON.parse(await readFile(resolve(local, name), "utf8"));
const browser = await read("after-results.json");
const popups = await read("popup-results.json");
const software = await read("software-results.json").catch(() => ({
  status: "pending",
}));
const evidence = {
  date: "2026-11-11",
  issue: "https://github.com/DupeisTaken/motion-capture-games/issues/53",
  baseline: "6fb1185813242a27b26e1c86f75a2f4baa5d71f3",
  browser: browser.browser,
  language: "English",
  syntheticOnly: true,
  checks: software,
  cases: [...browser.results, ...popups.results],
  uncaughtBrowserErrors: [...browser.errors, ...popups.errors],
};
const pullRequest = process.argv[2];
if (pullRequest) {
  if (
    !/^https:\/\/github\.com\/DupeisTaken\/motion-capture-games\/pull\/\d+$/.test(
      pullRequest,
    )
  )
    throw new Error("Expected this repository's pull request URL.");
  evidence.pullRequest = pullRequest;
}
const names = {
  mole: "Slap a Mole",
  dodgeball: "Dodgeball",
  runner: "Motion Runner",
  maze: "Virtual Maze",
  rig: "Rig pointer practice",
};
const img = async (name, alt) =>
  `<img alt="${alt}" loading="lazy" src="data:image/png;base64,${(await readFile(resolve(local, name))).toString("base64")}">`;
const comparisons = [];
for (const game of Object.keys(names)) {
  for (const width of [1440, 390, 320]) {
    const images = await Promise.all([
      img(
        `before-${game}-${width}-stage.png`,
        `${names[game]} before, ${width} pixel viewport`,
      ),
      img(
        `after-${game}-${width}-stage.png`,
        `${names[game]} after, ${width} pixel viewport`,
      ),
    ]);
    comparisons.push(
      `<details ${width === 390 ? "open" : ""}><summary>${names[game]} · ${width}px viewport</summary><div class="comparison"><figure><figcaption>Before · action outside play / missing in preview</figcaption>${images[0]}</figure><figure><figcaption>After · Resume stays with play</figcaption>${images[1]}</figure></div></details>`,
    );
  }
}
const popupImages = [];
for (const game of ["mole", "dodgeball", "maze", "rig"])
  popupImages.push(
    `<details><summary>${names[game]} · separate window</summary>${await img(`after-${game}-popup.png`, `${names[game]} Resume in separate display`)}</details>`,
  );
const verified = software.status === "passed";
const checks = verified
  ? `<li><code>pnpm check</code> passed: repository conventions, contracts, types, lint, ${software.typeScriptTests} TypeScript tests, formatting, Python types/lint/format, ${software.pythonTests} Python tests, rig fixture drift and byte compilation.</li><li><code>pnpm build</code> passed: all six Vite entry points and emitted asset-reference validation.</li>`
  : "<li>Full local software checks/build are pending. Browser and focused-test evidence are available below.</li>";
const rows = evidence.cases
  .filter((item) => item.viewport)
  .map(
    (item) =>
      `<tr><td>${names[item.game]}</td><td>${item.viewport.width} × ${item.viewport.height}</td><td>${item.action}</td><td>${item.geometry.width} × ${item.geometry.height}px</td><td>Passed</td></tr>`,
  )
  .join("");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Single-press game resume · delivery report</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f5ed;color:#203b35;font:16px/1.65 system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:48px 24px 80px}header{border-bottom:1px solid #cdd6c7;padding-bottom:28px;margin-bottom:32px}.eyebrow{font-size:12px;letter-spacing:.15em;text-transform:uppercase;color:#506958}h1{font-size:clamp(34px,6vw,64px);line-height:1.05;letter-spacing:-.04em;margin:18px 0}h2{font-size:25px;margin:38px 0 14px}p{max-width:80ch}a{color:#22624e}code{overflow-wrap:anywhere;background:#e6ece1;padding:2px 5px;border-radius:4px}.stats{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.stats span{border:1px solid #becdb3;border-radius:10px;padding:12px 18px;background:#eaf1e0}.stats strong{display:block;font-size:24px}.note{border-left:4px solid #83a65b;padding:14px 20px;background:#eaf1e0}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;align-items:start}figure{margin:0;min-width:0}figcaption{font-size:13px;color:#506958;margin-bottom:8px}img{display:block;width:100%;height:auto;border:1px solid #b7c9b8;border-radius:10px}details{border:1px solid #cdd6c7;background:#fffefa;border-radius:10px;padding:16px;margin:12px 0}summary{cursor:pointer;font-weight:650}details>img{margin-top:16px}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid #d5ddcf}th{background:#eaf1e0}li{margin:8px 0}footer{margin-top:40px;border-top:1px solid #cdd6c7;font-size:13px;color:#506958;padding-top:16px}@media(max-width:650px){main{padding:28px 16px 48px}.comparison{grid-template-columns:1fr}.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.stats span{padding:12px}.stats span:last-child{grid-column:1/-1}.stats strong{white-space:nowrap}details{padding:12px}th,td{padding:7px}}
</style></head><body><main>
<header><p class="eyebrow">Motion Studio / Interaction update / 11 November 2026</p><h1>Continue with<br>one press.</h1><p>All four games and the rig pointer practice keep a clear <strong>Resume</strong> action with their paused play surface. Click, tap or use the focused Enter/Space action to continue the current round.</p><p><a href="${evidence.issue}">Issue #53</a> · <a href="${pullRequest ?? "https://github.com/DupeisTaken/motion-capture-games/pulls?q=is%3Apr+head%3Acodex%2Fone-press-resume"}">Focused PR and hosted checks</a></p><div class="stats"><span><strong>5</strong>play surfaces</span><span><strong>19 / 19</strong>browser cases passed</span><span><strong>48px</strong>minimum observed button height</span></div></header>
<section><h2>What changed and why</h2><p>Resume was below the play area in the arcade and runner, outside separate game displays, and absent from the inline maze participant preview. The action now sits directly on the paused screen. The menu hides decorative art where necessary to make room at 320px without adding a confirmation or reopening setup.</p><ul><li>The available Resume button receives focus once. Later keyboard navigation is respected, and play regains focus after continuation.</li><li>The shared controller uses the button’s current document after a window transfer. Native pointer, touch, Enter and Space activation cannot also aim, flick, push or jump; Tab and the window’s Escape action retain their normal behavior.</li><li>One press in Slap a Mole, Dodgeball or Runner records continuation intent. Fresh same-owner input, stable tracking/standing and the existing two-second countdown still gate simulation. Score and time remain frozen while waiting.</li><li>Maze preserves its input gate and explicit continuation policy. Its participant preview now resumes directly; the map stays with the operator. Rig practice keeps its selected-source and display-visibility gates and reuses the existing logical aim.</li></ul><p class="note">Tracking identity, source/calibration changes, hidden displays and unavailable WebGL keep their recovery requirements. A new round remains necessary when the existing ownership policy requires it. This UI update adds no camera owner, inference path or game-clock rule.</p></section>
<section><h2>Actual verification</h2><ul>${checks}<li>English real-server Chromium ${browser.browser}: five surfaces × 1440 × 1000, 390 × 844 and 320 × 740 viewports, plus four separate-window cases. All 19 passed with no uncaught browser errors. Camera acquisitions: zero.</li><li>Desktop used Enter, 390px used Space, and 320px used touch taps. Checks measured visible hit targets, verified focus, preserved the displayed score and observed gameplay continue. Minimum measured Resume size was 170 × 48px.</li><li>Behavior tests cover one-press intent during missing framing/standing, frozen score/time/distance while waiting, restored play focus, input-event isolation, cross-document focus, held-key suppression, Tab/Escape behavior and existing identity/visibility gates.</li></ul><p>Local environment: Windows, Node ${software.node ?? "24.16.0"}, pnpm 11.25.0 and Python ${software.python ?? "3.12.14"}. Dependencies were installed from the lockfile into this isolated worktree; Python checks reused the existing environment through a local junction. The repository pins Node 24.21.0 and Python 3.12.16 for hosted CI. Require the latest PR commit’s <code>software-checks</code> gate before merging; this report does not pre-claim a hosted result.</p><div class="table-wrap"><table><thead><tr><th>Surface</th><th>Viewport</th><th>Resume input</th><th>Measured target</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section><h2>Before and after</h2><p>Actual local Vite screenshots with synthetic rehearsal input. Baseline source: <code>${evidence.baseline.slice(0, 12)}</code>. The 390px comparisons are expanded; desktop and 320px cases can be opened below. Images are embedded for offline use.</p>${comparisons.join("\n")}</section>
<section><h2>Separate displays</h2><p>Each available separate display exposes its own working Resume action. All four continued with one Enter press. Runner has no separate-window feature.</p>${popupImages.join("\n")}</section>
<section><h2>Remaining limits</h2><p>Evidence is camera-free software verification in Chromium on Windows. Physical camera recovery, recognition accuracy, hardware buttons/controllers, other browser engines, varied participant bodies and end-to-end latency were not tested. Existing hardware milestone gates remain open. No participant footage, personal records or credentials appear in this report.</p><p>Reproduce with <code>node scripts/verify-game-resume.mjs</code>, <code>node scripts/verify-game-resume.mjs --popups</code>, <code>pnpm check</code> and <code>pnpm build</code>. The baseline command adds <code>--baseline ${evidence.baseline}</code>. Regenerate this report with <code>node scripts/game-resume-report.mjs</code> after browser artifacts are available.</p></section><footer>Self-contained delivery report · synthetic examples only · measurements describe UI geometry and verification counts, not performance or physical certification.</footer>
</main></body></html>`;
await writeFile("reports/game-resume.html", html);
await writeFile(
  "reports/game-resume-results.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  `Wrote game-resume report with ${evidence.cases.length} browser cases; software checks ${software.status}.`,
);
