/* global window, document, navigator, Event, Node */
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
    baseline: {
      type: "string",
      default: "cc8b13c99fb2af67a4cb7b6ed96c241958ac7b38",
    },
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
  "Supply an installed browser with --chrome-executable; no browser is downloaded.",
);
const output = resolve(root, "reports/local/displayed-camera");
await mkdir(output, { recursive: true });
const baselineRef =
  !values["report-only"] &&
  execFileSync(
    "git",
    ["rev-parse", "--verify", `${values.baseline}^{commit}`],
    { cwd: root, encoding: "utf8" },
  ).trim();
const snapshots = new Map();
if (baselineRef)
  for (const file of ["rig.ts", "rig.css", "rig-renderer.ts"])
    snapshots.set(
      file,
      execFileSync("git", ["show", `${baselineRef}:apps/mirror/src/${file}`], {
        cwd: root,
        encoding: "utf8",
      }),
    );
const viewports = [
  ["desktop", 1440, 1050],
  ["mobile", 390, 844],
  ["narrow", 320, 740],
];
const result = {
  mode: values["report-only"] ? "offline-report" : "real-ui-gameplay-camera",
  language: "en",
  headless: true,
  baselineRef: baselineRef || null,
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  requests: [],
  errors: [],
  limitations: [
    "Actual Slap a Mole Practice/Touch game with pointer/keyboard input and a selected recorded synthetic background. Recorded bodies and XYZ do not drive scoring; no physical capture or accuracy claim.",
    "Planning uses synthetic device metadata. Acquisition requests, streams and getUserMedia are blocked and counted.",
    "Baseline snapshots the rig entry, stylesheet and renderer at the recorded commit, with current shared imports and recorded data.",
  ],
};
let server;
let browser;
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
async function capture(page, prefix, sizes = viewports) {
  for (const [name, width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      offenders: Array.from(document.querySelectorAll("body *"))
        .filter((element) => !element.closest(".table-wrap"))
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            element: element.tagName.toLowerCase(),
            id: element.id,
            className: element.getAttribute("class"),
            right: box.right,
            left: box.left,
            width: box.width,
            text: element.textContent.slice(0, 100),
          };
        })
        .filter(
          (box) =>
            box.width > 0 &&
            (box.right > window.innerWidth + 1 || box.left < -1),
        )
        .slice(0, 12),
    }));
    if (layout.scrollWidth > layout.viewportWidth)
      (result.overflows ??= []).push({ prefix, viewport: name, ...layout });
    assert(
      layout.scrollWidth <= layout.viewportWidth,
      `${prefix} overflows at ${width}px. ${JSON.stringify(layout.offenders)}`,
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
        name: "displayed-camera-evidence",
        enforce: "pre",
        transform(_source, id) {
          if (!id.includes("displayed-baseline")) return;
          const file = id.split("?")[0].replaceAll("\\", "/").split("/").at(-1);
          if (!snapshots.has(file)) return;
          let source = snapshots.get(file);
          if (file === "rig.ts")
            source = source
              .replace('"./rig.css"', '"./rig.css?displayed-baseline=1"')
              .replace(
                '"./rig-renderer"',
                '"./rig-renderer.ts?displayed-baseline=1"',
              );
          return source;
        },
        configureServer(vite) {
          vite.middlewares.use(
            "/displayed-baseline.html",
            (_request, response) => {
              response.setHeader("Content-Type", "text/html; charset=utf-8");
              response.end(
                '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Before displayed-camera selection</title></head><body><div id="app"></div><script type="module" src="/src/rig.ts?displayed-baseline=1"></script></body></html>',
              );
            },
          );
          vite.middlewares.use(
            "/displayed-report.html",
            async (_request, response, next) => {
              try {
                response.setHeader("Content-Type", "text/html; charset=utf-8");
                response.end(
                  await readFile(
                    resolve(root, "reports/displayed-camera.html"),
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
    hasTouch: true,
  });
  context.setDefaultTimeout(10000);
  if (!values["report-only"]) {
    await context.addInitScript(() => {
      window.__displayedAcquisitionAttempts = 0;
      if (navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = async () => {
          window.__displayedAcquisitionAttempts++;
          throw new Error("Acquisition is outside this synthetic acceptance.");
        };
    });
    await context.routeWebSocket("**/api/**", (socket) => {
      result.errors.push(`Forbidden stream: ${socket.url()}`);
      socket.close();
    });
    await context.route("**/api/**", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      result.requests.push({ method: request.method(), path });
      if (request.method() !== "GET" || path !== "/api/cameras") {
        result.errors.push(
          `Forbidden acquisition/control: ${request.method()} ${path}`,
        );
        await route.abort("blockedbyclient");
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          cameras: [
            { id: "a".repeat(64), name: "Synthetic reference camera" },
            { id: "b".repeat(64), name: "Synthetic supporting camera" },
          ],
        }),
      });
    });
  }
  const page = await context.newPage();
  observe(page);
  if (values["report-only"]) {
    const external = [];
    page.on("request", (request) => {
      if (!request.url().startsWith(url) && !request.url().startsWith("data:"))
        external.push(request.url());
    });
    await page.goto(`${url}displayed-report.html`, {
      waitUntil: "networkidle",
    });
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
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
      for (const section of ["checks", "limits"]) {
        await page
          .locator(`#${section} h2`)
          .evaluate((heading) => heading.scrollIntoView({ block: "start" }));
        const filename = `report-${name}-${section}.png`;
        await page.screenshot({ path: resolve(output, filename) });
        result.screenshots.push(filename);
      }
      const reviews = page.locator("#reviews");
      if (await reviews.locator("article").count()) {
        const filename = `report-${name}-reviews.png`;
        await reviews.screenshot({ path: resolve(output, filename) });
        result.screenshots.push(filename);
      }
    }
    assert.deepEqual(external, []);
    result.checks.push(
      "Offline English report, embedded images and responsive layout verified at three widths.",
    );
  } else {
    const bytes = await readFile(
      resolve(root, "apps/mirror/src/rig-rehearsal.json"),
    );
    const dataset = JSON.parse(bytes);
    result.datasetSha256 = createHash("sha256").update(bytes).digest("hex");
    await page.goto(`${url}displayed-baseline.html`, {
      waitUntil: "networkidle",
    });
    await capture(page, "before-rig");
    await page.goto(`${url}rig.html`, { waitUntil: "networkidle" });
    const primary = dataset.cases[0].frames[0].views.find(
      (v) => v.role === "primary",
    ).cameraId;
    const secondary = dataset.cases[0].frames[0].views.find(
      (v) => v.role === "secondary",
    ).cameraId;
    const preference = "motion-studio.rig.synthetic-displayed-camera.v1";
    const choose = (id) =>
      page.locator("#rig-displayed-camera").selectOption(id);
    const score = (target) =>
      target.locator("#rig-game-score").innerText().then(Number);
    const phase = (target) =>
      target.locator("#rig-game-stage").getAttribute("data-phase");
    const diagnostics = () =>
      page.evaluate(() =>
        JSON.stringify({
          html: ["rig-reference-view", "rig-support-view", "rig-space"].map(
            (id) => document.getElementById(id).innerHTML,
          ),
          text: [
            "rig-x",
            "rig-y",
            "rig-z",
            "rig-track",
            "rig-reference-context",
            "rig-support-context",
          ].map((id) => document.getElementById(id).textContent),
        }),
      );
    assert.equal(
      await page.locator("#rig-selected-stage").count(),
      0,
      "The third skeleton output must be removed.",
    );
    assert.equal(
      await page.locator("#rig-game-inline").getAttribute("open"),
      null,
    );
    assert.equal(await page.locator("#rig-reference-view").isVisible(), true);
    assert.equal(await page.locator("#rig-support-view").isVisible(), true);
    assert(
      await page.evaluate(() =>
        Boolean(
          document
            .querySelector("#rig-view-pair")
            .compareDocumentPosition(
              document.querySelector(".rig-space-panel"),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    );
    assert(
      await page.evaluate(() =>
        Boolean(
          document
            .querySelector(".rig-space-panel")
            .compareDocumentPosition(
              document.querySelector("#rig-gameplay-host"),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
    );
    const before = await diagnostics();
    await choose(secondary);
    assert.equal(await diagnostics(), before);
    assert.equal(
      await page.locator("#rig-game-stage").getAttribute("data-camera-id"),
      secondary,
    );
    await capture(page, "after-operator");
    await capture(page, "after-operator", [["tablet", 800, 1000]]);
    const gates = JSON.parse(
      await readFile(resolve(root, "configs/xyz-experiment.json"), "utf8"),
    ).gates;
    result.matrix = await page.evaluate(
      ({ cases, gates }) => {
        const scenario = document.querySelector("#rig-scenario"),
          slider = document.querySelector("#rig-frame"),
          selection = document.querySelector("#rig-displayed-camera");
        const failures = [],
          states = {};
        let selections = 0;
        const snapshot = () =>
          JSON.stringify(
            [
              "rig-reference-view",
              "rig-support-view",
              "rig-space",
              "rig-x",
              "rig-y",
              "rig-z",
              "rig-track",
            ].map((id) => document.getElementById(id).innerHTML),
          );
        for (const item of cases) {
          scenario.value = item.id;
          scenario.dispatchEvent(new Event("change", { bubbles: true }));
          for (const [index, frame] of item.frames.entries()) {
            slider.value = String(index);
            slider.dispatchEvent(new Event("input", { bubbles: true }));
            const original = snapshot();
            for (const view of frame.views) {
              selection.value = view.cameraId;
              selection.dispatchEvent(new Event("change", { bubbles: true }));
              const stage = document.querySelector("#rig-game-stage");
              selections++;
              const status = stage.dataset.sourceState;
              states[status] = (states[status] || 0) + 1;
              const label = `${item.id}/${index}/${view.cameraId}`;
              const check = (condition, detail) => {
                if (!condition) failures.push(`${label}: ${detail}`);
              };
              const sourceTime = BigInt(view.timeNs),
                uncertainty = BigInt(view.uncertaintyNs),
                evaluated = BigInt(frame.evaluatedAtNs);
              const points = new Map(
                view.joints
                  .filter(
                    (joint) =>
                      joint.x !== null &&
                      joint.y !== null &&
                      joint.x >= 0 &&
                      joint.y >= 0 &&
                      joint.x < view.imageSize[0] &&
                      joint.y < view.imageSize[1],
                  )
                  .map((joint) => [joint.name, joint]),
              );
              const allowed =
                points.size > 0 &&
                view.clockDomain === "mapped-host" &&
                sourceTime + uncertainty <= evaluated &&
                evaluated - (sourceTime - uncertainty) <=
                  BigInt(gates.max_age_ns) &&
                uncertainty <= BigInt(gates.max_time_uncertainty_ns) &&
                view.timeVerified &&
                view.timestampKind !== "host-read-completion" &&
                view.identityConfirmed &&
                view.rigTrackId !== null;
              const scene = document.querySelector("#rig-game-scene");
              if (!allowed) {
                check(
                  status === "unavailable",
                  "quality gate advertised gameplay availability",
                );
                check(
                  scene.hasAttribute("hidden") && scene.children.length === 0,
                  "invalid source retained gameplay artwork",
                );
              } else {
                check(
                  status ===
                    (points.size === view.joints.length ? "usable" : "partial"),
                  "source availability mismatch",
                );
                check(
                  scene.getAttribute("viewBox") ===
                    `0 0 ${view.imageSize.join(" ")}`,
                  "source image geometry mismatch",
                );
                const background = scene.querySelector("#rig-game-background");
                check(
                  background?.getAttribute("data-camera-id") === view.cameraId,
                  "wrong source backdrop",
                );
                const nose = points.get("nose"),
                  head = background?.querySelector('[data-joint="nose"]');
                check(
                  nose
                    ? !!head &&
                        Number(head.getAttribute("cx")) === nose.x &&
                        Number(head.getAttribute("cy")) === nose.y
                    : !head,
                  "source head geometry mismatch",
                );
                for (const segment of background?.querySelectorAll(
                  "[data-from-joint]",
                ) || []) {
                  const from = points.get(
                      segment.getAttribute("data-from-joint"),
                    ),
                    to = points.get(segment.getAttribute("data-to-joint"));
                  check(
                    !!from &&
                      !!to &&
                      Number(segment.getAttribute("x1")) === from.x &&
                      Number(segment.getAttribute("y1")) === from.y &&
                      Number(segment.getAttribute("x2")) === to.x &&
                      Number(segment.getAttribute("y2")) === to.y,
                    "source limb geometry mismatch",
                  );
                }
              }
              if (
                stage.dataset.cameraId !== view.cameraId ||
                snapshot() !== original
              )
                failures.push(
                  `${item.id}/${index}/${view.cameraId}: source or diagnostics changed`,
                );
              if (
                document.querySelector("#rig-game-score").textContent.trim() !==
                  "0" &&
                Number(
                  document.querySelector("#rig-game-score").textContent,
                ) !== 0
              )
                failures.push(
                  `${item.id}/${index}: diagnostic replay scored without game input`,
                );
            }
          }
        }
        return {
          cases: cases.length,
          recordedFrames: cases.reduce((sum, c) => sum + c.frames.length, 0),
          selections,
          states,
          failures,
        };
      },
      { cases: dataset.cases, gates },
    );
    assert.equal(result.matrix.selections, 144);
    assert.deepEqual(result.matrix.failures, []);
    result.checks.push(
      "All 144 recorded source selections retain both operator views, XYZ and zero gameplay score; changing a diagnostic sample cannot manufacture a hit.",
    );
    await page.locator("#rig-scenario").selectOption("nominal");
    await choose(secondary);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(
      await page.locator("#rig-displayed-camera").inputValue(),
      secondary,
    );
    await page.evaluate(
      (key) => window.localStorage.setItem(key, "missing-recorded-camera"),
      preference,
    );
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(
      await page.locator("#rig-displayed-camera").inputValue(),
      "missing-recorded-camera",
    );
    assert.match(
      await page.locator("#rig-selected-unavailable").innerText(),
      /unavailable/i,
    );
    await capture(page, "selected-unavailable", [viewports[0]]);
    await choose(primary);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.locator("#rig-game-start").click();
    await page
      .locator("#rig-game-target")
      .waitFor({ state: "visible", timeout: 8000 });
    async function targetState(target) {
      return target.locator("#rig-game-target").evaluate((el) => ({
        x: Number(el.dataset.x),
        y: Number(el.dataset.y),
        radius: Number(el.dataset.radius),
      }));
    }
    async function alignedTarget(target) {
      await target.locator("#rig-game-scene").scrollIntoViewIfNeeded();
      const item = await targetState(target);
      const scene = await target.locator("#rig-game-scene").boundingBox();
      const viewBox = await target
        .locator("#rig-game-scene")
        .getAttribute("viewBox");
      const [, , width, height] = viewBox.split(/\s+/).map(Number);
      const scale = Math.min(scene.width / width, scene.height / height);
      const rect = {
        x: scene.x + (scene.width - width * scale) / 2,
        y: scene.y + (scene.height - height * scale) / 2,
        width: width * scale,
        height: height * scale,
      };
      const sprite = await target.locator("#rig-game-target").evaluate((el) => {
        // Art bounds are asymmetric; verify the rendered game-coordinate center.
        const point = el.createSVGPoint();
        point.x = 60;
        point.y = 55;
        const projected = point.matrixTransform(el.getScreenCTM());
        return { x: projected.x, y: projected.y };
      });
      const expected = {
        x: rect.x + (1 - item.x) * rect.width,
        y: rect.y + item.y * rect.height,
      };
      result.projection = { item, scene, viewBox, sprite, rect, expected };
      assert(
        Math.abs(sprite.x - expected.x) < 1,
        "Game target and mirrored source must share X mapping.",
      );
      assert(
        Math.abs(sprite.y - expected.y) < 1,
        "Game target and source must share Y mapping.",
      );
      return { item, rect, expected };
    }
    async function hit(target) {
      const old = await score(target);
      const { expected } = await alignedTarget(target);
      await target.mouse.move(expected.x, expected.y);
      await target.waitForFunction(
        (value) =>
          Number(document.querySelector("#rig-game-score").textContent) > value,
        old,
      );
      return score(target);
    }
    result.primaryScore = await hit(page);
    for (const [name, width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await page
        .locator("#rig-game-stage")
        .screenshot({ path: resolve(output, `game-primary-${name}.png`) });
      result.screenshots.push(`game-primary-${name}.png`);
    }
    await page.locator("#rig-game-pause").click();
    await page.setViewportSize({ width: 1440, height: 1050 });
    const preserved = {
      score: await score(page),
      phase: await phase(page),
      target: await targetState(page),
      diagnostics: await diagnostics(),
    };
    await choose(secondary);
    assert.equal(await score(page), preserved.score);
    assert.equal(await phase(page), preserved.phase);
    assert.deepEqual(await targetState(page), preserved.target);
    assert.equal(await diagnostics(), preserved.diagnostics);
    assert.equal(
      await page.locator("#rig-game-scene").getAttribute("preserveAspectRatio"),
      "xMidYMid meet",
    );
    await page.locator("#rig-game-resume").click();
    await page
      .locator("#rig-game-target")
      .waitFor({ state: "visible", timeout: 6000 });
    // Move away first: each new contact is an explicit pointer action.
    const scene = await page.locator("#rig-game-scene").boundingBox();
    await page.mouse.move(
      scene.x + scene.width / 2,
      scene.y + scene.height * 0.15,
    );
    result.secondaryScore = await hit(page);
    assert(result.secondaryScore > result.primaryScore);
    await page
      .locator("#rig-game-stage")
      .screenshot({ path: resolve(output, "game-secondary-desktop.png") });
    result.screenshots.push("game-secondary-desktop.png");
    const opening = page.waitForEvent("popup");
    await page.locator("#rig-game-open").click();
    const popup = await opening;
    observe(popup);
    await popup.locator("#rig-game-scene").waitFor();
    assert.equal(await page.locator("#rig-game-stage").count(), 0);
    assert.equal(await page.locator("#rig-reference-view").isVisible(), true);
    assert.equal(await page.locator("#rig-support-view").isVisible(), true);
    assert.equal(
      await popup
        .locator(
          "#rig-reference-view,#rig-support-view,#rig-space,#rig-selected-context",
        )
        .count(),
      0,
    );
    assert.match(await popup.locator("body").innerText(), /Slap a Mole/);
    await choose(primary);
    assert.equal(
      await popup.locator("#rig-game-stage").getAttribute("data-camera-id"),
      primary,
    );
    await alignedTarget(popup);
    await capture(popup, "popup");
    const popupScore = await score(popup);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(
      await phase(popup),
      "playing",
      "A visible gameplay window must continue when only the operator is hidden.",
    );
    await popup.close();
    await page.locator("#rig-game-stage").waitFor();
    assert.equal(await score(page), popupScore);
    assert.equal(await phase(page), "paused");
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.locator("#rig-scenario").selectOption("stale-input");
    assert.equal(await phase(page), "paused");
    assert.equal(await score(page), popupScore);
    assert.equal(await page.locator("#rig-game-target").isVisible(), false);
    await capture(page, "selected-stale", [viewports[0]]);
    await page.locator("#rig-scenario").selectOption("uncertain-identity");
    assert.equal(await phase(page), "paused");
    assert.equal(await score(page), popupScore);
    await page.locator("#rig-scenario").selectOption("nominal");
    assert.equal(
      await phase(page),
      "paused",
      "Source recovery requires explicit Resume.",
    );
    await page.locator("#rig-game-resume").click();
    await page
      .locator("#rig-game-target")
      .waitFor({ state: "visible", timeout: 6000 });
    const reopen = page.waitForEvent("popup");
    await page.locator("#rig-game-open").click();
    const nextPopup = await reopen;
    observe(nextPopup);
    await page.locator("#rig-tab-planning").click();
    if (!nextPopup.isClosed()) await nextPopup.waitForEvent("close");
    assert.equal(await page.locator("#rig-game-stage").isVisible(), false);
    assert.equal(await page.locator("#rig-reference-view").isVisible(), false);
    assert.equal(await page.locator("#rig-x").isVisible(), false);
    assert.equal(await phase(page), "paused");
    await capture(page, "planning");
    await page.locator("#rig-tab-rehearsal").click();
    assert.equal(await score(page), popupScore);
    assert.equal(await phase(page), "paused");
    assert.equal(
      await page.locator("#rig-physical-state").innerText(),
      "Physical XYZ unavailable",
    );
    await page.close();
    const touchPage = await context.newPage();
    observe(touchPage);
    await touchPage.setViewportSize({ width: 390, height: 844 });
    await touchPage.goto(`${url}rig.html`, { waitUntil: "networkidle" });
    await touchPage.locator("#rig-displayed-camera").selectOption(secondary);
    await touchPage.locator("#rig-game-start").click();
    await touchPage
      .locator("#rig-game-target")
      .waitFor({ state: "visible", timeout: 8000 });
    assert.equal(
      await touchPage
        .locator(".rig-game-image")
        .evaluate((el) => window.getComputedStyle(el).touchAction),
      "none",
    );
    const touchTarget = await alignedTarget(touchPage);
    await touchPage.touchscreen.tap(
      touchTarget.expected.x,
      touchTarget.expected.y,
    );
    await touchPage.waitForFunction(
      () => Number(document.querySelector("#rig-game-score").textContent) > 0,
    );
    result.touchScore = await score(touchPage);
    await touchPage
      .locator("#rig-game-stage")
      .screenshot({ path: resolve(output, "game-touch-mobile.png") });
    result.screenshots.push("game-touch-mobile.png");
    result.checks.push(
      "A real touchscreen tap awards a Slap a Mole hit on the secondary scene in a 390px touch-enabled browser context; the playable region declares touch-action:none.",
    );
    result.checks.push(
      "Genuine Slap a Mole countdown, target, hit and score verified under both selected camera scenes using shared mirrored source/target/pointer geometry.",
    );
    result.checks.push(
      "Healthy source switches preserve paused game target/score/phase and operator diagnostics; unavailable/stale/uncertain presentation pauses scoring and requires explicit recovery.",
    );
    result.checks.push(
      "One game stage/HUD moves to a diagnostic-free player window, stays playable with a hidden operator, and restores safely; planning closes and pauses it.",
    );
    for (const item of context.pages())
      if (!item.isClosed())
        assert.equal(
          await item.evaluate(() => window.__displayedAcquisitionAttempts || 0),
          0,
        );
    assert.equal(
      result.requests.length,
      0,
      "Gameplay and rehearsal must not discover or start cameras.",
    );
    result.acquisitionAttempts = 0;
    result.gameplay = {
      primaryScore: result.primaryScore,
      secondaryScore: result.secondaryScore,
      pointerInputOnly: true,
      recordedBodyDrivesScore: false,
    };
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
