// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountDodgeballGame } from "../../apps/mirror/src/dodgeball-viewer";
import type { Observation } from "../../contracts/generated/observation";
import {
  syntheticBody,
  mapJoint,
  SYNTHETIC_BODY_BOUNDS,
  type BodyPoint,
} from "../../packages/motion/src/index";
import fixture from "../../contracts/examples/synthetic-observation.json";

const renderer = vi.hoisted(() => ({
  drawDodgeScene: vi.fn<(...args: unknown[]) => object>(() => ({
    x: 0,
    y: 0,
    width: 960,
    height: 600,
  })),
}));
vi.mock("../../apps/mirror/src/dodgeball-renderer", () => renderer);
const display = vi.hoisted(() => ({
  open: vi.fn(() => true),
  close: vi.fn(),
  dispose: vi.fn(),
  startTicker: vi.fn(() => vi.fn()),
  isOpen: false,
  visible: false,
}));
vi.mock("../../apps/mirror/src/game-display", () => ({
  createGameDisplay: () => display,
}));

let now: number;
let app: ReturnType<typeof mountDodgeballGame>;
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
  const joints = Object.fromEntries(
    syntheticBody().map(({ name, x, y }) => [
      name,
      {
        x,
        y,
        score: 0.95,
        status: "observed" as const,
        inFrame: true,
      },
    ]),
  );
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
        joints,
      },
    ],
  };
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
  if (!value) throw new Error(`Missing Dodgeball element: ${id}`);
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

function drawnBody(): BodyPoint[] {
  const body = renderer.drawDodgeScene.mock.calls.at(-1)?.[3];
  return body as BodyPoint[];
}
function drawnBall(): { phase: string; remainingMs: number } | null {
  return renderer.drawDodgeScene.mock.calls.at(-1)?.[4] as {
    phase: string;
    remainingMs: number;
  } | null;
}

beforeEach(() => {
  vi.clearAllMocks();
  display.isOpen = false;
  display.visible = false;
  display.open.mockReturnValue(true);
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
  document.body.innerHTML = '<div id="dodge-test-root"></div>';
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
  app = mountDodgeballGame(element("dodge-test-root"), {
    now: () => now,
    autoTick: false,
    seed: 42,
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

describe("Dodgeball operator integration", () => {
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
      const before = drawnBody().find((point) => point.name === "left_wrist")!;
      const moved = observation(2);
      for (const joint of Object.values(moved.people[0].joints)) {
        if (joint.x !== null) joint.x += 0.1;
      }
      now += 50;
      await socket.receive(packet(moved));
      const after = drawnBody().find((point) => point.name === "left_wrist")!;
      const rect = { x: 20, y: 40, width: 800, height: 500 };
      expect(renderer.drawDodgeScene.mock.calls.at(-1)?.[5]).toBe(true);
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
        drawnBody().find((point) => point.name === "nose")!,
        rect,
      );
      now += 50;
      element("game-stage").dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      const after = mapJoint(
        drawnBody().find((point) => point.name === "nose")!,
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

  it("keeps manual pause and resume outside setup", () => {
    startDemo();
    element<HTMLButtonElement>("pause-round").click();
    expect(element<HTMLDialogElement>("pre-game-settings").open).toBe(false);
    element<HTMLButtonElement>("resume-round").click();
    advance(2500);
    expect(element<HTMLDialogElement>("pre-game-settings").open).toBe(false);
    expect(element("game-overlay").hidden).toBe(true);
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
  it("starts rehearsal after setup confirmation and leaves camera access explicit", () => {
    choose("source-select", "demo");
    app.tick();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.getElementById("join-player")).toBeNull();
    expect(document.getElementById("player-track")).toBeNull();
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
    expect(drawnBody()).toHaveLength(13);
    startDemo();
    expect(drawnBall()).not.toBeNull();
  });
  it("queues Start through missing feet and begins only when tracking is ready", () => {
    choose("source-select", "demo");
    const framing = element<HTMLInputElement>("demo-framing");
    framing.checked = false;
    framing.dispatchEvent(new Event("change"));
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    advance(1000);
    expect(element("overlay-title").textContent).toBe("Finding your player");
    expect(drawnBall()).toBeNull();
    expect(element("time-value").textContent).toBe("1:00");
    framing.checked = true;
    framing.dispatchEvent(new Event("change"));
    expect(element("overlay-title").textContent).toBe("3");
    advance(3000);
    expect(drawnBall()).not.toBeNull();
  });
  it.each(["nose", "left_elbow", "left_ankle"] as const)(
    "queues camera Start through a missing %s",
    async (joint) => {
      const socket = await startCamera();
      element<HTMLButtonElement>("start-round").click();
      element<HTMLButtonElement>("confirm-start").click();
      const incomplete = observation();
      delete incomplete.people[0].joints[joint];
      await socket.receive(packet(incomplete));
      expect(element("overlay-title").textContent).toBe("Finding your player");
      expect(drawnBall()).toBeNull();
      now += 50;
      await socket.receive(packet(observation(2)));
      expect(element("overlay-title").textContent).toBe("3");
      expect(element("player-binding").textContent).toContain("camera-track-1");
    },
  );
  it("keeps a queued Start recoverable before any participant is admitted", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    advance(400);
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    now += 50;
    const missing = observation(10);
    missing.people = [];
    missing.detectedCount = 0;
    await socket.receive(packet(missing));
    expect(element("overlay-title").textContent).toBe("Finding your player");
    now += 50;
    const replacement = observation(11);
    replacement.people[0].trackId = "new-ready-player";
    await socket.receive(packet(replacement));
    expect(element("overlay-title").textContent).toBe("3");
    expect(element("player-binding").textContent).toContain("new-ready-player");
  });
  it("cancels a pending Start with End and stays ready without a camera", async () => {
    await selectCamera();
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    expect(element("overlay-title").textContent).toBe("Finding your player");
    element<HTMLButtonElement>("end-round").click();
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
    expect(element("start-round").hidden).toBe(false);
    expect(element("player-binding").hidden).toBe(true);
    expect(drawnBall()).toBeNull();
  });
  it("keeps pending Start safe across camera stop and restart before admission", async () => {
    await startCamera();
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    element<HTMLButtonElement>("source-stop").click();
    await flushPromises();
    element<HTMLButtonElement>("source-connect").click();
    await flushPromises();
    const socket = FakeWebSocket.instances.at(-1)!;
    socket.onopen?.();
    await socket.receive(packet(observation()));
    expect(element("overlay-title").textContent).toBe("3");
    expect(element("player-binding").textContent).toContain("camera-track-1");
    expect(element("score-value").textContent).toBe("000");
  });
  it("waits for one unique player instead of selecting by detection order", async () => {
    const socket = await startCamera();
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    const two = observation();
    two.people.push({
      ...structuredClone(two.people[0]),
      trackId: "spectator",
    });
    two.detectedCount = 2;
    await socket.receive(packet(two));
    expect(element("overlay-title").textContent).toBe("Finding your player");
    now += 50;
    await socket.receive(packet(observation(2)));
    expect(element("overlay-title").textContent).toBe("3");
  });
  it("advances the hazard with a spectator present and uses only the joined body", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    expect(element("overlay-title").textContent).toBe("3");

    let sequence = 1;
    const sendSpectatorFrame = async (ownerPresent = true) => {
      const value = observation(++sequence);
      const spectator = structuredClone(value.people[0]);
      spectator.trackId = "spectator";
      spectator.joints.nose!.x = 0.8;
      if (ownerPresent) value.people.splice(sequence % 2, 0, spectator);
      else value.people = [spectator];
      value.detectedCount = value.people.length;
      now += 50;
      await socket.receive(packet(value));
    };

    for (let frame = 0; frame < 65; frame++) await sendSpectatorFrame();
    expect(element("game-overlay").hidden).toBe(true);
    expect(drawnBall()?.phase).toBe("warning");
    const warningTime = drawnBall()!.remainingMs;
    const initialTime = element("time-value").textContent;
    for (let frame = 0; frame < 25; frame++) await sendSpectatorFrame();
    expect(element("game-overlay").hidden).toBe(true);
    expect(drawnBall()!.remainingMs).toBeLessThan(warningTime);
    expect(element("time-value").textContent).not.toBe(initialTime);
    expect(drawnBody().find((point) => point.name === "nose")?.x).toBe(0.5);
    expect(element("player-binding").textContent).toContain("camera-track-1");

    const score = element("score-value").textContent;
    await sendSpectatorFrame(false);
    expect(element("game-overlay").hidden).toBe(false);
    expect(element("restart-round").hidden).toBe(false);
    expect(element("score-value").textContent).toBe(score);
  });
  it("freezes active time and automatically counts down after confident framing recovery", () => {
    startDemo();
    const ball = drawnBall();
    const time = element("time-value").textContent;
    const score = element("score-value").textContent;
    const framing = element<HTMLInputElement>("demo-framing");
    framing.checked = false;
    framing.dispatchEvent(new Event("change"));
    advance(1000);
    expect(element("overlay-title").textContent).toMatch(/feet/i);
    expect(element("stage-player").textContent).toBe("WAITING");
    expect(drawnBall()?.remainingMs).toBe(ball?.remainingMs);
    expect(element("time-value").textContent).toBe(time);
    expect(element("score-value").textContent).toBe(score);
    framing.checked = true;
    framing.dispatchEvent(new Event("change"));
    expect(element("overlay-title").textContent).toBe("2");
    advance(2000);
    expect(element("game-overlay").hidden).toBe(true);
  });
  it("keeps manual pause explicit and guards hidden-document actions", () => {
    startDemo();
    element<HTMLButtonElement>("pause-round").click();
    advance(500);
    expect(element("overlay-title").textContent).toBe("Play paused");
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    app.tick();
    element("resume-round").dispatchEvent(new Event("click"));
    expect(element("overlay-title").textContent).toBe("Play paused");
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    element<HTMLButtonElement>("resume-round").click();
    expect(element("overlay-title").textContent).toBe("2");
  });
  it("does not suspend an active visible game window when the operator tab hides", () => {
    startDemo();
    display.visible = true;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    app.tick();
    expect(element("game-overlay").hidden).toBe(true);
  });
  it("opens the shared game display and reports blocked pop-ups", () => {
    element<HTMLButtonElement>("open-game-window").click();
    expect(display.open).toHaveBeenCalledOnce();
    display.open.mockReturnValue(false);
    element<HTMLButtonElement>("open-game-window").click();
    expect(element("display-status").textContent).toMatch(/allow pop-ups/i);
  });
  it("keeps tracking graphics opt-in and preserves the camera preview through joint loss", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    expect(renderer.drawDodgeScene.mock.calls.at(-1)?.[6]).toBe(false);
    const diagnostics = element<HTMLInputElement>("show-tracking");
    diagnostics.checked = true;
    diagnostics.dispatchEvent(new Event("change"));
    expect(renderer.drawDodgeScene.mock.calls.at(-1)?.[6]).toBe(true);
    const incomplete = observation(2);
    delete incomplete.people[0].joints.nose;
    now += 50;
    await socket.receive(packet(incomplete));
    expect(renderer.drawDodgeScene.mock.calls.at(-1)?.[2]).not.toBeNull();
  });
  it.each(["calibration", "track"])(
    "never gives an existing round to changed %s",
    async (change) => {
      const socket = await startCamera();
      await socket.receive(packet(observation()));
      element<HTMLButtonElement>("start-round").click();
      element<HTMLButtonElement>("confirm-start").click();
      const changed = observation(2);
      if (change === "calibration") changed.calibrationId = "new-space";
      else changed.people[0].trackId = "different-player";
      now += 50;
      await socket.receive(packet(changed));
      advance(2100);
      expect(element("resume-round").hidden).toBe(true);
      expect(element("restart-round").hidden).toBe(false);
      expect(element("player-binding").textContent).toContain("camera-track-1");
      element<HTMLButtonElement>("restart-round").click();
      element<HTMLButtonElement>("confirm-start").click();
      expect(element("score-value").textContent).toBe("000");
    },
  );
  it("never resumes old score after an explicit ambiguous identity or absent participant", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    now += 50;
    const uncertain = observation(2);
    uncertain.people[0].identity = "ambiguous";
    await socket.receive(packet(uncertain));
    expect(element("stage-player").textContent).toBe("WAITING");
    expect(element("player-status").textContent).toMatch(/New round needed/);
    now += 50;
    await socket.receive(packet(observation(3)));
    expect(element("resume-round").hidden).toBe(true);
    expect(element("restart-round").hidden).toBe(false);
    expect(element("overlay-copy").textContent).toMatch(/score ownership/);
    element<HTMLButtonElement>("restart-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    expect(element("overlay-title").textContent).toBe("3");
  });
  it("automatically recovers a short transport gap with the same confident owner", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("confirm-start").click();
    advance(500);
    expect(element("overlay-title").textContent).toBe("Finding you again");
    now += 50;
    await socket.receive(packet(observation(12)));
    expect(element("overlay-title").textContent).toBe("2");
    expect(element("score-value").textContent).toBe("000");
  });
  it("suppresses diagnostic graphics in a detached game display", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    const diagnostics = element<HTMLInputElement>("show-tracking");
    diagnostics.checked = true;
    display.isOpen = true;
    diagnostics.dispatchEvent(new Event("change"));
    expect(renderer.drawDodgeScene.mock.calls.at(-1)?.[6]).toBe(false);
    expect(element("display-score").textContent).toBe(
      element("score-value").textContent,
    );
  });
  it.each(["epoch", "sequence"])(
    "rejects a camera %s discontinuity before decode and clears the preview",
    async (field) => {
      const socket = await startCamera();
      await socket.receive(packet(observation()));
      const invalid = observation(2);
      if (field === "epoch") invalid.epoch = "restarted-source";
      else invalid.sequence = 1;
      now += 50;
      await socket.receive(packet(invalid));
      expect(createBitmap).toHaveBeenCalledTimes(1);
      expect(element("game-status").textContent).toMatch(
        /stream changed|old frame/,
      );
      expect(renderer.drawDodgeScene.mock.calls.at(-1)?.[1]).toBeNull();
      expect(renderer.drawDodgeScene.mock.calls.at(-1)?.[2]).toBeNull();
      expect(socket.close).toHaveBeenCalledOnce();
      expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
    },
  );
  it("rejects malformed observations before decoding while leaving Start available", async () => {
    const socket = await startCamera();
    const malformed = observation();
    malformed.people[0].joints.nose!.x = 1.2;
    await socket.receive(packet(malformed));
    expect(createBitmap).not.toHaveBeenCalled();
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
    expect(element("stage-player").textContent).toBe("WAITING");
  });
  it("offers three modes and difficulty choices, and locks them during play", () => {
    expect(
      [...element<HTMLSelectElement>("mode-select").options].map(
        (o) => o.value,
      ),
    ).toEqual(["timed", "survival", "practice"]);
    expect(
      [...element<HTMLSelectElement>("difficulty-select").options].map(
        (o) => o.value,
      ),
    ).toEqual(["easy", "normal", "hard"]);
    choose("mode-select", "practice");
    choose("difficulty-select", "hard");
    startDemo();
    expect(element("time-value").textContent).toBe("∞");
    expect(element<HTMLSelectElement>("mode-select").disabled).toBe(true);
    expect(element<HTMLSelectElement>("source-select").disabled).toBe(true);
    expect(drawnBall()?.phase).toBe("warning");
  });

  it("shows survival shields and an active-time clock", () => {
    choose("mode-select", "survival");
    startDemo();
    expect(element("shields-label").textContent).toBe("SHIELDS");
    expect(element("hits-value").textContent).toBe("3");
    expect(element("time-label").textContent).toBe("ACTIVE TIME");
  });

  it("moves the whole avatar with mirrored keyboard controls and clamps every joint", () => {
    startDemo();
    expect(document.activeElement).toBe(element("game-stage"));
    const before = drawnBody().find((p) => p.name === "nose")!.x;
    const key = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true,
    });
    now += 50;
    element("game-stage").dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(drawnBody().find((p) => p.name === "nose")!.x).toBeGreaterThan(
      before,
    );
    for (let i = 0; i < 40; i++) {
      now += 50;
      element("game-stage").dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
      );
    }
    expect(drawnBody()).toHaveLength(13);
    for (const point of drawnBody()) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
  });

  it("supports touch positioning and uses the same contain-fit coordinates", () => {
    startDemo();
    now += 50;
    element("game-stage").dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerType: "touch",
        clientX: 960,
        clientY: 600,
        bubbles: true,
      }),
    );
    const nose = drawnBody().find((p) => p.name === "nose")!;
    expect(nose.x).toBeCloseTo(SYNTHETIC_BODY_BOUNDS.left);
    expect(nose.y).toBeCloseTo(
      syntheticBody(SYNTHETIC_BODY_BOUNDS.left, SYNTHETIC_BODY_BOUNDS.bottom)[0]
        .y,
    );
    expect(document.activeElement).toBe(element("game-stage"));
    movePointer(200, 300);
    expect(drawnBody().find((p) => p.name === "nose")!.x).toBeGreaterThan(
      nose.x,
    );
  });

  it("announces a warning countdown, active ball and next-ball phase with text", () => {
    startDemo();
    expect(element("warning-life").textContent).toMatch(/MOVE CLEAR/);
    expect(
      element<HTMLProgressElement>("warning-progress").value,
    ).toBeGreaterThan(0);
    advance(1200);
    expect(element("warning-life").textContent).toMatch(/BALL ACTIVE/);
    advance(300);
    expect(element("warning-life").textContent).toMatch(/NEXT BALL/);
  });

  it("shows an actionable backend error and permits a retry", async () => {
    await selectCamera();
    fetchMock.mockRejectedValueOnce(new Error("Service offline"));
    element<HTMLButtonElement>("source-connect").click();
    await flushPromises();
    expect(element("game-status").textContent).toMatch(/offline.*pnpm dev/i);
    expect(element<HTMLButtonElement>("source-connect").disabled).toBe(false);
    expect(element<HTMLButtonElement>("source-stop").disabled).toBe(true);
  });

  it("keeps transport bounded by requesting the next frame only after decode", async () => {
    const socket = await startCamera();
    const bitmap = {
      width: fixture.image.width,
      height: fixture.image.height,
      close: vi.fn(),
    };
    let finish!: (value: typeof bitmap) => void;
    createBitmap.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const receiving = socket.receive(packet(observation()));
    await flushPromises();
    expect(socket.send).toHaveBeenCalledTimes(1);
    await socket.receive(packet(observation(2)));
    expect(createBitmap).toHaveBeenCalledTimes(1);
    finish(bitmap);
    await receiving;
    expect(socket.send).toHaveBeenCalledTimes(2);
  });

  it("closes a decoded bitmap after stop without reviving a camera preview", async () => {
    const socket = await startCamera();
    const bitmap = {
      width: fixture.image.width,
      height: fixture.image.height,
      close: vi.fn(),
    };
    let finish!: (value: typeof bitmap) => void;
    createBitmap.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const receiving = socket.receive(packet(observation()));
    await flushPromises();
    element<HTMLButtonElement>("source-stop").click();
    await flushPromises();
    finish(bitmap);
    await receiving;
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(renderer.drawDodgeScene.mock.calls.at(-1)?.[1]).toBeNull();
    expect(element("stage-player").textContent).toBe("WAITING");
  });

  it("releases a late camera-start acknowledgment after an explicit stop", async () => {
    await selectCamera();
    let finish!: (value: object) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    element<HTMLButtonElement>("source-connect").click();
    await flushPromises();
    element<HTMLButtonElement>("source-stop").click();
    finish({
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

  it("blocks a forged new start until an unconfirmed camera release is retried", async () => {
    await startCamera();
    fetchMock.mockRejectedValueOnce(new Error("Stop connection lost"));
    element<HTMLButtonElement>("source-stop").click();
    await flushPromises();
    element("source-connect").dispatchEvent(new Event("click"));
    await flushPromises();
    expect(
      fetchMock.mock.calls.filter(([path]) => path === "/api/start"),
    ).toHaveLength(1);
    expect(element("camera-release-message").textContent).toMatch(
      /unconfirmed.*connection lost/i,
    );
    element<HTMLButtonElement>("retry-camera-stop").click();
    await flushPromises();
    expect(element("camera-release").hidden).toBe(true);
    element<HTMLButtonElement>("source-connect").click();
    await flushPromises();
    expect(
      fetchMock.mock.calls.filter(([path]) => path === "/api/start"),
    ).toHaveLength(2);
  });

  it("deduplicates simultaneous start intents and release retries", async () => {
    await selectCamera();
    element("source-connect").dispatchEvent(new Event("click"));
    element("source-connect").dispatchEvent(new Event("click"));
    await flushPromises();
    expect(
      fetchMock.mock.calls.filter(([path]) => path === "/api/start"),
    ).toHaveLength(1);
    let finishStop!: (value: object) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishStop = resolve;
        }),
    );
    element<HTMLButtonElement>("source-stop").click();
    await flushPromises();
    element("retry-camera-stop").dispatchEvent(new Event("click"));
    element("retry-camera-stop").dispatchEvent(new Event("click"));
    await flushPromises();
    expect(
      fetchMock.mock.calls.filter(([path]) => path === "/api/stop"),
    ).toHaveLength(1);
    finishStop({ ok: true });
    await flushPromises();
    expect(element("camera-release").hidden).toBe(true);
  });
});
