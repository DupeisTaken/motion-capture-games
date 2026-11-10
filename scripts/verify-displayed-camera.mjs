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
      default: "145195aa21d3ea4f5fa8ceb077d2ccec0814583b",
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
  mode: values["report-only"] ? "offline-report" : "real-ui-displayed-camera",
  language: "en",
  headless: true,
  baselineRef: baselineRef || null,
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  requests: [],
  errors: [],
  limitations: [
    "Recorded synthetic samples from the actual solver; no live multi-camera capture, physical calibration or latency certification.",
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
    const rawDataset = await readFile(
      resolve(root, "apps/mirror/src/rig-rehearsal.json"),
    );
    result.datasetSha256 = createHash("sha256")
      .update(rawDataset)
      .digest("hex");
    await page.goto(`${url}displayed-baseline.html`, {
      waitUntil: "networkidle",
    });
    await capture(page, "before-rig");
    assert.equal(
      await page.evaluate(() => window.__displayedAcquisitionAttempts),
      0,
    );
    const dataset = JSON.parse(rawDataset.toString("utf8"));
    const nominal = dataset.cases.find((scenario) => scenario.id === "nominal");
    const primaryId = nominal.frames[0].views.find(
      (view) => view.role === "primary",
    ).cameraId;
    const secondaryId = nominal.frames[0].views.find(
      (view) => view.role === "secondary",
    ).cameraId;
    const preferenceKey = "motion-studio.rig.synthetic-displayed-camera.v1";
    const diagnostics = async () =>
      page.evaluate(() => {
        const ids = [
          "rig-x",
          "rig-y",
          "rig-z",
          "rig-reference-x",
          "rig-reference-y",
          "rig-reference-z",
          "rig-track",
          "rig-joint-count",
          "rig-reference-context",
          "rig-support-context",
          "rig-quality",
        ];
        return {
          text: Object.fromEntries(
            ids.map((id) => [id, document.getElementById(id).textContent]),
          ),
          map: document.querySelector("#rig-space").innerHTML,
          primary: document.querySelector("#rig-reference-view").innerHTML,
          secondary: document.querySelector("#rig-support-view").innerHTML,
        };
      });
    async function selectedMatches(target, frame, cameraId) {
      const view = frame.views.find((item) => item.cameraId === cameraId);
      assert(view, "Requested recorded view is missing from fixture.");
      assert.equal(
        await target
          .locator("#rig-selected-stage")
          .getAttribute("data-camera-id"),
        cameraId,
      );
      const sourceContext = await target
        .locator("#rig-selected-context")
        .innerText();
      for (const expected of [
        view.cameraId,
        `source frame ${view.frameId}`,
        view.cameraTrackId,
        `${view.timeNs} ns`,
        view.imageSize.join(" × "),
      ])
        assert(
          sourceContext.includes(expected),
          `Selected context does not contain ${expected}.`,
        );
      const circles = await target
        .locator("#rig-selected-diagram circle")
        .evaluateAll((elements) =>
          elements.map((element) => [
            Number(element.getAttribute("cx")),
            Number(element.getAttribute("cy")),
          ]),
        );
      const [width, height] = view.imageSize;
      const points = view.joints
        .filter(
          (joint) =>
            joint.x !== null &&
            joint.y !== null &&
            Number.isFinite(joint.x) &&
            Number.isFinite(joint.y) &&
            joint.x >= 0 &&
            joint.x < width &&
            joint.y >= 0 &&
            joint.y < height,
        )
        .map((joint) => [joint.x, joint.y]);
      assert.deepEqual(
        circles,
        points,
        "Selected overlay must use exactly that camera's own observations.",
      );
      assert.deepEqual(
        (
          await target
            .locator("#rig-selected-diagram svg")
            .getAttribute("viewBox")
        )
          .split(" ")
          .map(Number),
        [0, 0, width, height],
      );
      assert.equal(
        await target
          .locator("#rig-selected-diagram svg")
          .getAttribute("preserveAspectRatio"),
        "xMidYMid meet",
        "Selected source must contain-fit its complete canonical image geometry.",
      );
      assert.equal(
        await target.locator("#rig-selected-diagram").innerHTML(),
        await page
          .locator(
            view.role === "primary"
              ? "#rig-reference-view"
              : "#rig-support-view",
          )
          .innerHTML(),
      );
      return sourceContext;
    }
    async function acquisitionCount() {
      let attempts = 0;
      for (const item of context.pages())
        if (!item.isClosed())
          attempts += await item.evaluate(
            () => window.__displayedAcquisitionAttempts || 0,
          );
      assert.equal(attempts, 0, "Presentation acquired a physical camera.");
    }
    await page.goto(`${url}rig.html`, { waitUntil: "networkidle" });
    assert.equal(await page.locator("#rig-load-error").isVisible(), false);
    assert.equal(
      await page.locator("#rig-displayed-camera").inputValue(),
      primaryId,
    );
    assert.equal(
      result.requests.length,
      0,
      "Rehearsal should make no API request.",
    );
    await selectedMatches(page, nominal.frames[0], primaryId);
    await capture(page, "after-primary");
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.evaluate(() => window.scrollTo(0, 0));
    result.desktopDensity = await page.evaluate(() => ({
      viewportHeight: window.innerHeight,
      diagramHeight: document
        .querySelector("#rig-selected-diagram")
        .getBoundingClientRect().height,
      coordinates: ["rig-x", "rig-y", "rig-z"].map((id) => {
        const box = document.getElementById(id).getBoundingClientRect();
        return { id, top: box.top, bottom: box.bottom };
      }),
      diagnosticsFollowXYZ: Boolean(
        document
          .querySelector(".rig-space-panel")
          .compareDocumentPosition(document.querySelector("#rig-view-pair")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    }));
    assert(
      result.desktopDensity.diagramHeight <= 260,
      "Inline selected diagram must remain compact.",
    );
    assert(
      result.desktopDensity.coordinates.every(
        (box) =>
          box.top >= 0 &&
          box.bottom <= result.desktopDensity.viewportHeight - 8,
      ),
      "All desktop XYZ estimate cells must fit completely within the initial viewport with an 8px margin.",
    );
    assert(
      result.desktopDensity.diagnosticsFollowXYZ,
      "Both diagnostic cameras should follow the shared XYZ section.",
    );
    const beforeSelection = await diagnostics();
    const primaryDiagram = await page
      .locator("#rig-selected-diagram")
      .innerHTML();
    await page.locator("#rig-displayed-camera").selectOption(secondaryId);
    await selectedMatches(page, nominal.frames[0], secondaryId);
    assert.notEqual(
      await page.locator("#rig-selected-diagram").innerHTML(),
      primaryDiagram,
      "The selected camera changed only its label.",
    );
    assert.deepEqual(
      await diagnostics(),
      beforeSelection,
      "A display preference changed reconstruction or diagnostic roles.",
    );
    await capture(page, "after-secondary");
    await capture(page, "after-secondary", [["tablet", 800, 1000]]);
    result.tabletControls = await page
      .locator(".rig-controls")
      .evaluate((element) =>
        Array.from(element.children)
          .map((child) => {
            const box = child.getBoundingClientRect();
            return {
              label: child.id || child.tagName.toLowerCase(),
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
            };
          })
          .filter((box) => box.width > 0 && box.height > 0),
      );
    for (let i = 0; i < result.tabletControls.length; i++)
      for (let j = i + 1; j < result.tabletControls.length; j++) {
        const a = result.tabletControls[i],
          b = result.tabletControls[j];
        assert(
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) < 0.5 ||
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) < 0.5,
          `Tablet controls overlap: ${a.label} / ${b.label}`,
        );
      }
    result.selection = {
      primaryId,
      secondaryId,
      sameRigDiagnostics: true,
      sourceAndOverlaySwitch: true,
    };
    result.checks.push(
      "Primary/secondary selection switches the exact recorded source geometry, overlay and context; XYZ, map, roles and both diagnostic views remain unchanged.",
    );
    const config = JSON.parse(
      await readFile(resolve(root, "configs/xyz-experiment.json"), "utf8"),
    );
    result.matrix = await page.evaluate(
      ({ cases, maxAgeNs }) => {
        const select = document.querySelector("#rig-displayed-camera");
        const scenario = document.querySelector("#rig-scenario");
        const slider = document.querySelector("#rig-frame");
        const failures = [];
        const states = {};
        let selections = 0;
        const snapshot = () =>
          JSON.stringify({
            text: [
              "rig-x",
              "rig-y",
              "rig-z",
              "rig-reference-x",
              "rig-reference-y",
              "rig-reference-z",
              "rig-track",
              "rig-joint-count",
              "rig-reference-context",
              "rig-support-context",
              "rig-quality",
            ].map((id) => document.getElementById(id).textContent),
            html: ["rig-space", "rig-reference-view", "rig-support-view"].map(
              (id) => document.getElementById(id).innerHTML,
            ),
          });
        const check = (condition, label, reason) => {
          if (!condition && failures.length < 12)
            failures.push(`${label}: ${reason}`);
        };
        for (const item of cases) {
          scenario.value = item.id;
          scenario.dispatchEvent(new Event("change", { bubbles: true }));
          for (const [index, frame] of item.frames.entries()) {
            slider.value = String(index);
            slider.dispatchEvent(new Event("input", { bubbles: true }));
            const before = snapshot();
            for (const view of frame.views) {
              select.value = view.cameraId;
              select.dispatchEvent(new Event("change", { bubbles: true }));
              const label = `${item.id}/${index}/${view.cameraId}`;
              const stage = document.querySelector("#rig-selected-stage");
              const diagram = document.querySelector("#rig-selected-diagram");
              const contextText = document.querySelector(
                "#rig-selected-context",
              ).textContent;
              const status = stage.dataset.sourceStatus;
              states[status] = (states[status] || 0) + 1;
              selections++;
              check(
                stage.dataset.cameraId === view.cameraId,
                label,
                "camera identity substituted",
              );
              check(
                snapshot() === before,
                label,
                "selection changed XYZ/map/roles/diagnostics",
              );
              for (const text of [
                view.cameraId,
                `source frame ${view.frameId}`,
                view.cameraTrackId,
                `${view.timeNs} ns`,
                view.clockDomain,
              ])
                check(
                  contextText.includes(text),
                  label,
                  "source context mismatch",
                );
              const [width, height] = view.imageSize;
              const points = view.joints
                .filter(
                  (joint) =>
                    joint.x !== null &&
                    joint.y !== null &&
                    Number.isFinite(joint.x) &&
                    Number.isFinite(joint.y) &&
                    joint.x >= 0 &&
                    joint.x < width &&
                    joint.y >= 0 &&
                    joint.y < height,
                )
                .map((joint) => [joint.x, joint.y]);
              const sourceTime = BigInt(view.timeNs),
                uncertainty = BigInt(view.uncertaintyNs),
                evaluated = BigInt(frame.evaluatedAtNs);
              const drawable =
                points.length > 0 &&
                view.clockDomain === "mapped-host" &&
                sourceTime + uncertainty <= evaluated &&
                evaluated - (sourceTime - uncertainty) <= BigInt(maxAgeNs);
              if (drawable) {
                check(
                  diagram.innerHTML ===
                    document.querySelector(
                      view.role === "primary"
                        ? "#rig-reference-view"
                        : "#rig-support-view",
                    ).innerHTML,
                  label,
                  "diagram does not match its own diagnostic source",
                );
                const circles = Array.from(
                  diagram.querySelectorAll("circle"),
                  (circle) => [
                    Number(circle.getAttribute("cx")),
                    Number(circle.getAttribute("cy")),
                  ],
                );
                check(
                  JSON.stringify(circles) === JSON.stringify(points),
                  label,
                  "joint geometry does not match fixture",
                );
                check(
                  status ===
                    (points.length === view.joints.length
                      ? "usable"
                      : "partial"),
                  label,
                  "incorrect source availability",
                );
              } else {
                check(
                  diagram.querySelectorAll("svg").length === 0 &&
                    diagram.hidden,
                  label,
                  "expired/unavailable source retained a diagram",
                );
                check(
                  status === "unavailable",
                  label,
                  "expired/unavailable source mislabeled",
                );
                check(
                  !document.querySelector("#rig-selected-unavailable").hidden,
                  label,
                  "unavailable feedback hidden",
                );
              }
              check(
                document.querySelector("#rig-physical-state").textContent ===
                  "Physical XYZ unavailable",
                label,
                "synthetic selection enabled physical input",
              );
            }
          }
        }
        return {
          cases: cases.length,
          recordedFrames: cases.reduce(
            (count, item) => count + item.frames.length,
            0,
          ),
          selections,
          states,
          failures,
        };
      },
      { cases: dataset.cases, maxAgeNs: String(config.gates.max_age_ns) },
    );
    assert.deepEqual(result.matrix.failures, []);
    assert.equal(result.matrix.selections, result.matrix.recordedFrames * 2);
    result.checks.push(
      `Bounded full matrix: ${result.matrix.cases} cases × recorded samples × two camera choices (${result.matrix.selections} selections), checking own source/geometry/context, unchanged XYZ/roles, recorded source availability and stale rejection.`,
    );
    await page.locator("#rig-scenario").selectOption("nominal");
    await page.locator("#rig-displayed-camera").selectOption(secondaryId);
    await acquisitionCount();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(
      await page.locator("#rig-displayed-camera").inputValue(),
      secondaryId,
    );
    await selectedMatches(page, nominal.frames[0], secondaryId);
    result.checks.push(
      "Displayed camera identity persists through a real page reload.",
    );
    await page.setViewportSize({ width: 1440, height: 1050 });
    const opening = page.waitForEvent("popup");
    await page.locator("#rig-display-window").click();
    const popup = await opening;
    observe(popup);
    await popup.locator("#rig-selected-stage").waitFor();
    assert.equal(
      await page.locator("#rig-selected-stage").count(),
      0,
      "Popup duplicated the selected stage instead of moving it.",
    );
    assert.equal(await page.locator("#rig-reference-view").isVisible(), true);
    assert.equal(await page.locator("#rig-support-view").isVisible(), true);
    await page.locator("#rig-displayed-camera").selectOption(primaryId);
    await selectedMatches(popup, nominal.frames[0], primaryId);
    const middle = Math.floor((nominal.frames.length - 1) / 2);
    await page.locator("#rig-frame").fill(String(middle));
    await selectedMatches(popup, nominal.frames[middle], primaryId);
    await page.locator("#rig-displayed-camera").selectOption(secondaryId);
    await selectedMatches(popup, nominal.frames[middle], secondaryId);
    await capture(popup, "popup");
    await acquisitionCount();
    await popup.close();
    await page.locator("#rig-selected-stage").waitFor();
    await selectedMatches(page, nominal.frames[middle], secondaryId);
    assert.match(
      await page.locator("#rig-display-location").innerText(),
      /shown here/,
    );
    result.checks.push(
      "The same stage moves to a popup, follows operator camera/scrub changes at three viewport widths, and returns unchanged when closed.",
    );
    await page.evaluate(
      (key) => window.localStorage.setItem(key, "missing-recorded-camera"),
      preferenceKey,
    );
    await acquisitionCount();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(
      await page.locator("#rig-displayed-camera").inputValue(),
      "missing-recorded-camera",
    );
    assert.equal(
      await page.locator("#rig-selected-stage").getAttribute("data-camera-id"),
      "missing-recorded-camera",
    );
    assert.equal(await page.locator("#rig-selected-diagram svg").count(), 0);
    assert.match(
      await page.locator("#rig-selected-unavailable").innerText(),
      /selected camera is unavailable/,
    );
    assert.match(
      await page.locator("#rig-selected-context").innerText(),
      /not replaced by another view/,
    );
    assert.equal(await page.locator("#rig-reference-view svg").count(), 1);
    assert.equal(await page.locator("#rig-support-view svg").count(), 1);
    await capture(page, "selected-unavailable", [viewports[0]]);
    await page.locator("#rig-displayed-camera").selectOption(secondaryId);
    await page.locator("#rig-scenario").selectOption("missing-hip");
    const missingHip = dataset.cases.find(
      (scenario) => scenario.id === "missing-hip",
    ).frames[0];
    await selectedMatches(page, missingHip, secondaryId);
    assert.equal(
      await page
        .locator("#rig-selected-stage")
        .getAttribute("data-source-status"),
      "partial",
    );
    assert.match(
      await page.locator("#rig-selected-warning").innerText(),
      /missing/,
    );
    assert.equal(await page.locator("#rig-x").innerText(), "Unavailable");
    await capture(page, "selected-missing-hip", [viewports[0]]);
    await page.locator("#rig-scenario").selectOption("stale-input");
    assert.equal(
      await page.locator("#rig-displayed-camera").inputValue(),
      secondaryId,
    );
    assert.equal(
      await page
        .locator("#rig-selected-stage")
        .getAttribute("data-source-status"),
      "unavailable",
    );
    assert.equal(await page.locator("#rig-selected-diagram svg").count(), 0);
    assert.match(
      await page.locator("#rig-selected-unavailable").innerText(),
      /stale/,
    );
    assert.equal(await page.locator("#rig-reference-view svg").count(), 1);
    assert.equal(await page.locator("#rig-support-view svg").count(), 1);
    await capture(page, "selected-stale", [viewports[0]]);
    result.checks.push(
      "Missing saved identities remain selected and unavailable; partial joint input stays explicit; stale selected input clears output without substituting another source while forensic diagnostics remain.",
    );
    await page.locator("#rig-scenario").selectOption("nominal");
    const reopening = page.waitForEvent("popup");
    await page.locator("#rig-display-window").click();
    const secondPopup = await reopening;
    observe(secondPopup);
    await secondPopup.locator("#rig-selected-stage").waitFor();
    await page.locator("#rig-tab-planning").click();
    if (!secondPopup.isClosed()) await secondPopup.waitForEvent("close");
    assert.equal(await page.locator("#rig-selected-stage").isVisible(), false);
    assert.equal(await page.locator("#rig-reference-view").isVisible(), false);
    assert.equal(await page.locator("#rig-x").isVisible(), false);
    assert.equal(
      await page.locator("#reference-camera-choice").inputValue(),
      "",
    );
    assert.equal(await page.locator("#support-camera-choice").inputValue(), "");
    assert.equal(
      result.requests.length,
      0,
      "Planning should not discover devices until explicit Refresh.",
    );
    await capture(page, "planning");
    await page.locator("#reference-refresh-cameras").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#reference-camera-choice")
          .getAttribute("aria-busy") === "false",
    );
    await page.locator("#support-refresh-cameras").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#support-camera-choice")
          .getAttribute("aria-busy") === "false",
    );
    await page.locator("#reference-camera-choice").selectOption("a".repeat(64));
    await page.locator("#support-camera-choice").selectOption("b".repeat(64));
    assert.equal(
      await page.locator("#rig-displayed-camera").inputValue(),
      secondaryId,
    );
    assert.equal(
      await page.locator("#rig-physical-state").innerText(),
      "Physical XYZ unavailable",
    );
    await page.locator("#rig-tab-rehearsal").click();
    await selectedMatches(page, nominal.frames[0], secondaryId);
    assert.equal(
      await page.locator("#rig-maze-state").innerText(),
      "Maze input disabled",
    );
    await acquisitionCount();
    assert(
      result.requests.every(
        (request) =>
          request.method === "GET" && request.path === "/api/cameras",
      ),
    );
    result.acquisitionAttempts = 0;
    result.checks.push(
      "Physical planning closes the popup and hides synthetic output; physical camera role choices remain separate from displayed identity, with no acquisition or maze readiness.",
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
