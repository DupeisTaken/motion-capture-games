/* global window, document, navigator, Event */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { createServer } from "vite";

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
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `${name} overflow at ${width}px`,
    );
    const filename = `${name}-${suffix}.png`;
    await page.screenshot({ path: resolve(output, filename), fullPage: true });
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
    await page.goto(`${base}/rig.html`);
    await page.locator("#rig-rehearsal").waitFor();
    await capture(page, "before-rig", [sizes[0]]);
    await page.goto(`${base}/maze.html`);
    await page
      .locator("#maze-topology")
      .filter({ hasText: "hand rules fail" })
      .waitFor();
    assert.match(await page.locator("#maze-size").innerText(), /8 × 8 m/);
    assert.match(
      await page.locator("#maze-session-status").innerText(),
      /Ready for rehearsal/,
    );
    assert.equal(await page.evaluate(() => window.__mazeAudio.length), 0);
    const change = async (id, value) =>
      page.locator(`#${id}`).evaluate((element, value) => {
        element.value = String(value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    await page.locator("#maze-start").click();
    const originalZ = Number(await page.locator("#maze-z").inputValue());
    await page.locator("#maze-map").focus();
    await page.keyboard.press("ArrowUp");
    assert(
      Math.abs(
        Number(await page.locator("#maze-z").inputValue()) - originalZ - 0.1,
      ) < 0.011,
    );
    const pointerPosition = await page.locator("#maze-map").evaluate((map) => {
      const point = map.createSVGPoint();
      point.x = 1.2;
      point.y = 8 - 1.7;
      const screen = point.matrixTransform(map.getScreenCTM());
      return { x: screen.x, y: screen.y };
    });
    await page.mouse.move(pointerPosition.x - 5, pointerPosition.y);
    await page.mouse.down();
    await page.mouse.move(pointerPosition.x, pointerPosition.y);
    await page.mouse.up();
    assert(
      Math.abs(Number(await page.locator("#maze-x").inputValue()) - 1.2) <
        0.011,
    );
    assert(
      Math.abs(Number(await page.locator("#maze-z").inputValue()) - 1.7) <
        0.011,
    );
    results.checks.push(
      "Keyboard +Z movement and pointer dragging preserve metric map orientation and position.",
    );
    await change("maze-torso", 90);
    await change("maze-head", 0);
    const torso = await page.locator("#maze-heading").getAttribute("d");
    await page.locator("#maze-orientation").selectOption("head");
    assert.notEqual(
      await page.locator("#maze-heading").getAttribute("d"),
      torso,
    );
    await page.locator("#maze-quality").selectOption("head-missing");
    assert.match(
      await page.locator("#maze-session-status").innerText(),
      /missing orientation/,
    );
    assert(await page.locator("#maze-start").isDisabled());
    for (const id of ["maze-x-value", "maze-y-value", "maze-z-value"])
      assert.equal(await page.locator(`#${id}`).innerText(), "—");
    await page.locator("#maze-orientation").selectOption("torso");
    assert.match(await page.locator("#maze-start").innerText(), /Resume/);
    assert.equal(await page.locator("[data-level]").first().innerText(), "0");
    for (const quality of ["missing", "uncertain", "stale"]) {
      await page.locator("#maze-quality").selectOption("ready");
      await page.locator("#maze-start").click();
      await page.locator("#maze-quality").selectOption(quality);
      assert.match(
        await page.locator("#maze-session-status").innerText(),
        /Input unavailable/,
      );
    }
    await page.locator("#maze-quality").selectOption("ready");
    await page.locator("#maze-start").click();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.match(await page.locator("#maze-start").innerText(), /Resume/);
    results.checks.push(
      "Independent head/torso directions, missing selected direction, missing position/identity/stale input, unavailable XYZ, explicit recovery and blur pause verified.",
    );
    await change("maze-width", 5);
    await change("maze-depth", 10);
    await page.locator("#maze-difficulty").selectOption("easy");
    await page.locator("#maze-loops").uncheck();
    assert(await page.locator("#maze-start").isDisabled());
    await page.locator("#maze-config button[type=submit]").click();
    const goal = await page
      .locator('#maze-map circle[fill="#15977a"]')
      .evaluate((element) => ({
        x: Number(element.getAttribute("cx")),
        z: Number(element.getAttribute("cy")),
      }));
    await change("maze-x", goal.x);
    await change("maze-z", goal.z);
    await page.locator("#maze-start").click();
    assert.match(
      await page.locator("#maze-session-status").innerText(),
      /Goal reached/,
    );
    assert(await page.locator("#maze-start").isDisabled());
    await page.locator("#maze-reset").click();
    assert.match(
      await page.locator("#maze-session-status").innerText(),
      /Ready for rehearsal/,
    );
    results.checks.push(
      "Goal completion disables resume and silences output; explicit reset restores the start position.",
    );
    assert.match(
      await page.locator("#maze-topology").innerText(),
      /Perfect maze/,
    );
    assert.equal(await page.locator("#maze-size").innerText(), "5 × 10 m");
    await change("maze-width", 10);
    await change("maze-depth", 5);
    await change("maze-seed", "Z".repeat(80));
    await page.locator("#maze-difficulty").selectOption("hard");
    await page.locator("#maze-loops").check();
    await page.locator("#maze-config button[type=submit]").click();
    await capture(page, "long-seed", [sizes[2]]);
    results.checks.push(
      "5×10 and 10×5 dimensions, difficulty, loops off/on, settings regeneration and 80-character seed at 320 pixels verified.",
    );
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.evaluate(() => {
      window.__mazeOriginalOpen = window.open;
      window.open = () => null;
    });
    await page.locator("#maze-window").click();
    await page.waitForTimeout(250);
    assert.match(
      await page.locator("#maze-window-status").innerText(),
      /window blocked/,
    );
    await page.evaluate(() => {
      window.open = window.__mazeOriginalOpen;
    });
    const popupPromise = page.waitForEvent("popup");
    await page.locator("#maze-window").click();
    const popup = await popupPromise;
    await popup.locator("#participant-toggle").waitFor();
    assert.equal(await popup.locator("svg,#maze-map,#maze-size").count(), 0);
    await popup.locator("#participant-toggle").click();
    assert.match(
      await popup.locator("[data-participant-status]").innerText(),
      /running/,
    );
    await capture(popup, "participant-window", [sizes[1]]);
    await popup.close();
    await page.bringToFront();
    assert.match(await page.locator("#maze-start").innerText(), /Resume/);
    results.checks.push(
      "Popup-blocked guidance persists; real participant window contains no map/coordinates and shares pause/resume state; close returns safely.",
    );
    await change("maze-width", 8);
    await change("maze-depth", 8);
    await change("maze-seed", "quiet-path-01");
    await page.locator("#maze-difficulty").selectOption("medium");
    await page.locator("#maze-config button[type=submit]").click();
    const photo = await page.locator("#maze-map").screenshot();
    await page.locator("#maze-corners summary").click();
    await page.locator("#maze-photo").setInputFiles({
      name: "synthetic-maze-reference.png",
      mimeType: "image/png",
      buffer: photo,
    });
    await page.locator("#maze-photo-zone").waitFor({ state: "visible" });
    for (const [x, y] of [
      [10, 90],
      [90, 90],
      [90, 10],
      [10, 10],
    ]) {
      await page.locator("#maze-photo-x").fill(String(x));
      await page.locator("#maze-photo-y").fill(String(y));
      await page.locator("#maze-photo-y").press("Enter");
    }
    assert.match(
      await page.locator("#maze-photo-status").innerText(),
      /All four corners labelled/,
    );
    assert.equal(await page.locator("#maze-photo-corners li").count(), 4);
    assert(await page.locator("#maze-photo-add").isDisabled());
    await capture(page, "corners", [sizes[0]]);
    await page.locator("#maze-corners summary").click();
    results.checks.push(
      "Local synthetic PNG loaded without upload; four named photo corners labelled through keyboard percentages; labels remain explicitly non-metric.",
    );
    await page.locator("#maze-sound").click();
    await page
      .locator("#maze-sound")
      .filter({ hasText: "Mute sound" })
      .waitFor();
    await change("maze-x", 0);
    await change("maze-z", 0);
    await page.locator("#maze-start").click();
    assert.equal(await page.locator("[data-level]").first().innerText(), "100");
    await page.waitForTimeout(150);
    assert(
      await page.evaluate(() =>
        window.__mazeAudio.some(
          (entry) =>
            entry.method === "setTargetAtTime" &&
            entry.value > 0 &&
            entry.value <= 0.12,
        ),
      ),
    );
    await page.locator("#maze-start").click();
    assert.equal(await page.evaluate(() => window.__mazeAudio.at(-1).value), 0);
    await page.locator("#maze-start").click();
    await capture(page, "admin");
    await page.locator("#maze-view").click();
    assert(await page.locator("#maze-admin").isHidden());
    assert.equal(await page.locator("#maze-participant svg").count(), 0);
    await capture(page, "participant");
    await page.locator("#maze-return").click();
    await page.locator("#maze-sound").click();
    assert.equal(await page.evaluate(() => window.__mazeAcquisitions), 0);
    assert.deepEqual(results.requests, []);
    results.checks.push(
      "Explicit WebAudio activation, nonzero bounded gain while playing, immediate silence on pause, map-free preview and desktop/mobile/narrow English layouts verified; zero camera/API requests.",
    );
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
