/* global document, innerWidth */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const reportPath = resolve("reports/playtest-tracking.html");
const output = resolve("reports/local/playtest-tracking");
await mkdir(output, { recursive: true });
const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
assert(executablePath, "Set CHROME_PATH to an installed Chromium browser.");
const server = createServer(async (_request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(await readFile(reportPath));
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
assert(address && typeof address === "object");
let browser;
const evidence = [];
const figures = [];
try {
  browser = await chromium.launch({ executablePath, headless: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      assert.equal(new URL(route.request().url()).hostname, "127.0.0.1");
      await route.continue();
    });
    const response = await page.goto(`http://127.0.0.1:${address.port}/`);
    assert.equal(response.status(), 200);
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.equal(await page.locator("#metric-rows tr").count(), 8);
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    assert(noOverflow, `${name}: page overflow`);
    assert.equal(errors.length, 0);
    const screenshot = await page.screenshot({
      path: resolve(output, `${name}.png`),
    });
    await page.screenshot({
      path: resolve(output, `${name}-full.png`),
      fullPage: true,
    });
    figures.push(
      `<figure><img alt="English ${name} report preview served over local HTTP, ${width} by ${height}" src="data:image/png;base64,${screenshot.toString("base64")}"><figcaption>${name}: ${width} × ${height}, real local HTTP rendering. Report preview only; no physical participant or camera evidence.</figcaption></figure>`,
    );
    evidence.push({
      name,
      width,
      height,
      language: "en",
      noOverflow,
      pageErrors: errors,
    });
    await page.close();
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
const report = await readFile(reportPath, "utf8");
await writeFile(
  reportPath,
  report.replace(
    /<div class="screens" id="screenshots">[\s\S]*?<\/div>/,
    `<div class="screens" id="screenshots">${figures.join("")}</div>`,
  ),
);
await writeFile(
  resolve(output, "verification.json"),
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(JSON.stringify(evidence));
