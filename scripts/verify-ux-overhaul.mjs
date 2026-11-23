/* global document, innerWidth */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const before = process.argv.includes("--before");
const phase = before ? "before" : "after";
const out = resolve("reports/local/ux-overhaul", phase);
await mkdir(out, { recursive: true });

const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
assert(executablePath, "Set CHROME_PATH to an installed Chromium browser.");

const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath, headless: true });

const result = {
  phase,
  browser: browser.version(),
  cases: [],
  errors: [],
  cameraStarts: 0,
};

try {
  const ctx = await browser.newContext();
  await ctx.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET") result.cameraStarts++;
    assert.equal(
      route.request().method(),
      "GET",
      "No camera acquisition allowed",
    );
    await route.fulfill({
      json: route.request().url().endsWith("/cameras")
        ? { cameras: [] }
        : { state: "idle" },
    });
  });

  const pages = [
    ["directory", "/"],
    ["mole", "/mole.html"],
    ["dodgeball", "/dodgeball.html"],
    ["runner", "/runner.html"],
    ["maze", "/maze.html"],
    ["diagnostics", "/diagnostics.html"],
    ["rig", "/rig.html"],
  ];

  for (const [label, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
    ["narrow", 320, 740],
  ]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => innerWidth), width);
    page.on("pageerror", (err) =>
      result.errors.push(`${label}: ${err.message}`),
    );
    for (const [name, path] of pages) {
      await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
      await page.waitForTimeout(180);
      const metrics = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth > innerWidth;
        const stage = document.querySelector(
          "#game-stage, #maze-map, #stage, #rig-view-pair",
        );
        const stageTop = stage
          ? Math.round(stage.getBoundingClientRect().top)
          : null;
        const navCount = document.querySelectorAll(
          "header, nav.studio-navigation",
        ).length;
        const headerBottom = (() => {
          const items = [
            ...document.querySelectorAll("header, nav.studio-navigation"),
          ];
          return items.length
            ? Math.round(
                Math.max(
                  ...items.map((el) => el.getBoundingClientRect().bottom),
                ),
              )
            : 0;
        })();
        const openDialog = document.querySelectorAll("dialog[open]").length;
        return { overflow, stageTop, navCount, headerBottom, openDialog };
      });
      if (label !== "narrow") {
        await page.screenshot({
          path: resolve(out, `${name}-${label}-initial.png`),
          fullPage: false,
        });
      }
      if (metrics.openDialog > 0 && label !== "narrow") {
        const closeBtn = page.locator("#close-settings");
        if (await closeBtn.count()) {
          await closeBtn.click();
          await page.waitForTimeout(120);
          await page.screenshot({
            path: resolve(out, `${name}-${label}-stage.png`),
            fullPage: false,
          });
        }
      }
      if (!before) {
        assert.equal(
          metrics.overflow,
          false,
          `${name} overflowed horizontally at ${width}px`,
        );
      }
      result.cases.push({ name, label, width, ...metrics });
    }
    await page.close();
  }
  assert.deepEqual(result.errors, []);
  assert.equal(result.cameraStarts, 0);
  await writeFile(
    resolve(out, "metrics.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(
    `Captured ${phase} UI evidence (${result.cases.length} cases) -> ${out}`,
  );
} finally {
  await browser.close();
  await server.close();
}
