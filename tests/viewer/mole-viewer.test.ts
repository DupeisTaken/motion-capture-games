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

function targetPosition(): { x: number; y: number } {
  const target = element("mole-target");
  return {
    x: Number.parseFloat(target.style.left),
    y: Number.parseFloat(target.style.top),
  };
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
  document.body.innerHTML = '<div id="mole-test-root"></div>';
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
  it("opens a labeled synthetic rehearsal without starting a camera", () => {
    app.tick();
    expect(element<HTMLSelectElement>("source-select").value).toBe("demo");
    expect(document.body.textContent).toMatch(/synthetic/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Number(element("score-value").textContent)).toBe(0);
    expect(renderer.drawMoleScene).toHaveBeenCalled();
  });

  it("requires explicit joining before a round can begin", () => {
    app.tick();
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
    element<HTMLButtonElement>("join-player").click();
    app.tick();
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
    element<HTMLButtonElement>("start-round").click();
    app.tick();
    expect(element("overlay-title").textContent).toMatch(/3|ready|countdown/i);
    advance(3500);
    expect(element("mole-target").hidden).toBe(false);
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

  it("gates camera push mode and explains the missing depth capability", () => {
    choose("source-select", "camera");
    app.tick();
    expect(element<HTMLButtonElement>("interaction-push").disabled).toBe(true);
    expect(document.body.textContent).toMatch(/depth/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pauses without time or score loss while feet are outside the frame", () => {
    startDemo();
    const framing = element<HTMLInputElement>("demo-framing");
    framing.checked = false;
    framing.dispatchEvent(new Event("change", { bubbles: true }));
    app.tick();
    expect(element("overlay-title").textContent).toMatch(/step back|feet/i);
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
    const time = element("time-value").textContent;
    const score = element("score-value").textContent;
    advance(5000);
    expect(element("time-value").textContent).toBe(time);
    expect(element("score-value").textContent).toBe(score);
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
    framing.checked = true;
    framing.dispatchEvent(new Event("change", { bubbles: true }));
    app.tick();
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(false);
    element<HTMLButtonElement>("resume-round").click();
    app.tick();
    expect(element("overlay-title").textContent).toMatch(/2|ready|countdown/i);
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

  it("blocks start for stale joined camera input without spending round time", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    choose("player-track", "camera-track-1");
    element<HTMLButtonElement>("join-player").click();
    advance(400);
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
    expect(element("game-status").textContent).toMatch(/stale/i);
    expect(element("time-value").textContent).toBe("1:00");
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

  it("renders camera preview before admission and releases only its acknowledged epoch", async () => {
    const socket = await startCamera();
    const startRequest = fetchMock.mock.calls.find(
      ([path]) => path === "/api/start",
    );
    expect(JSON.parse(startRequest?.[1].body as string).algorithm).toBe(
      "rtmpose",
    );
    const cameraFrame = observation();
    await socket.receive(packet(cameraFrame));
    expect(renderer.drawMoleScene.mock.calls.at(-1)?.[1]).toEqual(cameraFrame);
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "next" }));
    const bitmap = await createBitmap.mock.results[0].value;
    element<HTMLButtonElement>("source-stop").click();
    await flushPromises();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledTimes(1);
    const stops = fetchMock.mock.calls.filter(([path]) => path === "/api/stop");
    expect(stops).toHaveLength(1);
    expect(JSON.parse(stops[0][1].body as string)).toEqual({
      epoch: "camera-test",
    });
    expect(renderer.drawMoleScene.mock.calls.at(-1)?.[1]).toBeNull();
  });

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
    expect(element("stage-player").textContent).toBe("NOT JOINED");
    expect(renderer.drawMoleScene.mock.calls.at(-1)?.[1]).toBeNull();
  });

  it("shows an actionable backend failure and permits another connection attempt", async () => {
    choose("source-select", "camera");
    fetchMock.mockRejectedValueOnce(new Error("Service offline"));
    element<HTMLButtonElement>("source-connect").click();
    await flushPromises();
    expect(element("game-status").textContent).toMatch(/offline.*pnpm dev/i);
    expect(element<HTMLButtonElement>("source-connect").disabled).toBe(false);
    expect(element<HTMLButtonElement>("source-stop").disabled).toBe(true);
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
  });

  it.each(["epoch", "sequence"])(
    "rejects a camera %s discontinuity without reviving its preview",
    async (field) => {
      const socket = await startCamera();
      await socket.receive(packet(observation()));
      const invalid = observation(2);
      if (field === "epoch") invalid.epoch = "unexpected-restart";
      else invalid.sequence = 1;
      now += 50;
      await socket.receive(packet(invalid));
      expect(createBitmap).toHaveBeenCalledTimes(1);
      expect(element("game-status").textContent).toMatch(
        /stream changed|old frame/i,
      );
      expect(element<HTMLButtonElement>("source-connect").disabled).toBe(false);
      expect(renderer.drawMoleScene.mock.calls.at(-1)?.[1]).toBeNull();
    },
  );

  it("releases a late camera-start acknowledgement after an operator stop", async () => {
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

  it("pauses camera scoring on ambiguous identity and requires explicit rejoin", async () => {
    const socket = await startCamera();
    await socket.receive(packet(observation()));
    choose("player-track", "camera-track-1");
    element<HTMLButtonElement>("join-player").click();
    element<HTMLButtonElement>("start-round").click();
    for (let sequence = 2; sequence <= 65; sequence++) {
      now += 50;
      await socket.receive(packet(observation(sequence)));
    }
    expect(element("mole-target").hidden).toBe(false);
    const uncertain = observation(66);
    uncertain.people[0].identity = "ambiguous";
    now += 50;
    await socket.receive(packet(uncertain));
    const time = element("time-value").textContent;
    const score = element("score-value").textContent;
    expect(element("game-overlay").hidden).toBe(false);
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
    expect(element("player-status").textContent).toMatch(/missing|uncertain/i);
    now += 50;
    await socket.receive(packet(observation(67)));
    expect(element("time-value").textContent).toBe(time);
    expect(element("score-value").textContent).toBe(score);
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
    choose("player-track", "camera-track-1");
    element<HTMLButtonElement>("join-player").click();
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(false);
  });

  it.each(["track", "calibration"])(
    "offers a new round after a changed camera %s instead of a resume loop",
    async (change) => {
      const socket = await startCamera();
      await socket.receive(packet(observation()));
      choose("player-track", "camera-track-1");
      element<HTMLButtonElement>("join-player").click();
      element<HTMLButtonElement>("start-round").click();
      for (let sequence = 2; sequence <= 65; sequence++) {
        now += 50;
        await socket.receive(packet(observation(sequence)));
      }

      // Establish a real camera-input score before changing its score owner/space.
      const outside = observation(66);
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
      const hit = observation(67);
      hit.people[0].joints.left_wrist = {
        x: 1 - target.x / 960,
        y: target.y / 600,
        score: 0.95,
        status: "observed",
        inFrame: true,
      };
      now += 50;
      await socket.receive(packet(hit));
      expect(Number(element("score-value").textContent)).toBe(100);

      const changedObservation = (sequence: number): Observation => {
        const changed = observation(sequence);
        if (change === "track") changed.people[0].trackId = "camera-track-2";
        else changed.calibrationId = "calibration-v2";
        return changed;
      };
      now += 50;
      await socket.receive(packet(changedObservation(68)));
      expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
      choose(
        "player-track",
        change === "track" ? "camera-track-2" : "camera-track-1",
      );
      element<HTMLButtonElement>("join-player").click();
      element<HTMLButtonElement>("resume-round").click();
      expect(element("resume-round").hidden).toBe(true);
      expect(element("restart-round").hidden).toBe(false);
      expect(element("restart-round").textContent).toMatch(/set up new round/i);
      expect(element("overlay-copy").textContent).toMatch(/score ownership/i);
      expect(Number(element("score-value").textContent)).toBe(100);

      element<HTMLButtonElement>("restart-round").click();
      expect(Number(element("score-value").textContent)).toBe(0);
      expect(element<HTMLButtonElement>("start-round").disabled).toBe(false);
      element<HTMLButtonElement>("start-round").click();
      for (let sequence = 69; sequence <= 130; sequence++) {
        now += 50;
        await socket.receive(packet(changedObservation(sequence)));
      }
      expect(element("mole-target").hidden).toBe(false);
      expect(element("game-overlay").hidden).toBe(true);
      expect(Number(element("score-value").textContent)).toBe(0);
    },
  );
});
