/* global document, window */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

// Use the already locked happy-dom WebSocket dependency; no browser/model download.
const require = createRequire(import.meta.url);
const { WebSocketServer } = createRequire(require.resolve("happy-dom"))("ws");
const output = resolve("reports/local/multiplayer");
await mkdir(output, { recursive: true });
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => p && existsSync(p));
assert(executablePath, "Set CHROME_PATH to an installed Chromium browser.");
const fixture = JSON.parse(
  await readFile("contracts/examples/synthetic-observation.json", "utf8"),
);
const baselineRef = execFileSync("git", ["rev-parse", "origin/main"], {
  encoding: "utf8",
}).trim();
let baseline = false;
let jpeg;
let scene = {
  epoch: "synthetic-multiplayer",
  revision: "synthetic-space-1",
  omitted: [],
  ambiguous: [],
  palm: null,
  cross: false,
};
const offsets = [
  ["nose", 0, -0.3],
  ["left_shoulder", -0.06, -0.2],
  ["right_shoulder", 0.06, -0.2],
  ["left_elbow", -0.08, -0.08],
  ["right_elbow", 0.08, -0.08],
  ["left_wrist", -0.1, 0.02],
  ["right_wrist", 0.1, 0.02],
  ["left_hip", -0.045, 0.08],
  ["right_hip", 0.045, 0.08],
  ["left_knee", -0.05, 0.22],
  ["right_knee", 0.05, 0.22],
  ["left_ankle", -0.055, 0.38],
  ["right_ankle", 0.055, 0.38],
];
let sequence = 0;
const result = {
  language: "en",
  transport:
    "Real local HTTP/WebSocket; generated camera packets/JPEG, no interception or physical capture",
  checks: [],
  screenshots: [],
  errors: [],
  starts: 0,
  streams: 0,
  baselineRef,
};
function packet() {
  const captured = Math.round(performance.now() * 1e6);
  const people = ["track-a", "track-b", "track-c"]
    .filter((id) => !scene.omitted.includes(id))
    .map((trackId, index) => {
      const x = scene.cross
        ? [0.75, 0.5, 0.25][index]
        : [0.25, 0.5, 0.75][index];
      const joints = Object.fromEntries(
        offsets.map(([name, dx, dy]) => [
          name,
          {
            x: x + dx,
            y: 0.5 + dy,
            status: "observed",
            inFrame: true,
            score: 0.99,
          },
        ]),
      );
      // Hands stay clear until a deliberate scoring test moves one canonical palm.
      for (const side of ["left", "right"]) {
        const point =
          scene.palm?.trackId === trackId && side === "left"
            ? scene.palm
            : { x: 0.01, y: 0.02 };
        joints[`${side}_wrist`] = {
          x: point.x,
          y: point.y,
          status: "observed",
          inFrame: true,
          score: 0.99,
        };
        joints[`${side}_index_finger`] = { ...joints[`${side}_wrist`] };
        joints[`${side}_pinky_finger`] = { ...joints[`${side}_wrist`] };
      }
      return {
        trackId,
        identity: scene.ambiguous.includes(trackId) ? "ambiguous" : "confident",
        box: { x: x - 0.12, y: 0.1, width: 0.24, height: 0.8 },
        joints,
      };
    });
  if (scene.cross) people.reverse();
  const observation = {
    ...fixture,
    source: "camera",
    algorithm: "rtmpose",
    epoch: scene.epoch,
    transformRevision: scene.revision,
    sequence: ++sequence,
    frameId: `synthetic-${sequence}`,
    capturedAtNs: String(captured),
    processedAtNs: String(captured),
    image: { ...fixture.image, width: 960, height: 600 },
    detectedCount: people.length,
    people,
    clock: {
      domain: "host-monotonic",
      quality: "host-read-completion",
      uncertaintyNs: null,
    },
  };
  const metadata = Buffer.from(JSON.stringify(observation));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(metadata.length);
  return Buffer.concat([header, metadata, jpeg]);
}
const sockets = new WebSocketServer({ noServer: true, maxPayload: 4096 });
sockets.on("connection", (socket) => {
  result.streams++;
  let pending = false;
  socket.on("message", () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (socket.readyState === 1) socket.send(packet());
    }, 50);
  });
});
const snapshots = new Map(
  ["mole-viewer.ts", "dodgeball-viewer.ts"].map((name) => [
    name,
    execFileSync("git", ["show", `${baselineRef}:apps/mirror/src/${name}`], {
      encoding: "utf8",
    }),
  ]),
);
const server = await createServer({
  configFile: false,
  root: resolve("apps/mirror"),
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
    hmr: false,
    fs: { allow: [resolve(".")] },
  },
  plugins: [
    {
      name: "synthetic-multiplayer-transport",
      enforce: "pre",
      transform(_source, id) {
        if (!baseline) return;
        for (const [name, source] of snapshots)
          if (id.replaceAll("\\", "/").endsWith(`/src/${name}`)) return source;
      },
      configureServer(server) {
        server.httpServer.on("upgrade", (request, socket, head) => {
          if (request.url === "/api/stream")
            sockets.handleUpgrade(request, socket, head, (ws) =>
              sockets.emit("connection", ws, request),
            );
        });
        server.middlewares.use((request, response, next) => {
          if (!request.url.startsWith("/api/")) return next();
          response.setHeader("Content-Type", "application/json");
          if (request.url === "/api/cameras")
            response.end(
              JSON.stringify({
                cameras: [
                  {
                    id: "a".repeat(64),
                    name: "Synthetic camera · generated people",
                  },
                ],
              }),
            );
          else if (request.url === "/api/start") {
            result.starts++;
            response.end(
              JSON.stringify({ state: "running", epoch: scene.epoch }),
            );
          } else response.end(JSON.stringify({ state: "idle" }));
        });
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1440, height: 1050 },
  });
  const art = await context.newPage();
  jpeg = Buffer.from(
    await art.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 960;
      c.height = 600;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#d4e1d5";
      ctx.fillRect(0, 0, 960, 600);
      ctx.fillStyle = "#abc2b2";
      ctx.fillRect(0, 490, 960, 110);
      ["#b74b35", "#2a6a8b", "#775395"].forEach((color, i) => {
        const x = [0.25, 0.5, 0.75][i] * 960;
        ctx.fillStyle = color;
        ctx.fillRect(x - 50, 200, 100, 160);
        ctx.fillRect(x - 65, 355, 45, 170);
        ctx.fillRect(x + 20, 355, 45, 170);
        ctx.beginPath();
        ctx.arc(x, 130, 45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#173b30";
        ctx.font = "22px sans-serif";
        ctx.fillText(["A", "B", "C"][i], x - 8, 140);
      });
      ctx.fillStyle = "#173b30";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("SYNTHETIC CAMERA FIXTURE · NO PHYSICAL CAPTURE", 100, 45);
      return c.toDataURL("image/jpeg", 0.85).split(",")[1];
    }),
    "base64",
  );
  await art.close();
  let page = await context.newPage();
  page.on("pageerror", (error) => result.errors.push(error.message));
  async function capture(
    name,
    sizes = [
      ["desktop", 1440, 1050],
      ["mobile", 390, 844],
    ],
  ) {
    for (const [label, width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${name} overflow at ${width}`,
      );
      const filename = `${name}-${label}.png`;
      await page.screenshot({
        path: resolve(output, filename),
        fullPage: true,
      });
      result.screenshots.push(filename);
    }
  }
  async function startCamera(kind) {
    await page.goto(`http://127.0.0.1:5199/${kind}.html`);
    await page
      .locator("#camera-choice option")
      .filter({ hasText: "Synthetic camera" })
      .waitFor({ state: "attached" });
    await page.selectOption("#camera-choice", "a".repeat(64));
    await page.click("#source-connect");
    await page.waitForFunction(
      () =>
        document.querySelector("#source-connect").disabled &&
        document.querySelector("#setup-stop-camera").disabled === false,
    );
    await page.waitForTimeout(200);
    const status = await page.locator("#setup-input-status").innerText();
    assert(
      !/Invalid observation|unavailable|could not|failed/i.test(status),
      status,
    );
  }
  async function enroll(id, track) {
    await page.selectOption(`#${id}-track`, track);
    await page.locator(`[data-slot="${id}"] [data-action="join"]`).click();
    await page
      .locator(`[data-slot="${id}"] .multiplayer-binding`)
      .filter({ hasText: track })
      .waitFor();
  }
  async function playing(id) {
    await page
      .locator(`[data-slot="${id}"][data-phase="playing"]`)
      .waitFor({ timeout: 12000 });
  }
  baseline = true;
  await startCamera("mole");
  await page.click("#close-settings");
  await capture("before-singleplayer");
  baseline = false;
  // Invalidate Vite's transformed baseline modules before checking new implementation.
  for (const module of server.moduleGraph.idToModuleMap.values())
    server.moduleGraph.invalidateModule(module);
  await page.close();
  page = await context.newPage();
  page.on("pageerror", (error) => result.errors.push(error.message));
  await startCamera("mole");
  await page.selectOption("#mode-select", "practice");
  await page.selectOption("#difficulty-select", "easy");
  await page.check("#multiplayer-enabled");
  await page.click("#close-settings");
  await enroll("player-1", "track-a");
  await enroll("player-2", "track-b");
  assert.match(
    await page.locator("#multiplayer-spectators").innerText(),
    /Spectators: 1.*track-c/,
  );
  await capture("after-two-player-lobby", [["desktop", 1440, 1050]]);
  await page.click("#multiplayer-start");
  await playing("player-1");
  await playing("player-2");
  result.checks.push(
    "Two enrolled games count down and play while the third detection stays a spectator.",
  );
  await enroll("player-3", "track-c");
  await page.click("#multiplayer-start");
  await playing("player-3");
  const target = await page
    .locator(
      '[data-slot="player-1"] .multiplayer-target[data-kind="mole"][data-phase="active"]',
    )
    .first()
    .evaluate((el) => ({ x: Number(el.dataset.x), y: Number(el.dataset.y) }));
  const scoresBefore = await page
    .locator(".multiplayer-score")
    .allTextContents();
  scene.palm = {
    trackId: "track-a",
    x: Math.max(0.01, target.x - 0.15),
    y: target.y,
  };
  await page.waitForTimeout(120);
  scene.palm = { trackId: "track-a", ...target };
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('[data-slot="player-1"] .multiplayer-score')
          .textContent,
      ) > 0,
  );
  scene.palm = null;
  const scoresAfter = await page
    .locator(".multiplayer-score")
    .allTextContents();
  assert.equal(scoresAfter[1], scoresBefore[1]);
  assert.equal(scoresAfter[2], scoresBefore[2]);
  result.checks.push(
    "Three actual Mole engines run; moving only track-a's palm scores only Player 1.",
  );
  scene.cross = true;
  await page.waitForTimeout(250);
  assert.deepEqual(
    await page.locator(".multiplayer-binding").allTextContents(),
    ["Enrolled: track-a", "Enrolled: track-b", "Enrolled: track-c"],
  );
  await capture("after-three-player-crossing");
  result.checks.push(
    "Reversed observation order and exchanged x positions preserve explicit membership and scores.",
  );
  scene.ambiguous = ["track-b"];
  await page
    .locator('[data-slot="player-2"][data-status="rejoin-required"]')
    .waitFor();
  const frozen = await page
    .locator('[data-slot="player-2"] .multiplayer-stats')
    .innerText();
  const liveBefore = await page
    .locator('[data-slot="player-1"] .multiplayer-stats')
    .innerText();
  await page.waitForTimeout(300);
  assert.equal(
    await page.locator('[data-slot="player-2"] .multiplayer-stats').innerText(),
    frozen,
  );
  assert.notEqual(
    await page.locator('[data-slot="player-1"] .multiplayer-stats').innerText(),
    liveBefore,
  );
  scene.omitted = ["track-c"];
  await page.waitForTimeout(600);
  await page
    .locator('[data-slot="player-3"][data-status="rejoin-required"]')
    .waitFor();
  await capture("after-affected-slots-paused", [["desktop", 1440, 1050]]);
  result.checks.push(
    "An ambiguous slot and a lost slot freeze independently; Player 1 continues without score transfer.",
  );
  scene.ambiguous = [];
  scene.omitted = [];
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator('[data-slot="player-2"]').getAttribute("data-status"),
    "rejoin-required",
  );
  await page.locator('[data-slot="player-2"] [data-action="leave"]').click();
  await enroll("player-2", "track-b");
  assert.equal(
    await page.locator('[data-slot="player-2"] .multiplayer-score').innerText(),
    "0",
  );
  result.checks.push(
    "A returned ID cannot unlock a terminal slot; explicit leave/re-enroll creates a fresh score.",
  );
  const preservedScores = await page
    .locator(".multiplayer-score")
    .allTextContents();
  scene.revision = "synthetic-space-2";
  await page
    .locator('[data-slot="player-1"][data-status="rejoin-required"]')
    .waitFor();
  await page
    .locator('[data-slot="player-2"][data-status="rejoin-required"]')
    .waitFor();
  assert.deepEqual(
    await page.locator(".multiplayer-score").allTextContents(),
    preservedScores,
  );
  result.checks.push(
    "Geometry revision invalidates all affected slots and preserves displayed scores.",
  );
  await page.close();
  scene = {
    epoch: "synthetic-dodgeball",
    revision: "synthetic-space-1",
    omitted: [],
    ambiguous: [],
    palm: null,
    cross: false,
  };
  page = await context.newPage();
  page.on("pageerror", (error) => result.errors.push(error.message));
  await startCamera("dodgeball");
  await page.selectOption("#mode-select", "practice");
  await page.check("#multiplayer-enabled");
  await page.click("#close-settings");
  await enroll("player-1", "track-a");
  await enroll("player-2", "track-b");
  await enroll("player-3", "track-c");
  await page.click("#multiplayer-start");
  await playing("player-1");
  await playing("player-2");
  await playing("player-3");
  await page.waitForTimeout(500);
  await capture("after-dodgeball-three-player");
  await page.locator('[data-slot="player-1"] [data-action="pause"]').click();
  assert.equal(
    await page.locator('[data-slot="player-1"]').getAttribute("data-phase"),
    "paused",
  );
  assert.equal(
    await page.locator('[data-slot="player-2"]').getAttribute("data-phase"),
    "playing",
  );
  result.checks.push(
    "Three Dodgeball engines render independent balls/body input; manual pause affects one slot.",
  );
  await page.click("#source-stop");
  assert.equal(
    await page.locator('[data-slot="player-2"]').getAttribute("data-phase"),
    "paused",
  );
  await page.click("#multiplayer-settings");
  scene.epoch = "synthetic-dodgeball-restarted";
  await page.click("#source-connect");
  await page.waitForTimeout(250);
  await page.click("#close-settings");
  await page
    .locator('[data-slot="player-2"][data-status="rejoin-required"]')
    .waitFor();
  result.checks.push(
    "Camera stop freezes all input; restarted epoch requires explicit enrollment without score transfer.",
  );
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
  assert.equal(result.starts, 4);
  assert.equal(result.streams, 4);
  result.checks.push(
    "English 1440px desktop and 390px mobile screenshots have no horizontal overflow or browser page errors.",
  );
  console.log(
    JSON.stringify(
      {
        checks: result.checks,
        screenshots: result.screenshots,
        starts: result.starts,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  for (const socket of sockets.clients) socket.terminate();
  sockets.close();
  await server.close();
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(result, null, 2),
  );
}
