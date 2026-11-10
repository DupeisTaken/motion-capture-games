// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Observation } from "../../contracts/generated/observation";
import type { PreviewFrame } from "../../contracts/generated/preview";
import fixture from "../../contracts/examples/synthetic-observation.json";
const renderer = vi.hoisted(() => ({
  drawFrame: vi.fn(),
  drawStandby: vi.fn(),
}));
vi.mock("../../apps/mirror/src/renderer", () => renderer);
const bitmap = (
  width = fixture.image.width,
  height = fixture.image.height,
) => ({ width, height, close: vi.fn() });
const createBitmap = vi.fn(async () => bitmap());
let acknowledgedEpoch: string;
let startFailure: string | null;
const fetchMock = vi.fn(
  async (path: string, _options?: RequestInit): Promise<Response> => {
    void _options;
    const ok = !(path === "/api/start" && startFailure);
    const body =
      path === "/api/start"
        ? ok
          ? { state: "running", epoch: acknowledgedEpoch }
          : { detail: startFailure }
        : { state: "idle" };
    return { ok, json: async () => body } as Response;
  },
);
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
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
  });
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  async receive(data: ArrayBuffer | string) {
    await this.onmessage?.({ data });
  }
}
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}
async function flush() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}
function pose(
  count = 3,
  sequence = 1,
  changes: Partial<Observation> = {},
): Observation {
  return {
    ...structuredClone(fixture),
    epoch: acknowledgedEpoch,
    source: "camera",
    algorithm: "rtmpose",
    clock: {
      domain: "host-monotonic",
      quality: "host-read-completion",
      uncertaintyNs: null,
    },
    sequence,
    people: Array.from({ length: count }, (_, i) => ({
      ...structuredClone(fixture.people[0]),
      trackId: `t${i}`,
      identity: "confident",
    })),
    detectedCount: count,
    ...changes,
  } as Observation;
}
function preview(
  value: Observation,
  changes: Partial<PreviewFrame> = {},
): ArrayBuffer {
  const meta: PreviewFrame = {
    version: 1,
    epoch: value.epoch,
    sequence: value.sequence,
    source: value.source,
    image: value.image,
    capturedAtNs: value.capturedAtNs,
    clockDomain: "host-monotonic",
    clockQuality: value.clock.quality,
    captureFps: 30,
    ...changes,
  };
  const header = new TextEncoder().encode(JSON.stringify(meta));
  const bytes = new Uint8Array(4 + header.length + 4);
  new DataView(bytes.buffer).setUint32(0, header.length, false);
  bytes.set(header, 4);
  bytes.set([255, 216, 255, 217], 4 + header.length);
  return bytes.buffer;
}
async function start(source: "camera" | "demo" = "camera") {
  if (source === "demo") el<HTMLButtonElement>("source-demo").click();
  el<HTMLButtonElement>("start").click();
  await flush();
  const streams = FakeWebSocket.instances.slice(-2);
  streams.forEach((ws) => ws.onopen?.());
  return { image: streams[0], poses: streams[1] };
}
async function frame(
  streams: Awaited<ReturnType<typeof start>>,
  value = pose(),
) {
  await streams.poses.receive(JSON.stringify(value));
  await streams.image.receive(preview(value));
  vi.advanceTimersByTime(250);
  await flush();
}
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers({
    toFake: [
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
      "performance",
    ],
  });
  acknowledgedEpoch = "test-epoch";
  startFailure = null;
  FakeWebSocket.instances = [];
  document.body.innerHTML = '<div id="app"></div>';
  createBitmap.mockImplementation(async () => bitmap());
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("createImageBitmap", createBitmap);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    window.setTimeout(() => cb(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) =>
    window.clearTimeout(id),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  await import("../../apps/mirror/src/main");
  await flush();
  vi.advanceTimersByTime(1);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
describe("independent diagnostic viewer", () => {
  it("defaults to RTMPose and separates display draws from image and pose arrivals", async () => {
    const streams = await start();
    const request = JSON.parse(
      fetchMock.mock.calls.find(([p]) => p === "/api/start")?.[1]
        ?.body as string,
    );
    expect(request.algorithm).toBe("rtmpose");
    expect(request).not.toHaveProperty("detectedCount");
    await streams.image.receive(preview(pose()));
    vi.advanceTimersByTime(160);
    expect(renderer.drawFrame).toHaveBeenCalledTimes(10);
    expect(renderer.drawFrame.mock.calls.at(-1)?.[2].people).toHaveLength(0);
    await streams.poses.receive(JSON.stringify(pose()));
    vi.advanceTimersByTime(250);
    expect(el("person-count").textContent).toBe("3");
    expect(renderer.drawFrame.mock.calls.at(-1)?.[2].people).toHaveLength(3);
    expect(el("update-rate").textContent).toBe("62.5");
    expect(el("camera-rate").textContent).toBe("30.0");
    expect(el("pose-rate").textContent).toBe("—"); // one result does not establish a rate
  });
  it("updates current counts including zero and shows capacity without creating players", async () => {
    const s = await start();
    await frame(s, pose(3, 1, { capacity: 3, capacityReached: true }));
    expect(el("capacity-warning").hidden).toBe(false);
    expect(el("count-label").textContent).toBe("at capacity");
    await frame(s, pose(0, 2));
    expect(el("person-count").textContent).toBe("0");
    expect(document.querySelectorAll(".person-row")).toHaveLength(0);
  });
  it("keeps fresh camera images drawing when pose input stalls and removes stale overlays", async () => {
    const s = await start();
    await frame(s);
    for (let sequence = 2; sequence <= 5; sequence++) {
      await s.image.receive(
        preview(pose(3, sequence), {
          capturedAtNs: String(BigInt(fixture.capturedAtNs) + 200_000_000n),
        }),
      );
      vi.advanceTimersByTime(200);
    }
    expect(el("source-badge").textContent).toBe("Live");
    expect(renderer.drawFrame.mock.calls.length).toBeGreaterThan(50);
    expect(renderer.drawFrame.mock.calls.at(-1)?.[2].people).toHaveLength(0);
    expect(el("person-count").textContent).toBe("0");
    el("mirror").dispatchEvent(new Event("input"));
    expect(el("person-count").textContent).toBe("0");
    expect(s.image.close).not.toHaveBeenCalled();
  });
  it("closes both streams, bitmap and animation work on Stop", async () => {
    const image = bitmap();
    createBitmap.mockResolvedValueOnce(image);
    const s = await start();
    await frame(s);
    el<HTMLButtonElement>("stop").click();
    await flush();
    expect(s.image.close).toHaveBeenCalledOnce();
    expect(s.poses.close).toHaveBeenCalledOnce();
    expect(image.close).toHaveBeenCalledOnce();
    expect(el("person-count").textContent).toBe("0");
    const draws = renderer.drawFrame.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(renderer.drawFrame.mock.calls.length).toBe(draws);
    expect(el<HTMLButtonElement>("start").disabled).toBe(false);
    expect(
      JSON.parse(
        fetchMock.mock.calls.find(([p]) => p === "/api/stop")?.[1]
          ?.body as string,
      ).epoch,
    ).toBe(acknowledgedEpoch);
  });
  it("clears images, counts and telemetry when preview input expires", async () => {
    const image = bitmap();
    createBitmap.mockResolvedValueOnce(image);
    const s = await start();
    await frame(s);
    vi.advanceTimersByTime(1800);
    expect(image.close).toHaveBeenCalledOnce();
    expect(el("source-badge").textContent).toBe("Stale");
    expect(el("person-count").textContent).toBe("0");
    expect(el("update-rate").textContent).toBe("—");
  });
  it.each(["image", "poses"] as const)(
    "rejects an unexpected epoch on %s",
    async (kind) => {
      const s = await start();
      await frame(s);
      const wrong = pose(3, 2, { epoch: "unexpected" });
      await s[kind].receive(
        kind === "image" ? preview(wrong) : JSON.stringify(wrong),
      );
      expect(el("status-title").textContent).toBe("Preview could not continue");
      expect(el("status-message").textContent).toContain("source restarted");
      expect(s.image.close).toHaveBeenCalled();
      expect(s.poses.close).toHaveBeenCalled();
    },
  );
  it("restores controls after an actionable startup failure", async () => {
    startFailure = "Camera permission denied.";
    el<HTMLButtonElement>("start").click();
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(el("status-message").textContent).toBe(startFailure);
    expect(el<HTMLButtonElement>("start").disabled).toBe(false);
  });
  it("labels synthetic input and disables model selection for generated scenes", async () => {
    const s = await start("demo");
    await frame(
      s,
      pose(3, 1, {
        source: "demo",
        algorithm: "synthetic",
        clock: {
          domain: "host-monotonic",
          quality: "synthetic",
          uncertaintyNs: null,
        },
      }),
    );
    expect(el<HTMLSelectElement>("algorithm").disabled).toBe(true);
    expect(el("source-badge").textContent).toBe("Synthetic");
    expect(el("timing-note").textContent).toContain(
      "not inference or camera performance results",
    );
  });
  it("ignores an obsolete pending decode error after a replacement source starts", async () => {
    let rejectOld: (reason: Error) => void = () => {};
    createBitmap.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectOld = reject;
      }),
    );
    const old = await start();
    const pending = old.image.receive(preview(pose()));
    await flush();
    el<HTMLButtonElement>("stop").click();
    await flush();
    acknowledgedEpoch = "new-epoch";
    const current = await start();
    await frame(current);
    rejectOld(new Error("Obsolete decode"));
    await pending;
    await flush();
    expect(el("person-count").textContent).toBe("3");
    expect(current.image.close).not.toHaveBeenCalled();
  });
  it("rejects mismatched image geometry before drawing", async () => {
    const wrong = bitmap(100, 100);
    createBitmap.mockResolvedValueOnce(wrong);
    const s = await start();
    await s.image.receive(preview(pose()));
    expect(wrong.close).toHaveBeenCalledOnce();
    expect(renderer.drawFrame).not.toHaveBeenCalled();
    expect(el("status-message").textContent).toContain(
      "dimensions do not match",
    );
  });
});
