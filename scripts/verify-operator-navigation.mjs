/* global window, document */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const baseline = process.argv.includes("--baseline");
const reportOnly = process.argv.includes("--report-only");
const phase = baseline ? "before" : "after";
const output = resolve("reports/local/operator-navigation");
await mkdir(output, { recursive: true });
const executablePath =
  process.env.CHROME_PATH ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find(existsSync);
assert(executablePath, "Use an existing browser; set CHROME_PATH if needed.");
const ref = "2cea8d7033a8be02f4f9d7079ecc0e6ca676a6fa";
const originals = new Map();
if (baseline) {
  for (const path of execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", ref, "apps/mirror/src"],
    { encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/)) {
    if (path.endsWith(".ts"))
      originals.set(
        path,
        execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" }),
      );
  }
}
const server = await createServer({
  server: { host: "127.0.0.1", port: 5197, strictPort: true, hmr: false },
  plugins: [
    {
      name: "navigation-evidence",
      enforce: "pre",
      transform(_source, id) {
        const path = id.replaceAll("\\", "/").split("/apps/mirror/src/")[1];
        return path && originals.get(`apps/mirror/src/${path}`);
      },
      configureServer(vite) {
        vite.middlewares.use("/navigation-report.html", async (_req, res) => {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            await readFile("reports/playtest-operator-navigation.html", "utf8"),
          );
        });
      },
    },
  ],
});
await server.listen();
const url = server.resolvedUrls.local[0];
let browser;
const result = {
  phase,
  baseline: ref,
  language: "en-US",
  browser: "",
  checks: [],
  screenshots: [],
  errors: [],
};
try {
  browser = await chromium.launch({ executablePath, headless: true });
  result.browser = browser.version();
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1440, height: 1000 },
  });
  let stopFails = false;
  const requests = [];
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push({ path, body: route.request().postData() });
    if (path === "/api/cameras")
      return route.fulfill({
        json: {
          cameras: [{ id: "a".repeat(64), name: "Synthetic test device" }],
        },
      });
    if (path === "/api/start")
      return route.fulfill({
        json: { state: "running", epoch: "synthetic-navigation-owner" },
      });
    if (path === "/api/stop")
      return route.fulfill({
        status: stopFails ? 409 : 200,
        json: stopFails
          ? { detail: "Synthetic release failure; retry" }
          : { state: "idle" },
      });
    return route.fulfill({ json: { state: "idle" } });
  });
  // Hold synthetic streams open without connecting to a camera/vision service.
  await context.routeWebSocket("**/api/**", (socket) =>
    socket.onMessage(() => {}),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => result.errors.push(error.message));
  if (reportOnly) {
    await page.goto(`${url}navigation-report.html`);
    await page.waitForFunction(() =>
      [...document.images].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    );
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
      ["narrow", 320, 740],
    ]) {
      await page.setViewportSize({ width, height });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "report overflow",
      );
      await page.screenshot({
        path: resolve(output, `report-${name}.png`),
        fullPage: true,
      });
      await page.screenshot({
        path: resolve(output, `report-${name}-top.png`),
      });
    }
    console.log("Report verified at desktop, mobile and 320px widths.");
  } else {
    const routes = [
      ["directory", ""],
      ["diagnostics", "diagnostics.html"],
      ["rig", "rig.html"],
      ["mole", "mole.html"],
      ["dodgeball", "dodgeball.html"],
      ["runner", "runner.html"],
      ["maze", "maze.html"],
    ];
    for (const [size, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      for (const [name, path] of routes) {
        await page.goto(`${url}${path}`);
        if (await page.locator("#close-settings").isVisible())
          await page.locator("#close-settings").click();
        await page.evaluate(() => window.scrollTo(0, 0));
        if (!baseline) {
          const nav = page.getByRole("navigation", {
            name: "Motion Studio navigation",
          });
          await nav.getByRole("button", { name: "Switch view" }).click();
          assert.equal(await nav.getByRole("link").count(), 7);
          assert.equal(await nav.locator('[aria-current="page"]').count(), 1);
          assert(
            await nav
              .getByRole("link", { name: "Virtual Maze", exact: true })
              .isVisible(),
          );
          const box = await nav.boundingBox();
          assert(
            box.x >= 0 && box.x + box.width <= width + 1,
            `${name} navigation overflow`,
          );
        }
        const screenshot = `${phase}-${name}-${size}.png`;
        await page.screenshot({ path: resolve(output, screenshot) });
        result.screenshots.push(screenshot);
      }
    }
    result.checks.push(
      "Real Vite server: all seven routes captured at 1440×1000 and 390×844, English; no camera/service used",
    );
    if (!baseline) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${url}diagnostics.html`);
      const nav = page.getByRole("navigation", {
        name: "Motion Studio navigation",
      });
      const toggle = nav.getByRole("button", { name: "Switch view" });
      await toggle.focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        "Slap a Mole",
      );
      await page.screenshot({
        path: resolve(output, "after-keyboard-mobile.png"),
      });
      await page.keyboard.press("Escape");
      assert(await toggle.evaluate((el) => el === document.activeElement));
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      result.checks.push(
        "Keyboard Enter opens, Tab reaches first game, Escape closes and returns focus",
      );
      assert.equal(
        requests.filter((req) => req.path === "/api/start").length,
        0,
        "navigation must not start capture",
      );
      await page.locator("#source-demo").click();
      await page.locator("#start").click();
      await page.waitForFunction(
        () => !document.querySelector("#stop").disabled,
      );
      await nav.getByRole("link", { name: "All games", exact: true }).click();
      assert.equal(new URL(page.url()).pathname, "/diagnostics.html");
      assert.match(
        await nav.locator('[role="status"]').textContent(),
        /source is active/,
      );
      stopFails = true;
      await page.locator("#stop").click();
      await page
        .getByRole("button", { name: "Retry camera stop", exact: true })
        .waitFor({ state: "visible" });
      await nav.getByRole("link", { name: "All games", exact: true }).click();
      assert.match(
        await nav.locator('[role="status"]').textContent(),
        /Retry camera stop/,
      );
      await page.screenshot({
        path: resolve(output, "after-release-recovery-mobile.png"),
      });
      stopFails = false;
      await page
        .getByRole("button", { name: "Retry camera stop", exact: true })
        .click();
      await page.waitForFunction(
        () => document.querySelector("#camera-release").hidden,
      );
      await nav.getByRole("link", { name: "All games", exact: true }).click();
      await page.waitForURL(url);
      result.checks.push(
        "Synthetic source departure blocked; failed scoped Stop retained Retry; acknowledged retry allowed directory return",
      );
      assert(
        requests
          .filter((req) => req.path === "/api/stop")
          .every(
            (req) =>
              JSON.parse(req.body).epoch === "synthetic-navigation-owner",
          ),
      );
      // Independent source owners can veto departure without importing navigation.
      await page.goto(`${url}maze.html`);
      if (await page.locator("#close-settings").isVisible())
        await page.locator("#close-settings").click();
      await page.evaluate(() =>
        document.querySelector("#app").addEventListener(
          "motion-studio:navigation-check",
          (event) => {
            event.preventDefault();
            event.detail.reason =
              "Synthetic calibration capture: stop and confirm release before switching.";
          },
          { once: true },
        ),
      );
      await page
        .getByRole("navigation", { name: "Motion Studio navigation" })
        .getByRole("link", { name: "All games", exact: true })
        .click();
      assert.equal(new URL(page.url()).pathname, "/maze.html");
      assert.match(
        await page.locator(".studio-navigation-message").textContent(),
        /calibration capture/,
      );
      result.checks.push(
        "Calibration-style app-local ownership veto keeps Maze on its operator page",
      );
      await page.goto(`${url}mole.html`);
      await page.locator("#source-select").selectOption("demo");
      const popupReady = context.waitForEvent("page");
      await page.locator("#open-game-display").click();
      const popup = await popupReady;
      await popup.waitForLoadState("domcontentloaded");
      assert.equal(await popup.locator(".studio-navigation").count(), 0);
      assert.equal(await popup.locator("#game-stage").count(), 1);
      await page.locator("#close-settings").click();
      await page
        .getByRole("navigation", { name: "Motion Studio navigation" })
        .getByRole("link", { name: "All games", exact: true })
        .click();
      assert.equal(new URL(page.url()).pathname, "/mole.html");
      assert.match(
        await page.locator(".studio-navigation-message").textContent(),
        /participant game window/,
      );
      await popup.close();
      await page
        .getByRole("navigation", { name: "Motion Studio navigation" })
        .getByRole("link", { name: "All games", exact: true })
        .click();
      await page.waitForURL(url);
      result.checks.push(
        "Separate participant window contains the same game stage and no operator navigation; departure waits for its return/close",
      );
    }
    assert.deepEqual(result.errors, []);
    await writeFile(
      resolve(output, `${phase}-results.json`),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await browser?.close();
  await server.close();
}
