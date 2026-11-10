import { readFile, writeFile } from "node:fs/promises";

// Screenshot inputs are synthetic real-server evidence kept in ignored local storage.
// The generated report embeds them, so the delivered HTML has no asset dependencies.
const root = new URL("../", import.meta.url);
const prUrl = process.argv[2] || "";
if (
  prUrl &&
  !/^https:\/\/github\.com\/DupeisTaken\/motion-capture-games\/pull\/\d+$/.test(
    prUrl,
  )
)
  throw new Error("Expected this repository's pull request URL.");
const figures = [
  [
    "review-before-desktop",
    "Before the Sol review",
    "Original prototype before independent review: small guidance/status text had insufficient contrast. Compare the revised setup beside it.",
  ],
  [
    "after-desktop",
    "Revised game setup · desktop",
    "1440 × 1100 viewport, English. Guidance uses the checked higher-contrast palette; known input failures block Start/Resume.",
  ],
  [
    "active-desktop",
    "Active rehearsal · desktop",
    "A real browser rehearsal hit scored 100. Targets, source image and contacts share one contain-fit/mirror transform. Synthetic input only.",
  ],
  [
    "framing-desktop",
    "Framing warning · desktop",
    "Removing synthetic feet freezes the round and disables Resume. Score and target time remain preserved until framing recovers.",
  ],
  [
    "framing-mobile",
    "Framing warning · mobile",
    "390 × 844 viewport, English. The warning, disabled Resume and readable guidance fit the narrow view. A separate 320 × 740 check found no horizontal overflow.",
  ],
  [
    "camera-release-desktop",
    "Release failure remains retryable",
    "Real browser against a task-owned synthetic HTTP/WebSocket fixture: HTTP 409 retains release ownership, blocks new setup and offers scoped Retry camera stop. Retry acknowledgment clears the warning. This fixture opens no camera.",
  ],
  [
    "results-desktop",
    "Results and restart",
    "Untimed practice can be explicitly ended. Results show hits, points and streak; Play again returns to configurable setup.",
  ],
  [
    "diagnostic-baseline",
    "Existing diagnostic workspace",
    "The diagnostic page remains available. Its new arcade navigation link is shown; there was no previous game screen to replace.",
  ],
];
const images = await Promise.all(
  figures.map(async ([name, title, caption]) => {
    const bytes = await readFile(
      new URL(`reports/local/mole-motion/${name}.jpg`, root),
    );
    return `<figure><img src="data:image/jpeg;base64,${bytes.toString("base64")}" alt="${title}" loading="lazy"><figcaption><strong>${title}</strong><span>${caption}</span></figcaption></figure>`;
  }),
);
const report = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mole Motion · Implementation and verification</title><style>
:root{font-family:Segoe UI,system-ui,sans-serif;color:#253d33;background:#f5f5ef}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:56px 28px}header{border-bottom:1px solid #d4ddcd;padding-bottom:28px}.eyebrow{font-size:11px;letter-spacing:.15em;color:#6a7d62}h1{font-size:54px;letter-spacing:-2px;line-height:1.05;margin:16px 0}h2{font-size:24px;letter-spacing:-.6px;margin-top:42px}p,li{font-size:14px;line-height:1.75}a{color:#316d4d}code{font-size:12px;background:#e8eddf;padding:2px 5px;border-radius:3px}.lede{max-width:790px;color:#61715a;font-size:17px}.pill{display:inline-block;padding:7px 11px;border:1px solid #c8d9bd;border-radius:5px;font-size:11px;color:#426344;margin:8px 8px 0 0}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:28px 0}.card{padding:20px;border-radius:8px;background:#e9efdf;border:1px solid #d5e0ca}.card strong{display:block;font-size:30px}.card span{font-size:11px;color:#617354}.notice{background:#efe6cd;border-left:4px solid #b18438;padding:16px 20px}.notice strong{display:block;margin-bottom:8px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:12px}th,td{padding:13px 12px;text-align:left;vertical-align:top;border-bottom:1px solid #d9dfd0;line-height:1.6}th{color:#5e7354;background:#e9eedf}figure{margin:0;border:1px solid #d4ddcd;border-radius:8px;background:#fff;overflow:hidden}figure img{display:block;width:100%;height:350px;object-fit:contain;background:#e8eddf}figcaption{padding:17px}figcaption strong{display:block;font-size:13px;margin-bottom:7px}figcaption span{font-size:12px;color:#65745f;line-height:1.6}.gallery{display:grid;grid-template-columns:1fr 1fr;gap:20px}.check{color:#386b3c;font-weight:650}footer{margin-top:44px;border-top:1px solid #d4ddcd;padding-top:18px;color:#5b6b55;font-size:11px}@media(max-width:650px){main{padding:30px 18px}h1{font-size:38px}.cards{grid-template-columns:1fr 1fr;gap:10px}.card{padding:15px}.gallery{grid-template-columns:1fr}figure img{height:290px}p,li{font-size:13px}th,td{padding:10px 8px;min-width:120px}}
</style></head><body><main>
<header><p class="eyebrow">MOTION CAPTURE GAMES / M2 EXPERIMENTAL SOFTWARE SLICE / 10 NOVEMBER 2026</p><h1>Mole Motion.</h1><p class="lede">An original motion-controlled take on whack-a-mole, with four ways to play, a touch/push toggle and explicit recovery when tracking cannot support a fair decision.</p><span class="pill">Single player</span><span class="pill">Synthetic evidence only</span><span class="pill">No new runtime dependencies</span><p><a href="https://github.com/DupeisTaken/motion-capture-games/issues/12">Issue #12</a> · ${prUrl ? `<a href="${prUrl}">Ready-for-review pull request</a>` : "Pull request link will be added after verified submission"} · Owning design: <code>docs/games/mole-motion.md</code></p></header>
<div class="cards"><div class="card"><strong>4</strong><span>round modes</span></div><div class="card"><strong>215</strong><span>TypeScript tests passed</span></div><div class="card"><strong>54</strong><span>Python tests passed</span></div><div class="card"><strong>168</strong><span>new game/motion/session/UI cases</span></div></div>
<div class="notice"><strong>Calibrated push input is an open hardware gate.</strong>The current vision contract supplies 2D joints. Camera play supports observed wrist/ankle contact. Hips, hands and wrists can exercise the actual push engine in a clearly labeled synthetic rehearsal; no live depth provider is invented. Physical push accuracy, reach calibration, framing detection, identity continuity and latency are unmeasured. This software slice starts M2 early at the user's request and does not close M1.</div>
<h2>What changed and why</h2><p>Before this change the repository had a diagnostic mirror and game design notes. Mole Motion adds a separate playable page at <code>/mole.html</code>, linked from the console, with setup, explicit joining, readiness countdown, targets, scores, pause/recovery, results and restart. The existing diagnostic page and camera/inference ownership remain intact.</p>
<div class="table-wrap"><table><thead><tr><th>Mode</th><th>Goal</th><th>End condition</th></tr></thead><tbody><tr><td>Timed</td><td>Build a score in 60 active seconds</td><td>Time runs out</td></tr><tr><td>Challenge</td><td>Hit 15 moles within 60 active seconds</td><td>15 hits or time runs out</td></tr><tr><td>Survival</td><td>Keep a streak alive</td><td>Third escaped mole</td></tr><tr><td>Practice</td><td>Learn touch/push with no clock pressure</td><td>Player chooses End round; escapes do not count as misses</td></tr></tbody></table></div>
<p>Touch accepts hands/wrists or feet. Push accepts hips, hands or wrists with a valid toward-screen displacement. Each mole scores once. A held touch cannot collect a new mole without a fresh entry; every forward push attempt, including a miss, consumes its cycle until it returns to neutral. Consecutive hits earn a bounded streak bonus.</p>
<p>Hard mode samples 32 legal target positions and favors the largest minimum distance from the participant's available eligible contacts. All of the target remains inside the configured image-space area. Size and lifetime vary by difficulty. This boundary and the proposed 4cm neutral / 12cm push thresholds still need physical participant trials.</p>
<h2>Architecture and failure behavior</h2><p><code>games/mole-motion</code> owns targets, collisions, active game time, score and seeded version-1 replay. <code>packages/motion</code> exposes named, observed contact points. <code>packages/session</code> binds one explicitly selected camera track to an anonymous player slot. The application alone composes these and controls the existing Python vision service. Games do not open cameras, import inference packages or know model landmark indices.</p>
<ul><li>Both feet must remain visible. Otherwise the screen says Step back and also suggests correcting camera framing or clearing an occlusion; missing feet alone do not prove camera distance.</li><li>Missing, stale, uncertain or malformed input freezes round/target time and scoring. Recovery clears gesture history and uses an explicit 2-second countdown; starting uses 3 seconds. Hidden tabs pause too.</li><li>A spectator cannot automatically join. Lost/uncertain membership requires explicit rejoin. Changing track, source or calibration requires a fresh round, preventing a prior score moving to another participant.</li><li>One paired image/observation packet is requested at a time. Late decoded bitmaps are closed; stopped-source acknowledgments enter epoch-scoped cleanup, with failures retained for an explicit retry. The client retains one image, not a frame backlog.</li><li>Source nanosecond differences and processing age are preserved. A bounded downward-only 20ms scheduling correction handles faster later delivery without rejuvenating delayed samples. Initial transit remains unknown; this is not exposure clock synchronization.</li><li>Video, normalized elliptical hit regions and anatomical contact labels share one contain-fit/mirror transform. Collisions use the current active browser game timeline; no physical latency compensation is claimed.</li></ul>
<h2>Independent Sol review and repairs</h2><p>An independent <strong>gpt-6.1-sol</strong> reviewer initially rated the experimental software slice <strong>8/10</strong>. It identified five P2 findings: insufficient guidance contrast, actions enabled for known-invalid input, unstable/misleading track selection, repeated Space scrolling, and camera release failures reported as success. All five have been repaired with focused regressions. The final review rating is pending; the original live-push/hardware requirement remains incomplete regardless of any software-slice score.</p><p>Readiness now comes directly from the game without advancing time, and both Start and Resume stay disabled until it is valid. Bound tracks are explicit and their selector is locked. Repeated Space no longer scrolls. Scoped camera-release failures retain their epochs and retry controls across source changes; setup remains blocked until acknowledgment.</p><p>Actual computed browser text contrast is <strong>5.56:1</strong> for notes, status, capability disclosure and scoreboard labels; <strong>5.23:1</strong> for instructions/footer; the unselected interaction option is <strong>4.96:1</strong>. These exceed the 4.5:1 small-text threshold for the checked selectors. Guidance is now 12px; contrast measurements cover the named controls, not an unperformed universal accessibility audit.</p>
<h2>Verification actually performed</h2><div class="table-wrap"><table><thead><tr><th>Check</th><th>Result</th><th>Evidence scope</th></tr></thead><tbody>
<tr><td><code>pnpm check</code></td><td class="check">Passed</td><td>Canonical schema drift; TypeScript + Python types; ESLint + Ruff; 215 Vitest tests across 8 files; 54 pytest tests; Prettier + Python formatting.</td></tr>
<tr><td><code>pnpm build</code></td><td class="check">Passed</td><td>Both the diagnostic and game pages build. No new runtime dependency or vision protocol change.</td></tr>
<tr><td>Game rules/replay</td><td class="check">75 passed</td><td>All modes, eligible limbs, push return/miss rearming, aliases, target consumption, difficulty/bounds, stale/future/order/clock/epoch gaps, interruption timelines, restart and seeded replay equality.</td></tr>
<tr><td>Motion/session</td><td class="check">60 passed</td><td>Observed proxies, feet validity, no automatic admission, spectator protection, exact track binding, changed geometry/epoch, source delays/resets and bounded scheduling correction.</td></tr>
<tr><td>Game UI integration</td><td class="check">26 passed</td><td>Actual wrist/foot contact and hip push simulation, pause/recovery, configuration, restart, camera error/order/decode/start/stop races, changed-track/calibration new-round recovery.</td></tr>
<tr><td>Camera release controller</td><td class="check">7 passed</td><td>Epoch-scoped acknowledgment, HTTP 409 and network errors, explicit retry, concurrent request deduplication, multiple late acknowledgments and synchronous transport failures and the native browser fetch receiver.</td></tr>
<tr><td>Real-server browser</td><td class="check">Verified</td><td>Local Vite server on 127.0.0.1:5181; 1440×1100 desktop, 390×844 and 320×740 narrow layouts; English. Actual rehearsal hit scored 100. Feet-loss pause, countdown resume, end/results and capability explanation observed. Captures below use only synthetic input.</td></tr>
<tr><td>Documentation/report</td><td class="check">Verified</td><td>Git whitespace, relative documentation references, HTML structure, embedded image signature/decoding, no remote assets, desktop/mobile report render.</td></tr>
</tbody></table></div>
<p>The first full check caught a nullable-frame TypeScript error; it was corrected. Integration review also corrected preview-before-join, repeated same-time synthetic samples, duplicated tuning, a forward-miss push rearm bypass, overly strict jitter rejection and misleading changed-source recovery. The counts above refer to the final passing run, not these earlier attempts.</p>
<h2>Real-server screen evidence</h2><p>These are captures of the running application. The existing diagnostics screenshot includes the new navigation link; the game is a new screen, so there is no prior game screenshot. Images are embedded and remain available offline. No camera, private participant image or recording was used.</p><div class="gallery">${images.join("\n")}</div>
<h2>Remaining work and practical limits</h2><p>The deliverable is a software prototype with camera contact support, not a certified installation. Live calibrated push input and per-participant reach setup require follow-up work; <a href="https://github.com/DupeisTaken/motion-capture-games/issues/4">the existing XYZ experiment</a> is relevant to depth calibration. Actual camera hit/framing quality, clothing/occlusion/height variation, physical push recognition, action-to-visible latency, three-player score attribution, platform hardware capacity and macOS operation were not measured. Synthetic scene rate and build timings are not camera-performance results.</p><p>Replay is an engine API with exact deterministic software outcomes for the same version, seed, commands and input. This page does not export participant recordings or provide a replay-import UI. The gameplay canvas uses a bounded 20Hz software update loop; no smoothness or end-to-end latency target is certified. The report itself needs no network connection; links to GitHub are optional references.</p>
<footer>Generated from scripts/mole-motion-report.mjs with synthetic local-server screenshots. English is the only supported language. Dates use the user's Asia/Shanghai calendar. Source revision is the pull request branch; test results are scoped to this software change.</footer>
</main></body></html>`;
await writeFile(new URL("reports/mole-motion.html", root), report);
console.log(
  "Wrote self-contained reports/mole-motion.html with 8 embedded screenshots.",
);
