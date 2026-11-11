/* global window, document, Event */
import assert from "node:assert/strict";

/** Exercise the same shared setup/confirmation path an operator uses. */
export async function verifyMazeFlow({ page, base, capture, results, sizes }) {
  const dialog = page.locator("#pre-game-settings");
  const change = async (id, value) =>
    page.locator(`#${id}`).evaluate((element, value) => {
      element.value = String(value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  const open = async (id = "open-settings") => {
    if (!(await dialog.isVisible())) await page.locator(`#${id}`).click();
    assert(await dialog.isVisible());
  };
  const confirm = async () => {
    await page.locator("#confirm-start").click();
    assert(await dialog.isHidden());
    assert.match(
      await page.locator("#maze-session-status").innerText(),
      /running/,
    );
  };
  const configure = async (values) => {
    await open();
    for (const [id, value] of Object.entries(values)) {
      if (typeof value === "boolean")
        await page.locator(`#${id}`).setChecked(value);
      else await change(id, value);
    }
    await confirm();
  };
  await page.goto(`${base}/rig.html`);
  await page.locator("#rig-rehearsal").waitFor();
  await capture(page, "before-rig", [sizes[0]]);
  await page.goto(`${base}/maze.html`);
  await dialog.waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#setup-title").innerText(),
    "Set up Virtual Maze",
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "close-settings",
  );
  assert.equal(await page.locator("[data-level]").first().innerText(), "0");
  assert.equal(await page.evaluate(() => window.__mazeAudio.length), 0);
  assert.equal(
    await page.locator('#maze-source option[value="physical"]').isDisabled(),
    true,
  );
  await capture(page, "setup");
  for (const [suffix, width, height] of sizes.slice(1)) {
    await page.setViewportSize({ width, height });
    await page
      .locator("#game-settings-title")
      .evaluate((element) => element.scrollIntoView({ block: "start" }));
    await capture(page, "setup-game", [[suffix, width, height]]);
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator("#maze-camera-guide-title").focus();
  await page.keyboard.press("Enter");
  assert(
    await page
      .locator(".maze-camera-guide")
      .evaluate((element) => element.open),
  );
  await page.locator("#maze-camera-guide-title").scrollIntoViewIfNeeded();
  await capture(page, "camera-guide", [sizes[0]]);
  await page.locator(".maze-camera-details summary").click();
  await page.locator(".maze-camera-details").scrollIntoViewIfNeeded();
  await capture(page, "camera-checks", [sizes[1], sizes[2]]);
  assert.match(
    await page.locator(".maze-camera-guide").innerText(),
    /no single angle or baseline guarantees accuracy/,
  );
  assert.match(
    await page.locator(".maze-camera-guide").innerText(),
    /floor contacts, not elevated hips or heads/,
  );
  assert.match(
    await page.locator(".maze-camera-guide").innerText(),
    /Planning notes and corner labels cannot pass these gates/,
  );
  assert.equal(
    await page.locator('.maze-camera-guide a[href="/rig.html"]').count(),
    1,
  );
  assert.equal(await page.locator(".maze-camera-guide svg title").count(), 1);
  assert.equal(
    await page
      .locator(".maze-camera-guide input, .maze-camera-guide button")
      .count(),
    0,
  );
  await page.locator(".maze-camera-details summary").click();
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator("#maze-camera-guide-title").click();
  await page.keyboard.press("Escape");
  assert(await dialog.isHidden());
  assert.equal(await page.locator("[data-level]").first().innerText(), "0");
  await page.locator("#maze-quality").selectOption("missing");
  await page.locator("#maze-start").click();
  assert(await dialog.isVisible());
  await page.locator("#close-settings").click();
  await page.locator("#maze-quality").selectOption("ready");
  await page.locator("#maze-start").click();
  await confirm();
  results.checks.push(
    "Shared setup opens on load, focuses Close, supports Escape without starting, validates an explicit Start round and keeps physical input unavailable.",
  );
  results.checks.push(
    "Accessible two-camera placement/coverage schematic and calibration, exposure, identity and held-out accuracy guidance render on desktop/mobile/narrow layouts; planning grants no physical capability.",
  );

  const originalZ = Number(await page.locator("#maze-z").inputValue());
  await page.locator("#maze-map").focus();
  await page.keyboard.press("ArrowUp");
  assert(
    Math.abs(
      Number(await page.locator("#maze-z").inputValue()) - originalZ - 0.1,
    ) < 0.011,
  );
  const pointer = await page.locator("#maze-map").evaluate((map) => {
    const point = map.createSVGPoint();
    point.x = 1.2;
    point.y = 8 - 1.7;
    const screen = point.matrixTransform(map.getScreenCTM());
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.move(pointer.x - 5, pointer.y);
  await page.mouse.down();
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.up();
  assert(
    Math.abs(Number(await page.locator("#maze-x").inputValue()) - 1.2) < 0.011,
  );
  assert(
    Math.abs(Number(await page.locator("#maze-z").inputValue()) - 1.7) < 0.011,
  );
  await change("maze-torso", 0);
  await change("maze-head", 90);
  const activeHeading = await page.locator("#maze-heading").getAttribute("d");
  const activePosition = await page.locator("#maze-x").inputValue();
  const activeLayout = await page.locator("#maze-map").innerHTML();
  await open("maze-reset");
  await change("maze-width", 5.37);
  await change("maze-seed", "");
  await page.locator("#confirm-start").click();
  assert(await dialog.isVisible());
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "maze-seed",
  );
  assert.equal(await page.locator("#maze-size").innerText(), "8 × 8 m");
  await change("maze-seed", "quiet-path-01");
  await change("maze-depth", 9.63);
  await page.locator("#maze-orientation").selectOption("head");
  await page.locator("#maze-difficulty").selectOption("easy");
  await page.locator("#maze-loops").uncheck();
  await page.locator("#close-settings").click();
  assert.equal(await page.locator("#maze-size").innerText(), "8 × 8 m");
  assert.equal(await page.locator("#maze-facing").innerText(), "Torso");
  assert.equal(
    await page.locator("#maze-heading").getAttribute("d"),
    activeHeading,
  );
  assert.equal(await page.locator("#maze-x").inputValue(), activePosition);
  assert.equal(await page.locator("#maze-map").innerHTML(), activeLayout);
  assert.match(await page.locator("#maze-start").innerText(), /Resume/);
  await page.locator("#maze-start").click();
  await open();
  assert.equal(await page.locator("#maze-width").inputValue(), "5.37");
  await change("maze-width", 4);
  await page.locator("#confirm-start").click();
  assert(await dialog.isVisible());
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "maze-width",
  );
  assert.equal(await page.locator("#maze-size").innerText(), "8 × 8 m");
  await change("maze-width", 5.37);
  await confirm();
  assert.equal(await page.locator("#maze-size").innerText(), "5.37 × 9.63 m");
  assert.equal(await page.locator("#maze-facing").innerText(), "Head");
  assert.match(
    await page.locator("#maze-topology").innerText(),
    /Perfect maze/,
  );
  const beforeHeadTurn = await page.locator("#maze-heading").getAttribute("d");
  await change("maze-head", 90);
  assert.notEqual(
    await page.locator("#maze-heading").getAttribute("d"),
    beforeHeadTurn,
  );
  await page.locator("#maze-quality").selectOption("torso-missing");
  assert.match(
    await page.locator("#maze-session-status").innerText(),
    /running/,
  );
  await page.locator("#maze-quality").selectOption("head-missing");
  assert.match(
    await page.locator("#maze-session-status").innerText(),
    /missing orientation/,
  );
  assert(await page.locator("#maze-start").isDisabled());
  for (const id of ["maze-x-value", "maze-y-value", "maze-z-value"])
    assert.equal(await page.locator(`#${id}`).innerText(), "—");
  await open();
  await page.locator("#maze-orientation").selectOption("torso");
  await page.locator("#close-settings").click();
  assert.equal(await page.locator("#maze-facing").innerText(), "Head");
  assert(await page.locator("#maze-start").isDisabled());
  await open();
  await confirm();
  assert.equal(await page.locator("#maze-facing").innerText(), "Torso");
  results.checks.push(
    "Draft dimensions/seed/difficulty/loops/orientation preserve the current paused round on Close; invalid native confirmation stays open/focused; valid 5.37×9.63 m confirmation applies atomically. Missing selected facing never falls back and never prevents opening setup.",
  );
  for (const quality of ["missing", "uncertain", "stale"]) {
    await page.locator("#maze-quality").selectOption(quality);
    assert.match(
      await page.locator("#maze-session-status").innerText(),
      /Input unavailable/,
    );
    await page.locator("#maze-quality").selectOption("ready");
    assert.match(await page.locator("#maze-start").innerText(), /Resume/);
    await page.locator("#maze-start").click();
  }
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  assert.match(await page.locator("#maze-start").innerText(), /Resume/);

  await open();
  await change("maze-width", 10);
  await change("maze-depth", 5);
  await change("maze-seed", "Z".repeat(80));
  await page.locator("#maze-difficulty").selectOption("hard");
  await page.locator("#maze-loops").check();
  await page.locator("#maze-seed").scrollIntoViewIfNeeded();
  await capture(page, "long-seed", [sizes[2]]);
  await confirm();
  assert.match(
    await page.locator("#maze-topology").innerText(),
    /hand rules fail/,
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  const goal = await page
    .locator('#maze-map circle[fill="#15977a"]')
    .evaluate((element) => ({
      x: Number(element.getAttribute("cx")),
      z: Number(element.getAttribute("cy")),
    }));
  await change("maze-x", goal.x);
  await change("maze-z", goal.z);
  assert.match(
    await page.locator("#maze-session-status").innerText(),
    /Goal reached/,
  );
  await open("maze-reset");
  await confirm();
  assert.notEqual(Number(await page.locator("#maze-x").inputValue()), goal.x);
  results.checks.push(
    "Keyboard/pointer map transforms, independent facing sources, stale/missing/ambiguous recovery, goal completion/new-round confirmation, loop mode, difficulty, rectangular dimensions and 80-character seed verified.",
  );

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
  await page.bringToFront();
  await open();
  assert(await popup.locator("#participant-toggle").isDisabled());
  assert.equal(await popup.locator("[data-level]").innerText(), "0");
  await page.locator("#close-settings").click();
  await popup.bringToFront();
  await popup.locator("#participant-toggle").click();
  await capture(popup, "participant-window", [sizes[1]]);
  await popup.close();
  await page.bringToFront();
  assert.match(await page.locator("#maze-start").innerText(), /Resume/);
  results.checks.push(
    "Blocked popup guidance persists; actual map-free participant window shares pause/resume and cannot resume during setup; popup closure preserves safe recovery.",
  );

  await configure({
    "maze-width": 8,
    "maze-depth": 8,
    "maze-difficulty": "medium",
    "maze-seed": "quiet-path-01",
    "maze-loops": true,
    "maze-orientation": "torso",
  });
  const photo = await page.locator("#maze-map").screenshot();
  await open();
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
  await capture(page, "corners", [sizes[0]]);
  await page.locator("#maze-corners summary").click();
  await confirm();
  await page.locator("#maze-sound").click();
  await page.locator("#maze-sound").filter({ hasText: "Mute sound" }).waitFor();
  await change("maze-x", 0);
  await change("maze-z", 0);
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
  await open();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__mazeAudio.at(-1).value), 0);
  await page.locator("#close-settings").click();
  assert.equal(await page.locator("[data-level]").first().innerText(), "0");
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
    "Local-only synthetic photo labels remain planning-only; enabled WebAudio has bounded gain, immediate silence during setup/pause, and explicit resume. Operator/participant and setup layouts verified at 1440/390/320 px with zero camera/API requests.",
  );
}
