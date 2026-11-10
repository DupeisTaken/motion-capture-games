/* global document, innerWidth */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const baseline = process.argv.includes("--baseline");
const output = resolve("reports/local/pre-game-settings");
await mkdir(output, { recursive: true });
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
assert(executablePath, "Set CHROME_PATH to an existing Chromium browser.");
const sources = new Map(
  baseline
    ? ["mole", "dodgeball"].map((game) => {
        const path = `apps/mirror/src/${game}-viewer.ts`;
        return [
          path,
          execFileSync("git", ["show", `15a56dc:${path}`], {
            encoding: "utf8",
          }),
        ];
      })
    : [],
);
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
  plugins: [
    {
      name: "pre-game-settings-baseline",
      enforce: "pre",
      transform(_source, id) {
        for (const [path, source] of sources)
          if (id.replaceAll("\\", "/").endsWith(`/${path}`)) return source;
      },
    },
  ],
});
let browser;
const results = [];
try {
  await server.listen();
  browser = await chromium.launch({ executablePath, headless: true });
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    const context = await browser.newContext({ viewport, locale: "en-US" });
    const calls = [];
    await context.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      calls.push(path);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          path === "/api/cameras"
            ? {
                cameras: [{ id: "a".repeat(64), name: "Synthetic USB camera" }],
              }
            : { state: "stopped", epoch: "setup-fixture" },
        ),
      });
    });
    for (const game of ["mole", "dodgeball"]) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${server.resolvedUrls.local[0]}${game}.html`);
      await page.locator("#source-select").waitFor();
      const prefix = `${baseline ? "before" : "after"}-${game}-${viewport.width}`;
      if (baseline) {
        await page.screenshot({
          path: resolve(output, `${prefix}.png`),
          fullPage: true,
        });
      } else {
        const dialog = page.locator("#pre-game-settings");
        await page.waitForFunction(
          () => document.querySelector("dialog")?.open,
        );
        assert.equal(
          await page
            .locator("#close-settings")
            .evaluate((el) => el === document.activeElement),
          true,
        );
        assert.equal(calls.filter((path) => path === "/api/start").length, 0);
        await page.keyboard.press("Tab");
        assert.equal(
          await dialog.evaluate((el) => el.contains(document.activeElement)),
          true,
        );
        // Both sections belong to the same native modal; select a camera without acquisition.
        await page.locator("#source-select").selectOption("camera");
        await page.locator("#camera-choice").selectOption("a".repeat(64));
        if (game === "mole") {
          await page.locator("#interaction-flick").click();
          assert.equal(
            await page
              .locator("#interaction-flick")
              .getAttribute("aria-pressed"),
            "true",
          );
        }
        await page.screenshot({
          path: resolve(output, `${prefix}-setup.png`),
          animations: "disabled",
        });
        assert.equal(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          true,
        );
        await page.keyboard.press("Escape");
        assert.equal(await dialog.evaluate((el) => el.open), false);
        assert.equal(
          await page.locator("#source-select").inputValue(),
          "camera",
        );
        assert.equal(await page.locator("#source-select").isDisabled(), false);
        await page.locator("#start-round").click();
        await page.locator("#source-select").selectOption("demo");
        await page.locator("#mode-select").selectOption("practice");
        await page.locator("#difficulty-select").selectOption("easy");
        if (game === "mole") await page.locator("#interaction-flick").click();
        if (viewport.width <= 390) {
          await page.locator("#game-settings-title").scrollIntoViewIfNeeded();
          const heading = await page
            .locator("#game-settings-title")
            .boundingBox();
          const footer = await page.locator(".setup-actions").boundingBox();
          assert(heading && footer && heading.y + heading.height <= footer.y);
          await page.screenshot({
            path: resolve(output, `${prefix}-game-options.png`),
            animations: "disabled",
          });
        }
        await page.locator("#confirm-start").click();
        await page.waitForFunction(
          () => document.querySelector("#game-overlay")?.hidden,
        );
        assert.equal(await dialog.evaluate((el) => el.open), false);
        assert.equal(await page.locator("#open-settings").isDisabled(), true);
        assert.equal(await page.locator("#mode-select").isDisabled(), true);
        await page.screenshot({
          path: resolve(output, `${prefix}-play.png`),
          fullPage: true,
        });
        await page.locator("#pause-round").click();
        assert.equal(await dialog.evaluate((el) => el.open), false);
        await page.locator("#resume-round").click();
        await page.waitForFunction(
          () => document.querySelector("#game-overlay")?.hidden,
        );
        await page.locator("#end-round").click();
        if (viewport.width === 1440) {
          await page.locator("#restart-round").click();
          const opened = page.waitForEvent("popup");
          await page
            .locator(
              game === "mole" ? "#open-game-display" : "#open-game-window",
            )
            .click();
          const popup = await opened;
          popup.on("pageerror", (error) => errors.push(error.message));
          await page.locator("#confirm-start").click();
          await popup.waitForFunction(
            () => document.querySelector("#game-overlay")?.hidden,
          );
          assert.equal(await popup.locator("#pre-game-settings").count(), 0);
          assert.equal(await popup.locator("#game-stage").count(), 1);
          await popup.screenshot({
            path: resolve(output, `${prefix}-display.png`),
          });
          await popup.close();
          await page.locator("#game-stage").waitFor();
          await page.locator("#end-round").click();
        }
        const resultCopy = await page.locator("#overlay-copy").textContent();
        await page.locator("#restart-round").click();
        assert.equal(await dialog.evaluate((el) => el.open), true);
        assert.equal(
          await page.locator("#mode-select").inputValue(),
          "practice",
        );
        assert.equal(
          await page.locator("#difficulty-select").inputValue(),
          "easy",
        );
        if (game === "mole") {
          assert.equal(
            await page
              .locator("#interaction-flick")
              .getAttribute("aria-pressed"),
            "true",
          );
        }
        await page.locator("#close-settings").click();
        assert.equal(
          await page.locator("#overlay-copy").textContent(),
          resultCopy,
        );
        assert.equal(
          await page
            .locator("#restart-round")
            .evaluate((el) => el === document.activeElement),
          true,
        );
        await page.locator("#restart-round").click();
        await page.locator("#confirm-start").click();
        await page.waitForFunction(
          () => document.querySelector("#game-overlay")?.hidden,
        );
        await page.locator("#end-round").click();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      }
      assert.deepEqual(errors, []);
      results.push({ game, viewport, baseline, pageErrors: errors.length });
      await page.close();
    }
    await context.close();
  }
  await writeFile(
    resolve(output, baseline ? "before.json" : "after.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
