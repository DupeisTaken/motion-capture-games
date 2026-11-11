/* global document, innerWidth */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

// Real local HTTP/WebSocket fixture and Vite UI. No route interception,
// replacement browser networking, hardware capture, inference or private media.
const reportOnly = process.argv.includes("--report-only");
const output = resolve("reports/local/runner-controls");
await mkdir(output, { recursive: true });
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
assert(executablePath, "Use an installed Chromium browser; no download.");
const result = {
  language: "English",
  source: "synthetic HTTP/WebSocket camera-shaped fixture",
  checks: [],
  screenshots: [],
  viewports: [],
  errors: [],
};
const baseline = new Map(
  ["runner.ts", "runner-viewer.ts", "runner.css"].map((file) => [
    file,
    execFileSync(
      "git",
      [
        "show",
        `2cea8d7033a8be02f4f9d7079ecc0e6ca676a6fa:apps/mirror/src/${file}`,
      ],
      { encoding: "utf8" },
    ),
  ]),
);
const fixturePort = 8874;
const fixtureUrl = `http://127.0.0.1:${fixturePort}`;
let fixture, server, browser, activePage;
async function control(value) {
  const response = await fetch(`${fixtureUrl}/fixture/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  assert(response.ok);
}
async function capture(page, name) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `${name}: horizontal overflow`,
  );
  await page.screenshot({
    path: resolve(output, `${name}.png`),
    fullPage: true,
  });
  result.screenshots.push(`${name}.png`);
}
try {
  if (!reportOnly) {
    fixture = spawn(
      resolve(
        ".venv",
        process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
      ),
      ["scripts/fixtures/runner-control-source.py", String(fixturePort)],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          OMP_NUM_THREADS: "2",
          OPENBLAS_NUM_THREADS: "2",
        },
      },
    );
    let logs = "";
    fixture.stderr.on("data", (data) => {
      logs += data;
    });
    for (let attempt = 0; attempt < 60; attempt++) {
      if (fixture.exitCode !== null) throw new Error(`Fixture exited: ${logs}`);
      try {
        if ((await fetch(`${fixtureUrl}/fixture/status`)).ok) break;
      } catch {
        /* Starting. */
      }
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.equal((await fetch(`${fixtureUrl}/fixture/status`)).status, 200);
  }
  server = await createServer({
    server: {
      port: 5274,
      strictPort: true,
      hmr: false,
      proxy: { "/api": { target: fixtureUrl, ws: true } },
    },
    plugins: [
      {
        name: "runner-control-evidence",
        enforce: "pre",
        transform(_source, id) {
          if (!id.includes("runner-baseline")) return;
          const file = id.split("?")[0].replaceAll("\\", "/").split("/").at(-1);
          if (!baseline.has(file)) return;
          let source = baseline.get(file);
          if (file === "runner.ts")
            source = source
              .replace('"./runner.css"', '"./runner.css?runner-baseline=1"')
              .replace(
                '"./runner-viewer"',
                '"./runner-viewer.ts?runner-baseline=1"',
              );
          return source;
        },
        configureServer(vite) {
          vite.middlewares.use(
            "/runner-baseline.html",
            (_request, response) => {
              response.setHeader("Content-Type", "text/html");
              response.end(
                '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Runner baseline</title><div id="app"></div><script type="module" src="/src/runner.ts?runner-baseline=1"></script></html>',
              );
            },
          );
          vite.middlewares.use(
            "/runner-report.html",
            async (_request, response, next) => {
              try {
                response.setHeader("Content-Type", "text/html");
                response.end(
                  await readFile(
                    "reports/playtest-runner-controls.html",
                    "utf8",
                  ),
                );
              } catch (error) {
                next(error);
              }
            },
          );
        },
      },
    ],
  });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  const context = await browser.newContext();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    assert.deepEqual(page.viewportSize(), { width, height });
    result.viewports.push({name, width: await page.evaluate(()=>innerWidth), height});
    activePage = page;
    page.on("pageerror", (error) => result.errors.push(error.message));
    if (reportOnly) {
      await page.goto(new URL("runner-report.html", url).href);
      assert(
        await page
          .locator("img")
          .evaluateAll((images) =>
            images.every((image) => image.complete && image.naturalWidth > 0),
          ),
      );
      await capture(page, `report-${name}`);
      await page.close();
      continue;
    }
    await page.goto(new URL("runner-baseline.html", url).href);
    await page.locator("#source-select").selectOption("camera");
    await capture(page, `before-${name}`);
    await page.goto(new URL("runner.html", url).href);
    assert.equal(
      await page.locator("#game-stage").getAttribute("data-phase"),
      "ready",
    );
    await page.locator("#source-select").selectOption("camera");
    await page.locator("#camera-choice").selectOption("manual");
    await control({
      x: 0.5,
      dy: 0,
      spectator: false,
      turned: false,
      stale: false,
      missing: false,
    });
    await page.locator("#source-connect").click();
    await page.locator("#calibrate-player:not([disabled])").waitFor();
    await page.locator("#calibrate-player").click();
    await page
      .locator("#preview-action")
      .filter({ hasText: "CENTER · STANDING" })
      .waitFor();
    await page.locator("#camera-preview:not([hidden])").waitFor();
    assert.equal(await page.locator("#game-stage").getAttribute("data-phase"),"ready");
    await capture(page, `after-${name}`);
    const expectAction = async (value) =>
      page.locator("#preview-action").filter({ hasText: value }).waitFor();
    await control({ x: 0.75 });
    await expectAction("LEFT");
    await control({ x: 0.25 });
    await expectAction("RIGHT");
    await control({ x: 0.5, dy: 0.11 });
    await expectAction("ROLL");
    await control({ dy: 0 });
    await expectAction("STANDING");
    await control({ dy: -0.07 });
    await expectAction("JUMP");
    await capture(page, `jump-${name}`);
    await control({ dy: 0, turned: true });
    await expectAction("STANDING");
    assert(
      (await page.locator("#preview-thresholds").textContent()).includes(
        "fallback",
      ),
    );
    await control({ turned: false, spectator: true });
    await expectAction("STANDING");
    await page.locator("#start-round").click();
    await page.waitForFunction(
      () => document.querySelector("#game-stage").dataset.phase === "playing",
    );
    await control({missing:true});
    await page.waitForFunction(()=>document.querySelector("#game-stage").dataset.phase==="paused");
    await control({missing:false});
    await page.waitForFunction(()=>document.querySelector("#game-stage").dataset.phase==="playing");
    await control({ stale: true });
    await page.waitForFunction(
      () => document.querySelector("#game-stage").dataset.phase === "paused",
    );
    await page
      .locator("#preview-freshness")
      .filter({ hasText: "STALE" })
      .waitFor();
    assert(await page.locator("#camera-preview").isHidden());
    const frozen = await page.locator("#score-value, #distance-value").allTextContents();
    await capture(page, `stale-${name}`);
    assert.deepEqual(await page.locator("#score-value, #distance-value").allTextContents(), frozen);
    await control({ stale: false });
    // Restart is explicit and creates a new source epoch and standing reference.
    await page.locator("#source-stop").click();
    await page.locator("#source-connect:not([disabled])").waitFor();
    assert.equal(
      await page.locator("#preview-freshness").textContent(),
      "Camera off",
    );
    await page
      .locator("#source-select")
      .isDisabled()
      .then(async (locked) => {
        if (locked) await page.locator("#new-round").click();
      });
    await control({spectator:false});
    await page.locator("#source-connect").click();
    await page.locator("#calibrate-player:not([disabled])").waitFor();
    assert((await page.locator("#practice-status").textContent()).includes("reference first"));
    await page.locator("#calibrate-player").click();
    await expectAction("STANDING");
    await page.locator("#source-stop").click();
    await page.locator("#source-connect:not([disabled])").waitFor();
    await page.locator("#source-select").selectOption("demo");
    assert(await page.locator("#body-preview").isHidden());
    result.checks.push(
      `${name}: mirrored thirds, jump/roll, turning fallback, spectators, same-track recovery countdown, explicit start/restart, stale scoring freeze, preview cleanup, no overflow`,
    );
    await page.close();
  }
  assert.deepEqual(result.errors, []);
  if (!reportOnly)
    result.fixture = await (await fetch(`${fixtureUrl}/fixture/status`)).json();
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({
      path: resolve(output, "failure.png"),
      fullPage: true,
    });
    console.log(await activePage.locator("#camera-controls").textContent());
  }
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  fixture?.kill();
  await writeFile(
    resolve(output, reportOnly ? "report-results.json" : "results.json"),
    JSON.stringify(result, null, 2),
  );
}
console.log(JSON.stringify(result, null, 2));
