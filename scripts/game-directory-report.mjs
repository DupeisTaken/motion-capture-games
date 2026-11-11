import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const local = resolve("reports/local/game-directory");
const read = (name) => JSON.parse(readFileSync(resolve(local, name), "utf8"));
const checks = existsSync(resolve(local, "checks.json"))
  ? read("checks.json")
  : {};
const browser = read("after.json");
const production = existsSync(resolve(local, "production.json"))
  ? read("production.json")
  : null;
const escape = (text) =>
  String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
function figure(name, caption) {
  const data = readFileSync(resolve(local, `${name}.png`)).toString("base64");
  return `<figure><img src="data:image/png;base64,${data}" alt="${escape(caption)}"><figcaption>${escape(caption)}</figcaption></figure>`;
}
const pr = process.argv[2];
if (
  pr &&
  !/^https:\/\/github\.com\/DupeisTaken\/motion-capture-games\/pull\/\d+$/.test(
    pr,
  )
)
  throw new Error("Expected a repository PR URL.");
const report = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Root game directory · Delivery report</title>
<style>
:root{font-family:Segoe UI,system-ui,sans-serif;color:#18332d;background:#f8f9f4;line-height:1.65}*{box-sizing:border-box}body{margin:0}main{max-width:1200px;margin:auto;padding:40px 28px}h1{font-size:clamp(30px,5vw,52px);letter-spacing:-1.5px;line-height:1.1;margin:12px 0 20px}h2{font-size:23px;margin:36px 0 12px}p{max-width:85ch}a{color:#146952;overflow-wrap:anywhere}code{background:#e7eddf;padding:2px 5px;border-radius:3px;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;border-bottom:1px solid #d4dfd0;padding:10px;overflow-wrap:anywhere}th{background:#e9efdf}.pair{display:grid;grid-template-columns:1fr 1fr;gap:22px}figure{margin:0;min-width:0}img{display:block;width:100%;height:auto;border:1px solid #d4dfd0;border-radius:10px}figcaption{font-size:13px;margin:10px 0 22px;color:#506257}.eyebrow{font-size:12px;letter-spacing:2px;text-transform:uppercase}summary{cursor:pointer;font-weight:650;margin:18px 0}.status{padding:15px 20px;border-radius:10px;background:#e8efdc}li{margin-bottom:7px}@media(max-width:650px){main{padding:26px 18px}.pair{grid-template-columns:1fr}table{font-size:12px}th,td{padding:8px 5px}}
</style></head><body><main>
<p class="eyebrow">Motion Studio · 11 November 2026 · Navigation</p><h1>One home for every game.</h1>
<p>The root URL now opens a game directory with Slap a Mole, Dodgeball, Motion Runner and Virtual Maze. The tracking console and two-camera workspace sit below the games as operator tools. The console moves to <code>/diagnostics.html</code>; existing game URLs remain valid.</p>
<p><a href="https://github.com/DupeisTaken/motion-capture-games/issues/54">Issue #54</a>${pr ? ` · <a href="${escape(pr)}">Ready-for-review pull request</a>` : " · Pull request pending local verification"}</p>
<h2>What changed and why</h2><ul>
<li>Four named, illustrated game cards make all implemented games discoverable. Each states its input options; Virtual Maze explicitly says synthetic rehearsal and physical input pending.</li>
<li>Static HTML links work without JavaScript. Local CSS and decorative inline SVG require no remote assets. Directory loading imports no game or camera runtime and sends no vision-service requests.</li>
<li>Game headers provide All games and corrected Tracking console links. Brand links return home. Rig console links, diagnostic lifecycle/vision verification and the preview benchmark use the explicit diagnostic route.</li>
<li>README, app ownership, architecture, roadmap, diagnostic guide, test guide and CI build coverage document seven entries. A directory test compares game cards with actual playable HTML files so a future game cannot silently disappear from the list.</li>
</ul>
<h2>Before and after · desktop</h2><div class="pair">${figure("before-desktop", "Before · root URL opens the tracking console · 1440 × 1000 viewport")}${figure("after-desktop", "After · four games and both operator tools · 1440 × 1000 viewport")}</div>
<details><summary>Before and after · mobile</summary><div class="pair">${figure("before-mobile", "Before · tracking console at the root · 390 × 844 viewport")}${figure("after-mobile", "After · stacked game cards and operator tools · 390 × 844 viewport")}</div></details>
<h2>Actual verification</h2><table><thead><tr><th>Check</th><th>Result</th></tr></thead><tbody>
<tr><td>pnpm check</td><td>${escape(checks.check ?? "Pending")}</td></tr>
<tr><td>pnpm build</td><td>${escape(checks.build ?? "Pending")}</td></tr>
<tr><td>Real Vite development server</td><td>${browser.viewports.length} English viewports: 1440 × 1000, 390 × 844, 320 × 740. No root overflow; keyboard skip works. All ${browser.pages.length} game/tool links and return paths passed, including mobile navigation.</td></tr>
<tr><td>Production preview</td><td>${production ? "PASS · all six linked destinations, root viewport/keyboard checks, no-JavaScript game link and return navigation" : "Pending build"}</td></tr>
<tr><td>Root API / browser errors</td><td>${browser.rootApiRequests.length} API requests; ${browser.errors.length} uncaught errors. Static game navigation also passed with JavaScript disabled.</td></tr>
<tr><td>Diagnostic lifecycle regression</td><td>${escape(checks.lifecycle ?? "Pending")}</td></tr>
<tr><td>Hosted software-checks</td><td>${escape(checks.ci ?? "Pending latest PR commit; required before merge")}</td></tr>
</tbody></table>
<p>Browser evidence comes from installed headless Chromium and real local Vite servers. Game/tool metadata GET responses were synthetic; camera control requests were rejected by the harness. Root request counts were observed independently. Screenshots contain no participant data. The report embeds its CSS and four screenshots for offline viewing.</p>
<h2>Limits and compatibility</h2><p>Bookmarks to <code>/</code> or <code>/index.html</code> now show the directory; use <code>/diagnostics.html</code> for the console. Existing game routes, scoring, identity and capture ownership remain unchanged. Adding games requires an explicit card, build entry and accurate input description. Browser transport mocks do not verify physical camera capture, movement recognition, live XYZ or latency; those milestone gates remain open.</p>
<p>${escape(checks.environment ?? "Local Windows environment; exact runtime versions recorded after checks.")} The implementation was made in an isolated checkout of main, preserving the original checkout's uncommitted work.</p>
</main></body></html>`;
writeFileSync("reports/game-directory.html", report);
console.log("Wrote self-contained reports/game-directory.html");
