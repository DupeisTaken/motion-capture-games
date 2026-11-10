import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const folder = resolve("reports/local/pre-game-settings");
const verification = JSON.parse(
  await readFile("reports/pre-game-settings-results.json", "utf8"),
);
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const figures = [
  [
    "before-mole-1440.png",
    "Before · Mole Motion",
    "Video and game options occupied a permanent sidebar. Baseline 15a56dc, real local Vite server, 1440 × 1000 viewport.",
  ],
  [
    "after-mole-1440-setup.png",
    "After · combined Mole setup",
    "One menu contains input, camera selection, display options and Mole rules. Start confirmation is the only new-round entry point.",
  ],
  [
    "before-dodgeball-1440.png",
    "Before · Dodgeball",
    "The permanent settings column reduced the space available to play. Baseline 15a56dc.",
  ],
  [
    "after-dodgeball-1440-setup.png",
    "After · combined Dodgeball setup",
    "The same accessible dialog lifecycle serves both games; each retains its own modes and difficulty options.",
  ],
  [
    "after-mole-390-setup.png",
    "Phone · video options",
    "390 × 844. Header and Start action stay visible while the middle options scroll. No camera was opened.",
  ],
  [
    "after-mole-320-game-options.png",
    "Narrow phone · game options",
    "320 × 740. Game options share the menu below video options; no horizontal overflow.",
  ],
  [
    "after-dodgeball-1440-play.png",
    "After · clear play view",
    "Settings leave the stage wider. Pause, Resume, End and camera stop remain in the operator view. Synthetic rehearsal only.",
  ],
];
const media = [];
for (const [file, title, caption] of figures) {
  const data = (await readFile(resolve(folder, file))).toString("base64");
  media.push(
    `<figure><img src="data:image/png;base64,${data}" alt="${esc(title)}" loading="lazy"><figcaption><strong>${esc(title)}</strong><p>${esc(caption)}</p></figcaption></figure>`,
  );
}
const checks = verification.checks
  .map(
    ([name, result]) =>
      `<tr><th scope="row">${esc(name)}</th><td>${esc(result)}</td></tr>`,
  )
  .join("");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pre-game settings · Motion Studio</title><style>
:root{font-family:Segoe UI,system-ui,sans-serif;color:#223b35;background:#f6f5ef}*{box-sizing:border-box}body{margin:0}main{max-width:1160px;margin:auto;padding:44px 26px}header{border-bottom:1px solid #d7dbcf;padding-bottom:28px}h1{font-size:clamp(32px,5vw,56px);letter-spacing:-1.6px;margin:12px 0}h2{font-size:23px;margin-top:38px}p,li{font-size:15px;line-height:1.75;max-width:85ch}a{color:#326952;text-underline-offset:3px}.eyebrow{font-size:11px;letter-spacing:.13em;font-weight:700}.lead{font-size:19px;max-width:75ch}.note{padding:18px 22px;background:#e9efdf;border-radius:10px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}figure{margin:0;border:1px solid #d8ddcf;background:#fffdf8;border-radius:10px;overflow:hidden}img{width:100%;display:block;height:auto}figcaption{padding:18px}figcaption p{font-size:13px;margin-bottom:0}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:13px 16px;text-align:left;vertical-align:top;border-bottom:1px solid #d8ddcf}th{width:36%}footer{margin-top:40px;border-top:1px solid #d8ddcf;padding-top:18px;font-size:12px;color:#58654d}@media(max-width:680px){main{padding:26px 16px}.grid{grid-template-columns:1fr}th,td{padding:11px 8px}th{width:40%}.lead{font-size:17px}}
</style></head><body><main><header><p class="eyebrow">MOTION STUDIO · SOFTWARE CHANGE REPORT · ${esc(verification.generatedOn)}</p><h1>One setup before every round.</h1><p class="lead">Video and game-specific options now share a separate menu in Mole Motion and Dodgeball. It opens on load, on Set up round, on Play again and for identity-recovery restarts.</p><p><a href="https://github.com/DupeisTaken/motion-capture-games/issues/33">Issue #33</a>${verification.pr ? ` · <a href="${esc(verification.pr)}">Review pull request</a>` : " · Pull request pending"}</p></header>
<h2>What changed and why</h2><p>The permanent sidebar became a native dialog with Video & input and Game settings sections. This keeps related decisions together and gives the game the full content width. Existing options, including Touch/Flick/Push, and camera ownership remain in the app; game engines still own collisions and scoring. The integration preserves the diagnostic and wrist-flick features merged into main at 3a4337f.</p><ul><li>Opening or closing setup without editing choices retains the current results. Only explicit Start round confirmation resets the score and records start intent. Every new round returns through that confirmation.</li><li>Selections stay in the existing controls between rounds. Active play locks configuration; required identity recovery allows a new setup. Pause/Resume stay in the play view.</li><li>Camera capture still requires Start camera. Stop, release errors and retry are available inside setup and on the operator page. Both surfaces call the same epoch-scoped release controller.</li><li>The native modal keeps keyboard focus inside setup, starts with focus on Close, supports Escape, and restores the requesting control. Phone options scroll between a persistent header and Start action.</li></ul>
<p class="note">The extra confirmation before replay is deliberate: each new round gets a chance to review video and game settings. Resume continues an existing round without this step. No new dependency, distributable package, inference path or wire contract is introduced; the CI component/build table remains current.</p>
<h2>Actual validation</h2><table><tbody>${checks}</tbody></table><p>Environment: ${esc(verification.environment)}. Real Chromium screenshots came from local Vite servers. API camera metadata was a synthetic fixture; gameplay used camera-free rehearsal. The baseline captures use the original viewer sources at 15a56dc. Verification serializes browser work and full checks.</p>
<h2>Before and after</h2><div class="grid">${media.join("\n")}</div>
<h2>Remaining limits</h2><p>This report establishes software behavior and English layout only. No physical camera, participant recording, GPU benchmark, calibrated depth, hardware capacity or motion-to-visible latency was tested. Current-main diagnostic, XYZ and wrist-flick changes are preserved. The original checkout’s separate camera-default/mirroring work is outside this PR. Hosted software-checks must pass on the latest PR commit before merge.</p><p>${esc(verification.hosted)}</p><footer>Self-contained offline HTML · embedded screenshots and CSS · synthetic data only. Reproduce screenshots with node scripts/verify-pre-game-settings.mjs (add --baseline for before images); generate this report with node scripts/pre-game-settings-report.mjs.</footer></main></body></html>`;
await writeFile("reports/pre-game-settings.html", html);
console.log(
  `Wrote reports/pre-game-settings.html (${Buffer.byteLength(html)} bytes).`,
);
