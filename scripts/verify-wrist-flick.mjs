/* global window, document, WebSocket, TextEncoder */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const baseline = process.argv.includes("--baseline");
const staged = process.argv.includes("--staged");
const phase = baseline ? "before" : "after";
const output = resolve("reports/local/wrist-flick");
await mkdir(output, { recursive: true });
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
assert(executablePath, "Set CHROME_PATH to an existing Chromium browser.");
const baselineRef = "15a56dc";
const sources = new Map(
  baseline || staged
    ? ["apps/mirror/src/mole-viewer.ts", "games/mole-motion/src/index.ts"].map(
        (path) => [
          path,
          execFileSync(
            "git",
            ["show", baseline ? `${baselineRef}:${path}` : `:${path}`],
            {
              encoding: "utf8",
            },
          ),
        ],
      )
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
                  left_wrist: joint(window.__wrist.x, window.__wrist.y),
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
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}mole.html`);
  await page.locator("#source-select").selectOption("camera");
  await page.locator("#mode-select").selectOption("practice");
  await page.locator("#difficulty-select").selectOption("easy");
  const screenshots = [];
  const capture = async (surface, name, fullPage = true) => {
    const file = `${phase}-${name}.jpg`;
    await surface.screenshot({
      path: resolve(output, file),
      type: "jpeg",
      quality: 75,
      fullPage,
    });
    screenshots.push(file);
  };
  if (!baseline) await page.locator("#interaction-flick").click();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
    ["narrow", 320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `${name}: horizontal overflow`,
    );
    await capture(page, name);
  }
  const checks = [
    "English setup: 1440×1000, 390×844 and 320×740; no horizontal overflow",
  ];
  if (!baseline) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#source-connect").click();
    await page.waitForFunction(
      () => !document.querySelector("#source-stop").disabled,
    );
    await page.locator("#start-round").click();
    await page.waitForFunction(
      () => !document.querySelector("#mole-target").hidden,
      undefined,
      { timeout: 10000 },
    );
    await page.evaluate(() => {
      const canvas = document.querySelector("#game-canvas");
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      const scale = Math.min(width / 960, height / 600);
      const offsetX = (width - 960 * scale) / 2,
        offsetY = (height - 600 * scale) / 2;
      const target = document.querySelector("#mole-target");
      const radius = parseFloat(target.style.width) / 2 / (960 * scale);
      window.__wrist = {
        x:
          1 -
          (parseFloat(target.style.left) - offsetX) / (960 * scale) -
          radius -
          0.03,
        y: (parseFloat(target.style.top) - offsetY) / (600 * scale),
      };
    });
    await page.waitForTimeout(350);
    assert.equal(await page.locator("#score-value").textContent(), "000");
    await page.evaluate(() => {
      window.__wrist.x += 0.025;
    });
    await page.waitForFunction(
      () => document.querySelector("#score-value").textContent === "100",
    );
    await capture(page, "camera-whack");
    await page.waitForTimeout(350);
    assert.equal(await page.locator("#score-value").textContent(), "100");
    assert.equal(await page.locator("#interaction-flick").isDisabled(), true);
    checks.push(
      "Synthetic camera wrist flap: 0 → 100 points; held wrist remains 100; interaction locked during round",
    );
    const popupPromise = page.waitForEvent("popup");
    await page.locator("#open-game-display").click();
    const popup = await popupPromise;
    await popup.waitForTimeout(150);
    assert.equal(await popup.locator("#display-score").textContent(), "100");
    await capture(popup, "game-window", false);
    await popup.close();
    checks.push(
      "Separate game window preserves the live flick round and score HUD",
    );
    await page.locator("#end-round").click();
    await page.locator("#source-stop").click();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, `${phase}-results.json`),
    JSON.stringify(
      {
        baselineRef: baseline ? baselineRef : null,
        browser: browser.version(),
        language: "en",
        screenshots,
        checks,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ phase, screenshots: screenshots.length, checks }, null, 2),
  );
} finally {
  await browser?.close();
  await server.close();
}
