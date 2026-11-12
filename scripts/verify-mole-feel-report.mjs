/* global document, window */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const executablePath = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));
assert(executablePath, "Set CHROME_PATH to an installed browser.");
const html = await readFile("reports/playtest-mole-feel.html");
const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const output = resolve("reports/local/mole-feel");
  await mkdir(output, { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    // Lazy report images must load before validating their embedded content.
    await page.evaluate(async () => {
      const images = [...document.images];
      images.forEach((image) => (image.loading = "eager"));
      await Promise.all(images.map((image) => image.decode()));
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.screenshot({
      path: resolve(output, `report-${name}.jpg`),
      fullPage: true,
      type: "jpeg",
      quality: 65,
    });
    await page.close();
  }
  console.log(
    "Self-contained HTML report: desktop/mobile, embedded images decoded, no overflow.",
  );
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
