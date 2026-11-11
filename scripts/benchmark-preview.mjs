/* global window, document, CanvasRenderingContext2D, requestAnimationFrame, innerWidth, performance */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:5173/diagnostics.html" },
    label: { type: "string", default: "preview" },
    duration: { type: "string", default: "30000" },
    warmup: { type: "string", default: "5000" },
    "scale-factor": { type: "string", default: "1" },
    "chrome-executable": { type: "string" },
    headless: { type: "boolean", default: false },
  },
});
const duration = Number(values.duration),
  warmup = Number(values.warmup);
const scaleFactor = Number(values["scale-factor"]);
assert([1, 2].includes(scaleFactor), "Use --scale-factor 1 or 2.");
assert(/^[a-z0-9-]+$/.test(values.label), "Use a short lowercase label.");
assert(
  duration >= 1000 && duration <= 120000 && warmup >= 1000 && warmup <= 30000,
  "Use a bounded warmup and duration in milliseconds.",
);
assert(
  ["127.0.0.1", "localhost"].includes(new URL(values.url).hostname),
  "This benchmark is for the local diagnostic viewer.",
);
const executablePath =
  values["chrome-executable"] ||
  process.env.CHROME_PATH ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    process.env.PROGRAMFILES &&
      resolve(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((path) => path && existsSync(path));
assert(
  executablePath,
  "Supply --chrome-executable with an installed Chrome/Chromium path. No browser is downloaded.",
);
const output = resolve("reports/local");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: values.headless,
});
try {
  const errors = [];
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    deviceScaleFactor: scaleFactor,
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type()))
      errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__previewBenchmark = { draws: [], raf: [], visibility: [] };
    const fill = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (
        this.canvas.id === "skeleton-canvas" &&
        args[0] === 0 &&
        args[1] === 0
      )
        window.__previewBenchmark.draws.push(performance.now());
      return fill.apply(this, args);
    };
    function probe(time) {
      window.__previewBenchmark.raf.push(time);
      requestAnimationFrame(probe);
    }
    requestAnimationFrame(probe);
    document.addEventListener("visibilitychange", () =>
      window.__previewBenchmark.visibility.push(document.hidden),
    );
  });
  await page.goto(values.url, { waitUntil: "networkidle" });
  await page.bringToFront();
  await page
    .getByRole("button", { name: "Synthetic scene", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start synthetic scene", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("#person-count")?.textContent === "3",
  );
  await page.waitForTimeout(warmup);
  await page.evaluate(() => {
    window.__previewBenchmark.draws = [];
    window.__previewBenchmark.raf = [];
  });
  await page.waitForTimeout(duration);
  const result = await page.evaluate(() => {
    const { draws, raf, visibility } = window.__previewBenchmark;
    const intervals = draws
      .slice(1)
      .map((value, index) => value - draws[index]);
    const sorted = [...intervals].sort((a, b) => a - b);
    const fps = (events) =>
      events.length < 2
        ? null
        : (1000 * (events.length - 1)) / (events.at(-1) - events[0]);
    const windows = Array.from(
      { length: Math.floor((draws.at(-1) - draws[0]) / 2000) },
      (_, index) =>
        fps(
          draws.filter(
            (time) =>
              time >= draws[0] + index * 2000 &&
              time < draws[0] + (index + 1) * 2000,
          ),
        ),
    );
    return {
      draws: draws.length,
      fps: fps(draws),
      rafFps: fps(raf),
      p50Ms: sorted[Math.floor(sorted.length * 0.5)],
      p95Ms: sorted[Math.floor(sorted.length * 0.95)],
      p99Ms: sorted[Math.floor(sorted.length * 0.99)],
      intervalsOver25Ms: intervals.filter((value) => value > 25).length,
      twoSecondWindowFps: windows,
      hidden: document.hidden,
      visibilityChanges: visibility,
      telemetry: document.querySelector(".telemetry")?.textContent,
    };
  });
  assert(
    result.draws >= 2 &&
      !result.hidden &&
      result.visibilityChanges.length === 0,
    "Keep the benchmark window visible throughout the measurement.",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(output, `${values.label}-desktop.jpg`),
    type: "jpeg",
    quality: 85,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Start synthetic scene", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("#person-count")?.textContent === "3",
  );
  await page.waitForTimeout(1000);
  result.mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(output, `${values.label}-mobile.jpg`),
    type: "jpeg",
    quality: 85,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  assert.equal(result.mobileOverflow, false, "Mobile viewport overflowed.");
  assert.deepEqual(errors, []);
  const record = {
    ...result,
    browser: browser.version(),
    headless: values.headless,
    warmupMs: warmup,
    measurementMs: duration,
    deviceScaleFactor: scaleFactor,
  };
  await writeFile(
    resolve(output, `${values.label}-metrics.json`),
    JSON.stringify(record, null, 2),
  );
  console.log(JSON.stringify(record, null, 2));
} finally {
  await browser.close();
}
