import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const beforeDir = resolve("reports/local/ux-overhaul/before");
const afterDir = resolve("reports/local/ux-overhaul/after");
const beforeMetrics = JSON.parse(
  readFileSync(resolve(beforeDir, "metrics.json"), "utf8"),
);
const afterMetrics = JSON.parse(
  readFileSync(resolve(afterDir, "metrics.json"), "utf8"),
);

const dataUri = (dir, file) =>
  `data:image/png;base64,${readFileSync(resolve(dir, file)).toString("base64")}`;

const pages = [
  ["directory", "Game Directory (/)"],
  ["mole", "Slap a Mole (/mole.html)"],
  ["dodgeball", "Dodgeball (/dodgeball.html)"],
  ["runner", "Motion Runner (/runner.html)"],
  ["maze", "Virtual Maze (/maze.html)"],
  ["diagnostics", "Tracking Console (/diagnostics.html)"],
  ["rig", "Two-Camera Workspace (/rig.html)"],
];

const metricFor = (list, name, label) =>
  list.cases.find((c) => c.name === name && c.label === label);

const rows = pages
  .map(([id, title]) => {
    const bd = metricFor(beforeMetrics, id, "desktop");
    const ad = metricFor(afterMetrics, id, "desktop");
    const bm = metricFor(beforeMetrics, id, "mobile");
    const am = metricFor(afterMetrics, id, "mobile");
    const fmt = (v) => (v == null ? "—" : `${v} px`);
    return `<tr>
      <td><strong>${title}</strong></td>
      <td>${bd.headerBottom} px → <strong>${ad.headerBottom} px</strong></td>
      <td>${fmt(bd.stageTop)} → <strong>${fmt(ad.stageTop)}</strong></td>
      <td>${fmt(bm.stageTop)} → <strong>${fmt(am.stageTop)}</strong></td>
      <td>${bd.openDialog} → <strong>${ad.openDialog}</strong></td>
      <td>${ad.overflow || am.overflow ? "Overflow" : "0 overflow"}</td>
    </tr>`;
  })
  .join("\n");

const desktopComparisons = [
  [
    "directory",
    "Game Directory",
    "directory-desktop-initial.png",
    "directory-desktop-initial.png",
  ],
  [
    "mole",
    "Slap a Mole (Entry)",
    "mole-desktop-initial.png",
    "mole-desktop-initial.png",
  ],
  [
    "runner",
    "Motion Runner",
    "runner-desktop-initial.png",
    "runner-desktop-initial.png",
  ],
  [
    "maze",
    "Virtual Maze",
    "maze-desktop-stage.png",
    "maze-desktop-initial.png",
  ],
  [
    "diagnostics",
    "Tracking Console",
    "diagnostics-desktop-initial.png",
    "diagnostics-desktop-initial.png",
  ],
  [
    "rig",
    "Two-Camera Workspace",
    "rig-desktop-initial.png",
    "rig-desktop-initial.png",
  ],
]
  .map(
    ([, title, beforeImg, afterImg]) => `<article class="compare-card">
      <h3>${title} — Desktop (1440×1000)</h3>
      <div class="compare-pair">
        <figure><figcaption>Before</figcaption><img src="${dataUri(beforeDir, beforeImg)}" alt="${title} desktop before overhaul" /></figure>
        <figure><figcaption>After</figcaption><img src="${dataUri(afterDir, afterImg)}" alt="${title} desktop after overhaul" /></figure>
      </div>
    </article>`,
  )
  .join("\n");

const mobileComparisons = [
  [
    "directory",
    "Game Directory",
    "directory-mobile-initial.png",
    "directory-mobile-initial.png",
  ],
  ["mole", "Slap a Mole", "mole-mobile-stage.png", "mole-mobile-initial.png"],
  [
    "runner",
    "Motion Runner",
    "runner-mobile-initial.png",
    "runner-mobile-initial.png",
  ],
  ["maze", "Virtual Maze", "maze-mobile-stage.png", "maze-mobile-initial.png"],
  [
    "diagnostics",
    "Tracking Console",
    "diagnostics-mobile-initial.png",
    "diagnostics-mobile-initial.png",
  ],
]
  .map(
    ([, title, beforeImg, afterImg]) => `<article class="compare-card">
      <h3>${title} — Mobile (390×844)</h3>
      <div class="compare-pair mobile-pair">
        <figure><figcaption>Before</figcaption><img src="${dataUri(beforeDir, beforeImg)}" alt="${title} mobile before overhaul" /></figure>
        <figure><figcaption>After</figcaption><img src="${dataUri(afterDir, afterImg)}" alt="${title} mobile after overhaul" /></figure>
      </div>
    </article>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Motion Studio · UI/UX Audit &amp; Overhaul Report</title>
    <style>
      :root {
        font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
        color: #0d1f1a;
        background: #f5f7f0;
      }
      * { box-sizing: border-box; }
      body { margin: 0; line-height: 1.55; }
      main { max-width: 1280px; margin: 0 auto; padding: 32px 24px 56px; }
      header {
        background: #0d1f1a;
        color: #f5f7f0;
        padding: 28px 32px;
        border-radius: 18px;
        margin-bottom: 28px;
      }
      header p.eyebrow {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: #c8f03a;
      }
      header h1 { margin: 0 0 8px; font-size: clamp(26px, 3vw, 38px); letter-spacing: -0.8px; }
      header p.lead { margin: 0; color: #c7d9ce; max-width: 78ch; font-size: 15px; }
      section { margin: 28px 0; }
      h2 { font-size: 22px; letter-spacing: -0.4px; margin: 0 0 12px; }
      h3 { font-size: 16px; margin: 0 0 12px; }
      .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
      .card {
        background: #ffffff;
        border: 1.5px solid #d5dfd6;
        border-radius: 14px;
        padding: 18px 20px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: #ffffff;
        border: 1.5px solid #d5dfd6;
        border-radius: 14px;
        overflow: hidden;
        font-size: 13.5px;
      }
      th, td { padding: 11px 14px; text-align: left; border-bottom: 1px solid #e4ece4; }
      th { background: #eff3ea; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: #4d6156; }
      tr:last-child td { border-bottom: 0; }
      .compare-card {
        background: #ffffff;
        border: 1.5px solid #d5dfd6;
        border-radius: 14px;
        padding: 16px 18px;
        margin-bottom: 18px;
      }
      .compare-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .mobile-pair { max-width: 780px; }
      figure { margin: 0; }
      figcaption { font-size: 12px; font-weight: 700; color: #4d6156; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.8px; }
      img { width: 100%; height: auto; display: block; border-radius: 10px; border: 1.5px solid #d5dfd6; }
      ul { margin: 8px 0 0; padding-left: 20px; }
      li { margin: 6px 0; }
      code { font-family: "Cascadia Code", Consolas, monospace; font-size: 0.92em; background: #eff3ea; padding: 2px 5px; border-radius: 5px; }
      a { color: #1a7a5e; font-weight: 600; }
      @media (max-width: 760px) {
        main { padding: 18px 14px 40px; }
        header { padding: 20px; }
        .compare-pair { grid-template-columns: 1fr; }
        table { display: block; overflow-x: auto; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <p class="eyebrow">Motion Studio · Issue #79</p>
        <h1>UI/UX Audit &amp; Structural Overhaul Report</h1>
        <p class="lead">
          Unified single-bar product navigation, stage-first direct play across all four games, harmonized Motion Studio tokens across arcade and operator tools, and trimmed defensive captions—verified on real local Vite and production preview servers in English across desktop (1440×1000), mobile (390×844), and narrow (320×740) viewports.
        </p>
      </header>

      <section>
        <h2>What Changed &amp; Why</h2>
        <div class="grid-2">
          <div class="card">
            <h3>1. Single Unified Product Bar</h3>
            <ul>
              <li>Replaced stacked double headers (117–220 px) with one 56–60 px Motion Studio bar in <code>app-navigation.ts</code> and <code>studio-tokens.css</code>.</li>
              <li>Converted <strong>Switch view</strong> into an anchored floating popover with concise groups and zero multi-sentence prose walls.</li>
              <li>Preserved all departure guards, <code>NavigationStartup</code>, <code>motion-studio:navigation-check</code>, Escape focus return, no-JS directory links, and hosted Pages route filtering.</li>
            </ul>
          </div>
          <div class="card">
            <h3>2. Stage-First Direct Play</h3>
            <ul>
              <li>Removed the blocking modal curtain on load for Slap a Mole, Dodgeball, and Virtual Maze—players immediately see the game stage above the fold.</li>
              <li>Added direct in-stage actions (<strong>Play without camera</strong> / <strong>Set up camera</strong> / <strong>Start round</strong> / <strong>Start rehearsal</strong>) and direct <strong>Play again</strong> through the existing clean reset/admission path.</li>
              <li>Moved Motion Runner’s HUD into a top cabinet scoreboard bar so the 3D world and <strong>Start run</strong> sit cleanly above the fold on desktop and mobile.</li>
            </ul>
          </div>
          <div class="card">
            <h3>3. Unified Visual Language &amp; Bug Fixes</h3>
            <ul>
              <li>Created <code>studio-tokens.css</code> and harmonized Directory, Mole, Dodgeball, Runner, Maze, Multiplayer, Tracking Console, and Two-Camera Workspace.</li>
              <li>Fixed the severe dark-blue-on-dark-green contrast defect in Maze’s setup modal, eliminated the 236 px desktop pillarbox void on Mole/Dodgeball, and fixed raw JSON parse errors in <code>camera-choice.ts</code> when the local vision service is offline.</li>
              <li>Fixed Multiplayer’s hidden-modal enrollment error bug and replaced raw phase enum strings with readable labels.</li>
            </ul>
          </div>
          <div class="card">
            <h3>4. Fewer Defensive Captions &amp; Operator Precision</h3>
            <ul>
              <li>Deduplicated 5-place readiness status echoes, dropped internal milestone codes (M1/M2/M4) from player footers, and condensed verbose setup essays into scannable one-liners.</li>
              <li>Placed Tracking Console’s <strong>Start camera</strong> directly under Input source (above the fold on desktop &amp; mobile) and moved 10 secondary profiling stats into a collapsible disclosure.</li>
              <li>Kept all honest safety boundaries intact: explicit camera start, no recording, synthetic vs. physical honesty, camera-release retry, and map-free Maze participant displays.</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2>Measured Before vs. After Layout Metrics</h2>
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Top chrome height (1440px)</th>
              <th>Stage top (1440×1000)</th>
              <th>Stage top (390×844)</th>
              <th>Blocking modal on load</th>
              <th>Horizontal overflow</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Desktop Before / After Evidence (1440×1000)</h2>
        ${desktopComparisons}
      </section>

      <section>
        <h2>Mobile Before / After Evidence (390×844)</h2>
        ${mobileComparisons}
      </section>

      <section>
        <h2>Checks Performed &amp; Remaining Limitations</h2>
        <div class="grid-2">
          <div class="card">
            <h3>Actual Verification Run</h3>
            <ul>
              <li><code>pnpm contracts:check</code>, <code>pnpm typecheck:typescript</code>, <code>pnpm lint:typescript</code>, <code>pnpm format:check:typescript</code> — passed.</li>
              <li><code>pnpm test:typescript</code> — 48 test files, 974 tests passed.</li>
              <li><code>pnpm build:mirror</code> (7 entries) &amp; <code>pnpm build:pages</code> (5 entries) — passed.</li>
              <li>Real-server Playwright browser checks (Chromium ${afterMetrics.browser}, English, 1440×1000 / 390×844 / 320×740, zero camera starts, zero page errors): <code>verify-ux-overhaul.mjs</code>, <code>verify-pages.mjs</code>, <code>verify-game-directory.mjs</code>, <code>verify-operator-navigation.mjs</code>, plus slice checks for Runner, Maze, Console, and Rig.</li>
              <li><code>pnpm check:repo</code> — whitespace, Markdown links/anchors, and static HTML report checks passed.</li>
            </ul>
          </div>
          <div class="card">
            <h3>Remaining Limitations</h3>
            <ul>
              <li>Python checks (<code>pnpm check:python</code>) were not run locally in this worktree because <code>uv</code> is not installed on PATH; no Python files were modified (CI runs the full Ubuntu/Windows/macOS Python matrix on the PR).</li>
              <li>Browser verification used synthetic HTTP/WebSocket fixtures and never opened a physical USB camera or measured physical tracking accuracy, latency, or multiplayer rig capacity.</li>
              <li>English is the only supported language. Physical M1/M4/M6/M7 hardware gates remain separate milestones.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>
`;

writeFileSync(resolve("reports/ux-overhaul.html"), html, "utf8");
console.log("Wrote reports/ux-overhaul.html");
