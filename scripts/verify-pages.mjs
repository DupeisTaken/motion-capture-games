/* global document, innerWidth */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { preview } from "vite";

const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
assert(executablePath, "Set CHROME_PATH to an installed Chromium browser.");
const output = resolve("reports/local/github-pages");
await mkdir(output, { recursive: true });
const base = "/motion-capture-games/";
const server = await preview({
  mode: "pages",
  base,
  appType: "mpa",
  preview: { port: 0, strictPort: false, proxy: {} },
});
let browser;
try {
  const url = server.resolvedUrls.local[0];
  assert.equal(new URL(url).pathname, base);
  browser = await chromium.launch({ executablePath, headless: true });
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(request.url()));
    page.on("websocket", (socket) => errors.push(socket.url()));
    page.on("response", (response) => {
      if (response.status() >= 400)
        errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(url);
    assert.equal(await page.locator(".game-card").count(), 4);
    assert.equal(await page.locator("#tools").isVisible(), false);
    await page.screenshot({
      path: resolve(output, `directory-${viewport.width}.png`),
    });
    for (const game of ["mole", "dodgeball", "runner", "maze"]) {
      await page.locator(`a.game-card[href="./${game}.html"]`).click();
      assert.equal(new URL(page.url()).pathname, `${base}${game}.html`);
      if (game === "maze") {
        assert.equal(await page.locator("#maze-calibration").count(), 0);
      } else {
        assert.equal(await page.locator("#source-select").inputValue(), "demo");
        assert.equal(
          await page.locator('#source-select option[value="camera"]').count(),
          0,
        );
      }
      assert.equal(await page.locator("dialog[open]").count(), 0);
      await page
        .locator(game === "maze" ? "#maze-start" : "#overlay-start")
        .click();
      if (game === "runner")
        await page.locator('[data-runner-phase="playing"]').waitFor();
      else if (game === "maze")
        await page
          .getByRole("button", { name: "Pause", exact: true })
          .waitFor();
      else await page.locator("#game-overlay").waitFor({ state: "hidden" });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: resolve(output, `${game}-${viewport.width}.png`),
      });
      const nav = page.getByRole("navigation", {
        name: "Motion Studio navigation",
      });
      await nav.getByRole("button", { name: "Switch view" }).click();
      assert.equal(await nav.getByRole("link").count(), 5);
      assert.equal(await nav.locator('[aria-current="page"]').count(), 1);
      assert.equal(
        await nav.getByRole("heading", { name: "Operator tools" }).count(),
        0,
      );
      assert.deepEqual(
        await nav
          .locator("a")
          .evaluateAll((links) =>
            links.map((link) => new URL(link.href).pathname),
          ),
        [
          base,
          ...["mole", "dodgeball", "runner", "maze"].map(
            (name) => `${base}${name}.html`,
          ),
        ],
      );
      await page.screenshot({
        path: resolve(output, `navigation-${game}-${viewport.width}.png`),
      });
      // Exercise the shared chooser as well as the static directory cards.
      const nextGame = game === "mole" ? "Dodgeball" : "Slap a Mole";
      await nav.getByRole("link", { name: nextGame, exact: true }).click();
      assert.equal(
        new URL(page.url()).pathname,
        `${base}${nextGame === "Dodgeball" ? "dodgeball" : "mole"}.html`,
      );
      assert.equal(await page.locator("dialog[open]").count(), 0);
      await page
        .getByRole("navigation", { name: "Motion Studio navigation" })
        .getByRole("link", { name: "All games", exact: true })
        .click();
      assert.equal(new URL(page.url()).pathname, base);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(
      requests.filter((request) => {
        const target = new URL(request);
        return (
          target.origin !== new URL(url).origin ||
          !target.pathname.startsWith(base) ||
          target.pathname.startsWith(`${base}api/`)
        );
      }),
      [],
    );
    await page.close();
    console.log(
      `${viewport.width}×${viewport.height}: four rounds started; five project-path destinations, cross-game chooser and directory return passed; no API or asset errors.`,
    );
  }
} finally {
  try {
    await browser?.close();
  } finally {
    await new Promise((done) => server.httpServer.close(done));
  }
}
