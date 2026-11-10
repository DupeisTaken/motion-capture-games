import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const evidence = JSON.parse(
  await readFile("reports/raw-game-display-results.json", "utf8"),
);
const folder = resolve(process.argv[2] || "reports/local/raw-game-display");
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const images = [
  [
    "mole-before.png",
    "Before · Mole Motion",
    "Current-main baseline: separate Join action and disabled Start. Captured from a local baseline server before this change.",
  ],
  [
    "dodge-before.png",
    "Before · Dodgeball",
    "Current-main baseline: enrollment and game controls coupled to momentary readiness.",
  ],
  [
    "mole-camera-desktop.png",
    "After · Mole camera gameplay",
    "1440 × 1000 viewport, synthetic camera packet fixture through the real game viewer. Raw colors; no skeleton, body mask or tint.",
  ],
  [
    "mole-popup.png",
    "Separate Mole display",
    "Same live stage, camera decoder and game runtime. Score/HUD and targets move to the player window; diagnostics stay with the operator.",
  ],
  [
    "mole-identity-recovery-mobile.png",
    "Identity loss · Mole mobile",
    "390 × 844 viewport. WAITING and New round agree; the old score remains frozen until a fresh round.",
  ],
  [
    "dodge-camera-desktop.png",
    "After · Dodgeball camera gameplay",
    "1440 × 1000 viewport. Raw synthetic room and virtual ball footprint share the contain/mirror transform.",
  ],
  [
    "dodge-popup.png",
    "Separate Dodgeball display",
    "Dedicated game stage with score/time/dodges. No operator track labels or body-collision diagnostics.",
  ],
  [
    "dodge-camera-mobile.png",
    "Framing recovery · narrow Dodgeball",
    "320 × 740 viewport. Missing feet pauses scoring/time; recovery is automatic, so there is no inactive Resume action.",
  ],
  [
    "dodge-popup-mobile.png",
    "Raw game display · 320 pixels",
    "Exact viewport capture from the real browser. Landscape camera fits without cropping in a portrait display; HUD and return controls remain usable.",
  ],
  [
    "console-desktop.png",
    "Console · raw overlay option",
    "Actual vision service synthetic scene. Tracking overlay can be hidden independently of counting/inference. Numeric timings are illustrative live diagnostics, not a benchmark.",
  ],
  [
    "console-mobile.png",
    "Console · mobile",
    "390 × 844 viewport. Same controls, English only; no horizontal overflow.",
  ],
];
const figures = [];
for (const [file, title, caption] of images) {
  const bytes = await readFile(resolve(folder, file));
  const mime =
    bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "image/png";
  figures.push(
    `<figure><h3>${esc(title)}</h3><img src="data:${mime};base64,${bytes.toString("base64")}" alt="${esc(title)}"><figcaption>${esc(caption)}</figcaption></figure>`,
  );
}
const checks = evidence.checks
  .map(
    ([name, result, scope]) =>
      `<tr><th>${esc(name)}</th><td>${esc(result)}</td><td>${esc(scope)}</td></tr>`,
  )
  .join("");
const review = evidence.review
  ? `<p>Independent Sol reviewer: gameplay <strong>${evidence.review.gameplay}/10</strong>, visuals <strong>${evidence.review.visuals}/10</strong>, controls <strong>${evidence.review.controls}/10</strong>. ${esc(evidence.review.scope)}</p>`
  : "<p>Independent review is pending final verification; no rating is claimed yet.</p>";
const pr = evidence.pullRequest
  ? ` · <a href="${esc(evidence.pullRequest)}">Ready-for-review PR</a>`
  : "";
const hosted = evidence.hosted
  ? `<p><a href="${esc(evidence.hosted.url)}">Verified cross-platform CI run</a>: all eight jobs passed for code revision <code>${esc(evidence.hosted.head.slice(0, 7))}</code>, including TypeScript/build and Python checks on Windows, macOS and Ubuntu. This report-only finalization records that completed run; the latest PR commit must also pass the same gate.</p>`
  : "";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Camera gameplay · Raw feeds and simpler controls</title><style>
:root{font-family:system-ui,sans-serif;color:#233b33;background:#f4f3ed}*{box-sizing:border-box}body{margin:0;line-height:1.6}main{max-width:1120px;margin:auto;padding:56px 30px}header{border-bottom:1px solid #ccd5c5;padding-bottom:30px}.eyebrow{font-size:12px;letter-spacing:.16em;color:#677858;text-transform:uppercase}h1{font-size:clamp(32px,5vw,58px);letter-spacing:-.05em;line-height:1.05;margin:18px 0}h2{margin:42px 0 16px;font-size:26px;letter-spacing:-.025em}h3{margin:0 0 12px;font-size:18px}a{color:#326344}code{background:#e6eade;border-radius:4px;padding:2px 5px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:13px 12px;border-bottom:1px solid #d5ddce;vertical-align:top}th{font-weight:650}.callout{background:#e8ecdc;border-left:4px solid #789064;padding:20px 24px;margin:28px 0}.figures{display:grid;grid-template-columns:1fr 1fr;gap:24px}figure{margin:0;background:#fffefa;border:1px solid #dce1d4;border-radius:12px;padding:18px;overflow:hidden}img{display:block;width:100%;height:auto;border:1px solid #e4e7dd}figcaption{font-size:12px;color:#586750;padding-top:12px}footer{border-top:1px solid #ccd5c5;margin-top:40px;padding-top:20px;font-size:12px;color:#586750}@media(max-width:700px){main{padding:30px 18px}.figures{grid-template-columns:1fr}table{font-size:12px}th,td{padding:10px 6px}}
</style></head><body><main><header><p class="eyebrow">Motion capture games / Camera gameplay / 10 November 2026</p><h1>A clear mirror.<br>A simpler start.</h1><p>Raw camera colors, an optional separate player display, and Start that waits for movement instead of rejecting a momentary tracking glitch.</p><p><a href="https://github.com/DupeisTaken/motion-capture-games/issues/25">Issue #25</a>${pr} · <a href="https://github.com/DupeisTaken/motion-capture-games/issues/26">Separate diagnostic lifecycle follow-up #26</a></p></header>
<section><h2>What changed and why</h2><p>Mole Motion and Dodgeball previously tinted the entire camera image and drew tracking geometry into gameplay. A separate player selection and Join action preceded a Start button that depended on the current pose. The games now draw untinted mirrored camera pixels with game graphics. Tracking diagnostics default off, remain optional in the operator preview, and stay hidden in the game window.</p><p>Start records participation intent and waits for one usable confident participant. Mole offers an optional advanced participant override for several people; Dodgeball asks for one participant in view. No slot is chosen by horizontal position or array order. Confident same-owner feet/joint loss and short transport gaps pause time and score, then recover with countdown. Explicit identity loss, a changed participant/source/space or a gap beyond two seconds requires one fresh-round action; another track cannot inherit the old score.</p><p>The camera selector retains current-main named-device discovery. Start camera locks while connected; Stop and acknowledged release/retry control replacement. Linux now uses V4L2 metadata through the already-pinned enumerator, preferring stable udev references or sysfs topology/interface identity over numeric video-node order. Windows Media Foundation and macOS AVFoundation remain intact.</p></section>
<section><h2>One game, two surfaces</h2><p><code>game-display.ts</code> moves the existing stage, live canvas, HUD and interaction listeners into a standards-mode browser window. It copies development/production styles, moves the single tick timer to that window, and restores original DOM order and focus on Return, Escape or window close. It opens no camera, decoder or second game. The player window hides tracking diagnostics even when the operator checkbox is selected. Rendering uses the canvas owner's display density.</p><p>This keeps the existing local browser architecture portable without adding a native desktop framework or installer. Popup-blocked feedback keeps the inline game usable; some browsers open a tab. Fullscreen failure offers window maximize. The operator page owns capture and must stay open. The game still uses inference-aligned JPEG packets, not uncompressed sensor output or the console's independent high-rate video path.</p></section>
<div class="callout"><strong>Identity remains a scoring boundary.</strong> A missing foot can recover on the same confidently observed owner; explicit uncertainty cannot silently reassign a score. The single Start action replaces one separate Join action. Queues remain bounded; no latency, camera FPS or physical recognition improvement is claimed from removing the tint.</div>
<section><h2>Verification actually performed</h2><table><thead><tr><th>Check</th><th>Result</th><th>Scope</th></tr></thead><tbody>${checks}</tbody></table><p>Local environment: Windows, Node 24.16.0, pnpm 11.25.0, Python 3.12.14 from the existing repository-local environment. Lockfiles installed frozen. Repository pins remain Node 24.21.0 / Python 3.12.16; hosted CI provisions those exact versions on Windows, macOS and Ubuntu.</p><p>Browser verification used Edge against actual local Vite servers: current app on 5173, unchanged baseline on 5174, and an isolated current service plus console on the allowed 4173 origin. Synthetic camera packets contain generated colored room/body imagery and canonical observations; no physical camera or participant footage was used. A first attempt on unapproved port5175 correctly failed origin validation, then moved to4173 without weakening the server. Popup capture needed native tab selection and exact viewport clipping; native inspection confirmed the apparent full-page shrink was a capture artifact.</p></section>
<section><h2>Independent review</h2>${hosted}${review}<p>Review iterations fixed queued-start ownership, old-packet regression coverage, contradictory READY labels, automatic-recovery Resume controls, connected-camera restarts, duplicate popup titles, standards-mode viewport initialization and second-display density. Ratings apply to the tested experimental software flow. Physical gameplay feel, participant collision accuracy, camera drivers and display latency remain separate hardware gates.</p></section>
<section><h2>Before and after · real-server screenshots</h2><p>English is the only supported language. Baseline images use camera-free rehearsal. After images explicitly identify the synthetic camera fixture where used. All image bytes are embedded for offline reading; no credentials, serials or participant data are included.</p><div class="figures">${figures.join("")}</div></section>
<section><h2>Compatibility and remaining limits</h2><table><tr><th>Windows</th><td>Local software checks and real Edge UI verification; Media Foundation discovery code preserved. Physical camera capture not tested in this change.</td></tr><tr><th>macOS</th><td>Portable browser controls and existing AVFoundation discovery retained; hosted software CI is the verification path. No physical macOS camera/browser trial in this change.</td></tr><tr><th>Linux</th><td>V4L2 named enumeration added with synthetic backend/identity tests and hosted software CI. No physical Linux camera trial; missing stable metadata requires explicit manual fallback.</td></tr></table><p>Desktop packaging, simultaneous cameras, 4K/60 formats, three-player crossings, calibrated depth/push, participant height/reach tuning and externally measured motion-to-display latency remain open. Hot-plug still has the native indexed-open race documented by camera selection. Long or explicit identity loss resets a new round's score intentionally. Browser popup policy and background scheduling vary; both surfaces hidden pause gameplay.</p><p>A separate read-only follow-up chat validated the pre-existing diagnostic-console unscoped-stop/late-start cleanup defect and filed issue #26. This patch does not claim to fix that independent lifecycle issue.</p><p>Primary platform references: <a href="https://github.com/lukehugh/cv2_enumerate_cameras/blob/7eaa2290424b87d0e4f40dfe8395019ee7b3293c/cv2_enumerate_cameras/linux_backend.py">Pinned Linux enumerator</a> · <a href="https://www.kernel.org/doc/html/latest/userspace-api/media/v4l/open.html">Linux device identity guidance</a>.</p></section><footer>Self-contained report generated by scripts/raw-game-report.mjs from inspectable results and synthetic local-server images. No external rendering assets or runtime scripts. Date uses Asia/Shanghai. Current hosted status is available in the linked PR's Checks tab.</footer></main></body></html>`;
await writeFile("reports/raw-game-display.html", html);
console.log(
  `Wrote offline report with ${images.length} embedded images (${Buffer.byteLength(html)} bytes).`,
);
