/* global document, window, fetch, AbortSignal */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = resolve(root, "reports/local/maze-calibration");
await mkdir(output, { recursive: true });
const reportOnly = process.argv.includes("--report-only");
const executablePath =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].find(existsSync);
assert(
  executablePath,
  "Use an existing installed Chrome/Edge; no browser download.",
);
const results = {
  mode: "real-vite-http-websocket-synthetic-fixture",
  language: "en",
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  requests: [],
  passed: false,
  limitations: [
    "Generated camera fixture only: no camera, participant footage, inference or hardware accuracy/latency measured.",
    "Two floor mappings do not establish stereo extrinsics, synchronized XYZ, identity or facing; physical maze remains unavailable.",
  ],
};
let server, browser, fixture;
async function serve(appRoot = resolve(root, "apps/mirror")) {
  const instance = await createServer({
    configFile: resolve(root, "vite.config.ts"),
    root: appRoot,
    server: {
      host: "127.0.0.1",
      port: 5194,
      strictPort: true,
      hmr: false,
      proxy: {
        "/api": { target: "http://127.0.0.1:8774", ws: true },
        "/fixture": { target: "http://127.0.0.1:8774" },
      },
    },
    plugins: [
      {
        name: "maze-calibration-report",
        configureServer(vite) {
          vite.middlewares.use(
            "/calibration-report.html",
            async (_request, response, next) => {
              try {
                response.setHeader("Content-Type", "text/html");
                response.end(
                  await readFile(
                    resolve(root, "reports/playtest-maze-calibration.html"),
                  ),
                );
              } catch {
                next();
              }
            },
          );
        },
      },
    ],
  });
  await instance.listen();
  return instance;
}
async function capture(page, name, selector, width = 1440, height = 1050) {
  await page.setViewportSize({ width, height });
  if (selector) await page.locator(selector).scrollIntoViewIfNeeded();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(done)),
    );
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    `${name}: page overflow`,
  );
  const dialog = page.locator("#pre-game-settings");
  if (await dialog.isVisible())
    assert(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
      `${name}: dialog overflow`,
    );
  const filename = `${name}.png`;
  await page.screenshot({
    path: resolve(output, filename),
    fullPage: reportOnly,
  });
  results.screenshots.push(filename);
}
async function waitForFixture() {
  for (let i = 0; i < 80; i++) {
    try {
      if (
        (
          await fetch("http://127.0.0.1:8774/api/status", {
            signal: AbortSignal.timeout(500),
          })
        ).ok
      )
        return;
    } catch {
      // Wait for the task-owned fixture process to bind its local port.
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(
    "Synthetic vision fixture did not start on task-owned port 8774.",
  );
}
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => results.errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api"))
      results.requests.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
      });
  });
  if (reportOnly) {
    server = await serve();
    await page.goto("http://127.0.0.1:5194/calibration-report.html");
    assert.equal(await page.locator("h1").count(), 1);
    await capture(page, "report-desktop", null);
    await capture(page, "report-mobile", null, 390, 844);
    results.checks.push(
      "Standalone embedded HTML report rendered at English desktop/mobile sizes without overflow.",
    );
  } else {
    const baseline = resolve(root, ".local/maze-calibration-before");
    await mkdir(baseline, { recursive: true });
    const archive = resolve(root, ".local/maze-calibration-before.tar");
    execFileSync(
      "git",
      [
        "archive",
        "2cea8d7033a8be02f4f9d7079ecc0e6ca676a6fa",
        "apps/mirror",
        "packages",
        "games",
        "contracts",
        "--output",
        archive,
      ],
      { cwd: root },
    );
    execFileSync("tar", ["-xf", archive, "-C", baseline]);
    server = await serve(resolve(baseline, "apps/mirror"));
    await page.goto("http://127.0.0.1:5194/maze.html");
    await page.locator("#pre-game-settings").waitFor({ state: "visible" });
    await capture(page, "before-desktop", "#maze-source");
    await capture(page, "before-mobile", "#maze-source", 390, 844);
    await page.goto("about:blank");
    await server.close();
    server = null;
    fixture = spawn(
      resolve(
        root,
        process.platform === "win32"
          ? ".venv/Scripts/python.exe"
          : ".venv/bin/python",
      ),
      ["services/vision/tools/maze_calibration_fixture.py"],
      {
        cwd: root,
        env: {
          ...process.env,
          PYTHONPATH: resolve(root, "services/vision"),
          OMP_NUM_THREADS: "2",
          OPENBLAS_NUM_THREADS: "2",
        },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    await waitForFixture();
    server = await serve();
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto("http://127.0.0.1:5194/maze.html");
    await page.locator("#maze-calibration summary").click();
    assert.equal(results.requests.filter((r) => r.method === "POST").length, 0);
    results.checks.push(
      "Page load performs metadata discovery only; no acquisition before explicit Start.",
    );
    await page.locator("#maze-cal-1-camera-choice").selectOption("manual");
    await page
      .locator("#cal-optics")
      .fill("Synthetic full-frame fixture; fixed focus / no zoom");
    await page.locator("#cal-start").click();
    await page.waitForFunction(() =>
      document.querySelector("#cal-frame-label").textContent.startsWith("Live"),
    );
    await capture(page, "live-desktop", "#cal-preview");
    await capture(page, "live-mobile", "#cal-preview", 390, 844);
    await capture(page, "live-narrow", "#cal-preview", 320, 740);
    await page.setViewportSize({ width: 1440, height: 1050 });
    const mark = async (u, v) => {
      await page.locator("#cal-u").fill(String(u * 100));
      await page.locator("#cal-v").fill(String(v * 100));
      await page.locator("#cal-add").click();
    };
    const freeze = async () => {
      const resuming = (
        await page.locator("#cal-freeze").innerText()
      ).startsWith("Resume");
      await page.locator("#cal-freeze").click();
      if (resuming)
        await page.waitForFunction(() =>
          document
            .querySelector("#cal-frame-label")
            .textContent.startsWith("Live"),
        );
    };
    async function measure() {
      await freeze();
      for (const p of [
        [0.1, 0.9],
        [0.9, 0.9],
        [0.9, 0.1],
        [0.1, 0.1],
      ])
        await mark(...p);
      await mark(0.15, 0.8);
      assert.match(
        await page.locator("#cal-result").innerText(),
        /Resume live video/,
      );
      for (const pair of [
        [
          [0.15, 0.8],
          [0.25, 0.8],
        ],
        [
          [0.46464466, 0.53535534],
          [0.53535534, 0.46464466],
        ],
        [
          [0.8, 0.25],
          [0.8, 0.15],
        ],
      ]) {
        await freeze();
        await freeze();
        for (const p of pair) await mark(...p);
      }
      await page.locator("#cal-fit").click();
      await page.waitForFunction(
        () =>
          !document
            .querySelector("#cal-result")
            .textContent.includes("Checking geometry"),
      );
    }
    await measure();
    assert.match(
      await page.locator("#cal-result").innerText(),
      /floor checks passed/,
    );
    await mark(0.5, 0.5);
    assert.match(
      await page.locator("#cal-result").innerText(),
      /X 4.000 m, Z 4.000 m/,
    );
    await mark(0.1, 0.9);
    assert.match(
      await page.locator("#cal-result").innerText(),
      /Marked floor contact:/,
    );
    await mark(0.5, 0.5);
    await capture(page, "checked-desktop", "#cal-result");
    await capture(page, "checked-mobile", "#cal-result", 390, 844);
    results.checks.push(
      "Real HTTP fit and WebSocket JPEG preview: corner labels, moved width/diagonal/depth references, held-out checks and manual (4,4)m floor probe passed against generated geometry.",
    );
    const beforeUrl = page.url();
    await page.evaluate(() =>
      document.querySelector('a[href="/rig.html"]').click(),
    );
    assert.equal(page.url(), beforeUrl);
    assert.match(
      await page.locator("#cal-capture-status").innerText(),
      /Stop calibration/,
    );
    await page.route(
      "**/api/stop",
      (route) =>
        route.fulfill({
          status: 409,
          json: { detail: "Synthetic driver release failure" },
        }),
      { times: 1 },
    );
    await page.locator("#cal-stop").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#cal-capture-status")
        .textContent.includes("release unconfirmed"),
    );
    assert(await page.locator("#cal-start").isDisabled());
    await capture(
      page,
      "release-retry-mobile",
      "#cal-capture-status",
      390,
      844,
    );
    await page.locator("#cal-stop").click();
    await page.waitForFunction(
      () => !document.querySelector("#cal-start").disabled,
    );
    results.checks.push(
      "Active same-tab route link was vetoed; failed acknowledged-epoch release blocked replacement until Stop retry succeeded.",
    );
    await page.locator("#cal-role").selectOption("1");
    await page.locator("#maze-cal-2-camera-choice").selectOption("manual");
    await page.locator("#maze-cal-2-camera-index").fill("1");
    await page
      .locator("#cal-optics")
      .fill("Synthetic alternate view; fixed focus / no zoom");
    await page.locator("#cal-start").click();
    await page.waitForFunction(() =>
      document.querySelector("#cal-frame-label").textContent.startsWith("Live"),
    );
    await measure();
    assert.match(
      await page.locator("#cal-pair-status").innerText(),
      /Camera 1: floor checks passed.*Camera 2: floor checks passed/s,
    );
    await capture(page, "two-roles-desktop", "#cal-pair-status");
    assert(
      await page.locator('#maze-source option[value="physical"]').isDisabled(),
    );
    await fetch("http://127.0.0.1:8774/fixture/geometry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ width: 800, height: 600 }),
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#cal-result")
        .textContent.includes("Image geometry changed"),
    );
    assert.match(
      await page.locator("#cal-pair-status").innerText(),
      /Camera 2: not calibrated/,
    );
    await capture(page, "invalidated-mobile", "#cal-result", 390, 844);
    results.checks.push(
      "Sequential camera 2 retained camera 1's checked snapshot with identical named floor coordinates; new preview dimensions invalidated role 2; physical play stayed disabled.",
    );
    await page.locator("#cal-stop").click();
    await page.waitForFunction(
      () => !document.querySelector("#cal-start").disabled,
    );
    await page.locator("#maze-width").fill("7.5");
    assert.match(
      await page.locator("#cal-pair-status").innerText(),
      /Camera 1: not calibrated/,
    );
    await page.locator("#close-settings").click();
    assert.equal(
      (await fetch("http://127.0.0.1:8774/api/status").then((r) => r.json()))
        .state,
      "idle",
    );
    results.checks.push(
      "Measured field change invalidated both roles; closing setup left the task-owned source idle. English 1440/390/320px layouts had no horizontal overflow.",
    );
  }
  assert.deepEqual(results.errors, []);
  results.passed = true;
} catch (error) {
  results.failure = error.stack || String(error);
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  if (fixture && !fixture.killed && fixture.exitCode === null) {
    fixture.kill();
    await new Promise((done) => fixture.once("exit", done));
  }
  results.completedAt = new Date().toISOString();
  await writeFile(
    resolve(output, reportOnly ? "report-results.json" : "results.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
}
console.log(JSON.stringify(results, null, 2));
