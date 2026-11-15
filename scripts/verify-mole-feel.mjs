/* global window, document, WebSocket, TextEncoder */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const baseline = process.argv.includes("--baseline");

const phase = baseline ? "before" : "after";
const output = resolve("reports/local/mole-feel");
await mkdir(output, { recursive: true });
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
assert(executablePath, "Set CHROME_PATH to an existing Chromium browser.");
const baselineRef = "2cea8d7033a8be02f4f9d7079ecc0e6ca676a6fa";
const sources = new Map(
  baseline
    ? [
        "apps/mirror/src/mole-viewer.ts",
        "games/mole-motion/src/index.ts",
        "apps/mirror/src/mole.css",
        "apps/mirror/src/mole-art.ts",
        "apps/mirror/src/dodgeball-renderer.ts",
      ].map((path) => [
        path,
        execFileSync("git", ["show", `${baselineRef}:${path}`], {
          encoding: "utf8",
        }),
      ])
    : [],
);
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
  plugins: [
    {
      name: "wrist-flick-baseline",
      enforce: "pre",
      transform(_source, id) {
        for (const [path, source] of sources)
          if (id.replaceAll("\\", "/").endsWith(`/${path}`)) return source;
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
  });
  const errors = [];
  await context.route("**/api/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        new URL(route.request().url()).pathname === "/api/cameras"
          ? {
              cameras: [
                { id: "a".repeat(64), name: "Synthetic wrist fixture" },
              ],
            }
          : { state: "running", epoch: "flick-browser" },
      ),
    }),
  );
  const fixture = JSON.parse(
    await readFile("contracts/examples/synthetic-observation.json", "utf8"),
  );
  await context.addInitScript((fixture) => {
    Math.random = () => 42 / 4_294_967_296;
    const NativeSocket = WebSocket;
    window.__wrist = { x: 0.05, y: 0.1 };
    window.WebSocket = class {
      static OPEN = 1;
      readyState = 1;
      sequence = 0;
      constructor(url) {
        if (!String(url).includes("/api/")) return new NativeSocket(url);
        window.setTimeout(() => this.onopen?.(), 0);
      }
      send() {
        window.setTimeout(() => {
          if (this.readyState !== 1) return;
          const canvas = document.createElement("canvas");
          canvas.width = 960;
          canvas.height = 600;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#c9d4c4";
          ctx.fillRect(0, 0, 960, 600);
          ctx.fillStyle = "#a4b79f";
          ctx.fillRect(0, 460, 960, 140);
          ctx.fillStyle = "#e1e7da";
          ctx.fillRect(80, 55, 230, 290);
          ctx.strokeStyle = "#879c80";
          ctx.lineWidth = 3;
          ctx.strokeRect(80, 55, 230, 290);
          ctx.fillStyle = "#59755a";
          ctx.font = "16px sans-serif";
          ctx.fillText("SYNTHETIC CAMERA FIXTURE", 32, 565);
          ctx.strokeStyle = "#5c7168";
          ctx.lineWidth = 24;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(480, 180);
          ctx.lineTo(480, 350);
          ctx.moveTo(480, 350);
          ctx.lineTo(405, 520);
          ctx.moveTo(480, 350);
          ctx.lineTo(560, 520);
          ctx.moveTo(480, 220);
          ctx.lineTo(window.__wrist.x * 960, window.__wrist.y * 600);
          ctx.moveTo(480, 220);
          ctx.lineTo(660, 320);
          ctx.stroke();
          ctx.fillStyle = "#e2ba92";
          ctx.beginPath();
          ctx.arc(480, 130, 42, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#d66764";
          ctx.beginPath();
          ctx.arc(
            window.__wrist.x * 960,
            window.__wrist.y * 600,
            12,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          const t = String(Math.round(window.performance.now() * 1e6));
          const joint = (x, y) => ({
            x,
            y,
            score: 0.99,
            inFrame: true,
            status: "observed",
          });
          const value = {
            ...fixture,
            source: "camera",
            algorithm: "mediapipe",
            clock: {
              domain: "host-monotonic",
              quality: "host-read-completion",
              uncertaintyNs: null,
            },
            epoch: "flick-browser",
            sequence: ++this.sequence,
            frameId: `flick-${this.sequence}`,
            capturedAtNs: t,
            processedAtNs: t,
            image: { ...fixture.image, width: 960, height: 600 },
            people: [
              {
                ...fixture.people[0],
                identity: "confident",
                joints: {
                  ...fixture.people[0].joints,
                  nose: joint(0.5, 0.22),
                  left_shoulder: joint(0.42, 0.36),
                  right_shoulder: joint(0.58, 0.36),
                  left_elbow: joint(0.36, 0.44),
                  right_elbow: joint(0.64, 0.45),
                  left_hip: joint(0.46, 0.58),
                  right_hip: joint(0.54, 0.58),
                  left_knee: joint(0.43, 0.73),
                  right_knee: joint(0.57, 0.73),
                  left_wrist: joint(window.__wrist.x, window.__wrist.y),
                  left_index_finger: joint(window.__wrist.x, window.__wrist.y),
                  left_pinky_finger: joint(window.__wrist.x, window.__wrist.y),
                  right_wrist: joint(0.69, 0.53),
                  left_ankle: joint(0.42, 0.87),
                  right_ankle: joint(0.58, 0.87),
                },
              },
            ],
          };
          const header = new TextEncoder().encode(JSON.stringify(value));
          const jpeg = Uint8Array.from(
            window.atob(canvas.toDataURL("image/jpeg", 0.8).split(",")[1]),
            (c) => c.charCodeAt(0),
          );
          const packet = new Uint8Array(4 + header.length + jpeg.length);
          new DataView(packet.buffer).setUint32(0, header.length, false);
          packet.set(header, 4);
          packet.set(jpeg, 4 + header.length);
          this.onmessage?.({ data: packet.buffer });
        }, 45);
      }
      close() {
        this.readyState = 3;
      }
    };
  }, fixture);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const screenshots = [];
  const capture = async (name, target = page) => {
    const file = `${phase}-${name}.jpg`;
    await target.screenshot({
      path: resolve(output, file),
      type: "jpeg",
      quality: 80,
      fullPage: true,
    });
    screenshots.push(file);
  };
  await page.goto(`${server.resolvedUrls.local[0]}mole.html`);
  await page.locator("#mode-select").selectOption("practice");
  await page.locator("#difficulty-select").selectOption("easy");
  await page.locator("#source-connect").click();
  await page.waitForFunction(
    () => !document.querySelector("#source-stop").disabled,
  );
  await page.locator("#confirm-start").click();
  await page.waitForFunction(
    () => !document.querySelector("#mole-target").hidden,
    undefined,
    { timeout: 10000 },
  );
  await capture("arrival-desktop");
  await page.waitForTimeout(550);
  await capture("active-desktop");
  const aim = async (id, offset) =>
    page.evaluate(
      ({ id, offset }) => {
        const canvas = document.querySelector("#game-canvas");
        const scale = Math.min(
          canvas.clientWidth / 960,
          canvas.clientHeight / 600,
        );
        const ox = (canvas.clientWidth - 960 * scale) / 2,
          oy = (canvas.clientHeight - 600 * scale) / 2;
        const t = document.querySelector(`#${id}`);
        window.__wrist = {
          x: 1 - (parseFloat(t.style.left) - ox) / (960 * scale) + offset,
          y: (parseFloat(t.style.top) - oy) / (600 * scale),
        };
      },
      { id, offset },
    );
  const whack = async (id) => {
    // Aim outside, then take a short fresh pass through the visible footprint.
    await aim(id, -0.12);
    await page.waitForTimeout(120);
    await aim(id, 0);
    await page.waitForTimeout(80);
  };
  await aim("mole-target", -0.12);
  await page.waitForTimeout(120);
  await aim("mole-target", 0.12);
  await page.waitForTimeout(100);
  const sparseScore = Number(await page.locator("#score-value").textContent());
  assert.equal(sparseScore, baseline ? 0 : 100, "Outside-to-outside pass");
  await capture("sparse-desktop");
  if (baseline) await whack("mole-target");
  await page.waitForFunction(
    () => Number(document.querySelector("#score-value").textContent) === 100,
  );
  await capture("hit-desktop");
  await whack("bomb-target");
  await page.waitForFunction(
    () => Number(document.querySelector("#score-value").textContent) === 50,
  );
  await capture("bomb-desktop");
  await page.evaluate(() => (window.__wrist = { x: 0.01, y: 0.01 }));
  await page.waitForTimeout(700);
  assert.equal(await page.locator("#score-value").textContent(), "050");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("active-mobile");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  if (!baseline) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await capture("reduced-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(
      () => document.querySelector("#target-effects .expired"),
      undefined,
      { timeout: 7000 },
    );
    await capture("expiry-desktop");
    // Display choice is in pre-game setup; open it before the next round.
    await page.locator("#end-round").click();
    await page.locator("#open-settings").click();
    const popupPromise = context
      .waitForEvent("page", { timeout: 5000 })
      .catch(() => null);
    await page.locator("#open-game-display").click();
    const popup = await popupPromise;
    assert(
      popup,
      `No player window: ${await page.locator("#display-status").textContent()}`,
    );
    await page.locator("#confirm-start").click();
    await popup.waitForFunction(
      () => document.querySelector("#mole-target")?.dataset.phase === "active",
      undefined,
      { timeout: 10000 },
    );
    await capture("player-window", popup);
    await popup.close();
  }
  await page.locator("#end-round").click();
  await page.locator("#source-stop").click();
  await page.goto(`${server.resolvedUrls.local[0]}dodgeball.html`);
  await page.locator("#mode-select").selectOption("practice");
  await page.locator("#source-connect").click();
  await page.waitForFunction(
    () => !document.querySelector("#source-stop").disabled,
  );
  await page.locator("#confirm-start").click();
  await page.waitForFunction(
    () => document.querySelector("#warning-track")?.dataset.phase === "warning",
    undefined,
    { timeout: 10000 },
  );
  await capture("dodge-warning-desktop");
  await page.waitForFunction(
    () => document.querySelector("#warning-track")?.dataset.phase === "danger",
  );
  await capture("dodge-danger-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("dodge-mobile");
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.locator("#end-round").click();
  await page.locator("#source-stop").click();
  if (!baseline) {
    const overlap = await context.newPage();
    await overlap.setViewportSize({ width: 390, height: 844 });
    overlap.on("pageerror", (error) => errors.push(error.message));
    await overlap.goto(`${server.resolvedUrls.local[0]}mole.html`);
    await overlap.evaluate(async () => {
      const { renderMoleTargets } = await import("/src/mole-targets.ts");
      // Clone the real stage so the running viewer cannot overwrite this stress fixture.
      const stage = document.querySelector("#game-stage").cloneNode(true);
      stage.querySelector(".mm-overlay").remove();
      document.body.replaceChildren(stage);
      const slots = ["mole-target", "mole-target-2", "bomb-target"].map((id) =>
        stage.querySelector(`#${id}`),
      );
      const effects = stage.querySelector("#target-effects");
      const target = {
        id: 99,
        kind: "mole",
        x: 0.5,
        y: 0.5,
        radius: 0.065,
        remainingMs: 5000,
        phase: "active",
      };
      renderMoleTargets(
        slots,
        effects,
        {
          phase: "playing",
          options: { difficulty: "easy" },
          targets: [target],
          targetFeedback: [
            {
              ...target,
              id: 98,
              targetId: 98,
              outcome: "hit",
              points: 100,
              remainingMs: 200,
            },
          ],
        },
        { x: 0, y: 0, width: stage.clientWidth, height: stage.clientHeight },
      );
      window.__replacementAboveOutcome =
        Number(window.getComputedStyle(slots[0]).zIndex) >
        Number(window.getComputedStyle(effects).zIndex);
    });
    assert(
      await overlap.evaluate(() => window.__replacementAboveOutcome),
      "Replacement must stay above the lingering outcome",
    );
    await capture("overlap-mobile", overlap);
    await overlap.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, `${phase}-results.json`),
    JSON.stringify(
      {
        phase,
        sparseScore,
        baselineRef,
        browser: browser.version(),
        language: "en",
        screenshots,
        checks: [
          "synthetic camera sparse pass: baseline 0 / new 100; mole then bomb 50; held sample no repeat",
          "English desktop/mobile and no mobile overflow",
          "Dodgeball warning/danger drawing",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ phase, screenshots, errors }));
} finally {
  await browser?.close();
  await server.close();
}
