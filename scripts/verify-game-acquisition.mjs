/* global document, Event */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const before = process.argv.includes("--before");
const runnerOnly = process.argv.includes("--runner");
const phase = before ? "before" : "after";
const baseline = "3ff148718fa062843c56774d329fffdffb4a5c88";
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
assert(executablePath, "Use an installed browser; no download.");
const originals = new Map();
if (before)
  for (const name of ["mole", "dodgeball", "runner"]) {
    const path = `apps/mirror/src/${name}-viewer.ts`;
    originals.set(
      path,
      execFileSync("git", ["show", `${baseline}:${path}`], {
        encoding: "utf8",
      }),
    );
  }
const server = await createServer({
  server: { host: "127.0.0.1", port: 5198, strictPort: true, hmr: false },
  plugins: [
    {
      name: "acquisition-before-evidence",
      enforce: "pre",
      transform(_source, id) {
        const path = id.replaceAll("\\", "/").split("/apps/mirror/src/")[1];
        return path && originals.get(`apps/mirror/src/${path}`);
      },
    },
  ],
});
await server.listen();
let browser;
const result = {
  phase,
  baseline,
  browser: "",
  language: "en-US",
  cases: [],
  screenshots: [],
  errors: [],
};
try {
  browser = await chromium.launch({ executablePath, headless: true });
  result.browser = browser.version();
  for (const [size, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    for (const game of runnerOnly ? ["runner"] : ["mole", "dodgeball"]) {
      const runner = game === "runner";
      const stopId = runner ? "source-stop" : "setup-stop-camera";
      const retryId = runner ? "retry-camera-stop" : "setup-retry-camera-stop";
      const statusId = runner ? "camera-status" : "setup-input-status";
      const context = await browser.newContext({
        locale: "en-US",
        viewport: { width, height },
      });
      let starts = 0;
      let startMode = "pending";
      let pending;
      let stopFails = false;
      const stopEpochs = [];
      await context.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/cameras")
          return route.fulfill({
            json: {
              cameras: [
                { id: "a".repeat(64), name: "Synthetic acquisition device" },
              ],
            },
          });
        if (path === "/api/start") {
          starts++;
          if (startMode === "pending") {
            pending = route;
            startMode = "running";
            return;
          }
          return route.fulfill({
            json:
              startMode === "malformed"
                ? { state: runner ? "error" : "running" }
                : { state: "running", epoch: "synthetic-current-owner" },
          });
        }
        if (path === "/api/stop") {
          stopEpochs.push(route.request().postDataJSON().epoch);
          return route.fulfill({
            status: stopFails ? 409 : 200,
            json: stopFails
              ? { detail: "Synthetic driver still stopping" }
              : { state: "idle" },
          });
        }
        return route.fulfill({ json: { state: "idle" } });
      });
      await context.routeWebSocket("**/api/**", (socket) =>
        socket.onMessage(() => {}),
      );
      const page = await context.newPage();
      page.on("pageerror", (error) => result.errors.push(error.message));
      const url = `${server.resolvedUrls.local[0]}${game}.html`;
      async function open() {
        await page.goto(url);
        if (runner) await page.locator("#source-select").selectOption("camera");
        await page.waitForFunction(
          () =>
            !document.querySelector("#camera-choice").disabled &&
            !!document.querySelector("#camera-choice").value,
        );
      }
      async function capture(name) {
        const file = `acquisition-${phase}-${game}-${name}-${size}.png`;
        await page.screenshot({ path: resolve(output, file) });
        result.screenshots.push(file);
      }
      const controlIds = [
        "source-connect",
        "source-select",
        "camera-choice",
        "refresh-cameras",
      ];
      async function assertLocked(locked) {
        for (const id of controlIds)
          assert.equal(
            await page.locator(`#${id}`).isDisabled(),
            locked,
            `${game}/${size}/${id}`,
          );
      }
      async function forgedStart() {
        await page.evaluate(() =>
          document
            .querySelector("#source-connect")
            .dispatchEvent(new Event("click")),
        );
        await page.waitForTimeout(100); // Let a wrongly admitted fetch reach the intercepted boundary.
      }
      await open();
      await page.locator("#source-connect").click();
      await page.locator(`#${stopId}`).click();
      await page.waitForTimeout(100);
      assert(pending, "Synthetic Start reached the held acknowledgement.");
      assert.equal(await page.locator("#source-connect").isDisabled(), !before);
      await capture("pending");
      await forgedStart();
      assert.equal(
        starts,
        before ? 2 : 1,
        "Stop must not admit replacement before startup settles",
      );
      stopFails = true;
      await pending.fulfill({
        json: { state: "running", epoch: "synthetic-late-owner" },
      });
      await page.locator(`#${retryId}`).waitFor({ state: "visible" });
      if (!before) {
        await assertLocked(true);
        await forgedStart();
        assert.equal(starts, 1);
        await capture("failed-release");
        stopFails = false;
        await page.locator(`#${retryId}`).click();
        await page.waitForFunction(
          () => !document.querySelector("#source-connect").disabled,
        );
        await assertLocked(false);
        assert(stopEpochs.every((epoch) => epoch === "synthetic-late-owner"));
        await page.locator("#source-connect").click();
        await page.waitForTimeout(100);
        assert.equal(
          starts,
          2,
          "Confirmed cleanup permits explicit replacement",
        );
        await page.locator(`#${stopId}`).click();
        startMode = "malformed";
        await open();
        const beforeUnknown = starts;
        await page.locator("#source-connect").click();
        await page.waitForFunction(
          (id) =>
            document
              .querySelector(`#${id}`)
              .textContent.includes("ownership is unknown"),
          statusId,
        );
        await assertLocked(true);
        await forgedStart();
        assert.equal(starts, beforeUnknown + 1);
        assert.match(
          await page.locator(`#${statusId}`).textContent(),
          /Restart the local vision service.*reload/,
        );
        await capture("unknown");
      }
      result.cases.push({
        game,
        size,
        pendingReplacementStarts: before ? 2 : 1,
        guardedRetryAndUnknown: !before,
      });
      await context.close();
    }
  }
  assert.deepEqual(result.errors, []);
  await writeFile(
    resolve(output, `acquisition-${runnerOnly ? "runner-" : ""}${phase}.json`),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
