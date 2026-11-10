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
const output = resolve("reports/local/camera-default");
await mkdir(output, { recursive: true });
const executablePath = [
  process.env.CHROME_PATH,
  resolve(
    process.env.PROGRAMFILES || "C:/Program Files",
    "Google/Chrome/Application/chrome.exe",
  ),
  resolve(
    process.env["PROGRAMFILES(X86)"] || "C:/Program Files (x86)",
    "Microsoft/Edge/Application/msedge.exe",
  ),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
assert(executablePath, "Set CHROME_PATH to an existing Chromium browser.");
const baselineRef = baseline
  ? execFileSync("git", ["rev-parse", "--verify", "15a56dc^{commit}"], {
      encoding: "utf8",
    }).trim()
  : null;
const sources = new Map(
  baseline
    ? ["mole-viewer.ts", "dodgeball-viewer.ts"].map((name) => [
        name,
        execFileSync(
          "git",
          ["show", `${baselineRef}:apps/mirror/src/${name}`],
          { encoding: "utf8" },
        ),
      ])
    : [],
);
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
  plugins: [
    {
      name: "camera-default-baseline",
      enforce: "pre",
      transform(_source, id) {
        for (const [name, source] of sources)
          if (id.replaceAll("\\", "/").endsWith(`/apps/mirror/src/${name}`))
            return source;
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
  });
  const errors = [];
  const calls = [];
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push(path);
    const body =
      path === "/api/cameras"
        ? {
            cameras: [{ id: "a".repeat(64), name: "Synthetic camera fixture" }],
          }
        : { state: "running", epoch: "camera-direction-fixture" };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  const fixture = JSON.parse(
    await readFile("contracts/examples/synthetic-observation.json", "utf8"),
  );
  await context.addInitScript((fixture) => {
    const NativeSocket = WebSocket;
    window.__cameraX = 0.35;
    window.WebSocket = class FixtureSocket {
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
          ctx.fillStyle = "#233e3a";
          ctx.fillRect(0, 0, 960, 600);
          ctx.fillStyle = "#ed36d9";
          ctx.fillRect(window.__cameraX * 960 - 35, 180, 70, 240);
          // Asymmetric marker proves raw camera pixels and geometry move together.
          const joints = Object.fromEntries(
            Object.entries(fixture.people[0].joints).map(([name, joint]) => [
              name,
              {
                ...joint,
                x: window.__cameraX,
                y: name.includes("ankle") ? 0.85 : 0.5,
                status: "observed",
                inFrame: true,
                score: 0.99,
              },
            ]),
          );
          const t = Math.round(window.performance.now() * 1e6);
          const observation = {
            ...fixture,
            source: "camera",
            clock: {
              domain: "host-monotonic",
              quality: "host-read-completion",
              uncertaintyNs: null,
            },
            epoch: "camera-direction-fixture",
            algorithm: "mediapipe",
            sequence: ++this.sequence,
            frameId: `synthetic-${this.sequence}`,
            image: { ...fixture.image, width: 960, height: 600 },
            capturedAtNs: String(t),
            processedAtNs: String(t),
            people: [{ ...fixture.people[0], identity: "confident", joints }],
          };
          const header = new TextEncoder().encode(JSON.stringify(observation));
          const jpeg = Uint8Array.from(
            window.atob(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]),
            (c) => c.charCodeAt(0),
          );
          const packet = new Uint8Array(4 + header.length + jpeg.length);
          new DataView(packet.buffer).setUint32(0, header.length, false);
          packet.set(header, 4);
          packet.set(jpeg, 4 + header.length);
          this.onmessage?.({ data: packet.buffer });
        }, 50);
      }
      close() {
        this.readyState = 3;
      }
    };
  }, fixture);
  const screenshots = [];
  const checks = [];
  const capture = async (page, name, fullPage = true) => {
    const file = `${phase}-${name}.jpg`;
    await page.screenshot({
      path: resolve(output, file),
      type: "jpeg",
      quality: 75,
      fullPage,
    });
    screenshots.push(file);
  };
  const centroid = (page, kind) =>
    page.locator("#game-canvas").evaluate((canvas, kind) => {
      const pixels = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let sumX = 0,
        count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const [r, g, b] = pixels.subarray(i, i + 3);
        const match =
          kind === "camera"
            ? r > 200 && g < 100 && b > 160
            : kind === "mole"
              ? r > 190 && g > 225 && b > 150
              : r > 140 && g > 180 && b > 150;
        if (match) {
          sumX += (i / 4) % canvas.width;
          count++;
        }
      }
      const scale = Math.min(canvas.width / 960, canvas.height / 600);
      const imageWidth = 960 * scale;
      const imageLeft = (canvas.width - imageWidth) / 2;
      return count ? (sumX / count - imageLeft) / imageWidth : null;
    }, kind);
  for (const game of ["mole", "dodgeball"]) {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const callsBefore = calls.length;
    await page.goto(`${url}${game}.html`);
    await page.waitForFunction(
      () => document.querySelector("#source-label")?.textContent.length > 0,
    );
    assert.equal(
      await page.locator("#source-select").inputValue(),
      baseline ? "demo" : "camera",
    );
    assert(
      !calls.slice(callsBefore).includes("/api/start"),
      "Page load must not start capture",
    );
    if (!baseline)
      await page.waitForFunction(
        () => document.querySelector("#camera-choice").value === "a".repeat(64),
      );
    if (!baseline)
      assert(
        await page
          .locator("#pre-game-settings")
          .evaluate((dialog) => dialog.open),
        "Camera defaults must preserve initial setup review",
      );
    for (const [size, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${game} ${size} overflow`,
      );
      if (!baseline)
        assert(
          await page
            .locator("#pre-game-settings")
            .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1),
          `${game} ${size} setup overflow`,
        );
      await capture(page, `${game}-${size}`);
    }
    checks.push(
      `${game}: default source ${baseline ? "rehearsal" : "camera"}; no automatic capture; desktop/mobile no overflow`,
    );
    if (!baseline) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator("#source-connect").click();
      await page.waitForFunction(
        () => !document.querySelector("#source-stop").disabled,
      );
      await page.waitForTimeout(300);
      await page.locator("#close-settings").click();
      const before = await centroid(page, "camera");
      await capture(page, `${game}-camera-right`);
      assert(
        before > 0.6 && before < 0.7,
        JSON.stringify({
          before,
          status: await page.locator("#player-status").textContent(),
          errors,
        }),
      );
      await page.evaluate(() => {
        window.__cameraX = 0.65;
      });
      await page.waitForTimeout(300);
      const after = await centroid(page, "camera");
      assert(after > 0.3 && after < 0.4 && after < before);
      await capture(page, `${game}-camera-left`);
      await page.locator("#open-settings").click();
      const popupPromise = page.waitForEvent("popup");
      await page
        .locator(game === "mole" ? "#open-game-display" : "#open-game-window")
        .click();
      const popup = await popupPromise;
      await popup.waitForTimeout(200);
      const detached = await centroid(popup, "camera");
      await capture(popup, `${game}-detached`, false);
      assert(
        Math.abs(detached - after) < 0.01,
        JSON.stringify({ detached, after }),
      );
      await popup.close();
      await page.locator("#close-settings").click();
      await page.locator("#source-stop").click();
      await page.locator("#open-settings").click();
      await page.locator("#source-select").selectOption("demo");
      await page.locator("#close-settings").click();
      const canvas = page.locator("#game-canvas");
      await canvas.scrollIntoViewIfNeeded();
      await canvas.click({
        position: {
          x: (await canvas.boundingBox()).width / 2,
          y: (await canvas.boundingBox()).height / 2,
        },
      });
      await page.waitForTimeout(100);
      const center = await centroid(page, game);
      await page.locator("#game-stage").press("ArrowLeft");
      await page.waitForTimeout(100);
      const left = await centroid(page, game);
      assert(left < center, `${game} ArrowLeft must move rendered pixels left`);
      await page.locator("#game-stage").press("ArrowRight");
      await page.waitForTimeout(100);
      assert(Math.abs((await centroid(page, game)) - center) < 0.005);
      checks.push(
        `${game}: synthetic camera pixels x ${before.toFixed(3)} → ${after.toFixed(3)}; same mirror in detached window; rendered rehearsal left/right verified`,
      );
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(output, `${phase}-results.json`),
    JSON.stringify(
      {
        baselineRef,
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
