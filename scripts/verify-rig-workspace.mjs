/* global window, document, navigator */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const { values } = parseArgs({
  options: {
    "report-only": { type: "boolean", default: false },
    "chrome-executable": { type: "string" },
    baseline: { type: "string", default: "4bd2070" },
  },
});
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
assert(
  executablePath,
  "Supply an installed browser using --chrome-executable; no browser is downloaded.",
);
const output = resolve(root, "reports/local/two-camera-workspace");
await mkdir(output, { recursive: true });
const baselineRef =
  !values["report-only"] &&
  execFileSync(
    "git",
    ["rev-parse", "--verify", `${values.baseline}^{commit}`],
    { cwd: root, encoding: "utf8" },
  ).trim();
const baselineSource =
  baselineRef &&
  execFileSync("git", ["show", `${baselineRef}:apps/mirror/src/main.ts`], {
    cwd: root,
    encoding: "utf8",
  });
const viewports = [
  ["desktop", 1440, 1050],
  ["mobile", 390, 844],
  ["narrow", 320, 740],
];
const result = {
  mode: values["report-only"]
    ? "offline-report"
    : "real-ui-static-solver-rehearsal",
  language: "en",
  headless: true,
  baselineRef: baselineRef || null,
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  requests: [],
  errors: [],
  limitations: [
    "Recorded synthetic observations and actual solver output, not live two-camera capture or physically validated XYZ.",
    "Camera device metadata is a synthetic planning fixture. No camera is opened.",
    "The before-console capture uses synthetic read-only idle status; it is layout evidence, not a running physical service.",
  ],
};
let browser;
let server;
function observe(page) {
  page.on("pageerror", (error) => result.errors.push(error.message));
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type()))
      result.errors.push({
        text: message.text(),
        location: message.location(),
      });
  });
}
const metricText = (value) => Number(value.toFixed(3)).toFixed(3);
async function capture(page, prefix, sizes = viewports) {
  for (const [name, width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `${prefix} overflow at ${width}px`,
    );
    const persistentLimit = page.locator(".rig-persistent-limit");
    if (await persistentLimit.count())
      assert.equal(
        await persistentLimit.evaluate(
          (element) => window.getComputedStyle(element).position,
        ),
        "static",
        "Physical availability status must remain in flow rather than obscuring workspace controls.",
      );
    for (const fullPage of [true, false]) {
      const filename = `${prefix}-${name}${fullPage ? "" : "-top"}.png`;
      await page.screenshot({ path: resolve(output, filename), fullPage });
      result.screenshots.push(filename);
    }
  }
}
try {
  server = await createServer({
    configFile: resolve(root, "vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false },
    plugins: [
      {
        name: "rig-workspace-evidence",
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
            "/rig-report.html",
            async (_request, response, next) => {
              try {
                response.setHeader("Content-Type", "text/html; charset=utf-8");
                response.end(
                  await readFile(
                    resolve(root, "reports/two-camera-workspace.html"),
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
  browser = await chromium.launch({ executablePath, headless: true });
  result.browser = browser.version();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    locale: "en-US",
  });
  context.setDefaultTimeout(10000);
  if (!values["report-only"]) {
    // The rig uses only simulated discovery metadata. The before-console image
    // also uses a labeled idle-status fixture; acquisition remains blocked.
    await context.addInitScript(() => {
      window.__rigAcquisitionAttempts = 0;
      if (navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = async () => {
          window.__rigAcquisitionAttempts++;
          throw new Error(
            "Camera acquisition is outside this planning verification.",
          );
        };
    });
  }
  const page = await context.newPage();
  observe(page);
  if (values["report-only"]) {
    const externalRequests = [];
    page.on("request", (request) => {
      if (!request.url().startsWith(url) && !request.url().startsWith("data:"))
        externalRequests.push(request.url());
    });
    await page.goto(`${url}rig-report.html`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert((await page.locator("h1").innerText()).length > 0);
    assert((await page.locator("img").count()) > 0);
    assert(
      await page
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              image.src.startsWith("data:") &&
              image.complete &&
              image.naturalWidth > 0,
          ),
        ),
    );
    await capture(page, "report");
    for (const [name, width, height] of viewports) {
      await page.setViewportSize({ width, height });
      for (const section of ["evidence", "checks", "limits"]) {
        await page
          .locator(`#${section} h2`)
          .evaluate((heading) => heading.scrollIntoView({ block: "start" }));
        const filename = `report-${name}-${section}.png`;
        await page.screenshot({ path: resolve(output, filename) });
        result.screenshots.push(filename);
      }
      const reviews = page.locator("#checks .cards");
      if (await reviews.locator("article").count()) {
        const filename = `report-${name}-reviews.png`;
        await reviews.screenshot({ path: resolve(output, filename) });
        result.screenshots.push(filename);
      }
    }
    assert.deepEqual(externalRequests, []);
    result.checks.push(
      "Self-contained English report and embedded screenshots render at desktop/mobile/narrow widths.",
    );
  } else {
    const rawDataset = await readFile(
      resolve(root, "apps/mirror/src/rig-rehearsal.json"),
      "utf8",
    );
    const dataset = JSON.parse(rawDataset);
    assert.equal(dataset.origin, "synthetic-rehearsal");
    assert.equal(dataset.recorded, true);
    assert(
      dataset.cases.some((scenario) => scenario.id === "stale-input"),
      "Recorded stale-input coverage is required.",
    );
    result.dataset = {
      sha256: createHash("sha256").update(rawDataset).digest("hex"),
      cases: dataset.cases.length,
      frames: dataset.cases.reduce(
        (count, scenario) => count + scenario.frames.length,
        0,
      ),
      method: "midpoint",
    };
    const a = { id: "a".repeat(64), name: "Synthetic USB camera" };
    const b = { id: "b".repeat(64), name: "Synthetic USB camera" };
    let cameras = [a, b];
    let metadataFailure = false;
    let baselineConsole = true;
    result.baselineStatus =
      "Synthetic idle status; no physical service or camera was used for the before-console capture.";
    await context.routeWebSocket("**/api/**", (socket) => {
      result.errors.push(
        `Forbidden acquisition/stream connection: ${socket.url()}`,
      );
      socket.close();
    });
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      result.requests.push({ method: request.method(), path });
      if (
        baselineConsole &&
        path === "/api/status" &&
        request.method() === "GET"
      ) {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            state: "idle",
            epoch: null,
            models: { rtmpose: false, mediapipe: false },
          }),
        });
        return;
      }
      if (path !== "/api/cameras" || request.method() !== "GET") {
        result.errors.push(
          `Forbidden acquisition/control request: ${request.method()} ${path}`,
        );
        await route.abort("blockedbyclient");
        return;
      }
      // A successful HTTP envelope with invalid metadata exercises discovery
      // recovery without creating an unrelated expected browser HTTP error.
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(metadataFailure ? { cameras: null } : { cameras }),
      });
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await capture(page, "before-console");
    assert.equal(await page.evaluate(() => window.__rigAcquisitionAttempts), 0);
    result.baselineRequests = [...result.requests];
    baselineConsole = false;
    result.requests = [];
    await page.goto(`${url}rig.html`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#rig-load-error").isVisible(), false);
    assert.equal(
      result.requests.length,
      0,
      "Rehearsal must not enumerate or acquire cameras.",
    );
    const allIds = await page
      .locator("[id]")
      .evaluateAll((elements) => elements.map((element) => element.id));
    assert.equal(
      new Set(allIds).size,
      allIds.length,
      "Workspace has duplicate HTML IDs.",
    );
    await capture(page, "after-rig");
    result.scenarios = [];
    for (const scenario of dataset.cases) {
      await page.locator("#rig-scenario").selectOption(scenario.id);
      const frame = scenario.frames[0];
      const available = frame.reconstruction.joints.filter(
        (joint) => joint.reason === "observed",
      ).length;
      for (const axis of ["x", "y", "z"]) {
        assert.equal(
          await page.locator(`#rig-${axis}`).innerText(),
          frame.reconstruction.root
            ? metricText(frame.reconstruction.root[axis])
            : "Unavailable",
          `${scenario.id} ${axis} must match the recorded solver output.`,
        );
        assert.equal(
          await page.locator(`#rig-reference-${axis}`).innerText(),
          metricText(frame.reference.root[axis]),
        );
      }
      assert.equal(
        await page.locator("#rig-joint-count").innerText(),
        `${available} / ${frame.reconstruction.joints.length}`,
      );
      const differenceCm = frame.reconstruction.root
        ? Math.hypot(
            ...["x", "y", "z"].map(
              (axis) =>
                frame.reconstruction.root[axis] - frame.reference.root[axis],
            ),
          ) * 100
        : null;
      assert.equal(
        await page.locator("#rig-reference-difference").innerText(),
        differenceCm === null ? "Unavailable" : `${differenceCm.toFixed(1)} cm`,
      );
      if (scenario.id === "scale-bias")
        assert(
          differenceCm > 10,
          "Bias case must expose an accepted but incorrect estimate against independent reference truth.",
        );
      assert.equal(
        await page.locator("#rig-physical-state").innerText(),
        "Physical XYZ unavailable",
      );
      assert.equal(
        await page.locator("#rig-maze-state").innerText(),
        "Maze input disabled",
      );
      const quality = await page.locator("#rig-quality").innerText();
      assert(quality.length > 0);
      if (scenario.id === "missing-hip")
        assert.match(quality, /Left hip — Missing joint observations/);
      if (scenario.id === "exposure-skew") {
        await page.locator("#rig-joint-details summary").click();
        assert.match(
          await page.locator("#rig-rejected-joints").innerText(),
          /Left wrist — Exposure pair is too far apart/,
        );
      }
      const status = await page
        .locator("#rig-sample-state")
        .getAttribute("data-state");
      if (scenario.id === "stale-input") {
        assert.equal(frame.reconstruction.root, null);
        assert.equal(status, "unavailable");
        assert.match(quality, /stale/i);
      }
      assert.equal(
        status,
        available === 0
          ? "unavailable"
          : frame.reconstruction.root &&
              available === frame.reconstruction.joints.length
            ? "sample-available"
            : "partial",
      );
      result.scenarios.push({
        id: scenario.id,
        rootAvailable: Boolean(frame.reconstruction.root),
        availableJoints: available,
        referenceDifferenceCm: differenceCm,
        status,
        quality,
      });
      if (["missing-hip", "scale-bias"].includes(scenario.id))
        await capture(page, `case-${scenario.id}`, [viewports[0]]);
      if (scenario.id === "weak-geometry") {
        result.weakGeometryLabels = [];
        for (const [name, width, height] of viewports) {
          await page.setViewportSize({ width, height });
          const labels = await page
            .locator("#rig-space text")
            .evaluateAll((elements) =>
              elements
                .filter((element) =>
                  [
                    "Reference",
                    "Supporting",
                    "Display / floor origin",
                  ].includes(element.textContent),
                )
                .map((element) => {
                  const box = element.getBoundingClientRect();
                  return {
                    text: element.textContent,
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height,
                  };
                }),
            );
          assert.equal(labels.length, 3);
          for (let i = 0; i < labels.length; i++)
            for (let j = i + 1; j < labels.length; j++) {
              const a = labels[i],
                b = labels[j];
              assert(
                a.x + a.width <= b.x ||
                  b.x + b.width <= a.x ||
                  a.y + a.height <= b.y ||
                  b.y + b.height <= a.y,
                `Weak-geometry labels overlap at ${width}px.`,
              );
            }
          result.weakGeometryLabels.push({ viewport: name, labels });
        }
        await capture(page, "case-weak-geometry", [viewports[2]]);
      }
    }
    assert.equal(result.requests.length, 0);
    result.checks.push(
      `All ${dataset.cases.length} recorded solver scenarios display their own estimates/reference, accepted joints and unavailable/partial reasons, including stale input; physical XYZ and maze input remain disabled.`,
    );
    await page.locator("#rig-scenario").selectOption("nominal");
    const nominal = dataset.cases.find((scenario) => scenario.id === "nominal");
    assert(
      nominal.frames.length >= 3,
      "Playback acceptance needs at least three recorded samples.",
    );
    const lastFrame = nominal.frames.length - 1;
    const middleFrame = Math.floor(lastFrame / 2);
    await page.locator("#rig-frame").fill(String(middleFrame));
    const scrubbedRoot = nominal.frames[middleFrame].reconstruction.root;
    for (const axis of ["x", "y", "z"])
      assert.equal(
        await page.locator(`#rig-${axis}`).innerText(),
        metricText(scrubbedRoot[axis]),
      );
    assert.equal(
      await page.locator("#rig-frame-label").innerText(),
      `${middleFrame + 1} / ${nominal.frames.length}`,
    );
    await page.locator("#rig-view-pair").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.locator("#rig-frame").inputValue(),
      String(middleFrame + 1),
    );
    await page.keyboard.press("ArrowLeft");
    assert.equal(
      await page.locator("#rig-frame").inputValue(),
      String(middleFrame),
    );
    await page.keyboard.press("Space");
    await page.waitForFunction(
      (index) => Number(document.querySelector("#rig-frame").value) > index,
      middleFrame,
    );
    await page.locator("#rig-play").click();
    const paused = await page.locator("#rig-frame").inputValue();
    await page.waitForTimeout(350);
    assert.equal(await page.locator("#rig-frame").inputValue(), paused);
    await page.locator("#rig-reset").click();
    assert.equal(await page.locator("#rig-frame").inputValue(), "0");
    assert(await page.locator("#rig-previous").isDisabled());
    await page.locator("#rig-frame").fill(String(lastFrame));
    assert(await page.locator("#rig-next").isDisabled());
    await page.locator("#rig-play").click();
    await page.waitForFunction(
      () => Number(document.querySelector("#rig-frame").value) >= 1,
    );
    await page.locator("#rig-tab-planning").click();
    const modePaused = await page.locator("#rig-frame").inputValue();
    await page.waitForTimeout(350);
    assert.equal(await page.locator("#rig-frame").inputValue(), modePaused);
    assert.equal(await page.locator("#rig-play").innerText(), "Play samples");
    assert.equal(await page.locator("#rig-x").isVisible(), false);
    assert.equal(
      result.requests.length,
      0,
      "Entering planning must wait for explicit Refresh.",
    );
    result.checks.push(
      "Scrub, keyboard stepping/playback, pause, reset and bounded end controls work; changing mode stops rehearsal and hides simulated coordinates.",
    );
    for (const prefix of ["reference", "support"]) {
      await page.locator(`#${prefix}-refresh-cameras`).click();
      await page.waitForFunction(
        (id) =>
          document
            .querySelector(`#${id}-camera-choice`)
            .getAttribute("aria-busy") === "false",
        prefix,
      );
      assert.equal(
        await page.locator(`#${prefix}-camera-choice`).inputValue(),
        "",
      );
    }
    for (const id of [
      "rig-placement-notes",
      "rig-calibration-notes",
      "rig-timing-notes",
    ])
      await page
        .locator(`#${id}`)
        .fill("Synthetic planning note; physical evidence not collected.");
    await page.locator("#reference-camera-choice").selectOption(a.id);
    await page.locator("#support-camera-choice").selectOption(a.id);
    assert.match(
      await page.locator("#rig-plan-result").innerText(),
      /different|distinct|same/i,
    );
    await page.locator("#support-camera-choice").selectOption(b.id);
    await page.locator(".rig-plan-check").click();
    assert.match(
      await page.locator("#rig-plan-result").innerText(),
      /Two distinct device roles/,
    );
    await capture(page, "physical-plan");
    cameras = [b, a];
    await page.locator("#support-refresh-cameras").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#support-camera-choice")
          .getAttribute("aria-busy") === "false",
    );
    assert.equal(
      await page.locator("#support-camera-choice").inputValue(),
      b.id,
    );
    assert.equal(
      await page.locator("#reference-camera-choice").inputValue(),
      a.id,
    );
    cameras = [a];
    await page.locator("#support-refresh-cameras").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#support-camera-choice")
          .getAttribute("aria-busy") === "false",
    );
    assert.equal(await page.locator("#support-camera-choice").inputValue(), "");
    assert.match(
      await page.locator("#support-camera-choice-status").innerText(),
      /disconnected/,
    );
    assert.notEqual(
      await page.locator("#rig-plan-result").getAttribute("data-state"),
      "sample",
    );
    metadataFailure = true;
    await page.locator("#support-refresh-cameras").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#support-camera-choice")
          .getAttribute("aria-busy") === "false",
    );
    assert.match(
      await page.locator("#support-camera-choice-status").innerText(),
      /invalid device list.*Retry Refresh/,
    );
    metadataFailure = false;
    cameras = [a, b];
    await page.locator("#support-refresh-cameras").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#support-camera-choice")
          .getAttribute("aria-busy") === "false",
    );
    await page.locator("#support-camera-choice").selectOption(b.id);
    assert.match(
      await page.locator("#rig-plan-result").innerText(),
      /Two distinct device roles/,
    );
    await page.locator("#support-camera-choice").selectOption("manual");
    await page.locator("#support-camera-index").fill("0");
    assert.match(
      await page.locator("#rig-plan-result").innerText(),
      /Manual indices do not establish two distinct/,
    );
    assert.equal(
      await page.locator("#rig-physical-state").innerText(),
      "Physical XYZ unavailable",
    );
    assert.equal(
      await page.locator("#rig-maze-state").innerText(),
      "Maze input disabled",
    );
    await page.locator("#rig-tab-planning").focus();
    await page.keyboard.press("Home");
    assert.equal(
      await page.locator("#rig-tab-rehearsal").getAttribute("aria-selected"),
      "true",
    );
    assert.equal(await page.locator("#rig-planning").isVisible(), false);
    assert.equal(await page.locator("#rig-rehearsal").isVisible(), true);
    assert.equal(
      await page.locator("#rig-physical-state").innerText(),
      "Physical XYZ unavailable",
    );
    assert.equal(await page.evaluate(() => window.__rigAcquisitionAttempts), 0);
    assert(
      result.requests.every(
        (request) =>
          request.method === "GET" && request.path === "/api/cameras",
      ),
    );
    result.acquisitionAttempts = 0;
    result.checks.push(
      "Distinct camera-role metadata preserves stable identities through reorder, clears disconnects, rejects duplicates/manual identity claims, and recovers invalid discovery metadata; no capture request or getUserMedia call occurs.",
    );
  }
  assert.deepEqual(result.errors, []);
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.failure = error.stack || String(error);
  throw error;
} finally {
  result.completedAt = new Date().toISOString();
  try {
    await browser?.close();
  } finally {
    await server?.close();
    await writeFile(
      resolve(
        output,
        values["report-only"] ? "report-results.json" : "results.json",
      ),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  }
}
console.log(JSON.stringify(result, null, 2));
