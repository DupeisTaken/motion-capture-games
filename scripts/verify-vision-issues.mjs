/* global window, document, WebSocket, performance, fetch, AbortSignal, CanvasRenderingContext2D */
import assert from "node:assert/strict";
import { spawn, execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { chromium } from "playwright-core";
import { createServer } from "vite";

// Real synthetic sources and HTTP/WebSockets only: no camera, model inference,
// browser route interception, replacement fetch/WebSocket or observation injection.
const root = fileURLToPath(new URL("..", import.meta.url));
const { values } = parseArgs({
  options: {
    "report-only": { type: "boolean", default: false },
    "decode-delay": { type: "boolean", default: false },
    baseline: { type: "string" },
    "chrome-executable": { type: "string" },
    python: { type: "string" },
  },
});
assert(
  !values.baseline || values["decode-delay"],
  "--baseline requires --decode-delay.",
);
assert(
  !(values["decode-delay"] && values["report-only"]),
  "Choose one verification mode.",
);
const baselineRef =
  values.baseline &&
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
const output = resolve(root, "reports/local/vision-issues");
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
const python =
  values.python ||
  resolve(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
assert(
  values["report-only"] || existsSync(python),
  "Run pnpm setup or supply --python.",
);
await mkdir(output, { recursive: true });
const viewports = [
  ["desktop", 1440, 1050],
  ["mobile", 390, 844],
  ["narrow", 320, 740],
];
const result = {
  mode: values["report-only"]
    ? "offline-report"
    : values["decode-delay"]
      ? "real-server-artificial-decode-delay"
      : "real-server-synthetic",
  baselineRef: baselineRef || null,
  language: "en",
  headless: true,
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  httpErrors: [],
  consoleDiagnostics: [],
  expectedOutageErrors: [],
  limitations: [
    "Generated bodies bypass cameras and pose inference; no hardware accuracy or latency claim.",
    "Stale source status cannot be induced by the healthy synthetic producer without fault injection; unit tests cover source-clock expiry.",
  ],
};
if (values["decode-delay"])
  result.limitations.push(
    "Browser-only instrumentation delays resolution of each actual decoded synthetic JPEG by 2000 ms; this is an artificial scheduling regression, not observed hardware decoder performance.",
  );
let browser;
let vite;
let child;
let serviceLog = "";
let expectedOutage = false;

const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function freePort() {
  const listener = createNetServer();
  await new Promise((done, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", done);
  });
  const port = listener.address().port;
  await new Promise((done) => listener.close(done));
  return port;
}
async function stopService() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const owned = child;
  const exited = new Promise((done) => owned.once("exit", done));
  if (process.platform === "win32") {
    // Only this script's still-live child PID and its descendants are targeted.
    try {
      await promisify(execFile)("taskkill", [
        "/PID",
        String(owned.pid),
        "/T",
        "/F",
      ]);
    } catch (error) {
      if (owned.exitCode === null && owned.signalCode === null) throw error;
    }
  } else owned.kill("SIGTERM");
  await Promise.race([
    exited,
    pause(5000).then(() => {
      if (owned.exitCode === null && owned.signalCode === null)
        throw new Error(
          "Task-owned Python service did not exit within five seconds.",
        );
    }),
  ]);
}
async function startService(port, origin) {
  // The stock service restricts origins to fixed dev ports. Add this run's
  // loopback-only ephemeral Vite origin without changing production policy.
  child = spawn(
    python,
    [
      "-c",
      "import sys, uvicorn; from motion_vision import server; server.ALLOWED_ORIGINS.add(sys.argv[2]); uvicorn.run(server.app, host='127.0.0.1', port=int(sys.argv[1]), ws_max_size=4096, ws_max_queue=1, log_level='warning')",
      String(port),
      origin,
    ],
    {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONPATH: resolve(root, "services/vision"),
        OMP_NUM_THREADS: "1",
        OPENBLAS_NUM_THREADS: "1",
        TF_NUM_INTRAOP_THREADS: "1",
        TF_NUM_INTEROP_THREADS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let launchError;
  child.once("error", (error) => {
    launchError = error;
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      serviceLog = (serviceLog + data.toString()).slice(-20000);
    });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (child.exitCode !== null)
      throw new Error(`Python exited: ${serviceLog}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/status`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      /* Wait for actual readiness, bounded by the deadline. */
    }
    await pause(100);
  }
  throw new Error(`Python readiness timed out: ${serviceLog}`);
}
function observe(page) {
  page.on("response", (response) => {
    if (response.status() >= 400)
      result.httpErrors.push({
        url: response.url(),
        status: response.status(),
        expectedOutage,
      });
  });
  page.on("pageerror", (error) => result.errors.push(error.message));
  page.on("console", (message) => {
    if (!["warning", "error"].includes(message.type())) return;
    const text = message.text();
    result.consoleDiagnostics.push({
      text,
      location: message.location(),
      expectedOutage,
    });
    if (
      expectedOutage &&
      /Failed to load resource|WebSocket connection.*failed|net::ERR_|Unexpected response code: 500/.test(
        text,
      )
    )
      result.expectedOutageErrors.push(text);
    else result.errors.push(text);
  });
}
async function capture(page, prefix, sizes = viewports) {
  for (const [name, width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `${prefix} overflowed at ${width}px.`,
    );
    const filename = `${prefix}-${name}.png`;
    await page.screenshot({ path: resolve(output, filename), fullPage: true });
    result.screenshots.push(filename);
  }
}
async function count(page, value, timeout = 10000) {
  await page.waitForFunction(
    (expected) =>
      document.querySelector("#person-count")?.textContent === String(expected),
    value,
    { timeout },
  );
}
async function epoch(page) {
  await page.waitForFunction(() =>
    Boolean(document.querySelector("#stream-epoch")?.title),
  );
  return page.locator("#stream-epoch").getAttribute("title");
}
async function stop(page) {
  await page.locator("#stop").click();
  await page.waitForFunction(() => !document.querySelector("#start").disabled);
  await count(page, 0);
}
async function start(page, scenario, capacity, tracker) {
  await page.locator("#demo-scenario").selectOption(scenario);
  await page.locator("#capacity").selectOption(String(capacity));
  await page.locator("#tracker").selectOption(tracker);
  await page.locator("#start").click();
  return epoch(page);
}

try {
  const port = values["report-only"] ? null : await freePort();
  vite = await createServer({
    configFile: resolve(root, "vite.config.ts"),
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
      hmr: false,
      proxy: port
        ? { "/api": { target: `http://127.0.0.1:${port}`, ws: true } }
        : {},
    },
    plugins: [
      {
        name: "vision-issues-report-evidence",
        enforce: "pre",
        transform(_source, id) {
          if (
            baselineSource &&
            id.replaceAll("\\", "/").endsWith("/apps/mirror/src/main.ts")
          )
            return baselineSource;
        },
        configureServer(server) {
          server.middlewares.use(
            "/vision-issues-report.html",
            async (_request, response, next) => {
              try {
                response.setHeader("Content-Type", "text/html; charset=utf-8");
                response.end(
                  await readFile(
                    resolve(root, "reports/vision-issues.html"),
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
  await vite.listen();
  const url = vite.resolvedUrls.local[0];
  if (port) await startService(port, new URL(url).origin);
  browser = await chromium.launch({ executablePath, headless: true });
  result.browser = browser.version();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    locale: "en-US",
  });
  context.setDefaultTimeout(10000);
  const page = await context.newPage();
  observe(page);
  if (values["decode-delay"]) {
    await page.close();
    result.decodeDelayMs = 2000;
    result.decode = [];
    const label = baselineRef ? "before" : "after";
    for (const [name, width, height] of viewports) {
      const probe = await context.newPage();
      observe(probe);
      await probe.setViewportSize({ width, height });
      await probe.addInitScript(() => {
        const nativeDecode = window.createImageBitmap.bind(window);
        const nativeDraw = CanvasRenderingContext2D.prototype.drawImage;
        window.__decodeDelay = { completed: 0, imageDraws: 0 };
        window.createImageBitmap = async (...args) => {
          const image = await nativeDecode(...args);
          await new Promise((done) => setTimeout(done, 2000));
          window.__decodeDelay.completed++;
          return image;
        };
        CanvasRenderingContext2D.prototype.drawImage = function (...args) {
          if (this.canvas.id === "skeleton-canvas")
            window.__decodeDelay.imageDraws++;
          return nativeDraw.apply(this, args);
        };
      });
      await probe.goto(url, { waitUntil: "networkidle" });
      await probe.locator("#source-demo").click();
      await probe.locator("#demo-scenario").selectOption("three");
      await probe.locator("#start").click();
      await probe.waitForFunction(() => window.__decodeDelay.completed >= 1);
      if (baselineRef)
        await probe.waitForFunction(() => window.__decodeDelay.imageDraws > 0);
      await pause(300);
      const observation = await probe.evaluate(() => ({
        ...window.__decodeDelay,
        acceptedImage: document.querySelector("#standby").hidden,
        status: document.querySelector("#status-title").textContent,
        message: document.querySelector("#status-message").textContent,
        frameState: document.querySelector("#frame-state").textContent,
      }));
      assert.equal(
        observation.acceptedImage,
        Boolean(baselineRef),
        "Delayed image acceptance differed from expected baseline/fix.",
      );
      assert.equal(
        observation.imageDraws > 0,
        Boolean(baselineRef),
        "Delayed JPEG drew unexpectedly.",
      );
      result.decode.push({ viewport: name, ...observation });
      await capture(probe, `decode-${label}`, [[name, width, height]]);
      await stop(probe);
      await probe.close();
    }
    result.checks.push(
      baselineRef
        ? "Before: actual JPEG delayed 2000 ms is incorrectly accepted and drawn at all three viewport widths."
        : "After: actual JPEG delayed 2000 ms is discarded without an image draw at all three viewport widths.",
    );
  } else if (values["report-only"]) {
    const externalRequests = [];
    page.on("request", (request) => {
      if (!request.url().startsWith(url) && !request.url().startsWith("data:"))
        externalRequests.push(request.url());
    });
    await page.goto(`${url}vision-issues-report.html`, {
      waitUntil: "networkidle",
    });
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert(
      (await page.locator("h1").innerText()).length > 0,
      "Report title missing.",
    );
    assert(
      (await page.locator("img").count()) > 0,
      "Report must embed screenshot evidence.",
    );
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
      "Report screenshot failed to load or was not embedded.",
    );
    await capture(page, "report");
    for (const [name, width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      const topFilename = `report-${name}-top.png`;
      await page.screenshot({ path: resolve(output, topFilename) });
      result.screenshots.push(topFilename);
      for (const section of ["xyz", "checks", "limits"]) {
        await page
          .locator(`#${section} h2`)
          .evaluate((heading) => heading.scrollIntoView({ block: "start" }));
        const filename = `report-${name}-${section}.png`;
        await page.screenshot({ path: resolve(output, filename) });
        result.screenshots.push(filename);
      }
    }
    assert.deepEqual(
      externalRequests,
      [],
      "Offline report fetched an external resource.",
    );
    result.checks.push(
      "Self-contained report and embedded screenshots rendered at all three widths.",
    );
  } else {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#source-demo").click();
    result.epochs = [await start(page, "cycle", 6, "pose")];
    result.countTransitions = [];
    const cycleStart = Date.now();
    for (const expected of [0, 1, 2, 3, 0]) {
      await count(page, expected, 8500);
      result.countTransitions.push({
        count: expected,
        elapsedMs: Date.now() - cycleStart,
      });
      if (expected === 3) await capture(page, "diagnostics");
    }
    result.checks.push(
      "Live synthetic entering/leaving sequence 0 → 1 → 2 → 3 → 0 through both real streams.",
    );
    await stop(page);
    result.capacities = [];
    for (const [capacity, tracker] of [
      [1, "pose"],
      [3, "iou"],
      [6, "pose"],
    ]) {
      result.epochs.push(await start(page, "three", capacity, tracker));
      await count(page, Math.min(3, capacity));
      const warning = await page.locator("#capacity-warning").isVisible();
      assert.equal(warning, capacity <= 3);
      assert.match(
        await page.locator("#stream-camera").innerText(),
        new RegExp(` / ${tracker}$`),
      );
      result.capacities.push({
        capacity,
        tracker,
        count: Math.min(3, capacity),
        capacityWarning: warning,
      });
      if (capacity !== 6) await stop(page);
    }
    assert.equal(
      new Set(result.epochs).size,
      result.epochs.length,
      "Restart reused an epoch.",
    );
    result.checks.push(
      "Caps 1/3/6 bound current detections and expose saturation; both real association modes run; restarts issue new epochs.",
    );
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.locator("#mirror").uncheck();
    assert.equal(await page.locator("#view-label").innerText(), "Camera view");
    await page.locator("#show-video").uncheck();
    await page.locator("#show-boxes").uncheck();
    await page.locator("#confidence").fill("0.9");
    assert.equal(await page.locator("#confidence-value").innerText(), "0.90");
    await count(page, 3);
    await capture(page, "diagnostics-controls", [viewports[0]]);
    await page.locator("#show-tracking").uncheck();
    await pause(100);
    const blankCanvas = await page
      .locator("#skeleton-canvas")
      .evaluate((canvas) => {
        const pixels = canvas
          .getContext("2d")
          .getImageData(0, 0, canvas.width, canvas.height).data;
        for (let offset = 4; offset < pixels.length; offset += 4)
          if (
            pixels[offset] !== pixels[0] ||
            pixels[offset + 1] !== pixels[1] ||
            pixels[offset + 2] !== pixels[2] ||
            pixels[offset + 3] !== pixels[3]
          )
            return false;
        return true;
      });
    assert(
      blankCanvas,
      "Disabling both image and overlay retained rendered content.",
    );
    await count(page, 3);
    result.controls = {
      mirror: "Camera view",
      imageDisabled: true,
      boundsDisabled: true,
      jointThreshold: 0.9,
      overlayDisabledClearsCanvas: blankCanvas,
      countUnaffected: true,
    };
    for (const id of ["mirror", "show-video", "show-boxes", "show-tracking"])
      await page.locator(`#${id}`).check();
    await page.locator("#confidence").fill("0.5");
    result.checks.push(
      "Mirror/image/bounds/overlay/visibility controls work; hiding image and overlay clears pixels without changing detections.",
    );
    result.transport = await page.evaluate(async () => {
      const socket = new WebSocket(
        `${window.location.origin.replace("http", "ws")}/api/observations?epoch=${encodeURIComponent(document.querySelector("#stream-epoch").title)}`,
      );
      const messages = [];
      socket.addEventListener("message", (event) =>
        messages.push(JSON.parse(event.data)),
      );
      const wait = (ms) => new Promise((done) => setTimeout(done, ms));
      const next = async () => {
        const before = messages.length;
        socket.send(JSON.stringify({ type: "next" }));
        const deadline = performance.now() + 3000;
        while (messages.length === before && performance.now() < deadline)
          await wait(10);
        if (messages.length === before)
          throw new Error("Pull observation timed out.");
        return messages.at(-1);
      };
      try {
        await new Promise((done, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Probe socket open timed out.")),
            3000,
          );
          socket.onopen = () => {
            clearTimeout(timeout);
            done();
          };
          socket.onerror = () => {
            clearTimeout(timeout);
            reject(new Error("Probe socket failed."));
          };
        });
        const first = await next();
        await wait(650);
        const unsolicited = messages.length - 1;
        const second = await next();
        return {
          firstSequence: first.sequence,
          secondSequence: second.sequence,
          skippedSequences: second.sequence - first.sequence - 1,
          unsolicited,
          epoch: second.epoch,
          source: second.source,
          clockQuality: second.clock.quality,
          capacity: second.capacity,
          count: second.detectedCount,
        };
      } finally {
        socket.close();
      }
    });
    assert.equal(result.transport.unsolicited, 0);
    assert(
      result.transport.skippedSequences >= 3,
      "Slow consumer replayed old queued observations.",
    );
    assert.equal(result.transport.source, "demo");
    assert.equal(result.transport.clockQuality, "synthetic");
    result.checks.push(
      "Real pull stream sends no unsolicited frames and skips superseded observations after a 650 ms consumer pause.",
    );
    const liveEpoch = await epoch(page);
    const ended = await context.request.post(`${url}api/stop`, {
      data: { epoch: liveEpoch },
    });
    assert(ended.ok());
    await page.waitForFunction(
      () => !document.querySelector("#start").disabled,
    );
    await count(page, 0);
    assert.equal(await page.locator("#stream-epoch").innerText(), "—");
    await capture(page, "diagnostics-ended", [viewports[0]]);
    result.checks.push(
      "Real server-side source end clears current count and context, permits explicit restart.",
    );
    result.epochs.push(await start(page, "empty", 6, "iou"));
    await count(page, 0);
    expectedOutage = true;
    await stopService();
    await page.waitForFunction(
      () =>
        !document.querySelector("#retry-camera-stop").disabled &&
        !document.querySelector("#retry-camera-stop").closest("[hidden]"),
    );
    assert(
      await page.locator("#start").isDisabled(),
      "Unconfirmed release must lock replacement.",
    );
    await startService(port, new URL(url).origin);
    await page.locator("#retry-camera-stop").click();
    await page.waitForFunction(
      () => !document.querySelector("#start").disabled,
    );
    expectedOutage = false;
    result.epochs.push(await start(page, "three", 6, "pose"));
    await count(page, 3);
    await stop(page);
    assert.equal(new Set(result.epochs).size, result.epochs.length);
    result.checks.push(
      "Actual service process outage locks replacement until release retry succeeds; service restart and a new synthetic epoch recover.",
    );
    result.finalStatus = await (
      await context.request.get(`${url}api/status`)
    ).json();
    assert.equal(result.finalStatus.state, "idle");
  }
  assert.deepEqual(
    result.errors,
    [],
    "Unexpected browser console/page errors.",
  );
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
    try {
      await stopService();
    } finally {
      await vite?.close();
      await writeFile(
        resolve(
          output,
          values["report-only"]
            ? "report-results.json"
            : values["decode-delay"]
              ? `decode-${baselineRef ? "before" : "after"}-results.json`
              : "results.json",
        ),
        `${JSON.stringify(result, null, 2)}\n`,
      );
    }
  }
}
console.log(JSON.stringify(result, null, 2));
