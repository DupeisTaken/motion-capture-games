/* global document, innerWidth */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer, preview } from "vite";

const before = process.argv.includes("--before");
const production = process.argv.includes("--production");
const reportOnly = process.argv.includes("--report-only");
const phase = before ? "before" : production ? "production" : "after";
const output = resolve("reports/local/game-directory");
await mkdir(output, { recursive: true });
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
assert(executablePath, "Set CHROME_PATH to an installed Chromium browser.");
const server = production
  ? await preview({ preview: { port: 0, strictPort: false } })
  : await createServer({
      server: { port: 0, strictPort: false, hmr: false },
      plugins: [
        {
          name: "directory-report-preview",
          configureServer(vite) {
            vite.middlewares.use(
              "/directory-report.html",
              async (_request, response) => {
                response.setHeader("Content-Type", "text/html; charset=utf-8");
                response.end(
                  await readFile("reports/game-directory.html", "utf8"),
                );
              },
            );
          },
        },
      ],
    });
if (!production) await server.listen();
let browser;
const result = {
  phase,
  viewports: [],
  pages: [],
  rootApiRequests: [],
  errors: [],
};
try {
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext();
  // Tool/game pages may enumerate metadata. Never acquire a real camera for UI evidence.
  await context.route("**/api/**", async (route) => {
    assert.equal(route.request().method(), "GET", "Unexpected control request");
    await route.fulfill({
      json: route.request().url().endsWith("/cameras")
        ? { cameras: [] }
        : { state: "idle" },
    });
  });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
    ["narrow", 320, 740],
  ]) {
    const page = await context.newPage();
    page.on("pageerror", (error) => result.errors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/"))
        result.rootApiRequests.push(request.url());
    });
    await page.setViewportSize({ width, height });
    assert.equal(
      (
        await page.goto(
          reportOnly ? new URL("directory-report.html", url).href : url,
        )
      ).status(),
      200,
    );
    if (reportOnly) {
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.equal(
        await page
          .locator("img")
          .evaluateAll((images) =>
            images.every((image) => image.complete && image.naturalWidth > 0),
          ),
        true,
      );
      await page.screenshot({
        path: resolve(output, `report-${name}.png`),
        fullPage: true,
      });
      result.viewports.push({
        name,
        width,
        height,
        noOverflow: true,
        imagesLoaded: true,
      });
      await page.close();
      continue;
    }
    await page
      .locator(before ? "#workspace" : ".game-card")
      .first()
      .waitFor();
    await page.screenshot({
      path: resolve(output, `${phase}-${name}.png`),
      fullPage: true,
    });
    if (!before) {
      assert.equal(await page.locator(".game-card").count(), 4);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Skip to games",
      );
      await page.keyboard.press("Enter");
      assert.equal(new URL(page.url()).hash, "#games");
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement.getAttribute("href")),
        "/mole.html",
      );
      result.viewports.push({
        name,
        width,
        height,
        noOverflow: true,
        keyboardSkip: true,
      });
    }
    await page.close();
  }
  if (!before && !reportOnly) {
    assert.deepEqual(result.rootApiRequests, []);
    for (const path of [
      "mole.html",
      "dodgeball.html",
      "runner.html",
      "maze.html",
      "diagnostics.html",
      "rig.html",
    ]) {
      const page = await context.newPage({
        viewport: { width: 390, height: 844 },
      });
      page.on("pageerror", (error) => result.errors.push(error.message));
      await page.goto(url);
      await page
        .locator(`.game-card[href="/${path}"], .tool-link[href="/${path}"]`)
        .click();
      assert.equal(new URL(page.url()).pathname, `/${path}`);
      await page.locator("main").waitFor();
      if (await page.locator("dialog[open]").count())
        await page.keyboard.press("Escape");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${path} mobile overflow`,
      );
      await page.screenshot({
        path: resolve(output, `${phase}-${path}.png`),
        fullPage: true,
      });
      await page.setViewportSize({ width: 320, height: 740 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${path} narrow overflow`,
      );
      if (path === "diagnostics.html")
        assert.equal(await page.locator("#workspace").count(), 1);
      if (["mole.html", "dodgeball.html", "runner.html"].includes(path)) {
        await page.getByRole("button", { name: "Switch view" }).click();
        await page
          .getByRole("link", { name: "Tracking console", exact: true })
          .click();
        await page.locator("#workspace").waitFor();
        assert.equal(new URL(page.url()).pathname, "/diagnostics.html");
      }
      await page.locator(".brand, .mm-brand").first().click();
      await page.locator(".game-card").first().waitFor();
      assert.equal(new URL(page.url()).pathname, "/");
      result.pages.push({ path, navigation: true });
      await page.close();
    }
    const staticContext = await browser.newContext({
      javaScriptEnabled: false,
    });
    const staticPage = await staticContext.newPage();
    await staticPage.goto(url);
    await staticPage
      .getByRole("link", { name: "Slap a Mole", exact: true })
      .click();
    assert.equal(new URL(staticPage.url()).pathname, "/mole.html");
    await staticContext.close();
    assert.deepEqual(result.errors, []);
  }
  if (!before) assert.deepEqual(result.errors, []);
  await writeFile(
    resolve(output, `${reportOnly ? "report" : phase}.json`),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  if (production) await new Promise((done) => server.httpServer.close(done));
  else await server.close();
}
