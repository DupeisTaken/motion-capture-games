// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Window as TestWindow } from "happy-dom";
import fixture from "../../apps/mirror/src/rig-rehearsal.json";
import { createRigGameplay } from "../../apps/mirror/src/rig-gameplay";
import { MoleGame } from "../../games/mole-motion/src/index";
import { containRect } from "../../packages/motion/src/index";
import {
  loadRigDataset,
  selectRigFrame,
  type RigFrame,
} from "../../apps/mirror/src/rig-state";

const data = loadRigDataset(fixture);
const sample = (id = "nominal") =>
  structuredClone(selectRigFrame(data, id, 0).frame);
let controller: ReturnType<typeof createRigGameplay>;
let clock: number;
let host: HTMLElement;
const get = <T extends Element = HTMLElement>(id: string) => {
  const stage = document.getElementById("rig-game-stage");
  return (document.getElementById(id) ?? stage?.querySelector(`#${id}`)) as T;
};
const click = (id: string) => get<HTMLButtonElement>(id).click();
let bounds = { left: 10, top: 20, width: 800, height: 600 };
function canvas() {
  const scene = get<SVGSVGElement>("rig-game-scene");
  vi.spyOn(scene, "getBoundingClientRect").mockImplementation(() => ({
    ...bounds,
    x: bounds.left,
    y: bounds.top,
    right: bounds.left + bounds.width,
    bottom: bounds.top + bounds.height,
    toJSON: () => ({}),
  }));
  return scene;
}
function aim(
  x: number,
  y: number,
  frame: RigFrame = sample(),
  cameraId = "camera-0",
  target: Element = get("rig-game-scene"),
) {
  const view = frame.views.find((v) => v.cameraId === cameraId)!;
  const rect = containRect(
    { width: view.imageSize[0], height: view.imageSize[1] },
    bounds,
  );
  target.dispatchEvent(
    new MouseEvent("pointermove", {
      bubbles: true,
      clientX: bounds.left + rect.x + (1 - x) * rect.width,
      clientY: bounds.top + rect.y + y * rect.height,
    }),
  );
}
function advance(ms: number) {
  for (let remaining = ms; remaining > 0; remaining -= 50) {
    clock += Math.min(remaining, 50);
    controller.tick();
  }
}
function start(cameraId = "camera-0", frame = sample()) {
  controller.setSource(frame, cameraId);
  click("rig-game-start");
  advance(3000);
  expect(controller.state.phase).toBe("playing");
}
function hit(cameraId = "camera-0", frame = sample()) {
  const target = controller.state.targets[0]!;
  aim(0.02, 0.98, frame, cameraId);
  advance(50);
  aim(target.x, target.y, frame, cameraId);
  advance(50);
}

beforeEach(() => {
  vi.useFakeTimers();
  clock = 0;
  bounds = { left: 10, top: 20, width: 800, height: 600 };
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  document.body.innerHTML = '<div id="gameplay-test"></div>';
  host = document.getElementById("gameplay-test")!;
  controller = createRigGameplay(host, {
    now: () => clock,
    autoTick: false,
    seed: 42,
  });
  canvas();
});
afterEach(() => {
  controller.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("genuine Slap a Mole with selected synthetic presentation", () => {
  it.each(["camera-0", "camera-1"])(
    "counts a genuine pointer hit once in %s and preserves held-touch rules",
    (cameraId) => {
      start(cameraId);
      expect(document.activeElement).toBe(get("rig-game-stage"));
      expect(controller.state.targets.map(({ kind }) => kind)).toEqual([
        "mole",
      ]);
      hit(cameraId);
      expect(controller.state.score).toBe(100);
      expect(controller.state.hits).toBe(1);
      advance(500);
      expect(controller.state.hits).toBe(1);
      expect(get("rig-game-score").textContent).toBe("100");
      expect(get("rig-game-stage").dataset.cameraId).toBe(cameraId);
    },
  );

  it("uses the selected source's actual body coordinates without diagnostic markers", () => {
    const frame = sample();
    for (const view of frame.views) {
      controller.setSource(frame, view.cameraId);
      const background = get<SVGGElement>("rig-game-background");
      expect(background.dataset.cameraId).toBe(view.cameraId);
      const head = background.querySelector('[data-joint="nose"]')!;
      const nose = view.joints.find((j) => j.name === "nose")!;
      expect(Number(head.getAttribute("cx"))).toBe(nose.x);
      expect(Number(head.getAttribute("cy"))).toBe(nose.y);
      expect(background.querySelector("text")).toBeNull();
    }
    controller.setSource(sample("missing-hip"), "camera-1");
    expect(get("rig-game-background").querySelector("polygon")).toBeNull();
  });

  it("keeps a healthy view or sample change purely presentational with no engine progress or phantom hit", () => {
    start();
    hit();
    const before = controller.state;
    const update = vi.spyOn(MoleGame.prototype, "update");
    const pause = vi.spyOn(MoleGame.prototype, "pause");
    clock += 10;
    controller.setSource(sample(), "camera-1");
    expect(controller.state).toEqual(before);
    const later = structuredClone(data.cases[0].frames[5]);
    controller.setSource(later, "camera-0");
    expect(controller.state).toEqual(before);
    expect(update).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    controller.tick();
    expect(controller.state.score).toBe(before.score);
    expect(controller.state.targets[0]?.id).toBe(before.targets[0]?.id);
  });

  it("uses the exact 4:3 selected-image fit and clears contact in letterboxing", () => {
    const frame = sample();
    frame.views[0].imageSize = [800, 600];
    bounds = { left: 25, top: 15, width: 1000, height: 500 };
    start("camera-0", frame);
    const target = controller.state.targets[0]!;
    aim(0.02, 0.98, frame);
    advance(50);
    aim(target.x, target.y, frame);
    advance(50);
    expect(controller.state.score).toBe(100);
    get("rig-game-scene").dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: bounds.left + 5,
        clientY: bounds.top + 250,
      }),
    );
    expect(controller.state.phase).toBe("paused");
    expect(get("rig-game-cursor").hasAttribute("hidden")).toBe(true);
    expect(get<HTMLButtonElement>("rig-game-resume").disabled).toBe(false);
    advance(100);
    expect(controller.state.score).toBe(100);
  });

  it.each(["stale-input", "uncertain-identity", "time-uncertain"])(
    "pauses and blanks %s before a tick and requires explicit recovery",
    (caseId) => {
      start();
      hit();
      const before = controller.state;
      controller.setSource(sample(caseId), "camera-0");
      expect(controller.state.phase).toBe("paused");
      expect(get("rig-game-scene").children).toHaveLength(0);
      expect(controller.state.score).toBe(before.score);
      expect(controller.state.targets[0]).toEqual(before.targets[0]);
      controller.setSource(sample(), "camera-0");
      advance(100);
      expect(controller.state.phase).toBe("paused");
      get("rig-game-stage").dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
      );
      click("rig-game-resume");
      advance(2000);
      expect(controller.state.phase).toBe("playing");
      expect(controller.state.score).toBe(before.score);
    },
  );

  it.each([
    "weak-geometry",
    "calibration-changed",
    "scale-bias",
    "exposure-skew",
    "missing-hip",
  ])(
    "does not use %s XYZ to drive or disable healthy pointer input",
    (caseId) => {
      controller.setSource(sample(caseId), "camera-1");
      expect(get<HTMLButtonElement>("rig-game-start").disabled).toBe(false);
      expect(get("rig-game-scene").children.length).toBeGreaterThan(0);
      expect(get("rig-game-source-label").textContent).toContain(
        "pointer controlled",
      );
    },
  );

  it("does not substitute a missing camera or accept unverified timing", () => {
    start();
    const before = controller.state;
    controller.setSource(sample(), "gone-camera");
    expect(get("rig-game-stage").dataset.cameraId).toBe("gone-camera");
    expect(controller.state.phase).toBe("paused");
    expect(controller.state.score).toBe(before.score);
    const frame = sample();
    frame.views[1].timeVerified = false;
    controller.setSource(frame, "camera-1");
    expect(get<HTMLButtonElement>("rig-game-resume").disabled).toBe(true);
    expect(get("rig-game-scene").children).toHaveLength(0);
  });

  it("cancels interrupted pointer input without keeping a scoring contact", () => {
    start();
    const before = controller.state;
    get("rig-game-stage").dispatchEvent(
      new Event("pointercancel", { bubbles: true }),
    );
    expect(controller.state.phase).toBe("paused");
    expect(get("rig-game-cursor").hasAttribute("hidden")).toBe(true);
    advance(100);
    expect(controller.state.score).toBe(before.score);
    expect(controller.state.targets[0]).toEqual(before.targets[0]);
  });

  it("can Resume from operator controls after leaving the image without scoring a held target", () => {
    start();
    hit();
    const before = controller.state;
    const target = before.targets[0]!;
    get<HTMLButtonElement>("rig-game-pause").focus();
    click("rig-game-pause");
    aim(target.x, target.y);
    get("rig-game-scene").dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: bounds.left + 20,
        clientY: bounds.top - 10,
      }),
    );
    expect(get("rig-game-cursor").hasAttribute("hidden")).toBe(true);
    expect(get<HTMLButtonElement>("rig-game-resume").disabled).toBe(false);
    click("rig-game-resume");
    expect(document.activeElement).toBe(get("rig-game-stage"));
    advance(2050);
    expect(controller.state.phase).toBe("playing");
    expect(controller.state.score).toBe(before.score);
    expect(controller.state.targets[0]?.id).toBe(target.id);
    aim(0.02, 0.98);
    advance(50);
    aim(target.x, target.y);
    advance(50);
    expect(controller.state.hits).toBe(2);
    expect(controller.state.score).toBe(210);
  });

  it("uses one captured clock value for an update even if every clock read advances", () => {
    controller.dispose();
    let reads = 0;
    controller = createRigGameplay(host, {
      now: () => ++reads,
      autoTick: false,
    });
    controller.setSource(sample(), "camera-0");
    click("rig-game-start");
    controller.tick();
    expect(controller.state.phase).toBe("countdown");
    expect(controller.state.reason).toBeNull();
  });

  it("leaves the preview collapsed until requested and preserves inline play when a popup is blocked", () => {
    controller.setSource(sample(), "camera-0");
    expect(get<HTMLDetailsElement>("rig-game-inline").open).toBe(false);
    vi.spyOn(window, "open").mockReturnValue(null);
    click("rig-game-open");
    expect(get<HTMLDetailsElement>("rig-game-inline").open).toBe(true);
    expect(get("rig-game-location").textContent).toContain("blocked");
    click("rig-game-start");
    advance(3000);
    expect(controller.state.phase).toBe("playing");
  });

  it("moves the same game and input geometry to a popup, preserves score on return and closes for planning", () => {
    start();
    hit();
    const before = controller.state;
    const stage = get<HTMLElement>("rig-game-stage");
    const popup = new TestWindow({ url: location.href }) as unknown as Window;
    Object.defineProperty(popup.document, "hidden", {
      configurable: true,
      value: false,
    });
    vi.spyOn(window, "open").mockReturnValue(popup);
    vi.spyOn(popup, "close").mockImplementation(() => {});
    vi.spyOn(popup, "focus").mockImplementation(() => {});
    click("rig-game-open");
    expect(popup.document.getElementById("rig-game-stage")).toBe(stage);
    controller.setSource(sample(), "camera-1");
    expect(controller.state).toEqual(before);
    const scene = popup.document.getElementById("rig-game-scene")!;
    expect(scene.getAttribute("viewBox")).toBe("0 0 1920 1080");
    expect(
      scene
        .querySelector('[data-game-layer="source"]')
        ?.getAttribute("data-camera-id"),
    ).toBe("camera-1");
    click("rig-game-pause");
    popup.document.querySelector<HTMLButtonElement>("button")!.focus();
    get<HTMLButtonElement>("rig-game-resume").focus();
    click("rig-game-resume");
    expect(popup.document.activeElement).toBe(stage);
    advance(2000);
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    advance(50);
    expect(controller.state.phase).toBe("playing");
    controller.setEnabled(false);
    expect(popup.close).toHaveBeenCalledOnce();
    expect(stage.ownerDocument).toBe(document);
    expect(controller.state.phase).toBe("paused");
    expect(controller.state.score).toBe(before.score);
    expect(get("rig-game-scene").children).toHaveLength(0);
  });

  it("pauses when every playable display is hidden without resetting state", () => {
    start();
    const before = controller.state;
    get<HTMLDetailsElement>("rig-game-inline").open = false;
    get("rig-game-inline").dispatchEvent(new Event("toggle"));
    expect(controller.state.phase).toBe("paused");
    expect(controller.state.targets[0]).toEqual(before.targets[0]);
    get<HTMLDetailsElement>("rig-game-inline").open = true;
    advance(100);
    expect(controller.state.phase).toBe("paused");
  });

  it("does not count the expanded placeholder as visible when the popup is hidden", () => {
    start();
    const popup = new TestWindow({ url: location.href }) as unknown as Window;
    Object.defineProperty(popup.document, "hidden", {
      configurable: true,
      value: false,
    });
    vi.spyOn(window, "open").mockReturnValue(popup);
    vi.spyOn(popup, "close").mockImplementation(() => {});
    vi.spyOn(popup, "focus").mockImplementation(() => {});
    click("rig-game-open");
    const before = controller.state;
    Object.defineProperty(popup.document, "hidden", {
      configurable: true,
      value: true,
    });
    popup.document.dispatchEvent(new Event("visibilitychange"));
    expect(controller.state.phase).toBe("paused");
    advance(200);
    expect(controller.state.score).toBe(before.score);
    expect(controller.state.elapsedMs).toBe(before.elapsedMs);
    popup.dispatchEvent(new Event("pagehide"));
    advance(100);
    expect(controller.state.phase).toBe("paused");
  });

  it("owns one ticker and removes it and all input listeners on disposal", () => {
    controller.dispose();
    controller = createRigGameplay(host, { now: () => clock });
    controller.setSource(sample(), "camera-0");
    const stage = get("rig-game-stage");
    expect(vi.getTimerCount()).toBe(1);
    controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
    stage.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(host.children).toHaveLength(0);
  });
});
