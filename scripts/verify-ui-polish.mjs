/* global document, innerWidth, getComputedStyle */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const before = process.argv.includes("--before");
// Keep the visual baseline reproducible after this PR is merged.
const baseline = "5800f632fe1fbb2dbaeaea47d3a9ae5950327dc5";
const themeFiles = new Set(
  [
    "camera-choice.css",
    "directory.css",
    "dodgeball.css",
    "mole.css",
    "runner.css",
    "pre-game-settings.css",
    "mole-targets.ts",
    "dodgeball-viewer.ts",
    "runner-viewer.ts",
  ].map((name) => `apps/mirror/src/${name}`),
);
const output = resolve("reports/local/ui-polish");
await mkdir(output, { recursive: true });
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
assert(executablePath, "Set CHROME_PATH to an installed Chromium browser.");
function contrast(foreground, background) {
  const fg = foreground.match(/[\d.]+/g).map(Number);
  const bg = background.match(/[\d.]+/g).map(Number);
  const alpha = fg[3] ?? 1;
  const luminance = (rgb) =>
    rgb.slice(0, 3).reduce((sum, value, index) => {
      const channel = value / 255;
      return (
        sum +
        [0.2126, 0.7152, 0.0722][index] *
          (channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4)
      );
    }, 0);
  const front = luminance(
    fg
      .slice(0, 3)
      .map((value, index) => value * alpha + bg[index] * (1 - alpha)),
  );
  const back = luminance(bg);
  return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);
}
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false },
  plugins: before
    ? [
        {
          name: "immutable-theme-baseline",
          enforce: "pre",
          load(id) {
            const file = relative(process.cwd(), id.split("?")[0]).replaceAll(
              "\\",
              "/",
            );
            if (themeFiles.has(file)) {
              const snapshot = (path) =>
                execFileSync("git", ["show", `${baseline}:${path}`], {
                  encoding: "utf8",
                });
              // CSS @import reads disk outside Vite's module load hook. Inline
              // the pinned shared shell so Dodgeball/Runner cannot mix themes.
              return snapshot(file).replace(/@import "\.\/mole\.css";/g, () =>
                snapshot("apps/mirror/src/mole.css"),
              );
            }
          },
        },
      ]
    : [],
});
await server.listen();
let browser;
const result = { baseline, before, cases: [], errors: [], cameraStarts: 0 };
try {
  browser = await chromium.launch({ executablePath, headless: true });
  result.browser = browser.version();
  const context = await browser.newContext();
  await context.route("**/api/**", async (route) => {
    if (route.request().method() !== "GET") result.cameraStarts++;
    assert.equal(
      route.request().method(),
      "GET",
      "No camera acquisition is allowed",
    );
    await route.fulfill({
      json: route.request().url().endsWith("/cameras")
        ? { cameras: [] }
        : { state: "idle" },
    });
  });
  for (const width of [1440, 390, 320]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    assert.equal(await page.evaluate(() => innerWidth), width);
    page.on("pageerror", (error) => result.errors.push(error.message));
    for (const game of ["directory", "mole", "dodgeball", "runner", "maze"]) {
      await page.goto(
        new URL(
          game === "directory" ? "/" : `/${game}.html`,
          server.resolvedUrls.local[0],
        ).href,
      );
      await page
        .locator(game === "directory" ? ".game-card" : "#game-stage, #maze-map")
        .first()
        .waitFor();
      assert.equal(await page.locator("html").getAttribute("lang"), "en");
      if (before && ["mole", "dodgeball", "runner"].includes(game))
        assert.equal(
          await page.evaluate(
            () => getComputedStyle(document.body).backgroundColor,
          ),
          "rgb(246, 245, 239)",
        );
      const noOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      );
      await page.screenshot({
        path: resolve(
          output,
          `${before ? "before" : "after"}-${game}-${width}.png`,
        ),
      });
      if (!before && !noOverflow) {
        console.log(
          await page.evaluate(() =>
            [...document.querySelectorAll("body *")]
              .map((element) => ({
                tag: element.tagName,
                id: element.id,
                class: element.className,
                right: element.getBoundingClientRect().right,
              }))
              .filter((item) => item.right > innerWidth + 1)
              .slice(0, 15),
          ),
        );
        assert.fail(`${game} overflow at ${width}`);
      }
      const colors = await page.evaluate((game) => {
        const pairs =
          game === "directory"
            ? [
                [
                  ".game-card:has(.art-maze) .game-action",
                  ".game-card:has(.art-maze) .game-action",
                  4.5,
                ],
              ]
            : ["mole", "dodgeball"].includes(game)
              ? [
                  [".intro", "body", 4.5],
                  [".score-item > span", ".scoreboard", 4.5],
                  [".score-item.primary-score strong", ".scoreboard", 3],
                  ["#confirm-start", "#confirm-start", 4.5],
                ]
              : [];
        return pairs.map(([selector, background, minimum]) => ({
          selector,
          minimum,
          foreground: getComputedStyle(document.querySelector(selector)).color,
          background: getComputedStyle(document.querySelector(background))
            .backgroundColor,
        }));
      }, game);
      const contrasts = colors.map((color) => ({
        ...color,
        ratio: contrast(color.foreground, color.background),
      }));
      if (!before)
        for (const color of contrasts)
          assert(
            color.ratio >= color.minimum,
            `${game} ${color.selector}: contrast ${color.ratio}`,
          );
      if (game !== "directory") {
        if (game !== "maze")
          await page.locator("#source-select").selectOption("demo");
        await page
          .locator(game === "runner" ? "#overlay-start" : "#confirm-start")
          .click();
        if (game === "runner")
          await page.locator('[data-runner-phase="playing"]').waitFor();
        else if (game !== "maze")
          await page.locator("#game-overlay").waitFor({ state: "hidden" });
        const stage = page.locator(
          game === "maze" ? "#maze-map" : "#game-stage",
        );
        await stage.scrollIntoViewIfNeeded();
        if (!before)
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          );
        await page.screenshot({
          path: resolve(
            output,
            `${before ? "before" : "after"}-${game}-play-${width}.png`,
          ),
        });
      }
      result.cases.push({
        game,
        width,
        noOverflow,
        contrasts,
        roundStarted: game !== "directory",
      });
    }
    await page.close();
  }
  // Exercise the actual CSS in a reduced-motion browser, including shared settings.
  if (!before) {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(new URL("/mole.html", server.resolvedUrls.local[0]).href);
    await page.locator("#close-settings").click();
    const feedback = await page.evaluate(() => {
      const stage = document.querySelector("#game-stage");
      stage.setAttribute("data-flash", "hit");
      const particle = document.createElement("span");
      particle.className = "mole-particle";
      stage.append(particle);
      return {
        particleAnimation: getComputedStyle(particle).animationName,
        flashAnimation: getComputedStyle(stage, "::before").animationName,
        muted: getComputedStyle(document.documentElement)
          .getPropertyValue("--mm-muted")
          .trim(),
      };
    });
    assert.equal(feedback.particleAnimation, "none");
    assert.equal(feedback.flashAnimation, "none");
    result.reducedMotion = feedback;
    await page.close();
  }
  assert.deepEqual(result.errors, []);
  assert.equal(result.cameraStarts, 0);
  await writeFile(
    resolve(output, `${before ? "before" : "after"}.json`),
    JSON.stringify(result, null, 2),
  );
  console.log(
    `${result.cases.length} English page/viewport cases passed; zero camera starts or uncaught errors.`,
  );
} finally {
  await browser?.close();
  await server.close();
}
