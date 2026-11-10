import { readFile, writeFile } from "node:fs/promises";

// Only generated synthetic screenshots are embedded; no participant media is used.
const root = new URL("../", import.meta.url);
const evidence = JSON.parse(
  await readFile(new URL("reports/dodgeball-verification.json", root), "utf8"),
);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const figures = [];
for (const shot of evidence.screenshots) {
  if (!/^[a-z-]+\.jpg$/.test(shot.file))
    throw new Error("Invalid screenshot name");
  const bytes = await readFile(
    new URL(`reports/local/dodgeball/${shot.file}`, root),
  );
  figures.push(
    `<figure><details><summary><img src="data:image/jpeg;base64,${bytes.toString("base64")}" alt="${escape(shot.title)}" loading="lazy"><span>Enlarge or collapse image</span></summary></details><figcaption><strong>${escape(shot.title)}</strong>${escape(shot.caption)}</figcaption></figure>`,
  );
}
const rows = evidence.checks
  .map(
    (check) =>
      `<tr><th scope="row">${escape(check.name)}</th><td>${escape(check.result)}</td><td>${escape(check.detail)}</td></tr>`,
  )
  .join("");
const ratings = evidence.review.dimensions
  .map(
    (row) =>
      `<tr><th scope="row">${escape(row.name)}</th><td>${escape(row.score)}/10</td></tr>`,
  )
  .join("");
const report = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Dodgeball · Implementation and verification</title><style>
:root{font-family:Segoe UI,system-ui,sans-serif;color:#203d37;background:#f6f5ef}*{box-sizing:border-box}body{margin:0}main{max-width:1180px;margin:auto;padding:56px 28px}header{border-bottom:1px solid #cbd7cd;padding-bottom:30px}.eyebrow{font-size:11px;letter-spacing:.16em;font-weight:700;color:#546e62}h1{font-size:clamp(42px,7vw,78px);line-height:1.05;letter-spacing:-3px;margin:20px 0}h1 span{color:#bf5039}.lede{font-size:19px;max-width:760px;color:#4e655b;line-height:1.6}h2{font-size:27px;letter-spacing:-.7px;margin:44px 0 14px}h3{font-size:17px}p,li{line-height:1.75;font-size:14px}a{color:#8b3c2a;text-underline-offset:3px}:focus-visible{outline:3px solid #b44b2e;outline-offset:4px}code{background:#e5ebe1;padding:2px 5px;font-size:12px;border-radius:3px}.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{font-size:11px;padding:7px 12px;border:1px solid #becdbf;border-radius:20px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:28px 0}.metric{background:#e7eee3;border:1px solid #cbd8c5;border-radius:10px;padding:20px}.metric strong{font-size:32px;display:block}.metric span{font-size:12px;color:#4c6254}.notice{padding:20px 24px;background:#f4e7db;border-left:4px solid #b34f31;border-radius:0 7px 7px 0}.notice strong{display:block}.columns{display:grid;grid-template-columns:1fr 1fr;gap:30px}.table-wrap{overflow:auto;border:1px solid #cbd7cd;border-radius:8px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:13px 16px;vertical-align:top;border-bottom:1px solid #d5dfd2;line-height:1.6}thead th{background:#e6edde;font-size:11px;text-transform:uppercase;letter-spacing:.08em}tbody th{font-weight:600;min-width:140px}tbody tr:last-child>*{border-bottom:0}.gallery{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;border:1px solid #ccd7ca;border-radius:10px;background:white;overflow:hidden}figure summary{cursor:zoom-in;background:#e5ebe1}figure summary span{display:block;padding:10px 18px;font-size:12px}figure details[open] summary{cursor:zoom-out}figure:has(details[open]){grid-column:1/-1}figure details[open] img{height:auto}figure img{display:block;width:100%;height:340px;object-fit:contain}figcaption{padding:18px;font-size:12px;color:#4a6256;line-height:1.7}figcaption strong{display:block;color:#263f36;font-size:14px;margin-bottom:6px}footer{font-size:11px;line-height:1.7;margin-top:44px;border-top:1px solid #cbd7cd;padding-top:18px;color:#4f665a}@media(max-width:650px){.checks-table,.checks-table tbody,.checks-table tr,.checks-table th,.checks-table td{display:block;width:100%;min-width:0}.checks-table thead{display:none}.checks-table th{background:#e6edde}.checks-table td{border-bottom:0}.checks-table tr{border-bottom:1px solid #cbd7cd}main{padding:30px 16px}h1{letter-spacing:-1.5px}.lede{font-size:16px}.metrics{grid-template-columns:1fr 1fr;gap:10px}.metric{padding:16px}.columns,.gallery{grid-template-columns:1fr}.notice{padding:16px}h2{font-size:24px}figure img{height:300px}th,td{padding:10px 12px}p,li{font-size:13px}}
</style></head><body><main>
<header><p class="eyebrow">MOTION STUDIO / EXPERIMENTAL M4 SOFTWARE / 10 NOVEMBER 2026</p><h1>Dodgeball<span>.</span></h1><p class="lede">Read the ring. Move your body. Let the ball pass. A new local motion game with visible collision regions and a fair pause when tracking cannot support play.</p><div class="chips"><span class="chip">Single player</span><span class="chip">3 modes · 3 difficulties</span><span class="chip">Synthetic evidence</span><span class="chip">No new runtime dependencies</span></div><p><a href="https://github.com/DupeisTaken/motion-capture-games/issues/18">Issue #18</a> · ${evidence.prUrl ? `<a href="${escape(evidence.prUrl)}">Ready-for-review PR</a>` : "PR pending verified submission"} · <a href="https://github.com/DupeisTaken/motion-capture-games/pull/17">Mole Motion dependency PR #17</a></p></header>
<div class="metrics"><div class="metric"><strong>${evidence.vitestTests}</strong><span>TypeScript tests passed</span></div><div class="metric"><strong>${evidence.pytestTests}</strong><span>Python tests passed</span></div><div class="metric"><strong>${evidence.newTests}</strong><span>new Dodgeball behavior cases</span></div><div class="metric"><strong>${evidence.review.overall}/10</strong><span>independent Sol software review</span></div></div>
<div class="notice"><strong>Experimental software, with physical playtest gates still open.</strong><p>No participant camera footage was used. Real-camera collision/framing accuracy, height and movement tuning, physical latency, hardware capacity and multiplayer are unmeasured. The review score assesses the delivered software within that scope; it does not certify an installation or close M1/M4.</p></div>
<h2>What changed and why</h2><p>The arcade previously offered Mole Motion. The new <code>/dodgeball.html</code> page adds full-body avoidance of virtual balls and links to both existing games and diagnostics. It uses the same explicit joining, source ownership and framing recovery conventions. The PR is stacked on <code>codex/mole-motion</code> so its diff contains the Dodgeball addition.</p>
<div class="columns"><div><h3>Simple play, readable hazards</h3><p>One warning ring previews the exact ball footprint. The ball becomes dangerous for a short window, then clears. The visible head, torso and limbs are the collision shapes. Move clear and remain clear to earn points and a capped streak bonus. A ball can hit only once. Timed runs for 60 active seconds; Survival ends on hit three; Practice removes life and score penalties.</p></div><div><h3>The same framing warning</h3><p><strong>Step back — keep both feet in view.</strong> Missing feet freezes round time, obstacle time and scoring. The screen also suggests camera adjustment or clearing an occlusion. Missing upper-body joints use a separate message. Returning to frame requires explicit resume and a readiness countdown; tracking gaps never shrink the hitbox.</p></div></div>
<h2>Architecture and fairness</h2><ul><li>The pure seeded game module owns obstacles, body shapes, collisions, score and version-1 replay. The canonical body adapter provides 13 named, observed joints; the game has no camera, inference or vendor-index dependency.</li><li>The existing one-slot session binds an explicitly selected confident track. Changed track, source, calibration or geometry requires a new round; spectators never inherit score. Ambiguity requires explicit recovery.</li><li>The app retains bounded paired video/pose delivery and one decoded image. Late asynchronous results are discarded using source-generation checks. Video, body regions and ball geometry share one contain-fit/mirror transform.</li><li>Warning and active time freeze across pause. A tracking-disrupted ball cannot earn an unobserved dodge. Explicit resume preserves the pending footprint and countdown without catch-up.</li><li>${escape(evidence.collisionPolicy)}</li><li>Initial source-to-browser transit is unknown. The game does not claim exposure clock synchronization, physical depth, continuous physical collision detection or latency compensation. Default sizes and timings are proposed tuning, not participant measurements.</li></ul>
<h2>Checks actually run</h2><div class="table-wrap" role="region" aria-label="Verification results" tabindex="0"><table class="checks-table"><thead><tr><th>Check</th><th>Result</th><th>Evidence and scope</th></tr></thead><tbody>${rows}</tbody></table></div><p>${escape(evidence.environment)}</p><p>${escape(evidence.corrections)}</p>
<h2>Real-server screen evidence</h2><p>English only. Screens were captured from the running local Vite server using generated body input; no camera was opened. The baseline is the existing Mole Motion screen because Dodgeball is a new page. Images are embedded for offline viewing; expand an image to inspect it within the report.</p><div class="gallery">${figures.join("\n")}</div>
<h2>Independent Sol review</h2><p>${escape(evidence.review.scope)}</p><div class="table-wrap" role="region" aria-label="Review ratings" tabindex="0"><table><thead><tr><th>Dimension</th><th>Final rating</th></tr></thead><tbody>${ratings}</tbody></table></div><p>${escape(evidence.review.iterations)}</p>
<h2>Remaining limitations</h2><p>The installation must still be playtested with real participants at different heights, positions and comfortable movement ranges. Occlusion, clothing, camera placement, calibrated reach, display alignment, external latency, macOS operation and physical hardware capacity have not been verified. One player is supported; no multiplayer or physical ball tracking is supplied. Synthetic rehearsal moves a canonical body proxy and is not a measurement of human recognition accuracy. Camera input still depends on the existing local vision service. Replay is an engine API, without an import/export UI.</p>
<footer>Owning design: <code>docs/games/dodgeball.md</code>. Source: <code>scripts/dodgeball-report.mjs</code> and <code>reports/dodgeball-verification.json</code>. Screenshot inputs live in ignored local storage; all report media and styles are embedded. Dates use Asia/Shanghai. Optional GitHub links require a network connection; reading this report does not.</footer>
</main></body></html>`;
await writeFile(new URL("reports/dodgeball.html", root), report);
console.log(
  `Wrote Dodgeball report with ${figures.length} embedded synthetic screenshots.`,
);
