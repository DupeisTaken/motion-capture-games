import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const folder = resolve("reports/local/camera-default");
const evidence = JSON.parse(
  await readFile("reports/camera-default-results.json", "utf8"),
);
const browser = JSON.parse(
  await readFile(resolve(folder, "after-results.json"), "utf8"),
);
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const figures = [];
for (const [file, caption] of [
  [
    "before-mole-desktop.jpg",
    "Before · Mole Motion opens in rehearsal (baseline 15a56dc).",
  ],
  [
    "after-mole-desktop.jpg",
    "After · Mole Motion setup opens with Camera and named device selection.",
  ],
  [
    "before-dodgeball-desktop.jpg",
    "Before · Dodgeball opens in rehearsal (baseline 15a56dc).",
  ],
  [
    "after-dodgeball-desktop.jpg",
    "After · Dodgeball setup opens with Camera; capture still requires Start camera.",
  ],
  [
    "after-mole-mobile.jpg",
    "Mole Motion · 390 × 844 viewport, full-page screenshot. Camera setup and rehearsal choice remain accessible.",
  ],
  [
    "after-dodgeball-mobile.jpg",
    "Dodgeball · 390 × 844 viewport, full-page screenshot. No horizontal overflow.",
  ],
  [
    "after-mole-camera-right.jpg",
    "Mole · synthetic camera marker at displayed x ≈ 0.649.",
  ],
  [
    "after-mole-camera-left.jpg",
    "Mole · marker moves left to displayed x ≈ 0.350 when canonical camera x increases.",
  ],
  [
    "after-dodgeball-camera-right.jpg",
    "Dodgeball · same synthetic marker before moving left.",
  ],
  [
    "after-dodgeball-camera-left.jpg",
    "Dodgeball · same mirror mapping moves the marker left.",
  ],
  [
    "after-mole-detached.jpg",
    "Separate Mole window · same left-side marker, with letterboxing preserved.",
  ],
  [
    "after-dodgeball-detached.jpg",
    "Separate Dodgeball window · same left-side marker and mirror orientation.",
  ],
]) {
  const data = await readFile(resolve(folder, file));
  figures.push(
    `<figure><img src="data:image/jpeg;base64,${data.toString("base64")}" alt="${esc(caption)}" loading="lazy"><figcaption>${esc(caption)}</figcaption></figure>`,
  );
}
const checks = evidence.checks
  .map(
    ([name, result, detail]) =>
      `<tr><th>${esc(name)}</th><td>${esc(result)}</td><td>${esc(detail)}</td></tr>`,
  )
  .join("");
const pr = evidence.pullRequest
  ? ` · <a href="${esc(evidence.pullRequest)}">Pull request</a>`
  : "";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Camera defaults and mirrored movement</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f4ee;color:#233e35;font:16px/1.6 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:48px 28px}header{border-bottom:1px solid #cbd6cc;padding-bottom:24px}h1{font-size:clamp(32px,5vw,58px);line-height:1.1;letter-spacing:-.04em;margin:12px 0 20px}h2{font-size:25px;margin:36px 0 12px}p{max-width:85ch}a{color:#326344}.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#65765c}.note{padding:20px 24px;background:#e6eddd;border-left:4px solid #76906b;margin:28px 0}code{background:#e6ebdf;padding:2px 5px;border-radius:4px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;padding:12px 10px;border-bottom:1px solid #d2dcce;overflow-wrap:anywhere}.figures{display:grid;grid-template-columns:1fr 1fr;gap:22px}figure{margin:0;padding:14px;background:#fffef8;border:1px solid #d8e0d2;border-radius:10px}img{display:block;width:100%;height:auto}figcaption{padding-top:12px;font-size:13px;color:#56694e}footer{margin-top:36px;border-top:1px solid #ccd6c6;padding-top:18px;font-size:13px;color:#56694e}@media(max-width:700px){main{padding:28px 16px}.figures{grid-template-columns:1fr}table{font-size:13px}table,tbody,tr,th,td{display:block}thead{display:none}tr{padding:12px 0;border-bottom:1px solid #d2dcce}th,td{padding:3px 0;border:0}td:nth-child(2){font-weight:700}}
</style></head><body><main><header><p class="eyebrow">Motion capture games · 11 November 2026 · English</p><h1>Camera first.<br>Left feels like left.</h1><p>Mole Motion and Dodgeball now open in Camera mode, with connected-device discovery ready for an explicit Start camera action.</p><p><a href="https://github.com/DupeisTaken/motion-capture-games/issues/32">Issue #32</a>${pr}</p></header>
<section><h2>What changed and why</h2><p>Both games previously selected rehearsal on load. Camera is now the first/default option, device metadata loads immediately, and camera setup is visible. Rehearsal remains one selection away. Page load enumerates metadata without acquiring camera capture, opening a camera stream or consuming round time.</p><p>Integrated main 1ee824b after the pre-game setup PR merged. Both games keep the combined setup menu on load and before each round; Camera is its default source. Setup confirmation, saved choices, replay and Flick behavior remain intact. The refreshed screenshots show this integrated flow.</p><p>The existing camera, pointer and arrow-key direction mapping was already correct. This change preserves that mapping, documents it explicitly and adds regression checks. Mole targets now use the same <code>mapJoint</code> helper as contacts, so target placement follows the shared contain-fit mirror transform. The stage explains “Move left → go left.” No wire schema, inference provider, collision rule, buffering limit or independently distributable package changes.</p></section>
<div class="note"><strong>Facing the display, your left is left on screen.</strong> Physical movement toward the participant’s left increases canonical, unmirrored camera x. The presentation mirror maps this with <code>1 - x</code>, decreasing displayed x. Pointer input performs the inverse mapping; the left arrow increases canonical x. Anatomical joint names remain stable.</div>
<section><h2>Verification actually performed</h2><table><thead><tr><th>Check</th><th>Result</th><th>Scope</th></tr></thead><tbody>${checks}</tbody></table><p>Local environment: Windows, Node 24.16.0, pnpm 11.25.0, isolated CPython 3.12.16 environment installed from the lockfile. Node remains below the exact 24.21.0 repository pin but within its declared Node 24 range. Browser: Chromium/Edge ${esc(browser.browser)}, headless, served by actual local Vite servers. English is the only supported language.</p><p>The committed <code>scripts/verify-camera-default.mjs</code> captures baseline source from commit 15a56dc and current views, simulating only device/API/stream boundaries. Both games are checked at 1440 × 1000 and 390 × 844. Pixel measurements account for contain-fit letterboxing: increasing source x from 0.35 to 0.65 moves the visible marker from normalized display x 0.649 to 0.350. The separate window retains the same orientation. Keyboard checks measure rendered rehearsal pixels moving left and returning right, rather than only inspecting input values. Unit tests additionally cover all four arrows, canonical contact/body movement and detached-display mirroring.</p><p>${esc(evidence.hosted || "Hosted checks have not yet been recorded. The latest PR commit must pass software-checks before merge.")}</p></section>
<section><h2>Before and after</h2><p>All imagery and observations are synthetic. The magenta rectangle is a generated camera marker for orientation checks, not participant footage or an inferred person. Screenshots below embed their original image bytes and work offline.</p><div class="figures">${figures.join("")}</div></section>
<section><h2>Limits and follow-through</h2><p>No physical camera, participant movement, camera-driver release, mounting orientation, model accuracy or motion-to-display latency was tested in this change. Hardware trials must verify that each installation supplies the documented upright, unmirrored canonical image. Existing freshness, identity, camera-release and scoring rules remain in force. Camera Push still needs calibrated depth. The component/build table remains current: source-only modules are checked through the existing Vite application and no new package was introduced.</p><p>Baseline screenshots use main 15a56dc. The camera-default change preserves existing interaction modes and retains anatomical names without introducing another input mirror.</p></section><footer>Generated by scripts/camera-default-report.mjs from inspectable check results and real-server synthetic screenshots. No external rendering assets, credentials or participant data. Date uses Asia/Shanghai.</footer></main></body></html>`;
await writeFile("reports/camera-default.html", html);
console.log(
  `Wrote self-contained report with ${figures.length} embedded images.`,
);
