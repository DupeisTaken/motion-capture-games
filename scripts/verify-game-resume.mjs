/* global document, innerWidth */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const { values } = parseArgs({
  options: { baseline: { type: "string" }, popups: { type: "boolean" } },
});
const baseline = values.baseline;
const output = resolve("reports/local/game-resume");
await mkdir(output, { recursive: true });
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
assert(executablePath, "Set CHROME_PATH to an installed Chromium browser.");
const snapshots = new Map();
if (baseline) {
  const ref = execFileSync(
    "git",
    ["rev-parse", "--verify", `${baseline}^{commit}`],
    { encoding: "utf8" },
  ).trim();
  for (const file of [
    "mole-viewer.ts",
    "dodgeball-viewer.ts",
    "runner-viewer.ts",
    "maze-viewer.ts",
    "maze-display.ts",
    "rig-gameplay.ts",
    "rig-gameplay.css",
  ])
    snapshots.set(
      file,
      execFileSync("git", ["show", `${ref}:apps/mirror/src/${file}`], {
        encoding: "utf8",
      }),
    );
}
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
  plugins: [
    {
      name: "resume-baseline",
      enforce: "pre",
      transform(_source, id) {
        for (const [file, source] of snapshots)
          if (id.replaceAll("\\", "/").endsWith(`/apps/mirror/src/${file}`))
            return source;
      },
    },
  ],
});
let browser;
const results = [];
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({ executablePath, headless: true });
  const url = server.resolvedUrls.local[0];
  for (const viewport of values.popups
    ? []
    : [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
        { width: 320, height: 740 },
      ]) {
    const context = await browser.newContext({
      viewport,
      locale: "en-US",
      hasTouch: viewport.width <= 390,
    });
    const acquisitions = [];
    await context.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/start") acquisitions.push(path);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ cameras: [] }),
      });
    });
    for (const game of ["mole", "dodgeball", "runner", "maze", "rig"]) {
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(`${game}: ${error.message}`));
      await page.goto(`${url}${game}.html`);
      let stageId = "game-stage",
        resumeId = "resume-round";
      if (["mole", "dodgeball"].includes(game)) {
        await page.locator("#source-select").selectOption("demo");
        await page.locator("#mode-select").selectOption("practice");
        await page.locator("#confirm-start").click();
        await page.waitForFunction(
          () => document.querySelector("#game-overlay")?.hidden,
        );
        await page.locator("#pause-round").click();
      } else if (game === "runner") {
        await page.locator("#practice-mode").check();
        await page.locator("#start-round").click();
        await page.waitForFunction(
          () => document.querySelector("#game-overlay")?.hidden,
        );
        await page.locator("#stage-pause").click();
      } else if (game === "maze") {
        stageId = "maze-participant";
        resumeId = "maze-resume";
        await page.locator("#confirm-start").click();
        await page.locator("#maze-start").click();
        await page.locator("#maze-view").click();
      } else {
        stageId = "rig-game-stage";
        resumeId = "rig-game-resume";
        await page.locator("#rig-game-start").click();
        await page.locator("#rig-game-target").waitFor({ state: "visible" });
        await page.locator("#rig-game-pause").click();
      }
      const stage = page.locator(`#${stageId}`);
      await stage.scrollIntoViewIfNeeded();
      const prefix = `${baseline ? "before" : "after"}-${game}-${viewport.width}`;
      await page.screenshot({ path: resolve(output, `${prefix}.png`) });
      await stage.screenshot({ path: resolve(output, `${prefix}-stage.png`) });
      if (!baseline) {
        const resume = page.locator(`#${resumeId}`);
        assert(await resume.isVisible(), `${game}: Resume is visible`);
        assert(await resume.isEnabled(), `${game}: Resume is enabled`);
        assert(
          await resume.evaluate((el) => el === document.activeElement),
          `${game}: Resume has focus`,
        );
        assert(
          await stage.evaluate(
            (el, id) => el.contains(document.getElementById(id)),
            resumeId,
          ),
          `${game}: Resume belongs to stage`,
        );
        const geometry = await resume.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return {
            height: rect.height,
            width: rect.width,
            insideViewport: rect.left >= 0 && rect.right <= innerWidth,
            hit: el.contains(
              document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              ),
            ),
          };
        });
        assert(
          geometry.height >= 44 &&
            geometry.width >= 44 &&
            geometry.insideViewport &&
            geometry.hit,
          `${game}: reachable touch target ${JSON.stringify(geometry)}`,
        );
        const scoreId = game === "rig" ? "rig-game-score" : "score-value";
        const score =
          game !== "maze"
            ? await page.locator(`#${scoreId}`).textContent()
            : null;
        const action =
          viewport.width === 1440
            ? "Enter"
            : viewport.width === 390
              ? "Space"
              : "tap";
        if (action === "tap") await resume.tap();
        else await page.keyboard.press(action);
        if (game !== "maze")
          assert.equal(
            await page.locator(`#${scoreId}`).textContent(),
            score,
            `${game}: resume preserves score`,
          );
        if (game === "rig")
          await page.locator("#rig-game-target").waitFor({ state: "visible" });
        else if (game === "maze")
          await page.waitForFunction(() =>
            document
              .querySelector("#maze-session-status")
              ?.textContent.includes("running"),
          );
        else
          await page.waitForFunction(
            () => document.querySelector("#game-overlay")?.hidden,
          );
        assert(
          await stage.evaluate((el) => el === document.activeElement),
          `${game}: focus returns to play`,
        );
        results.push({
          game,
          viewport,
          action,
          geometry,
          preservedScore: score,
        });
      } else results.push({ game, viewport, baseline });
      console.log(`${prefix}: passed`);
      await page.close();
    }
    assert.equal(
      acquisitions.length,
      0,
      "Synthetic verification never starts a camera",
    );
    await context.close();
  }
  if (values.popups) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: "en-US",
    });
    await context.route("**/api/**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: '{"cameras":[]}',
      }),
    );
    for (const game of ["mole", "dodgeball", "maze", "rig"]) {
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(`${game}: ${error.message}`));
      await page.goto(`${url}${game}.html`);
      let opener, pauseId, resumeId, playing;
      if (["mole", "dodgeball"].includes(game)) {
        await page.locator("#source-select").selectOption("demo");
        await page.locator("#mode-select").selectOption("practice");
        opener = game === "mole" ? "open-game-display" : "open-game-window";
        pauseId = "pause-round";
        resumeId = "resume-round";
        playing = () => document.querySelector("#game-overlay")?.hidden;
      } else if (game === "maze") {
        await page.locator("#confirm-start").click();
        opener = "maze-window";
        resumeId = "participant-toggle";
        playing = () =>
          document
            .querySelector("[data-participant-status]")
            ?.textContent.includes("running");
      } else {
        await page.locator("#rig-game-start").click();
        await page.locator("#rig-game-target").waitFor({ state: "visible" });
        opener = "rig-game-open";
        pauseId = "rig-game-pause";
        resumeId = "rig-game-resume";
        playing = () =>
          !document.querySelector("#rig-game-target")?.hasAttribute("hidden");
      }
      const [popup] = await Promise.all([
        page.waitForEvent("popup"),
        page.locator(`#${opener}`).click(),
      ]);
      popup.on("pageerror", (error) =>
        errors.push(`${game} popup: ${error.message}`),
      );
      await popup.waitForLoadState();
      if (["mole", "dodgeball"].includes(game))
        await page.locator("#confirm-start").click();
      if (pauseId) {
        await popup.waitForFunction(playing);
        await page.locator(`#${pauseId}`).click();
      }
      const resume = popup.locator(`#${resumeId}`);
      await resume.waitFor({ state: "visible" });
      assert(await resume.isEnabled());
      assert(
        await resume.evaluate((el) => el === document.activeElement),
        `${game} popup Resume focus`,
      );
      const bounds = await resume.boundingBox();
      assert(bounds && bounds.height >= 44, `${game} popup touch target`);
      await popup.screenshot({
        path: resolve(output, `after-${game}-popup.png`),
      });
      await popup.keyboard.press("Enter");
      await popup.waitForFunction(playing);
      if (game === "maze") assert.equal(await popup.locator("svg").count(), 0);
      results.push({
        game,
        popup: true,
        action: "Enter",
        resumeInPlayWindow: true,
      });
      console.log(`after-${game}-popup: passed`);
      await popup.close();
      await page.close();
    }
    await context.close();
  }
  assert.deepEqual(errors, [], "No uncaught browser errors");
  await writeFile(
    resolve(
      output,
      `${values.popups ? "popup" : baseline ? "before" : "after"}-results.json`,
    ),
    JSON.stringify({ browser: browser.version(), results, errors }, null, 2) +
      "\n",
  );
} finally {
  await browser?.close();
  await server.close();
}
