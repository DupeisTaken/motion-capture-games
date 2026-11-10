/* global window, document, WebSocket, PageTransitionEvent */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const { values } = parseArgs({
  options: {
    baseline: { type: "string" },
    "report-only": { type: "boolean", default: false },
    "chrome-executable": { type: "string" },
  },
});
const output = resolve("reports/local/diagnostic-capture-lifecycle");
await mkdir(output, { recursive: true });
const executablePath =
  values["chrome-executable"] ||
  process.env.CHROME_PATH ||
  [
    process.env.PROGRAMFILES &&
      resolve(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      resolve(
        process.env["PROGRAMFILES(X86)"],
        "Microsoft/Edge/Application/msedge.exe",
      ),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((path) => path && existsSync(path));
assert(executablePath, "Supply --chrome-executable; no browser is downloaded.");
const baselineRef =
  values.baseline &&
  execFileSync(
    "git",
    ["rev-parse", "--verify", `${values.baseline}^{commit}`],
    { encoding: "utf8" },
  ).trim();
const baselineSource =
  baselineRef &&
  execFileSync("git", ["show", `${baselineRef}:apps/mirror/src/main.ts`], {
    encoding: "utf8",
  });
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false },
  plugins: [
    {
      name: "diagnostic-lifecycle-evidence",
      enforce: "pre",
      transform(_source, id) {
        if (
          baselineSource &&
          id.replaceAll("\\", "/").endsWith("/apps/mirror/src/main.ts")
        )
          return baselineSource;
      },
      configureServer(vite) {
        vite.middlewares.use(
          "/lifecycle-report.html",
          async (_request, response) => {
            response.setHeader("Content-Type", "text/html; charset=utf-8");
            response.end(
              await readFile(
                "reports/diagnostic-capture-lifecycle.html",
                "utf8",
              ),
            );
          },
        );
      },
    },
  ],
});
await server.listen();
const url = server.resolvedUrls.local[0];
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const errors = [];
  const result = {
    baselineRef: baselineRef || null,
    browser: browser.version(),
    headless: true,
    language: "en",
    checks: [],
  };
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    locale: "en-US",
  });
  if (values["report-only"]) {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${url}lifecycle-report.html`);
    for (const [name, width, height] of [
      ["desktop", 1440, 1050],
      ["mobile", 390, 844],
      ["narrow", 320, 740],
    ]) {
      await page.setViewportSize({ width, height });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "Report overflow",
      );
      await page.screenshot({
        path: resolve(output, `report-${name}.png`),
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    console.log("Offline report verified at 1440x1050, 390x844 and 320x740.");
  } else {
    // Only API boundaries are simulated. Vite serves the actual viewer/renderer/CSS.
    await context.addInitScript(() => {
      const NativeSocket = WebSocket;
      window.__lifecycleFixture = { sockets: 0, acknowledgments: 0 };
      const nativeFetch = window.fetch;
      window.fetch = async (...args) => {
        const response = await nativeFetch(...args);
        if (String(args[0]).endsWith("/api/start")) {
          const json = response.json.bind(response);
          response.json = async () => {
            const body = await json();
            window.__lifecycleFixture.acknowledgments++;
            return body;
          };
        }
        return response;
      };
      window.WebSocket = class FixtureSocket {
        static OPEN = 1;
        readyState = 1;
        constructor(url, protocols) {
          if (!String(url).includes("/api/"))
            return new NativeSocket(url, protocols);
          window.__lifecycleFixture.sockets++;
          window.setTimeout(() => this.onopen?.(), 0);
        }
        send() {}
        close() {
          this.readyState = 3;
          this.onclose?.();
        }
      };
    });
    let currentEpoch = "other-tab-epoch";
    let sequence = 0;
    let failStop = true;
    let rejectCamera = false;
    let deferStart = false;
    let acknowledgeStart;
    let startReached;
    const stops = [];
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const send = (body, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (path === "/api/cameras")
        return send({
          cameras: [{ id: "a".repeat(64), name: "Synthetic named camera" }],
        });
      if (path === "/api/status")
        return send({
          state: currentEpoch ? "running" : "idle",
          epoch: currentEpoch,
        });
      if (path === "/api/start") {
        if (rejectCamera && request.postDataJSON().source === "camera")
          return send(
            { detail: "Synthetic camera disconnected before startup." },
            409,
          );
        if (deferStart)
          await new Promise((resolve) => {
            acknowledgeStart = resolve;
            startReached();
          });
        currentEpoch = `synthetic-epoch-${++sequence}`;
        return send({ state: "running", epoch: currentEpoch });
      }
      if (path === "/api/stop") {
        const epoch = request.postData() ? request.postDataJSON().epoch : null;
        stops.push(epoch);
        if (failStop)
          return send(
            {
              detail:
                "Synthetic driver is still stopping. Wait a moment and retry.",
            },
            409,
          );
        if (!epoch || epoch === currentEpoch) currentEpoch = null;
        return send({
          state: currentEpoch ? "running" : "idle",
          epoch: currentEpoch,
        });
      }
      throw new Error(`Unexpected API request ${path}`);
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#source-demo").click();
    await page.locator("#start").click();
    await page.waitForFunction(() => window.__lifecycleFixture.sockets === 2);
    await page.locator("#stop").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#start").disabled ||
        !document.querySelector("#retry-camera-stop")?.disabled,
    );
    const label = baselineRef ? "before" : "after";
    const failedRelease = {
      startLocked: await page.locator("#start").isDisabled(),
      retryVisible: await page
        .locator("#retry-camera-stop")
        .isVisible()
        .catch(() => false),
      sourceLocked: await page.locator("#source-demo").isDisabled(),
    };
    for (const [name, width, height] of [
      ["desktop", 1440, 1050],
      ["mobile", 390, 844],
      ["narrow", 320, 740],
    ]) {
      await page.setViewportSize({ width, height });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "Viewer overflow",
      );
      await page.screenshot({
        path: resolve(output, `${label}-release-${name}.png`),
        fullPage: true,
      });
    }
    result.checks.push({ scenario: "HTTP 409 release", ...failedRelease });
    if (!baselineRef) {
      assert.deepEqual(failedRelease, {
        startLocked: true,
        retryVisible: true,
        sourceLocked: true,
      });
      failStop = false;
      await page.locator("#retry-camera-stop").click();
      await page.waitForFunction(
        () => !document.querySelector("#start").disabled,
      );
      assert.equal(currentEpoch, null);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: resolve(output, "after-recovered-mobile.png"),
        fullPage: true,
      });
      result.checks.push({
        scenario: "retry releases retained epoch",
        passed: true,
      });
    }
    await page.close();
    failStop = false;
    rejectCamera = true;
    currentEpoch = "other-tab-epoch";
    const crossTab = await context.newPage();
    crossTab.on("pageerror", (error) => errors.push(error.message));
    await crossTab.goto(url, { waitUntil: "networkidle" });
    await crossTab.locator("#start").click();
    await crossTab.waitForFunction(
      () =>
        document.querySelector("#status-title").textContent ===
        "Unable to start",
    );
    const preserved = currentEpoch === "other-tab-epoch";
    result.checks.push({
      scenario: "rejected named camera preserves other tab",
      passed: preserved,
    });
    if (!baselineRef) assert(preserved);
    await crossTab.close();
    rejectCamera = false;
    deferStart = true;
    for (const action of ["stop", "pagehide"]) {
      const pending = await context.newPage();
      pending.on("pageerror", (error) => errors.push(error.message));
      acknowledgeStart = null;
      const requestReached = new Promise((resolve) => {
        startReached = resolve;
      });
      await pending.goto(url, { waitUntil: "networkidle" });
      await pending.locator("#source-demo").click();
      await pending.locator("#start").click();
      await requestReached;
      assert(
        acknowledgeStart,
        "Start route must reach deferred acknowledgment",
      );
      if (action === "stop") await pending.locator("#stop").click();
      else
        await pending.evaluate(() =>
          window.dispatchEvent(
            new PageTransitionEvent("pagehide", { persisted: true }),
          ),
        );
      acknowledgeStart();
      await pending.waitForFunction(
        () => window.__lifecycleFixture.acknowledgments > 0,
      );
      await pending.waitForFunction(
        () =>
          document.querySelector("#start").disabled === false ||
          window.__lifecycleFixture.sockets > 0,
      );
      const sockets = await pending.evaluate(
        () => window.__lifecycleFixture.sockets,
      );
      const released = currentEpoch === null;
      result.checks.push({
        scenario: `late start after ${action}`,
        released,
        socketsCreated: sockets,
      });
      if (!baselineRef) {
        assert(released);
        assert.equal(sockets, 0);
      }
      await pending.close();
    }
    if (!baselineRef) {
      deferStart = false;
      const rendering = await context.newPage();
      rendering.on("pageerror", (error) => errors.push(error.message));
      await rendering.goto(url, { waitUntil: "networkidle" });
      await rendering.locator("#source-demo").click();
      await rendering.locator("#start").click();
      await rendering.waitForFunction(
        () => window.__lifecycleFixture.sockets === 2,
      );
      await rendering.evaluate(() => {
        const canvas = document.querySelector("#skeleton-canvas");
        const context = canvas.getContext("2d");
        context.fillStyle = "#ff00ff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        window.__lifecycleFixture.readPixel = () =>
          Array.from(context.getImageData(0, 0, 1, 1).data);
        canvas.getContext = () => {
          throw new Error("Synthetic renderer failure");
        };
      });
      await rendering.locator("#stop").click();
      await rendering.waitForFunction(
        () => !document.querySelector("#start").disabled,
      );
      assert.equal(currentEpoch, null);
      const pixel = await rendering.evaluate(() =>
        window.__lifecycleFixture.readPixel(),
      );
      assert.notDeepEqual(
        pixel.slice(0, 3),
        [255, 0, 255],
        "Failed renderer retained the old pixels",
      );
      result.checks.push({
        scenario: "renderer failure releases source and clears retained pixels",
        passed: true,
      });
      await rendering.close();
    }
    result.unscopedStops = stops.filter((epoch) => !epoch).length;
    result.stopRequests = stops;
    result.errors = errors;
    if (!baselineRef) assert.equal(result.unscopedStops, 0);
    assert.deepEqual(errors, []);
    await writeFile(
      resolve(output, `${label}-results.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await browser?.close();
  await server.close();
}
