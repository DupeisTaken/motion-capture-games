/* global window, document, navigator */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { verifyMazeFlow } from "./verify-maze-flow.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const { values } = parseArgs({
  options: {
    "report-only": { type: "boolean", default: false },
    "chrome-executable": { type: "string" },
  },
});
const executablePath =
  values["chrome-executable"] ||
  process.env.CHROME_PATH ||
  [
    process.env.PROGRAMFILES &&
      resolve(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      resolve(
        process.env["PROGRAMFILES(X86)"],
        "Microsoft/Edge/Application/msedge.exe",
      ),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((path) => path && existsSync(path));
assert(
  executablePath,
  "Supply an installed browser via --chrome-executable; none is downloaded.",
);
const output = resolve(root, "reports/local/virtual-maze");
await mkdir(output, { recursive: true });
const results = {
  mode: values["report-only"] ? "offline-report" : "real-vite-browser",
  language: "en",
  startedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  requests: [],
  limitations: [
    "Synthetic position/directions and photo; no cameras, physical accuracy, acoustic SPL or hardware buzzer certification.",
    "WebAudio parameter and state checks verify software signals; speaker audibility and sound-pressure levels were not measured.",
  ],
};
const sizes = [
  ["desktop", 1440, 1050],
  ["mobile", 390, 844],
  ["narrow", 320, 740],
];
let server, browser;
async function capture(page, name, viewports = sizes) {
  for (const [suffix, width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) =>
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(resolve),
        ),
      );
    });
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    if (!fits) {
      await page.screenshot({
        path: resolve(output, `${name}-${suffix}-overflow.png`),
        fullPage: false,
      });
      const overflowing = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => ({
            tag: element.tagName,
            id: element.id,
            width: element.clientWidth,
            scrollWidth: element.scrollWidth,
            text: element.textContent.slice(0, 70),
          }))
          .slice(0, 12),
      );
      assert.fail(
        `${name} overflow at ${width}px: ${JSON.stringify(overflowing)}`,
      );
    }
    const dialog = page.locator("#pre-game-settings");
    if (await dialog.isVisible())
      assert(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
        `${name} dialog overflow at ${width}px`,
      );
    const filename = `${name}-${suffix}.png`;
    await page.screenshot({
      path: resolve(output, filename),
      fullPage: !(await dialog.isVisible()),
    });
    results.screenshots.push(filename);
    if (name === "report") {
      const topFilename = `${name}-${suffix}-top.png`;
      await page.screenshot({
        path: resolve(output, topFilename),
        fullPage: false,
      });
      results.screenshots.push(topFilename);
    }
  }
}
try {
  server = await createServer({
    configFile: resolve(root, "vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false },
    plugins: [
      {
        name: "maze-report",
        configureServer(vite) {
          vite.middlewares.use(
            "/maze-report.html",
            async (_request, response, next) => {
              try {
                response.setHeader("Content-Type", "text/html; charset=utf-8");
                response.end(
                  await readFile(
                    resolve(root, "reports/virtual-maze.html"),
                    "utf8",
                  ),
                );
              } catch (error) {
                next(error);
              }
            },
          );
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--autoplay-policy=user-gesture-required"],
  });
  const context = await browser.newContext();
  context.on("page", (page) => {
    page.on("pageerror", (error) => results.errors.push(error.message));
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type()))
        results.errors.push(message.text());
    });
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api"))
        results.requests.push({ method: request.method(), url: request.url() });
    });
  });
  await context.addInitScript(() => {
    window.__mazeAcquisitions = 0;
    window.__mazeAudio = [];
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = () => {
        window.__mazeAcquisitions++;
        return Promise.reject(
          new Error("Camera access is forbidden in maze verification"),
        );
      };
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      createGain() {
        const node = super.createGain();
        for (const method of ["setTargetAtTime", "setValueAtTime"]) {
          const original = node.gain[method].bind(node.gain);
          node.gain[method] = (...args) => {
            window.__mazeAudio.push({ method, value: args[0] });
            return original(...args);
          };
        }
        return node;
      }
    };
  });
  const page = await context.newPage();
  if (values["report-only"]) {
    await page.goto(`${base}/maze-report.html`);
    assert.equal(await page.locator("h1").count(), 1);
    await capture(page, "report");
    results.checks.push(
      "Self-contained report renders at 1440, 390 and 320 pixels without horizontal overflow.",
    );
  } else {
    await verifyMazeFlow({ page, base, capture, results, sizes });
  }
  assert.deepEqual(results.errors, []);
  results.passed = true;
} catch (error) {
  results.passed = false;
  results.failure = error.stack || String(error);
  throw error;
} finally {
  results.completedAt = new Date().toISOString();
  try {
    await browser?.close();
  } finally {
    await server?.close();
    await writeFile(
      resolve(
        output,
        values["report-only"] ? "report-results.json" : "results.json",
      ),
      `${JSON.stringify(results, null, 2)}\n`,
    );
  }
}
console.log(JSON.stringify(results, null, 2));
