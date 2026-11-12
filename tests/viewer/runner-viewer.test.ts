// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountRunnerGame } from "../../apps/mirror/src/runner-viewer";
import {
  syntheticBody,
  type Observation,
} from "../../packages/motion/src/index";
import fixture from "../../contracts/examples/synthetic-observation.json";

const renderer = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn() }));
const createRenderer = vi.hoisted(() => vi.fn());
vi.mock("../../apps/mirror/src/runner-renderer", () => ({
  createRunnerRenderer: createRenderer,
}));
const fetchMock = vi.fn();
let now: number;
let app: ReturnType<typeof mountRunnerGame>;
class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 1;
  binaryType = "blob";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer | string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly send = vi.fn();
  readonly close = vi.fn(() => {
    this.readyState = 3;
  });
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
}
function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
function click(id: string) {
  element<HTMLButtonElement>(id).click();
}
function choose(id: string, value: string) {
  element<HTMLSelectElement>(id).value = value;
  element(id).dispatchEvent(new Event("change", { bubbles: true }));
}
function toggle(id: string, checked: boolean) {
  element<HTMLInputElement>(id).checked = checked;
  element(id).dispatchEvent(new Event("change", { bubbles: true }));
}
function advance(milliseconds: number) {
  const end = now + milliseconds;
  while (now < end) {
    now = Math.min(end, now + 50);
    app.tick();
  }
}
async function flush() {
  for (let index = 0; index < 20; index++) await Promise.resolve();
}
function state() {
  return renderer.render.mock.calls.at(-1)![0];
}
function observation(sequence: number, people = 1): Observation {
  const value = structuredClone(fixture) as Observation;
  const joints = Object.fromEntries(
    syntheticBody().map(({ name, x, y }) => [
      name,
      { x, y, score: 0.95, status: "observed", inFrame: true },
    ]),
  );
  return {
    ...value,
    source: "camera",
    algorithm: "mediapipe",
    detectedCount: people,
    clock: {
      domain: "host-monotonic",
      quality: "host-read-completion",
      uncertaintyNs: null,
    },
    epoch: "runner-camera",
    sequence,
    frameId: `runner-${sequence}`,
    capturedAtNs: String(BigInt(sequence) * 50_000_000n),
    processedAtNs: String(BigInt(sequence) * 50_000_000n + 10_000_000n),
    people: Array.from({ length: people }, (_, index) => ({
      ...value.people[0],
      trackId: `runner-track-${index}`,
      identity: "confident",
      joints: structuredClone(joints),
    })),
  };
}
function packet(value: Observation) {
  const metadata = new TextEncoder().encode(JSON.stringify(value));
  const data = new Uint8Array(4 + metadata.length + 4);
  new DataView(data.buffer).setUint32(0, metadata.length, false);
  data.set(metadata, 4);
  data.set([255, 216, 255, 217], 4 + metadata.length);
  return data.buffer;
}
async function startCamera() {
  choose("source-select", "camera");
  await flush();
  choose("camera-choice", "manual");
  click("source-connect");
  await flush();
  const socket = FakeWebSocket.instances.at(-1)!;
  socket.onopen?.();
  return socket;
}
beforeEach(() => {
  now = 100;
  vi.clearAllMocks();
  createRenderer.mockImplementation(() => renderer);
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () =>
      url === "/api/cameras"
        ? { cameras: [] }
        : url === "/api/start"
          ? { epoch: "runner-camera", state: "running" }
          : { state: "idle" },
  }));
  document.body.innerHTML = '<div id="app"></div>';
  app = mountRunnerGame(element("app"), {
    now: () => now,
    autoTick: false,
    seed: 42,
  });
});
afterEach(async () => {
  app.dispose();
  await flush();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("runner application", () => {
  it("starts camera-free with an original rendered world and no video surface", () => {
    expect(element<HTMLSelectElement>("source-select").value).toBe("demo");
    expect(document.querySelector("video")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/start")).toBe(
      false,
    );
    expect(state().options.variant).toBe("rail");
    expect(element("demo-controls").hidden).toBe(false);
  });
  it("plays, chooses absolute lanes, jumps once and holds roll until release", () => {
    click("start-round");
    advance(3100);
    expect(state().phase).toBe("playing");
    now += 16;
    click("lane-left");
    advance(200);
    expect(state().avatarX).toBe(-1);
    now += 16;
    click("lane-right");
    advance(350);
    expect(state().avatarX).toBe(1);
    now += 16;
    click("lane-center");
    advance(200);
    expect(state().avatarX).toBe(0);
    now += 16;
    click("jump-action");
    advance(250);
    expect(state().jumpHeight).toBeGreaterThan(1);
    advance(1000);
    expect(state().jumpHeight).toBe(0);
    now += 16;
    element("duck-action").dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }),
    );
    advance(50);
    expect(state().duck).toBe(true);
    now += 16;
    element("duck-action").dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }),
    );
    advance(50);
    expect(state().duck).toBe(false);
  });
  it("defaults to Standard, snapshots Fast start for the run, and retains it for a new run", () => {
    expect(element<HTMLInputElement>("fast-start").checked).toBe(false);
    expect(state().speed).toBe(10);
    toggle("fast-start", true);
    expect(state().options.fastStart).toBe(true);
    expect(state().speed).toBe(14);
    expect(element("pace-description").textContent).toContain("14 m/s");
    click("start-round");
    expect(element<HTMLInputElement>("fast-start").disabled).toBe(true);
    advance(3400);
    expect(state().speed).toBeGreaterThan(14);
    expect(element("speed-label").textContent).toContain("FAST");
    // A late synthetic change event must not reset an active run or its score.
    toggle("fast-start", false);
    expect(state().phase).toBe("playing");
    expect(state().options.fastStart).toBe(true);
    expect(element<HTMLInputElement>("fast-start").checked).toBe(true);
    click("pause-round");
    expect(element<HTMLInputElement>("fast-start").disabled).toBe(true);
    click("new-round");
    expect(element<HTMLInputElement>("fast-start").disabled).toBe(false);
    expect(element<HTMLInputElement>("fast-start").checked).toBe(true);
    expect(state().speed).toBe(14);
    expect(element("game-status").textContent).toBe(
      "Choose your input, then start your run.",
    );
    toggle("fast-start", false);
    expect(state().speed).toBe(10);
  });
  it("continues rehearsal when a spectator enters and pauses on lost tracking with the spectator still present", () => {
    click("start-round");
    advance(3300);
    const distance = state().distance;
    now += 16;
    toggle("demo-extra", true);
    advance(1500);
    expect(state().phase).toBe("playing");
    expect(state().distance).toBeGreaterThan(distance);
    expect(element("player-badge").textContent).toBe("1 PLAYER · READY");
    now += 16;
    toggle("demo-missing", true);
    const frozen = state();
    advance(1500);
    expect(state().phase).toBe("paused");
    expect(state().distance).toBe(frozen.distance);
    expect(state().score).toBe(frozen.score);
  });
  it("does not automatically resume a manual pause and starts a fresh score on New run", () => {
    click("start-round");
    advance(3400);
    expect(element("stage-pause").hidden).toBe(false);
    click("stage-pause");
    const score = state().score;
    advance(1000);
    expect(state().phase).toBe("paused");
    expect(state().score).toBe(score);
    click("resume-round");
    advance(2100);
    expect(state().phase).toBe("playing");
    click("pause-round");
    click("new-round");
    expect(state().phase).toBe("ready");
    expect(state().score).toBe(0);
  });
  it("takes one in-stage Resume press while rolling and waits for standing", () => {
    click("start-round");
    advance(3400);
    click("pause-round");
    const resume = element<HTMLButtonElement>("resume-round");
    expect(element("game-overlay").contains(resume)).toBe(true);
    expect(document.activeElement).toBe(resume);
    const frozen = state();
    now += 16;
    element("duck-action").dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 1 }),
    );
    click("resume-round");
    advance(500);
    expect(state().phase).toBe("paused");
    expect(state().score).toBe(frozen.score);
    expect(state().distance).toBe(frozen.distance);
    expect(resume.hidden).toBe(true);
    element("duck-action").dispatchEvent(
      new PointerEvent("pointerup", { pointerId: 1 }),
    );
    advance(50);
    expect(state().phase).toBe("countdown");
    expect(document.activeElement).toBe(element("game-stage"));
    advance(2100);
    expect(state().phase).toBe("playing");
  });
  it("exposes both worlds and three skins without changing the gameplay contract", () => {
    choose("world-select", "gold");
    choose("skin-select", "ember");
    expect(element("world-title").textContent).toBe("Gold Rush");
    expect(renderer.render.mock.calls.at(-1)!.slice(1)).toEqual([
      "gold",
      "ember",
    ]);
    expect(element<HTMLSelectElement>("skin-select").options.length).toBe(3);
    click("start-round");
    advance(3100);
    expect(element<HTMLSelectElement>("world-select").disabled).toBe(true);
    expect(element<HTMLSelectElement>("source-select").disabled).toBe(true);
  });
  it("requires a new run after explicit identity loss instead of transferring the score", () => {
    click("start-round");
    advance(3300);
    now += 16;
    toggle("demo-missing", true);
    expect(state().phase).toBe("paused");
    expect(state().requiresNewRound).toBe(true);
    const score = state().score;
    now += 16;
    toggle("demo-missing", false);
    advance(2500);
    expect(state().phase).toBe("paused");
    expect(state().score).toBe(score);
    expect(element("resume-round").hidden).toBe(true);
  });
  it("camera startup stays explicit, requests multi-person detection, and shares the stream with an optional operator preview", async () => {
    const bitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", bitmap);
    const socket = await startCamera();
    now = 150;
    socket.onmessage?.({ data: packet(observation(1)) });
    expect(element("body-preview").hidden).toBe(false);
    expect(element("camera-preview")).toBeTruthy();
    expect(element("camera-status").textContent).toBe(
      "Player found. Stand comfortably, then choose Set standing reference.",
    );
    expect(element<HTMLButtonElement>("calibrate-player").disabled).toBe(false);
    const call = fetchMock.mock.calls.find(([url]) => url === "/api/start")!;
    expect(JSON.parse(call[1].body)).toMatchObject({
      source: "camera",
      maxPeople: 3,
    });
    click("start-round");
    expect(state().phase).toBe("ready");
    click("calibrate-player");
    expect(element("practice-status").textContent).toContain("1 / 6");
    expect(element("game-status").textContent).toContain("standing reference");
  });
  it("starts after explicit standing without a movement checklist and clears stale preview/actions", async () => {
    const socket = await startCamera();
    let sequence = 0;
    const send = () => {
      now += 50;
      socket.onmessage?.({ data: packet(observation(++sequence)) });
    };
    send();
    click("calibrate-player");
    send();
    send();
    send();
    expect(element("practice-status").textContent).toContain("optional");
    click("start-round");
    expect(state().phase).toBe("countdown");
    socket.onmessage?.({ data: JSON.stringify({ state: "stale" }) });
    expect(state().phase).toBe("paused");
    expect(element("preview-freshness").textContent).toContain("STALE");
    expect(element("head-guides").hasAttribute("hidden")).toBe(true);
    send();
    send();
    send();
    expect(state().phase).toBe("countdown");
    toggle("show-preview", false);
    expect(element("camera-preview").hidden).toBe(true);
    click("source-stop");
    await flush();
    expect(element("preview-freshness").textContent).toBe("Camera off");
    choose("source-select", "demo");
    expect(element("body-preview").hidden).toBe(true);
  });
  it("starts on one press despite a noisy hip and shows the calibrated lane guides", async () => {
    const socket = await startCamera();
    let sequence = 0;
    const send = (x = 0, hipNoise = 0) => {
      now += 50;
      const value = observation(++sequence);
      for (const joint of Object.values(value.people[0].joints))
        if (joint?.x != null) joint.x += x;
      value.people[0].joints.left_hip!.y! += hipNoise;
      socket.onmessage?.({ data: packet(value) });
    };
    send(0.05);
    expect(element("lane-guides").hasAttribute("hidden")).toBe(true);
    click("calibrate-player");
    expect(element("lane-guides").hasAttribute("hidden")).toBe(false);
    expect(Number(element("lane-guide-left").getAttribute("x"))).toBeCloseTo(
      27,
    );
    expect(Number(element("lane-guide-center").getAttribute("x"))).toBeCloseTo(
      45,
    );
    expect(Number(element("lane-guide-right").getAttribute("x"))).toBeCloseTo(
      63,
    );
    click("overlay-start");
    expect(state().phase).toBe("ready");
    expect(element("overlay-copy").textContent).toMatch(/stand comfortably/i);
    expect(element("overlay-start").textContent).toBe("Cancel start");
    send(0.05, 0.022);
    send(0.05, -0.022);
    expect(state().phase).toBe("ready");
    expect(element("player-badge").textContent).toBe("STAND TO START");
    send(0.05, 0.022);
    expect(state().phase).toBe("countdown");
    for (let index = 0; index < 65; index++) send(0.05, 0.022);
    expect(state().phase).toBe("playing");
    for (let index = 0; index < 6; index++) send(0.17);
    expect(state().avatarX).toBe(-1);
    for (let index = 0; index < 6; index++) send(0.05);
    expect(state().avatarX).toBe(0);
    for (let index = 0; index < 6; index++) send(-0.07);
    expect(state().avatarX).toBe(1);
  });
  it("shows the missing camera step in the stage and lets either Start control cancel", async () => {
    choose("source-select", "camera");
    await flush();
    click("overlay-start");
    expect(element("overlay-copy").textContent).toMatch(/start the camera/i);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/start")).toBe(
      false,
    );
    click("start-round");
    const socket = await startCamera();
    now += 50;
    socket.onmessage?.({ data: packet(observation(1)) });
    click("calibrate-player");
    for (let sequence = 2; sequence <= 6; sequence++) {
      now += 50;
      socket.onmessage?.({ data: packet(observation(sequence)) });
    }
    expect(state().phase).toBe("ready");
    expect(element("overlay-start").textContent).toMatch(
      /start body-controlled/i,
    );
  });
  it("recovers only the same track after brief loss, freezes scoring, and expires without packets", async () => {
    const socket = await startCamera();
    let sequence = 0;
    function send(
      mode: "fresh" | "missing" | "tentative" | "ambiguous" = "fresh",
    ) {
      now += 50;
      const value = observation(++sequence, 2);
      if (mode === "missing") value.people.shift();
      value.detectedCount = value.people.length;
      if (mode === "tentative" || mode === "ambiguous")
        value.people[0].identity = mode;
      socket.onmessage?.({ data: packet(value) });
    }
    // Bind while alone, then let a spectator enter before calibration.
    now += 50;
    socket.onmessage?.({ data: packet(observation(++sequence)) });
    send();
    click("calibrate-player");
    send();
    send();
    send();
    click("start-round");
    for (let i = 0; i < 65; i++) send();
    expect(state().phase).toBe("playing");
    const frozen = state();
    send("missing");
    expect(state().phase).toBe("paused");
    expect(state().score).toBe(frozen.score);
    expect(state().distance).toBe(frozen.distance);
    send("tentative");
    expect(state().phase).toBe("paused");
    send();
    expect(state().phase).toBe("paused");
    send();
    send();
    expect(state().phase).toBe("countdown");
    for (let i = 0; i < 45; i++) send();
    expect(state().phase).toBe("playing");
    advance(451);
    expect(state().phase).toBe("paused");
    expect(element("resume-round").hidden).toBe(true);
    const score = state().score;
    send();
    send();
    send();
    expect(state().score).toBe(score);
    expect(state().phase).toBe("paused");
    click("new-round");
    send();
    click("calibrate-player");
    send();
    send();
    send();
    click("start-round");
    send("ambiguous");
    expect(element("resume-round").hidden).toBe(true);
  });
  it("rejects stale calibration clicks even if the old button was enabled", async () => {
    const socket = await startCamera();
    now += 50;
    socket.onmessage?.({ data: packet(observation(1)) });
    now += 351;
    click("calibrate-player");
    app.tick();
    expect(element("practice-status").textContent).toContain("reference first");
    expect(element<HTMLButtonElement>("calibrate-player").disabled).toBe(true);
  });
  it("releases only its acknowledged epoch and blocks replacements while release is unconfirmed", async () => {
    await startCamera();
    fetchMock.mockImplementation(async (url: string) => ({
      ok: url !== "/api/stop",
      json: async () =>
        url === "/api/stop" ? { detail: "Device busy" } : { cameras: [] },
    }));
    click("source-stop");
    await flush();
    const stops = fetchMock.mock.calls.filter(([url]) => url === "/api/stop");
    expect(stops).toHaveLength(1);
    expect(JSON.parse(stops[0][1].body)).toEqual({ epoch: "runner-camera" });
    expect(element<HTMLButtonElement>("source-connect").disabled).toBe(true);
    expect(element("camera-release").hidden).toBe(false);
    expect(element("camera-release-message").textContent).toContain(
      "Device busy",
    );
  });
  it("cancels a pending startup by releasing the late acknowledgement", async () => {
    let acknowledge: ((value: unknown) => void) | null = null;
    fetchMock.mockImplementation((url: string) =>
      url === "/api/start"
        ? new Promise((resolve) => {
            acknowledge = resolve;
          })
        : Promise.resolve({ ok: true, json: async () => ({ cameras: [] }) }),
    );
    choose("source-select", "camera");
    await flush();
    choose("camera-choice", "manual");
    click("source-connect");
    await flush();
    click("source-stop");
    await flush();
    expect(acknowledge).not.toBeNull();
    expect(element<HTMLButtonElement>("source-connect").disabled).toBe(true);
    click("source-connect");
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/start"),
    ).toHaveLength(1);
    (acknowledge as unknown as (value: unknown) => void)({
      ok: true,
      json: async () => ({ epoch: "late-runner", state: "running" }),
    });
    await flush();
    const stops = fetchMock.mock.calls.filter(([url]) => url === "/api/stop");
    expect(stops).toHaveLength(1);
    expect(JSON.parse(stops[0][1].body)).toEqual({ epoch: "late-runner" });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
  it("pauses immediately on lost WebGL, freezes outcomes and waits for explicit Resume after restoration", () => {
    click("start-round");
    advance(3300);
    const frozen = state();
    const lost = new Event("webglcontextlost", { cancelable: true });
    element("game-canvas").dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    expect(element("overlay-kicker").textContent).toBe("RENDERING UNAVAILABLE");
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
    advance(1500);
    element("game-canvas").dispatchEvent(new Event("webglcontextrestored"));
    expect(state().phase).toBe("paused");
    expect(state().distance).toBe(frozen.distance);
    expect(state().score).toBe(frozen.score);
    expect(state().obstacles).toEqual(frozen.obstacles);
    advance(500);
    expect(state().phase).toBe("paused");
    click("resume-round");
    expect(state().phase).toBe("countdown");
    advance(2100);
    expect(state().phase).toBe("playing");
  });
  it("renders actionable failure instructions when WebGL cannot initialize", () => {
    app.dispose();
    createRenderer.mockImplementationOnce(() => {
      throw new Error("WebGL unavailable");
    });
    app = mountRunnerGame(element("app"), { now: () => now, autoTick: false });
    expect(element("overlay-kicker").textContent).toBe("RENDERING UNAVAILABLE");
    expect(element("overlay-copy").textContent).toContain("reload this page");
    expect(element<HTMLButtonElement>("start-round").disabled).toBe(true);
    expect(element<HTMLButtonElement>("overlay-start").disabled).toBe(true);
  });
  it("keeps camera start explicit, offers optional practice, keeps the owner in control with a spectator and refuses a replacement owner", async () => {
    const socket = await startCamera();
    let sequence = 0;
    function send(x = 0, y = 0, duck = false, people = 1, replacement = false) {
      now += 50;
      const value = observation(++sequence, people);
      for (const joint of Object.values(value.people[0].joints))
        if (joint && joint.x !== null && joint.y !== null) {
          joint.x += x;
          joint.y += y;
        }
      if (duck) {
        for (const name of [
          "nose",
          "left_shoulder",
          "right_shoulder",
          "left_hip",
          "right_hip",
        ] as const)
          value.people[0].joints[name]!.y! += 0.11;
        value.people[0].joints.left_knee!.x! -= 0.1;
        value.people[0].joints.right_knee!.x! += 0.1;
      }
      if (people > 1) value.people.reverse();
      if (replacement) value.people[0].trackId = "replacement-player";
      socket.onmessage?.({ data: packet(value) });
    }
    send();
    click("calibrate-player");
    send(0.22);
    send();
    send(-0.22);
    send();
    send(0, 0, true);
    send();
    send();
    send();
    send(0, -0.08);
    send(0, -0.08);
    send(0, -0.08);
    // A takeoff event has ended, but both feet are still airborne. This must
    // neither satisfy the Stand practice check nor admit the start countdown.
    expect(element("practice-status").textContent).toContain("5 / 6");
    expect(element("practice-5").classList.contains("complete")).toBe(false);
    click("start-round");
    expect(state().phase).toBe("ready");
    send();
    send();
    send();
    send();
    send();
    expect(element("practice-status").textContent).toContain(
      "All movements rehearsed",
    );
    click("start-round");
    expect(state().phase).toBe("countdown");
    send(0, -0.08);
    send(0, -0.08);
    send(0, -0.08);
    expect(state().phase).toBe("paused");
    expect(element<HTMLButtonElement>("resume-round").disabled).toBe(true);
    send();
    send();
    send();
    send();
    send();
    expect(state().phase).toBe("countdown");
    for (let index = 0; index < 65; index++) send();
    expect(state().phase).toBe("playing");
    const before = state();
    for (let index = 0; index < 20; index++) send(0.22, 0, false, 2);
    expect(state().phase).toBe("playing");
    expect(state().score).toBeGreaterThan(before.score);
    expect(state().distance).toBeGreaterThan(before.distance);
    expect(state().avatarX).toBe(-1);
    send();
    expect(state().phase).toBe("playing");
    send(0, 0, false, 1, true);
    expect(state().phase).toBe("paused");
    advance(500);
    expect(element("resume-round").hidden).toBe(true);
    expect(element("overlay-copy").textContent).toContain("score ownership");
    const ownedScore = state().score;
    for (let index = 0; index < 60; index++) send(0, 0, false, 1, true);
    expect(state().score).toBe(ownedScore);
    expect(state().phase).toBe("paused");
  });
});
