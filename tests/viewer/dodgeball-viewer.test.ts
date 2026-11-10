// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountDodgeballGame } from "../../apps/mirror/src/dodgeball-viewer";
import type { Observation } from "../../contracts/generated/observation";
import {
  syntheticBody,
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

async function startCamera(): Promise<FakeWebSocket> {
  choose("source-select", "camera");
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
  element<HTMLButtonElement>("join-player").click();
  app.tick();
  element<HTMLButtonElement>("start-round").click();
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
  vi.stubGlobal("fetch", fetchMock);
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
  it("opens a labeled full-body rehearsal without starting a camera", () => {
    expect(element<HTMLSelectElement>("source-select").value).toBe("demo");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
    element<HTMLButtonElement>("join-player").click();
    expect(drawnBody()).toHaveLength(13);
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
    expect(document.querySelector('a[href="/mole.html"]')).not.toBeNull();
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
  it("freezes time and the ball when either foot is hidden, requiring explicit recovery", () => {
    startDemo();
    const framing = element<HTMLInputElement>("demo-framing");
    framing.checked = false;
    framing.dispatchEvent(new Event("change"));
    expect(element("overlay-title").textContent).toBe(
      "Step back — keep both feet in view.",
    );
    expect(element("overlay-copy").textContent).toMatch(
      /camera framing.*occlusion/,
    );
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
    const time = element("time-value").textContent,
      ball = drawnBall();
    advance(5000);
    expect(element("time-value").textContent).toBe(time);
    expect(drawnBall()).toEqual(ball);
    framing.checked = true;
    framing.dispatchEvent(new Event("change"));
    expect(element("game-overlay").hidden).toBe(false);
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(false);
    element<HTMLButtonElement>("resume-round").click();
    expect(element("overlay-title").textContent).toBe("2");
  });
  it("supports pause, countdown recovery, end, results and a fresh setup", () => {
    startDemo();
    element<HTMLButtonElement>("pause-round").click();
    const time = element("time-value").textContent;
    advance(5000);
    expect(element("time-value").textContent).toBe(time);
    element<HTMLButtonElement>("resume-round").click();
    expect(element("overlay-title").textContent).toBe("2");
    expect(document.activeElement).toBe(element("game-stage"));
    advance(2500);
    expect(element("game-overlay").hidden).toBe(true);
    element<HTMLButtonElement>("end-round").click();
    expect(element("overlay-copy").textContent).toMatch(
      /clean dodges.*points.*best streak/,
    );
    expect(element("restart-round").hidden).toBe(false);
    element<HTMLButtonElement>("restart-round").click();
    expect(element<HTMLSelectElement>("mode-select").disabled).toBe(false);
    expect(element("score-value").textContent).toBe("000");
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
  });
  it("pauses on a hidden tab and removes listeners on disposal", () => {
    startDemo();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(element("overlay-copy").textContent).toMatch(/Tab hidden/);
    const title = element("overlay-title").textContent;
    app.dispose();
    element<HTMLButtonElement>("resume-round").click();
    expect(element("overlay-title").textContent).toBe(title);
  });
  it("shows an actionable backend error and permits a retry", async () => {
    choose("source-select", "camera");
    fetchMock.mockRejectedValueOnce(new Error("Service offline"));
    element<HTMLButtonElement>("source-connect").click();
    await flushPromises();
    expect(element("game-status").textContent).toMatch(/offline.*pnpm dev/i);
    expect(element<HTMLButtonElement>("source-connect").disabled).toBe(false);
    expect(element<HTMLButtonElement>("source-stop").disabled).toBe(true);
  });
  it("requires explicit camera-track enrollment and rejects incomplete body input", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
    choose("player-track", "camera-track-1");
    element<HTMLButtonElement>("join-player").click();
    element<HTMLButtonElement>("start-round").click();
    for (let sequence = 2; sequence <= 64; sequence++) {
      now += 50;
      await socket.receive(packet(observation(sequence)));
    }
    expect(element("game-overlay").hidden).toBe(true);
    const incomplete = observation(65);
    delete incomplete.people[0].joints.left_elbow;
    now += 50;
    await socket.receive(packet(incomplete));
    expect(element("overlay-copy").textContent).toMatch(/whole body visible/);
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
    now += 50;
    await socket.receive(packet(observation(66)));
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(false);
  });
  it("releases uncertain identity and never automatically substitutes a participant", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    choose("player-track", "camera-track-1");
    element<HTMLButtonElement>("join-player").click();
    element<HTMLButtonElement>("start-round").click();
    now += 50;
    const uncertain = observation(2);
    uncertain.people[0].identity = "ambiguous";
    await socket.receive(packet(uncertain));
    expect(element("stage-player").textContent).toBe("NOT JOINED");
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
    now += 50;
    await socket.receive(packet(observation(3)));
    expect(element("stage-player").textContent).toBe("NOT JOINED");
    choose("player-track", "camera-track-1");
    element<HTMLButtonElement>("join-player").click();
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(false);
  });
  it.each(["calibration", "track"])(
    "requires a new round after a %s change",
    async (change) => {
      const socket = await startCamera();
      await socket.receive(packet(observation()));
      choose("player-track", "camera-track-1");
      element<HTMLButtonElement>("join-player").click();
      element<HTMLButtonElement>("start-round").click();
      now += 50;
      const changed = observation(2);
      if (change === "calibration") changed.calibrationId = "new-calibration";
      else changed.people[0].trackId = "camera-track-2";
      await socket.receive(packet(changed));
      choose(
        "player-track",
        change === "track" ? "camera-track-2" : "camera-track-1",
      );
      element<HTMLButtonElement>("join-player").click();
      element<HTMLButtonElement>("resume-round").click();
      expect(element("resume-round").hidden).toBe(true);
      expect(element("restart-round").hidden).toBe(false);
      expect(element("overlay-copy").textContent).toMatch(/score ownership/);
    },
  );
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
    expect(element("stage-player").textContent).toBe("NOT JOINED");
  });
  it("releases a late camera-start acknowledgment after an explicit stop", async () => {
    choose("source-select", "camera");
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
  it.each(["epoch", "sequence"])(
    "rejects a camera %s discontinuity",
    async (field) => {
      const socket = await startCamera();
      await socket.receive(packet(observation()));
      const invalid = observation(2);
      if (field === "epoch") invalid.epoch = "restart";
      else invalid.sequence = 1;
      now += 50;
      await socket.receive(packet(invalid));
      expect(createBitmap).toHaveBeenCalledTimes(1);
      expect(element("game-status").textContent).toMatch(
        /stream changed|old frame/,
      );
      expect(renderer.drawDodgeScene.mock.calls.at(-1)?.[1]).toBeNull();
    },
  );
  it("blocks start while known feet are missing and enables it after framing recovery", () => {
    const framing = element<HTMLInputElement>("demo-framing");
    framing.checked = false;
    element<HTMLButtonElement>("join-player").click();
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
    expect(element("game-status").textContent).toMatch(/feet/i);
    framing.checked = true;
    framing.dispatchEvent(new Event("change", { bubbles: true }));
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
  });

  it("keeps camera track options stable and displays the actual bound owner", async () => {
    const socket = await startCamera();
    const first = observation();
    const spectator = {
      ...structuredClone(first.people[0]),
      trackId: "camera-track-2",
    };
    first.people.push(spectator);
    first.detectedCount = 2;
    await socket.receive(packet(first));
    choose("player-track", "camera-track-1");
    const control = element<HTMLSelectElement>("player-track");
    const options = [...control.options];
    const next = observation(2);
    next.people.push(spectator);
    next.people.reverse();
    next.detectedCount = 2;
    now += 50;
    await socket.receive(packet(next));
    expect([...control.options]).toEqual(options);
    for (let index = 0; index < options.length; index++)
      expect(control.options[index]).toBe(options[index]);
    expect(control.value).toBe("camera-track-1");
    element<HTMLButtonElement>("join-player").click();
    expect(control.disabled).toBe(true);
    expect(element("player-binding").textContent).toMatch(
      /player 1.*camera-track-1/i,
    );
    const later = observation(3);
    later.people.push(spectator);
    later.detectedCount = 2;
    now += 50;
    await socket.receive(packet(later));
    expect(control.disabled).toBe(true);
    expect(control.value).toBe("camera-track-1");
  });

  it("blocks start for stale joined camera input without spending round or ball time", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    choose("player-track", "camera-track-1");
    element<HTMLButtonElement>("join-player").click();
    advance(400);
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
    expect(element("game-status").textContent).toMatch(/stale/i);
    element("start-round").dispatchEvent(new Event("click"));
    expect(element("time-value").textContent).toBe("1:00");
    expect(drawnBall()).toBeNull();
  });

  it("blocks stale camera resume and preserves time until fresh input and explicit recovery", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    choose("player-track", "camera-track-1");
    element<HTMLButtonElement>("join-player").click();
    element<HTMLButtonElement>("start-round").click();
    for (let sequence = 2; sequence <= 65; sequence++) {
      now += 50;
      await socket.receive(packet(observation(sequence)));
    }
    element<HTMLButtonElement>("pause-round").click();
    const time = element("time-value").textContent;
    advance(400);
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
    expect(element("game-status").textContent).toMatch(/stale/i);
    expect(element("overlay-copy").textContent).toMatch(/stale/i);
    element("resume-round").dispatchEvent(new Event("click"));
    expect(element("overlay-title").textContent).toBe("Play paused");
    expect(element("time-value").textContent).toBe(time);
    // The gap invalidates membership too; fresh poses alone cannot grant control.
    now += 50;
    await socket.receive(packet(observation(74)));
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
    choose("player-track", "camera-track-1");
    element<HTMLButtonElement>("join-player").click();
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(false);
    expect(element("time-value").textContent).toBe(time);
  });

  it("keeps a failed late-start release available after switching to rehearsal", async () => {
    choose("source-select", "camera");
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
    expect(element("camera-release-message").textContent).toMatch(
      /unconfirmed.*driver/i,
    );
    element<HTMLButtonElement>("retry-camera-stop").click();
    await flushPromises();
    expect(element("camera-release").hidden).toBe(true);
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
      expect(element("player-status").textContent).toMatch(
        /join player 1.*rehearsal/i,
      );
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

  it.each(["nose", "left_elbow", "left_ankle"] as const)(
    "blocks admission for missing %s and updates recovery guidance",
    async (joint) => {
      const socket = await startCamera();
      const incomplete = observation();
      delete incomplete.people[0].joints[joint];
      await socket.receive(packet(incomplete));
      choose("player-track", "camera-track-1");
      element<HTMLButtonElement>("join-player").click();
      expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
      expect(element("game-status").textContent).toMatch(/whole body|feet/i);
      element("start-round").dispatchEvent(new Event("click"));
      expect(element("overlay-title").textContent).not.toBe("3");
      expect(drawnBall()).toBeNull();
      now += 50;
      await socket.receive(packet(observation(2)));
      expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
      expect(element("game-status").textContent).toMatch(/ready.*start/i);
    },
  );

  it("rejects malformed body observations before preview, admission or decoding", async () => {
    const socket = await startCamera();
    const malformed = observation();
    malformed.people[0].joints.nose!.x = 1.2;
    await socket.receive(packet(malformed));
    expect(createBitmap).not.toHaveBeenCalled();
    expect(element("game-status").textContent).toMatch(/Invalid observation/i);
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
    expect(element("stage-player").textContent).toBe("NOT JOINED");
  });

  it("guards Start and Resume against a hidden document even after a forged click", () => {
    element<HTMLButtonElement>("join-player").click();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    app.tick();
    element("start-round").dispatchEvent(new Event("click"));
    expect(drawnBall()).toBeNull();
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    startDemo();
    element<HTMLButtonElement>("pause-round").click();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    app.tick();
    element("resume-round").dispatchEvent(new Event("click"));
    expect(element("overlay-title").textContent).toBe("Play paused");
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
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
    choose("source-select", "camera");
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

  it("offers a new setup before a changed-source resume can be attempted", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    choose("player-track", "camera-track-1");
    element<HTMLButtonElement>("join-player").click();
    element<HTMLButtonElement>("start-round").click();
    element<HTMLButtonElement>("pause-round").click();
    now += 50;
    const changed = observation(2);
    changed.calibrationId = "different-space";
    await socket.receive(packet(changed));
    choose("player-track", "camera-track-1");
    element<HTMLButtonElement>("join-player").click();
    expect(element("resume-round").hidden).toBe(true);
    expect(element("restart-round").hidden).toBe(false);
    expect(element("overlay-copy").textContent).toMatch(/score ownership/);
    element("resume-round").dispatchEvent(new Event("click"));
    expect(element("overlay-title").textContent).toBe("Play paused");
    element<HTMLButtonElement>("restart-round").click();
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
  });
});
