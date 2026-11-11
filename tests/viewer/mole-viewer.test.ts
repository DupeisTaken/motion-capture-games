// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountMoleGame } from "../../apps/mirror/src/mole-viewer";
import type { Observation } from "../../contracts/generated/observation";
import fixture from "../../contracts/examples/synthetic-observation.json";
import { mapJoint } from "../../packages/motion/src/index";
import { TUNING, type TouchRegion } from "../../games/mole-motion/src/index";

const renderer = vi.hoisted(() => ({
  drawMoleScene: vi.fn<(...args: unknown[]) => object>(() => ({
    x: 0,
    y: 0,
    width: 960,
    height: 600,
  })),
}));
vi.mock("../../apps/mirror/src/mole-renderer", () => renderer);
const display = vi.hoisted(() => ({
  isOpen: false,
  visible: false,
  open: vi.fn(() => false),
  close: vi.fn(),
  dispose: vi.fn(),
  startTicker: vi.fn(() => () => {}),
}));
vi.mock("../../apps/mirror/src/game-display", () => ({
  createGameDisplay: () => display,
}));

let now: number;
let app: ReturnType<typeof mountMoleGame>;
const fetchMock = vi.fn();
const createBitmap = vi.fn();

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 1;
  binaryType = "blob";
  onopen: (() => void) | null = null;
  onmessage:
    ((event: { data: ArrayBuffer | string }) => void | Promise<void>) | null =
    null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly send = vi.fn();
  readonly close = vi.fn(() => {
    this.readyState = 3;
  });
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  async receive(data: ArrayBuffer | string): Promise<void> {
    await this.onmessage?.({ data });
  }
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 24; index++) await Promise.resolve();
}

function observation(sequence = 1): Observation {
  const base = structuredClone(fixture) as Observation;
  const joint = {
    x: 0.4,
    y: 0.8,
    score: 0.95,
    status: "observed",
    inFrame: true,
  } as const;
  return {
    ...base,
    source: "camera",
    epoch: "camera-test",
    sequence,
    frameId: `camera-frame-${sequence}`,
    algorithm: "mediapipe",
    clock: {
      domain: "host-monotonic",
      quality: "host-read-completion",
      uncertaintyNs: null,
    },
    capturedAtNs: String(BigInt(sequence) * 50_000_000n),
    processedAtNs: String(BigInt(sequence) * 50_000_000n + 16_000_000n),
    people: [
      {
        ...base.people[0],
        identity: "confident",
        joints: {
          ...base.people[0].joints,
          left_index_finger: { ...joint, x: 0.22, y: 0.46 },
          left_pinky_finger: { ...joint, x: 0.18, y: 0.46 },
          left_ankle: { ...joint, x: 0.4 },
          right_ankle: { ...joint, x: 0.6 },
        },
      },
    ],
  };
}

function leftPalm(
  { joints }: Observation["people"][number],
  x: number,
  y: number,
) {
  const joint = {
    x,
    y,
    score: 0.95,
    status: "observed",
    inFrame: true,
  } as const;
  joints.left_wrist = { ...joint, y: y - 0.03 };
  joints.left_index_finger = { ...joint, x: x + 0.01, y: y + 0.03 };
  joints.left_pinky_finger = { ...joint, x: x - 0.01, y: y + 0.03 };
}

function packet(value: Observation): ArrayBuffer {
  const metadata = new TextEncoder().encode(JSON.stringify(value));
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const encoded = new Uint8Array(4 + metadata.byteLength + jpeg.byteLength);
  new DataView(encoded.buffer).setUint32(0, metadata.byteLength, false);
  encoded.set(metadata, 4);
  encoded.set(jpeg, 4 + metadata.byteLength);
  return encoded.buffer;
}

async function selectCamera() {
  choose("source-select", "camera");
  await flushPromises();
}

async function startCamera(): Promise<FakeWebSocket> {
  await selectCamera();
  element<HTMLButtonElement>("source-connect").click();
  await flushPromises();
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("Camera did not create a stream.");
  socket.onopen?.();
  return socket;
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing Slap a Mole element: ${id}`);
  return value as T;
}

function choose(id: string, value: string): void {
  const select = element<HTMLSelectElement>(id);
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function advance(milliseconds: number): void {
  const until = now + milliseconds;
  while (now < until) {
    now = Math.min(until, now + 50);
    app.tick();
  }
}

function startDemo(): void {
  if (element<HTMLSelectElement>("source-select").value !== "demo") {
    choose("source-select", "demo");
  }
  app.tick();
  app.tick();
  element<HTMLButtonElement>("start-round").click();
  element<HTMLButtonElement>("confirm-start").click();
  advance(3500);
}

function movePointer(x: number, y: number): void {
  now += 50;
  element("game-stage").dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      clientX: x,
      clientY: y,
    }),
  );
  app.tick();
}

function targetPosition(id = "mole-target"): { x: number; y: number } {
  const target = element(id);
  return {
    x: Number.parseFloat(target.style.left),
    y: Number.parseFloat(target.style.top),
  };
}

it("shows two independently timed moles, a bomb, and the bomb penalty in both score displays", () => {
  startDemo();
  const targets = ["mole-target", "mole-target-2", "bomb-target"].map(element);
  expect(targets.every((target) => !target.hidden)).toBe(true);
  const moleIds = targets.slice(0, 2).map((target) => target.dataset.targetId);
  const bombId = targets[2].dataset.targetId;

  movePointer(0, 0);
  const bomb = targetPosition("bomb-target");
  movePointer(bomb.x, bomb.y);
  expect(element("score-value").textContent).toBe("-50");
  expect(element("display-score").textContent).toBe("-50");
  expect(element("hits-value").textContent).toBe("0");
  expect(element("hit-feedback").textContent).toBe("BOMB! −50");
  expect(element("hit-feedback").hidden).toBe(false);
  expect(targets[2].dataset.targetId).not.toBe(bombId);
  expect(targets.slice(0, 2).map((target) => target.dataset.targetId)).toEqual(
    moleIds,
  );
  expect(targets[0].querySelector("progress")!.value).toBeLessThan(
    targets[2].querySelector("progress")!.value,
  );
  advance(200);
  expect(element("score-value").textContent).toBe("-50");
  element<HTMLButtonElement>("pause-round").click();
  expect(targets.every((target) => target.hidden)).toBe(true);
});

beforeEach(() => {
  vi.clearAllMocks();
  display.isOpen = false;
  display.visible = false;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ state: "running", epoch: "camera-test" }),
  });
  FakeWebSocket.instances = [];
  createBitmap.mockReset();
  createBitmap.mockImplementation(async () => ({
    width: fixture.image.width,
    height: fixture.image.height,
    close: vi.fn(),
  }));
  now = 100;
  document.body.innerHTML = '<div id="mole-test-root"></div>';
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  vi.stubGlobal("fetch", (path: string, options?: RequestInit) =>
    path === "/api/cameras"
      ? Promise.resolve({
          ok: true,
          json: async () => ({
            cameras: [{ id: "a".repeat(64), name: "USB camera" }],
          }),
        })
      : fetchMock(path, options),
  );
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("createImageBitmap", createBitmap);
  vi.stubGlobal("Option", function Option(text = "", value = text) {
    const option = document.createElement("option");
    option.textContent = text;
    option.value = value;
    return option;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  app = mountMoleGame(element("mole-test-root"), {
    now: () => now,
    autoTick: false,
  });
  vi.spyOn(element("game-canvas"), "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 960,
    bottom: 600,
    width: 960,
    height: 600,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  app.dispose();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Slap a Mole operator integration", () => {
  it("defaults to camera setup and discovers devices without starting capture", async () => {
    await flushPromises();
    expect(element<HTMLSelectElement>("source-select").value).toBe("camera");
    expect(element("camera-controls").hidden).toBe(false);
    expect(element("demo-controls").hidden).toBe(true);
    expect(
      element<HTMLSelectElement>("camera-choice").selectedOptions[0]
        ?.textContent,
    ).toBe("USB camera");
    expect(element("source-label").textContent).toBe("LOCAL CAMERA · 2D");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it.each([false, true])(
    "keeps camera movement screen-left in the mirrored display (detached: %s)",
    async (detached) => {
      display.isOpen = detached;
      const socket = await startCamera();
      await socket.receive(packet(observation()));
      const before = (
        renderer.drawMoleScene.mock.calls.at(-1)?.[7] as TouchRegion[]
      ).find((contact) => contact.name === "left_hand")!;
      const moved = observation(2);
      for (const joint of Object.values(moved.people[0].joints)) {
        if (joint.x !== null) joint.x += 0.1;
      }
      now += 50;
      await socket.receive(packet(moved));
      const args = renderer.drawMoleScene.mock.calls.at(-1)!;
      const after = (args[7] as TouchRegion[]).find(
        (contact) => contact.name === "left_hand",
      )!;
      const rect = { x: 20, y: 40, width: 800, height: 500 };
      expect(args[4]).toBe(true);
      expect(mapJoint(after, rect).x).toBeLessThan(mapJoint(before, rect).x);
      expect(after.name).toBe(before.name);
      expect(after.y).toBe(before.y);
    },
  );

  it.each(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"])(
    "moves rehearsal %s in the viewer's direction",
    (key) => {
      startDemo();
      movePointer(480, 300);
      const rect = { x: 0, y: 0, width: 960, height: 600 };
      const before = mapJoint(
        (renderer.drawMoleScene.mock.calls.at(-1)?.[7] as TouchRegion[])[0],
        rect,
      );
      now += 50;
      element("game-stage").dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      const after = mapJoint(
        (renderer.drawMoleScene.mock.calls.at(-1)?.[7] as TouchRegion[])[0],
        rect,
      );
      expect(Math.sign(after.x - before.x)).toBe(
        key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0,
      );
      expect(Math.sign(after.y - before.y)).toBe(
        key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0,
      );
    },
  );

  it("opens unified setup on load without starting input or a round", () => {
    const setup = element<HTMLDialogElement>("pre-game-settings");
    expect(setup.open).toBe(true);
    expect(setup.contains(element("source-select"))).toBe(true);
    expect(setup.contains(element("mode-select"))).toBe(true);
    expect(setup.contains(element("difficulty-select"))).toBe(true);
    expect(setup.contains(element("show-tracking"))).toBe(true);
    expect(document.activeElement).toBe(element("close-settings"));
    advance(5000);
    expect(element("game-overlay").hidden).toBe(false);
    expect(element("time-value").textContent).toBe("1:00");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("retains choices and requires confirmation after closing and reopening setup", () => {
    choose("source-select", "demo");
    choose("mode-select", "practice");
    choose("difficulty-select", "hard");
    element<HTMLButtonElement>("close-settings").click();
    expect(element<HTMLDialogElement>("pre-game-settings").open).toBe(false);
    element<HTMLButtonElement>("start-round").click();
    expect(element<HTMLDialogElement>("pre-game-settings").open).toBe(true);
    advance(4000);
    expect(element("game-overlay").hidden).toBe(false);
    expect(element<HTMLSelectElement>("mode-select").value).toBe("practice");
    expect(element<HTMLSelectElement>("difficulty-select").value).toBe("hard");
    element<HTMLButtonElement>("confirm-start").click();
    advance(3500);
    expect(element<HTMLDialogElement>("pre-game-settings").open).toBe(false);
    expect(element("game-overlay").hidden).toBe(true);
    expect(element<HTMLButtonElement>("open-settings").disabled).toBe(true);
  });

  it("reviews every replay without discarding results until confirmation", () => {
    startDemo();
    element<HTMLButtonElement>("end-round").click();
    const result = element("overlay-copy").textContent;
    const score = element("score-value").textContent;
    element<HTMLButtonElement>("restart-round").click();
    expect(element<HTMLDialogElement>("pre-game-settings").open).toBe(true);
    advance(4000);
    expect(element("overlay-copy").textContent).toBe(result);
    expect(element("score-value").textContent).toBe(score);
    element<HTMLButtonElement>("close-settings").click();
    expect(document.activeElement).toBe(element("restart-round"));
    expect(element("overlay-copy").textContent).toBe(result);
    element<HTMLButtonElement>("restart-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    advance(3500);
    expect(element("game-overlay").hidden).toBe(true);
  });

  it("offers one focused in-stage Resume and waits for recovered input after one press", () => {
    startDemo();
    element<HTMLButtonElement>("pause-round").click();
    const resume = element<HTMLButtonElement>("resume-round");
    expect(element("game-overlay").contains(resume)).toBe(true);
    expect(resume.textContent).toBe("Resume");
    expect(document.activeElement).toBe(resume);
    const score = element("score-value").textContent;
    const time = element("time-value").textContent;
    element<HTMLInputElement>("demo-framing").checked = false;
    element("demo-framing").dispatchEvent(new Event("change"));
    resume.click();
    advance(500);
    expect(resume.hidden).toBe(true);
    expect(element("score-value").textContent).toBe(score);
    expect(element("time-value").textContent).toBe(time);
    expect(element("game-overlay").hidden).toBe(false);
    element<HTMLInputElement>("demo-framing").checked = true;
    element("demo-framing").dispatchEvent(new Event("change"));
    advance(2500);
    expect(element("game-overlay").hidden).toBe(true);
    expect(element<HTMLDialogElement>("pre-game-settings").open).toBe(false);
  });

  it("keeps manual pause and resume outside setup", () => {
    startDemo();
    element<HTMLButtonElement>("pause-round").click();
    expect(element<HTMLDialogElement>("pre-game-settings").open).toBe(false);
    element<HTMLButtonElement>("resume-round").click();
    advance(2500);
    expect(element<HTMLDialogElement>("pre-game-settings").open).toBe(false);
    expect(element("game-overlay").hidden).toBe(true);
  });

  it("offers camera flicks with wrist guidance and locks the interaction during play", () => {
    choose("source-select", "camera");
    element<HTMLButtonElement>("interaction-flick").click();
    expect(element("interaction-flick").getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(element("interaction-touch").getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(element("interaction-note").textContent).toMatch(
      /quick flap.*visibly move/,
    );
    expect(element("stage-mode").textContent).toBe("FLICK TO WHACK");
    expect(element<HTMLButtonElement>("interaction-push").disabled).toBe(true);
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    expect(element<HTMLButtonElement>("interaction-flick").disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rehearses a settled wrist flick with arrow keys and excludes hip/foot input", () => {
    choose("source-select", "demo");
    element<HTMLButtonElement>("interaction-flick").click();
    expect(
      [...element<HTMLSelectElement>("demo-contact").options]
        .filter((option) => !option.disabled)
        .map((option) => option.value),
    ).toEqual(["left_wrist", "right_wrist"]);
    startDemo();
    const target = targetPosition();
    const radius = Number.parseFloat(element("mole-target").style.width) / 2;
    // Aim from a distant corner so an unseeded nearby target cannot count the setup move.
    movePointer(959, 599);
    movePointer(target.x + radius + 24, target.y);
    advance(250);
    expect(element("score-value").textContent).toBe("000");
    now += 50;
    element("game-stage").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    expect(element("score-value").textContent).toBe("100");
    expect(element("game-status").textContent).toMatch(/settle your hand/);
    advance(500);
    expect(element("score-value").textContent).toBe("100");
  });

  it("scores a wrist flap through the camera packet and session pipeline without depth", async () => {
    const socket = await startCamera();
    element<HTMLButtonElement>("interaction-flick").click();
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    let sequence = 0;
    const send = async (x = 0.01, y = 0.01) => {
      now += 50;
      const value = observation(++sequence);
      value.people[0].joints.left_wrist = {
        x,
        y,
        status: "observed",
        score: 0.99,
        inFrame: true,
      };
      value.people[0].joints.right_wrist = {
        x: 0.01,
        y: 0.01,
        status: "observed",
        score: 0.99,
        inFrame: true,
      };
      await socket.receive(packet(value));
    };
    for (let i = 0; i < 80; i++) await send();
    expect(element("mole-target").hidden).toBe(false);
    const target = targetPosition();
    const radius =
      Number.parseFloat(element("mole-target").style.width) / 2 / 960;
    const x = 1 - target.x / 960 - radius - 0.03;
    const y = target.y / 600;
    for (let i = 0; i < 6; i++) await send(x, y);
    expect(element("score-value").textContent).toBe("000");
    await send(x + 0.025, y);
    expect(element("score-value").textContent).toBe("100");
    expect(element("display-score").textContent).toBe("100");
    await send(x + 0.025, y);
    expect(element("score-value").textContent).toBe("100");
  });

  it("keeps a connected camera stable until Stop, including a forged Start click", async () => {
    await startCamera();
    const connect = element<HTMLButtonElement>("source-connect");
    expect(connect.disabled).toBe(true);
    connect.dispatchEvent(new Event("click"));
    await flushPromises();
    expect(
      fetchMock.mock.calls.filter(([path]) => path === "/api/start"),
    ).toHaveLength(1);
    element<HTMLButtonElement>("source-stop").click();
    await flushPromises();
    expect(connect.disabled).toBe(false);
  });
  it("offers all four round modes and three difficulty choices", () => {
    expect(
      Array.from(element<HTMLSelectElement>("mode-select").options).map(
        (option) => option.value,
      ),
    ).toEqual(["timed", "challenge", "survival", "practice"]);
    expect(
      Array.from(element<HTMLSelectElement>("difficulty-select").options).map(
        (option) => option.value,
      ),
    ).toEqual(["easy", "normal", "hard"]);
    choose("mode-select", "practice");
    choose("difficulty-select", "hard");
    startDemo();
    expect(element("time-value").textContent).toMatch(/∞|untimed|practice/i);
    expect(element<HTMLSelectElement>("mode-select").disabled).toBe(true);
    expect(element<HTMLSelectElement>("difficulty-select").disabled).toBe(true);
  });

  it("gates camera push mode and explains the missing depth capability", async () => {
    await selectCamera();
    app.tick();
    expect(element<HTMLButtonElement>("interaction-push").disabled).toBe(true);
    expect(document.body.textContent).toMatch(/depth/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("freezes the round on operator pause and resumes through countdown", () => {
    startDemo();
    element<HTMLButtonElement>("pause-round").click();
    app.tick();
    const time = element("time-value").textContent;
    advance(5000);
    expect(element("time-value").textContent).toBe(time);
    element<HTMLButtonElement>("resume-round").click();
    app.tick();
    expect(element("overlay-title").textContent).toMatch(/2|ready|countdown/i);
    advance(2500);
    expect(element("mole-target").hidden).toBe(false);
  });

  it("pauses on a hidden tab and requires explicit recovery", () => {
    startDemo();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    app.tick();
    const time = element("time-value").textContent;
    advance(5000);
    expect(element("time-value").textContent).toBe(time);
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    app.tick();
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(false);
    expect(element("game-overlay").hidden).toBe(false);
  });

  it.each(["left_wrist", "right_foot"])(
    "scores a mirrored %s touch once and clears round results on replay",
    (contact) => {
      choose("demo-contact", contact);
      startDemo();
      movePointer(0, 0);
      const target = targetPosition();
      movePointer(target.x, target.y);
      expect(Number(element("score-value").textContent)).toBe(100);
      expect(element("hits-value").textContent).toBe("1");
      advance(100);
      expect(element("hits-value").textContent).toBe("1");
      element<HTMLButtonElement>("end-round").click();
      expect(element("overlay-copy").textContent).toMatch(
        /1 moles whacked.*100 points/,
      );
      element<HTMLButtonElement>("restart-round").click();
      element<HTMLButtonElement>("confirm-start").click();
      expect(Number(element("score-value").textContent)).toBe(0);
      expect(element("hits-value").textContent).toBe("0");
      expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
      expect(element<HTMLSelectElement>("mode-select").disabled).toBe(true);
    },
  );

  it("uses a hip push in rehearsal and keeps feet out of push controls", () => {
    choose("source-select", "demo");
    element<HTMLButtonElement>("interaction-push").click();
    const contact = element<HTMLSelectElement>("demo-contact");
    expect(
      Array.from(contact.options).find((option) => option.value === "left_foot")
        ?.disabled,
    ).toBe(true);
    expect(
      Array.from(contact.options).find((option) => option.value === "left_hip")
        ?.disabled,
    ).toBe(false);
    choose("demo-contact", "left_hip");
    startDemo();
    movePointer(0, 0);
    const target = targetPosition();
    movePointer(target.x, target.y);
    expect(Number(element("score-value").textContent)).toBe(0);
    now += 50;
    element("game-stage").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
      }),
    );
    expect(Number(element("score-value").textContent)).toBe(100);
    const repeatedSpace = new KeyboardEvent("keydown", {
      key: " ",
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    element("game-stage").dispatchEvent(repeatedSpace);
    expect(repeatedSpace.defaultPrevented).toBe(true);
    advance(100);
    expect(element("hits-value").textContent).toBe("1");
  });

  it("keeps a failed late-start release available after switching to rehearsal", async () => {
    await selectCamera();
    let finishStart!: (value: object) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStart = resolve;
        }),
    );
    element<HTMLButtonElement>("source-connect").click();
    await flushPromises();
    choose("source-select", "demo");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ detail: "Driver still stopping" }),
    });
    finishStart({
      ok: true,
      json: async () => ({ state: "running", epoch: "late-epoch" }),
    });
    await flushPromises();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(element("camera-release").hidden).toBe(false);
    expect(element("setup-camera-release").hidden).toBe(false);
    expect(
      element("pre-game-settings").contains(element("setup-retry-camera-stop")),
    ).toBe(true);
    expect(element("camera-release-message").textContent).toMatch(
      /unconfirmed.*driver/i,
    );
    element<HTMLButtonElement>("setup-retry-camera-stop").click();
    await flushPromises();
    expect(element("camera-release").hidden).toBe(true);
    expect(element("setup-camera-release").hidden).toBe(true);
    const stops = fetchMock.mock.calls.filter(([path]) => path === "/api/stop");
    expect(
      stops.map(([, init]) => JSON.parse(String(init.body)).epoch),
    ).toEqual(["late-epoch", "late-epoch"]);
  });

  it.each(["409", "network"])(
    "keeps a failed %s camera release visible and retryable in rehearsal",
    async (failure) => {
      await startCamera();
      fetchMock.mockImplementationOnce(async () => {
        if (failure === "network") throw new Error("Service offline");
        return {
          ok: false,
          status: 409,
          json: async () => ({
            detail: "Camera driver still stopping; ownership retained.",
          }),
        };
      });
      element<HTMLButtonElement>("source-stop").click();
      await flushPromises();
      expect(element("camera-release").hidden).toBe(false);
      expect(element("camera-release-message").textContent).toMatch(
        /release unconfirmed/i,
      );
      expect(element<HTMLButtonElement>("source-connect").disabled).toBe(true);
      expect(element<HTMLButtonElement>("retry-camera-stop").disabled).toBe(
        false,
      );
      // A source selection does not conceal the unresolved release. Keep the retry
      // failing once more so it is still offered after switching to rehearsal.
      fetchMock.mockRejectedValueOnce(new Error("Service offline"));
      choose("source-select", "demo");
      await flushPromises();
      expect(element("camera-release").hidden).toBe(false);
      expect(element("player-status").textContent).toMatch(/rehearsal ready/i);
      element<HTMLButtonElement>("retry-camera-stop").click();
      await flushPromises();
      expect(element("camera-release").hidden).toBe(true);
      const stops = fetchMock.mock.calls.filter(
        ([path]) => path === "/api/stop",
      );
      expect(stops).toHaveLength(3);
      expect(
        stops.every(
          ([, init]) => JSON.parse(String(init.body)).epoch === "camera-test",
        ),
      ).toBe(true);
    },
  );

  it("closes a late decoded image after the camera has stopped", async () => {
    const socket = await startCamera();
    const bitmap = {
      width: fixture.image.width,
      height: fixture.image.height,
      close: vi.fn(),
    };
    let finishDecode!: (value: typeof bitmap) => void;
    createBitmap.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDecode = resolve;
        }),
    );
    const receiving = socket.receive(packet(observation()));
    await flushPromises();
    element<HTMLButtonElement>("source-stop").click();
    await flushPromises();
    finishDecode(bitmap);
    await receiving;
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(element("stage-player").textContent).toBe("WAITING");
    expect(renderer.drawMoleScene.mock.calls.at(-1)?.[1]).toBeNull();
  });

  it("releases a late camera-start acknowledgement after an operator stop", async () => {
    await selectCamera();
    let finishStart!: (value: object) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStart = resolve;
        }),
    );
    element<HTMLButtonElement>("source-connect").click();
    await flushPromises();
    element<HTMLButtonElement>("source-stop").click();
    finishStart({
      ok: true,
      json: async () => ({ state: "running", epoch: "late-owned-epoch" }),
    });
    await flushPromises();
    expect(FakeWebSocket.instances).toHaveLength(0);
    const stops = fetchMock.mock.calls.filter(([path]) => path === "/api/stop");
    expect(stops).toHaveLength(1);
    expect(JSON.parse(stops[0][1].body as string)).toEqual({
      epoch: "late-owned-epoch",
    });
    expect(element<HTMLButtonElement>("source-connect").disabled).toBe(false);
  });

  it("starts rehearsal after setup without a join step or camera access", () => {
    choose("source-select", "demo");
    app.tick();
    expect(document.getElementById("join-player")).toBeNull();
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    expect(element("overlay-title").textContent).toBe("3");
    advance(3500);
    expect(element("mole-target").hidden).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(element("display-score").textContent).toBe("000");
  });

  it("accepts Start with incomplete framing and waits without spending round time", () => {
    choose("source-select", "demo");
    const framing = element<HTMLInputElement>("demo-framing");
    framing.checked = false;
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    advance(1000);
    expect(element("time-value").textContent).toBe("1:00");
    expect(element("overlay-copy").textContent).toMatch(/feet/i);
    expect(element<HTMLButtonElement>("end-round").disabled).toBe(false);
    framing.checked = true;
    framing.dispatchEvent(new Event("change"));
    expect(element("overlay-title").textContent).toBe("3");
    advance(3500);
    expect(element("mole-target").hidden).toBe(false);
  });

  it("automatically recovers missing feet through a countdown without manual resume", () => {
    startDemo();
    const framing = element<HTMLInputElement>("demo-framing");
    framing.checked = false;
    framing.dispatchEvent(new Event("change"));
    const time = element("time-value").textContent;
    advance(1000);
    expect(element("time-value").textContent).toBe(time);
    expect(element("resume-round").hidden).toBe(true);
    framing.checked = true;
    framing.dispatchEvent(new Event("change"));
    expect(element("overlay-title").textContent).toBe("2");
    expect(element("time-value").textContent).toBe(time);
    advance(2500);
    expect(element("mole-target").hidden).toBe(false);
  });

  it("arms camera Start before a pose exists, then auto starts after stable input", async () => {
    const socket = await startCamera();
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    advance(500);
    expect(element("time-value").textContent).toBe("1:00");
    for (let sequence = 1; sequence <= 80; sequence++) {
      now += 50;
      await socket.receive(packet(observation(sequence)));
    }
    expect(element("mole-target").hidden).toBe(false);
    expect(element("player-binding").textContent).toMatch(/camera-track-1/);
  });

  it("does not select by detection order when multiple participants are present", async () => {
    const socket = await startCamera();
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    for (let sequence = 1; sequence <= 20; sequence++) {
      const value = observation(sequence);
      value.people.push({
        ...structuredClone(value.people[0]),
        trackId: "camera-track-2",
      });
      if (sequence % 2) value.people.reverse();
      value.detectedCount = 2;
      now += 50;
      await socket.receive(packet(value));
    }
    expect(element("player-binding").hidden).toBe(true);
    expect(element("player-status").textContent).toMatch(/more than one/i);
    expect(element("mole-target").hidden).toBe(true);
    expect(element("time-value").textContent).toBe("1:00");
  });

  it("keeps the round running and scores only the joined player when a spectator enters", async () => {
    const socket = await startCamera();
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    let sequence = 0;
    const send = async (value: Observation) => {
      now += 50;
      await socket.receive(packet(value));
    };
    for (let frame = 0; frame < 80; frame++) {
      const value = observation(++sequence);
      leftPalm(value.people[0], 0.04, 0.04);
      await send(value);
    }
    const target = targetPosition();
    const initialTime = element("time-value").textContent;
    const initialScore = element("score-value").textContent;
    const x = 1 - target.x / 960;
    const y = target.y / 600;
    function withSpectator(hit: boolean): Observation {
      const value = observation(++sequence);
      const joined = value.people[0];
      const spectator = structuredClone(joined);
      spectator.trackId = "spectator";
      leftPalm(spectator, x, y);
      leftPalm(joined, hit ? x : 0.04, hit ? y : 0.04);
      value.people.splice(sequence % 2, 0, spectator);
      value.detectedCount = 2;
      return value;
    }
    for (let frame = 0; frame < 25; frame++) await send(withSpectator(false));
    expect(element("time-value").textContent).not.toBe(initialTime);
    expect(element("score-value").textContent).toBe(initialScore);
    expect(element("mole-target").hidden).toBe(false);
    expect(element("player-binding").textContent).toContain("camera-track-1");
    await send(withSpectator(true));
    expect(Number(element("score-value").textContent)).toBe(
      Number(initialScore) + 100,
    );

    const departed = withSpectator(false);
    departed.people = departed.people.filter(
      (person) => person.trackId === "spectator",
    );
    departed.detectedCount = 1;
    await send(departed);
    expect(element("restart-round").hidden).toBe(false);
    expect(element("mole-target").hidden).toBe(true);
    expect(Number(element("score-value").textContent)).toBe(
      Number(initialScore) + 100,
    );
  });

  it("supports an optional explicit override before Start for a crowded camera view", async () => {
    const socket = await startCamera();
    const value = observation();
    value.people.push({
      ...structuredClone(value.people[0]),
      trackId: "camera-track-2",
    });
    value.detectedCount = 2;
    await socket.receive(packet(value));
    choose("player-track", "camera-track-2");
    expect(element("player-binding").textContent).toMatch(/camera-track-2/);
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    expect(element<HTMLSelectElement>("player-track").disabled).toBe(false);
    for (let sequence = 2; sequence <= 15; sequence++) {
      const next = {
        ...value,
        sequence,
        capturedAtNs: String(BigInt(sequence) * 50_000_000n),
        processedAtNs: String(BigInt(sequence) * 50_000_000n + 16_000_000n),
      };
      now += 50;
      await socket.receive(packet(next));
    }
    expect(element<HTMLSelectElement>("player-track").disabled).toBe(true);
  });

  it("requires a new round after explicit identity uncertainty even if the same track returns", async () => {
    const socket = await startCamera();
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    for (let sequence = 1; sequence <= 80; sequence++) {
      now += 50;
      await socket.receive(packet(observation(sequence)));
    }
    const uncertain = observation(81);
    uncertain.people[0].identity = "ambiguous";
    now += 50;
    await socket.receive(packet(uncertain));
    expect(element("stage-player").textContent).toBe("WAITING");
    expect(element("player-status").textContent).toMatch(/New round needed/);
    const time = element("time-value").textContent;
    const score = element("score-value").textContent;
    expect(element("mole-target").hidden).toBe(true);
    for (let sequence = 82; sequence <= 92; sequence++) {
      now += 50;
      await socket.receive(packet(observation(sequence)));
    }
    expect(element("time-value").textContent).toBe(time);
    expect(element("score-value").textContent).toBe(score);
    expect(element("mole-target").hidden).toBe(true);
    for (let sequence = 93; sequence <= 145; sequence++) {
      now += 50;
      await socket.receive(packet(observation(sequence)));
    }
    expect(element("mole-target").hidden).toBe(true);
    expect(element("restart-round").hidden).toBe(false);
  });

  it.each(["track", "calibration"])(
    "requires a fresh round after changed %s, with no score transfer",
    async (change) => {
      const socket = await startCamera();
      element<HTMLButtonElement>("start-round").click();
      element<HTMLButtonElement>("confirm-start").click();
      for (let sequence = 1; sequence <= 80; sequence++) {
        now += 50;
        await socket.receive(packet(observation(sequence)));
      }
      const outside = observation(81);
      leftPalm(outside.people[0], 0.04, 0.04);
      now += 50;
      await socket.receive(packet(outside));
      const target = targetPosition();
      const hit = observation(82);
      leftPalm(hit.people[0], 1 - target.x / 960, target.y / 600);
      now += 50;
      await socket.receive(packet(hit));
      expect(element("score-value").textContent).toBe("100");
      for (let sequence = 83; sequence <= 110; sequence++) {
        const value = observation(sequence);
        if (change === "track") value.people[0].trackId = "camera-track-2";
        else value.calibrationId = "changed-calibration";
        now += 50;
        await socket.receive(packet(value));
      }
      expect(element("score-value").textContent).toBe("100");
      expect(element("mole-target").hidden).toBe(true);
      expect(element("restart-round").hidden).toBe(false);
      expect(element("overlay-copy").textContent).toMatch(/score ownership/i);
      element<HTMLButtonElement>("restart-round").click();
      element<HTMLButtonElement>("confirm-start").click();
      expect(element("score-value").textContent).toBe("000");
      expect(element("start-round").hidden).toBe(true);
      expect(element("game-status").textContent).toMatch(/waiting/i);
    },
  );

  it("scores a camera palm ring at the mole edge and ignores a wrist at its center", async () => {
    const socket = await startCamera();
    const start = fetchMock.mock.calls.find(([url]) => url === "/api/start");
    expect(JSON.parse(start?.[1]?.body).algorithm).toBe("mediapipe");
    element<HTMLButtonElement>("confirm-start").click();
    const feed = async (value: Observation) => {
      now += 50;
      await socket.receive(packet(value));
    };
    for (let sequence = 1; sequence <= 80; sequence++) {
      await feed(observation(sequence));
    }
    const target = targetPosition();
    const x = 1 - target.x / 960;
    const y = target.y / 600;
    const wristOnly = observation(81);
    leftPalm(wristOnly.people[0], x, y + 0.03);
    delete wristOnly.people[0].joints.left_index_finger;
    await feed(wristOnly);
    expect(element("hits-value").textContent).toBe("0");
    expect(
      (renderer.drawMoleScene.mock.calls.at(-1)?.[7] as TouchRegion[]).map(
        ({ name }) => name,
      ),
    ).toEqual(["left_foot", "right_foot"]);

    const palmAway = observation(82);
    leftPalm(palmAway.people[0], x, y - 0.1);
    await feed(palmAway);
    const palmEdge = observation(83);
    const palmY = y - TUNING.normal.radius - TUNING.touchRadius / 2;
    leftPalm(palmEdge.people[0], x, palmY);
    await feed(palmEdge);
    expect(element("score-value").textContent).toBe("100");
    const palm = (
      renderer.drawMoleScene.mock.calls.at(-1)?.[7] as TouchRegion[]
    ).find(({ name }) => name === "left_hand");
    expect(palm?.y).toBeCloseTo(palmY);
    expect(palm?.radius).toBe(TUNING.touchRadius);
    advance(TUNING.staleMs + 50);
    expect(renderer.drawMoleScene.mock.calls.at(-1)?.[7]).toEqual([]);
  });

  it("keeps camera diagnostics off by default and out of the separate player display", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    expect(renderer.drawMoleScene.mock.calls.at(-1)?.[5]).toBe(false);
    const toggle = element<HTMLInputElement>("show-tracking");
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));
    expect(renderer.drawMoleScene.mock.calls.at(-1)?.[5]).toBe(true);
    display.isOpen = true;
    app.tick();
    expect(renderer.drawMoleScene.mock.calls.at(-1)?.[5]).toBe(false);
  });

  it("keeps playing when the operator tab hides while the game display is visible", () => {
    startDemo();
    display.visible = true;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    advance(500);
    expect(element("game-overlay").hidden).toBe(true);
    expect(element("mole-target").hidden).toBe(false);
  });

  it("reports blocked popups with an actionable operator message", () => {
    element<HTMLButtonElement>("open-game-display").click();
    expect(display.open).toHaveBeenCalledOnce();
    expect(element("display-status").textContent).toMatch(/allow pop-ups/i);
  });
  it.each([500, 2500])(
    "handles a %i ms transport gap without transferring score",
    async (gap) => {
      const socket = await startCamera();
      element<HTMLButtonElement>("start-round").click();
      element<HTMLButtonElement>("confirm-start").click();
      for (let sequence = 1; sequence <= 80; sequence++) {
        now += 50;
        await socket.receive(packet(observation(sequence)));
      }
      const time = element("time-value").textContent;
      advance(gap);
      const skipped = Math.ceil(gap / 50);
      for (
        let sequence = 81 + skipped;
        sequence <= 81 + skipped + 60;
        sequence++
      ) {
        now += 50;
        await socket.receive(packet(observation(sequence)));
      }
      if (gap > 2000) {
        expect(element("restart-round").hidden).toBe(false);
        expect(element("time-value").textContent).toBe(time);
        expect(element("mole-target").hidden).toBe(true);
      } else {
        expect(element("restart-round").hidden).toBe(true);
        expect(element("mole-target").hidden).toBe(false);
      }
    },
  );

  it("keeps a confident camera owner through missing feet and resumes automatically", async () => {
    const socket = await startCamera();
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    for (let sequence = 1; sequence <= 80; sequence++) {
      now += 50;
      await socket.receive(packet(observation(sequence)));
    }
    const value = observation(81);
    value.people[0].joints.left_ankle = {
      x: null,
      y: null,
      score: 0,
      status: "missing",
      inFrame: false,
    };
    now += 50;
    await socket.receive(packet(value));
    expect(element("mole-target").hidden).toBe(true);
    expect(element("player-binding").textContent).toMatch(/camera-track-1/);
    expect(element("stage-player").textContent).toBe("WAITING");
    expect(element("player-status").textContent).toMatch(/feet/i);
    const time = element("time-value").textContent;
    for (let sequence = 82; sequence <= 92; sequence++) {
      now += 50;
      await socket.receive(packet(observation(sequence)));
    }
    expect(element("time-value").textContent).toBe(time);
    for (let sequence = 93; sequence <= 145; sequence++) {
      now += 50;
      await socket.receive(packet(observation(sequence)));
    }
    expect(element("mole-target").hidden).toBe(false);
    expect(element("restart-round").hidden).toBe(true);
  });
  it("preserves actionable camera startup errors while keeping Start available", async () => {
    await selectCamera();
    fetchMock.mockRejectedValueOnce(new Error("Service offline"));
    element<HTMLButtonElement>("source-connect").click();
    await flushPromises();
    expect(element("game-status").textContent).toMatch(/offline.*pnpm dev/i);
    expect(element<HTMLButtonElement>("source-connect").disabled).toBe(false);
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
  });
  it.each(["epoch", "sequence"])(
    "rejects a camera %s discontinuity before decoding or rendering the invalid image",
    async (field) => {
      const socket = await startCamera();
      const first = observation();
      await socket.receive(packet(first));
      const bitmap = await createBitmap.mock.results[0].value;
      const invalid = observation(2);
      if (field === "epoch") invalid.epoch = "unexpected-restart";
      else invalid.sequence = 1;
      const renderedBefore = renderer.drawMoleScene.mock.calls.length;
      now += 50;
      await socket.receive(packet(invalid));
      expect(createBitmap).toHaveBeenCalledTimes(1);
      expect(
        renderer.drawMoleScene.mock.calls
          .slice(renderedBefore)
          .every((call) => call[1] === null),
      ).toBe(true);
      expect(renderer.drawMoleScene.mock.calls.at(-1)?.[1]).toBeNull();
      expect(bitmap.close).toHaveBeenCalledOnce();
      expect(socket.close).toHaveBeenCalledOnce();
      expect(element("game-status").textContent).toMatch(
        /stream changed|old frame/i,
      );
      expect(element<HTMLButtonElement>("source-connect").disabled).toBe(false);
      expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
      const stops = fetchMock.mock.calls.filter(
        ([path]) => path === "/api/stop",
      );
      expect(JSON.parse(stops.at(-1)![1].body as string)).toEqual({
        epoch: "camera-test",
      });
    },
  );
});
