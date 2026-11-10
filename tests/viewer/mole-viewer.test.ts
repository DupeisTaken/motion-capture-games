// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountMoleGame } from "../../apps/mirror/src/mole-viewer";
import type { Observation } from "../../contracts/generated/observation";
import fixture from "../../contracts/examples/synthetic-observation.json";

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
          left_ankle: { ...joint, x: 0.4 },
          right_ankle: { ...joint, x: 0.6 },
        },
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
  if (!value) throw new Error(`Missing Mole Motion element: ${id}`);
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

function targetPosition(): { x: number; y: number } {
  const target = element("mole-target");
  return {
    x: Number.parseFloat(target.style.left),
    y: Number.parseFloat(target.style.top),
  };
}

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

describe("Mole Motion operator integration", () => {
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
      expect(Number(element("score-value").textContent)).toBe(0);
      expect(element("hits-value").textContent).toBe("0");
      expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
      expect(element<HTMLSelectElement>("mode-select").disabled).toBe(false);
    },
  );

  it("uses a hip push in rehearsal and keeps feet out of push controls", () => {
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

  it("starts rehearsal directly without a join step or camera access", () => {
    expect(document.getElementById("join-player")).toBeNull();
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
    element<HTMLButtonElement>("start-round").click();
    expect(element("overlay-title").textContent).toBe("3");
    advance(3500);
    expect(element("mole-target").hidden).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(element("display-score").textContent).toBe("000");
  });

  it("accepts Start with incomplete framing and waits without spending round time", () => {
    const framing = element<HTMLInputElement>("demo-framing");
    framing.checked = false;
    element<HTMLButtonElement>("start-round").click();
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
      for (let sequence = 1; sequence <= 80; sequence++) {
        now += 50;
        await socket.receive(packet(observation(sequence)));
      }
      const outside = observation(81);
      outside.people[0].joints.left_wrist = {
        x: 0.01,
        y: 0.01,
        score: 0.95,
        status: "observed",
        inFrame: true,
      };
      now += 50;
      await socket.receive(packet(outside));
      const target = targetPosition();
      const hit = observation(82);
      hit.people[0].joints.left_wrist = {
        x: 1 - target.x / 960,
        y: target.y / 600,
        score: 0.95,
        status: "observed",
        inFrame: true,
      };
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
      expect(element("score-value").textContent).toBe("000");
      expect(element("start-round").hidden).toBe(true);
      expect(element("game-status").textContent).toMatch(/waiting/i);
    },
  );

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
