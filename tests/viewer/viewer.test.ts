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
const defaultFetch = async (
  path: string,
  _options?: RequestInit,
): Promise<Response> => {
  void _options;
  const ok = !(path === "/api/start" && startFailure);
  const body =
    path === "/api/cameras"
      ? { cameras: [{ id: "a".repeat(64), name: "Built-in camera" }] }
      : path === "/api/start"
        ? ok
          ? { state: "running", epoch: acknowledgedEpoch }
          : { detail: startFailure }
        : { state: "idle" };
  return { ok, status: ok ? 200 : 409, json: async () => body } as Response;
};
const fetchMock = vi.fn(defaultFetch);
const response = (body: unknown, ok = true, status = ok ? 200 : 409) =>
  ({ ok, status, json: async () => body }) as Response;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const requests = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => url === path);
const stopEpochs = () =>
  requests("/api/stop").map(([, init]) => JSON.parse(String(init?.body)));
let cleanupListeners = () => {};
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
  renderer.drawFrame.mockReset();
  renderer.drawStandby.mockReset();
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
  fetchMock.mockImplementation(defaultFetch);
  FakeWebSocket.instances = [];
  document.body.innerHTML = '<div id="app"></div>';
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
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
  // Module reloads share happy-dom's window; dispose each instance's listeners.
  const documentEvents = vi.spyOn(document, "addEventListener");
  const windowEvents = vi.spyOn(window, "addEventListener");
  cleanupListeners = () => {
    for (const [type, listener, options] of documentEvents.mock.calls)
      document.removeEventListener(type, listener, options);
    for (const [type, listener, options] of windowEvents.mock.calls)
      window.removeEventListener(type, listener, options);
    documentEvents.mockRestore();
    windowEvents.mockRestore();
  };
  await import("../../apps/mirror/src/main");
  await flush();
  vi.advanceTimersByTime(1);
});
afterEach(() => {
  cleanupListeners();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
describe("independent diagnostic viewer", () => {
  it("lets the operator hide tracking while retaining independent raw camera delivery", async () => {
    const streams = await start();
    await frame(streams, pose(1));
    const overlay = el<HTMLInputElement>("show-tracking");
    overlay.checked = false;
    overlay.dispatchEvent(new Event("input"));
    expect(renderer.drawFrame.mock.calls.at(-1)?.[3].showTracking).toBe(false);
    expect(el("person-count").textContent).toBe("1");
    overlay.checked = true;
    overlay.dispatchEvent(new Event("input"));
    expect(renderer.drawFrame.mock.calls.at(-1)?.[3].showTracking).toBe(true);
  });
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
  it.each(["first", "replacement"] as const)(
    "discards an expired %s decode without reviving the preview and recovers on the next packet",
    async (phase) => {
      const s = await start();
      const previous = bitmap();
      if (phase === "replacement") {
        createBitmap.mockResolvedValueOnce(previous);
        await frame(s, pose(3, 1));
      }
      const decoded = deferred<ReturnType<typeof bitmap>>();
      createBitmap.mockReturnValueOnce(decoded.promise);
      const pending = s.image.receive(preview(pose(3, 2)));
      await flush();
      const pulls = s.image.send.mock.calls.length;
      vi.advanceTimersByTime(2000);
      renderer.drawFrame.mockClear();
      const expired = bitmap();
      decoded.resolve(expired);
      await pending;
      vi.advanceTimersByTime(16);
      expect(expired.close).toHaveBeenCalledOnce();
      expect(renderer.drawFrame).not.toHaveBeenCalled();
      expect(el("source-badge").textContent).toBe("Stale");
      expect(el("status-title").textContent).toBe("Waiting for fresh input");
      expect(el("status-message").textContent).toContain("including decoding");
      expect(el("standby").hidden).toBe(false);
      expect(el("standby-title").textContent).toBe("Waiting for fresh input");
      expect(el("viewport-title").textContent).toBe("Waiting for fresh input");
      expect(el("stage-source").textContent).toContain("Source active");
      expect(el("person-count").textContent).toBe("0");
      expect(s.image.send).toHaveBeenCalledTimes(pulls + 1);
      expect(s.image.close).not.toHaveBeenCalled();
      if (phase === "replacement")
        expect(previous.close).toHaveBeenCalledOnce();

      const fresh = bitmap();
      createBitmap.mockResolvedValueOnce(fresh);
      await frame(s, pose(1, 3));
      expect(el("source-badge").textContent).toBe("Live");
      expect(el("person-count").textContent).toBe("1");
      expect(renderer.drawFrame.mock.calls.at(-1)?.[1]).toBe(fresh);
      expect(fresh.close).not.toHaveBeenCalled();
    },
  );
  it("keeps synthetic first-frame expiry labels consistent with its active source", async () => {
    const s = await start("demo");
    const decoded = deferred<ReturnType<typeof bitmap>>();
    createBitmap.mockReturnValueOnce(decoded.promise);
    const pending = s.image.receive(
      preview(
        pose(3, 1, {
          source: "demo",
          algorithm: "synthetic",
          clock: {
            domain: "host-monotonic",
            quality: "synthetic",
            uncertaintyNs: null,
          },
        }),
      ),
    );
    await flush();
    vi.advanceTimersByTime(2000);
    decoded.resolve(bitmap());
    await pending;
    expect(el("standby").hidden).toBe(false);
    expect(el("standby-title").textContent).toBe("Waiting for fresh input");
    expect(el("standby-message").textContent).toContain(
      "source is still running",
    );
    expect(el("viewport-title").textContent).toBe("Waiting for fresh input");
    expect(el("stage-source").textContent).toContain("Source active");
    expect(el<HTMLButtonElement>("stop").disabled).toBe(false);
    el<HTMLButtonElement>("stop").click();
    await flush();
    expect(el("standby-title").textContent).toBe("Ready to observe");
    expect(el("viewport-title").textContent).toBe("Synthetic test scene");
    expect(el("stage-source").textContent).toBe("No source connected");
  });
  it("counts decoding time within the browser arrival-age budget", async () => {
    const s = await start();
    const decoded = deferred<ReturnType<typeof bitmap>>();
    createBitmap.mockReturnValueOnce(decoded.promise);
    const pending = s.image.receive(preview(pose()));
    await flush();
    vi.advanceTimersByTime(1000);
    const image = bitmap();
    decoded.resolve(image);
    await pending;
    vi.advanceTimersByTime(16);
    expect(renderer.drawFrame.mock.calls.at(-1)?.[1]).toBe(image);
    vi.advanceTimersByTime(800);
    expect(image.close).toHaveBeenCalledOnce();
    expect(el("source-badge").textContent).toBe("Stale");
  });
  it("hides an expired image on a display-control redraw before periodic cleanup", async () => {
    const s = await start();
    await s.image.receive(preview(pose()));
    vi.advanceTimersByTime(1510);
    renderer.drawFrame.mockClear();
    renderer.drawStandby.mockClear();
    el("mirror").dispatchEvent(new Event("input"));
    expect(renderer.drawFrame).not.toHaveBeenCalled();
    expect(renderer.drawStandby).toHaveBeenCalledOnce();
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
    expect(requests("/api/stop")).toHaveLength(0);
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
  it("preserves console telemetry and stable operator rows across high-rate observations", async () => {
    const streams = await start();
    await frame(streams);
    const replace = vi.spyOn(el("person-list"), "replaceChildren");
    for (let sequence = 2; sequence <= 122; sequence++)
      await frame(streams, pose(3, sequence));
    expect(replace).not.toHaveBeenCalled();
    expect(el("sample-count").textContent).toBe("120");
    expect(el("processing-time").textContent).not.toBe("—");
    expect(el("stream-camera").textContent).toContain("pose");
    const changed = pose(3, 123);
    changed.people[0].identity = "ambiguous";
    changed.people[0].trackId = null;
    await frame(streams, changed);
    expect(replace).toHaveBeenCalledOnce();
    expect(el("status-title").textContent).toBe("Identity needs recovery");
  });
  it("retains native-index validation and clears detailed console statistics on stale input", async () => {
    el<HTMLSelectElement>("camera-choice").value = "manual";
    el<HTMLSelectElement>("camera-choice").dispatchEvent(new Event("change"));
    el<HTMLInputElement>("camera-index").value = "1.5";
    el<HTMLButtonElement>("start").click();
    await flush();
    expect(fetchMock.mock.calls.some(([path]) => path === "/api/start")).toBe(
      false,
    );
    expect(el("status-title").textContent).toBe("Choose a camera");
    el<HTMLInputElement>("camera-index").value = "0";
    const streams = await start();
    await frame(streams, pose(1));
    expect(el("processing-time").textContent).not.toBe("—");
    vi.advanceTimersByTime(1800);
    for (const id of [
      "processing-time",
      "packet-size",
      "stream-clock",
      "arrival-age",
    ])
      expect(el(id).textContent).toBe("—");
  });

  it.each(["stop", "hidden", "pagehide"] as const)(
    "waits for a canceled Start acknowledgment after %s and releases only its epoch",
    async (cause) => {
      const started = deferred<Response>();
      const stopped = deferred<Response>();
      fetchMock.mockImplementation((path, init) => {
        if (path === "/api/start") return started.promise;
        if (path === "/api/stop") return stopped.promise;
        return defaultFetch(path, init);
      });
      el<HTMLButtonElement>("start").click();
      await flush();
      if (cause === "stop") el<HTMLButtonElement>("stop").click();
      else if (cause === "hidden") {
        Object.defineProperty(document, "hidden", { value: true });
        document.dispatchEvent(new Event("visibilitychange"));
      } else window.dispatchEvent(new Event("pagehide"));
      await flush();
      expect(requests("/api/stop")).toHaveLength(0);
      expect(el<HTMLButtonElement>("start").disabled).toBe(true);
      el("start").dispatchEvent(new Event("click"));
      await flush();
      expect(requests("/api/start")).toHaveLength(1);

      started.resolve(response({ state: "running", epoch: "late-owner" }));
      await flush();
      expect(stopEpochs()).toEqual([{ epoch: "late-owner" }]);
      expect(FakeWebSocket.instances).toHaveLength(0);
      expect(el<HTMLButtonElement>("start").disabled).toBe(true);
      stopped.resolve(response({ state: "idle" }));
      await flush();
      vi.advanceTimersByTime(1000);
      expect(renderer.drawFrame).not.toHaveBeenCalled();
    },
  );

  it("releases a late acknowledged error result after cancellation", async () => {
    const started = deferred<Response>();
    fetchMock.mockImplementation((path, init) =>
      path === "/api/start" ? started.promise : defaultFetch(path, init),
    );
    el<HTMLButtonElement>("start").click();
    el<HTMLButtonElement>("stop").click();
    await flush();
    expect(requests("/api/stop")).toHaveLength(0);
    started.resolve(
      response({
        state: "error",
        epoch: "failed-owner",
        message: "Model failed",
      }),
    );
    await flush();
    expect(stopEpochs()).toEqual([{ epoch: "failed-owner" }]);
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(el<HTMLButtonElement>("start").disabled).toBe(false);
  });

  it.each(["conflict", "network", "synchronous"] as const)(
    "keeps %s stop failure actionable and retries the same owned epoch before restart",
    async (failure) => {
      const image = bitmap();
      createBitmap.mockResolvedValueOnce(image);
      const streams = await start();
      await frame(streams);
      fetchMock.mockImplementationOnce(() => {
        if (failure === "conflict")
          return Promise.resolve(
            response({ detail: "Driver is still stopping" }, false),
          );
        if (failure === "network")
          return Promise.reject(new Error("Stop connection lost"));
        throw new Error("Stop transport failed");
      });
      el<HTMLButtonElement>("stop").click();
      await flush();
      expect(image.close).toHaveBeenCalledOnce();
      expect(streams.image.close).toHaveBeenCalledOnce();
      expect(streams.poses.close).toHaveBeenCalledOnce();
      expect(el("person-count").textContent).toBe("0");
      expect(el("camera-release").hidden).toBe(false);
      expect(el("camera-release-message").textContent).toMatch(/unconfirmed/i);
      expect(el<HTMLButtonElement>("retry-camera-stop").disabled).toBe(false);
      for (const id of [
        "start",
        "camera-choice",
        "refresh-cameras",
        "discover-cameras",
      ])
        expect(el<HTMLButtonElement>(id).disabled).toBe(true);
      el("start").dispatchEvent(new Event("click"));
      await flush();
      expect(requests("/api/start")).toHaveLength(1);
      const draws = renderer.drawFrame.mock.calls.length;
      vi.advanceTimersByTime(1000);
      expect(renderer.drawFrame.mock.calls.length).toBe(draws);

      el<HTMLButtonElement>("retry-camera-stop").click();
      await flush();
      expect(stopEpochs()).toEqual([
        { epoch: acknowledgedEpoch },
        { epoch: acknowledgedEpoch },
      ]);
      expect(el("camera-release").hidden).toBe(true);
      expect(el<HTMLButtonElement>("start").disabled).toBe(false);
      acknowledgedEpoch = "replacement";
      const restarted = await start();
      await frame(restarted, pose(1));
      expect(el("person-count").textContent).toBe("1");
    },
  );

  it("deduplicates repeated teardown and retry intents while release is pending", async () => {
    const streams = await start();
    const oldClose = streams.image.onclose;
    const oldError = streams.poses.onerror;
    streams.image.close.mockImplementation(() => {
      streams.image.readyState = 3;
      oldClose?.();
    });
    const stopped = deferred<Response>();
    fetchMock.mockImplementationOnce(() => stopped.promise);
    el<HTMLButtonElement>("stop").click();
    await flush();
    el("stop").dispatchEvent(new Event("click"));
    el("retry-camera-stop").dispatchEvent(new Event("click"));
    el("retry-camera-stop").dispatchEvent(new Event("click"));
    oldClose?.();
    oldError?.();
    window.dispatchEvent(new Event("pagehide"));
    await flush();
    expect(stopEpochs()).toEqual([{ epoch: acknowledgedEpoch }]);
    stopped.resolve(response({ state: "idle" }));
    await flush();
    expect(el("camera-release").hidden).toBe(true);
  });

  it.each(["confirmed", "unconfirmed"] as const)(
    "preserves %s scoped release when both active and standby rendering throw",
    async (release) => {
      const image = bitmap();
      createBitmap.mockResolvedValueOnce(image);
      const streams = await start();
      await frame(streams);
      const unhandled = vi.fn();
      window.addEventListener("error", unhandled);
      window.addEventListener("unhandledrejection", unhandled);
      renderer.drawFrame.mockClear().mockImplementation(() => {
        throw new Error("Canvas draw failed");
      });
      renderer.drawStandby.mockClear().mockImplementation(() => {
        throw new Error("Canvas standby failed");
      });
      if (release === "unconfirmed")
        fetchMock.mockResolvedValueOnce(
          response({ detail: "Camera driver is still stopping" }, false),
        );

      expect(() => vi.advanceTimersByTime(16)).not.toThrow();
      await flush();
      expect(renderer.drawFrame).toHaveBeenCalledOnce();
      expect(renderer.drawStandby).toHaveBeenCalledOnce();
      expect(image.close).toHaveBeenCalledOnce();
      expect(streams.image.close).toHaveBeenCalledOnce();
      expect(streams.poses.close).toHaveBeenCalledOnce();
      expect(stopEpochs()).toEqual([{ epoch: acknowledgedEpoch }]);
      expect(el("person-count").textContent).toBe("0");
      expect(el("standby").hidden).toBe(false);
      expect(el("source-badge").textContent).toBe("Stopped");
      expect(el<HTMLButtonElement>("stop").disabled).toBe(true);
      expect(el("status-title").textContent).toBe(
        release === "confirmed"
          ? "Preview display unavailable"
          : "Camera release unconfirmed",
      );
      expect(el("camera-release").hidden).toBe(release === "confirmed");
      expect(el<HTMLButtonElement>("start").disabled).toBe(
        release === "unconfirmed",
      );
      vi.advanceTimersByTime(1000);
      await flush();
      expect(renderer.drawFrame).toHaveBeenCalledOnce();
      expect(renderer.drawStandby).toHaveBeenCalledOnce();
      expect(unhandled).not.toHaveBeenCalled();
      if (release === "unconfirmed") {
        expect(el("camera-release-message").textContent).toMatch(
          /unconfirmed.*driver/i,
        );
        expect(el<HTMLButtonElement>("retry-camera-stop").disabled).toBe(false);
        el<HTMLButtonElement>("retry-camera-stop").click();
        await flush();
        expect(stopEpochs()).toEqual([
          { epoch: acknowledgedEpoch },
          { epoch: acknowledgedEpoch },
        ]);
        expect(el("camera-release").hidden).toBe(true);
        expect(el<HTMLButtonElement>("start").disabled).toBe(false);
      }
    },
  );

  it("releases its epoch and closes the first channel if opening the second fails", async () => {
    vi.stubGlobal(
      "WebSocket",
      class extends FakeWebSocket {
        constructor(url: string) {
          if (url.includes("/observations"))
            throw new Error("Socket constructor failed");
          super(url);
        }
      },
    );
    el<HTMLButtonElement>("start").click();
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].close).toHaveBeenCalledOnce();
    expect(stopEpochs()).toEqual([{ epoch: acknowledgedEpoch }]);
    expect(el<HTMLButtonElement>("start").disabled).toBe(false);
  });

  it.each(["open", "next"] as const)(
    "closes both channels when sending the %s pull throws",
    async (when) => {
      const streams = await start();
      streams.poses.send.mockImplementationOnce(() => {
        throw new Error("Socket send failed");
      });
      if (when === "open") streams.poses.onopen?.();
      else await streams.poses.receive(JSON.stringify(pose()));
      await flush();
      expect(streams.image.close).toHaveBeenCalledOnce();
      expect(streams.poses.close).toHaveBeenCalledOnce();
      expect(stopEpochs()).toEqual([{ epoch: acknowledgedEpoch }]);
    },
  );

  it.each([
    ["image", "onerror"],
    ["image", "onclose"],
    ["poses", "onerror"],
    ["poses", "onclose"],
  ] as const)(
    "closes the stream pair when %s emits %s",
    async (kind, event) => {
      const streams = await start();
      await frame(streams);
      streams[kind][event]?.();
      await flush();
      expect(streams.image.close).toHaveBeenCalledOnce();
      expect(streams.poses.close).toHaveBeenCalledOnce();
      expect(stopEpochs()).toEqual([{ epoch: acknowledgedEpoch }]);
      expect(el("person-count").textContent).toBe("0");
      const draws = renderer.drawFrame.mock.calls.length;
      vi.advanceTimersByTime(1000);
      expect(renderer.drawFrame.mock.calls.length).toBe(draws);
    },
  );

  it("closes the displayed bitmap and cancels animation on pagehide", async () => {
    const image = bitmap();
    createBitmap.mockResolvedValueOnce(image);
    const streams = await start();
    await frame(streams);
    window.dispatchEvent(new Event("pagehide"));
    await flush();
    expect(image.close).toHaveBeenCalledOnce();
    expect(streams.image.close).toHaveBeenCalledOnce();
    expect(streams.poses.close).toHaveBeenCalledOnce();
    expect(stopEpochs()).toEqual([{ epoch: acknowledgedEpoch }]);
    const draws = renderer.drawFrame.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(renderer.drawFrame.mock.calls.length).toBe(draws);
    expect(el("person-count").textContent).toBe("0");
  });

  it.each(["stop", "pagehide"] as const)(
    "disposes a bitmap decoded after %s without resuming drawing or stream pulls",
    async (cause) => {
      const decoded = deferred<ReturnType<typeof bitmap>>();
      createBitmap.mockReturnValueOnce(decoded.promise);
      const streams = await start();
      const pending = streams.image.receive(preview(pose()));
      await flush();
      if (cause === "stop") el<HTMLButtonElement>("stop").click();
      else window.dispatchEvent(new Event("pagehide"));
      await flush();
      const pulls = streams.image.send.mock.calls.length;
      const image = bitmap();
      decoded.resolve(image);
      await pending;
      vi.advanceTimersByTime(1000);
      expect(image.close).toHaveBeenCalledOnce();
      expect(renderer.drawFrame).not.toHaveBeenCalled();
      expect(streams.image.send).toHaveBeenCalledTimes(pulls);
      expect(el("standby").hidden).toBe(false);
      expect(el("person-count").textContent).toBe("0");
    },
  );

  it("ignores obsolete socket callbacks and closes late decoded images after restart", async () => {
    const decoded = deferred<ReturnType<typeof bitmap>>();
    createBitmap.mockReturnValueOnce(decoded.promise);
    const old = await start();
    const opened = old.image.onopen;
    const closed = old.poses.onclose;
    const failed = old.image.onerror;
    const pending = old.image.receive(preview(pose()));
    await flush();
    el<HTMLButtonElement>("stop").click();
    await flush();
    acknowledgedEpoch = "new-generation";
    const current = await start();
    await frame(current, pose(1));
    const oldPulls = old.image.send.mock.calls.length;
    opened?.();
    closed?.();
    failed?.();
    const lateImage = bitmap();
    decoded.resolve(lateImage);
    await pending;
    await flush();
    expect(lateImage.close).toHaveBeenCalledOnce();
    expect(old.image.send).toHaveBeenCalledTimes(oldPulls);
    expect(current.image.close).not.toHaveBeenCalled();
    expect(current.poses.close).not.toHaveBeenCalled();
    expect(el("person-count").textContent).toBe("1");
    expect(stopEpochs()).toEqual([{ epoch: "test-epoch" }]);
  });

  it.each([
    "network",
    "malformed-json",
    "missing-epoch",
    "empty-epoch",
  ] as const)(
    "reports unknown ownership after a %s Start acknowledgment without adopting global status",
    async (failure) => {
      fetchMock.mockImplementation((path, init) => {
        if (path === "/api/status")
          return Promise.resolve(
            response({ state: "running", epoch: "someone-elses-source" }),
          );
        if (path !== "/api/start") return defaultFetch(path, init);
        if (failure === "network")
          return Promise.reject(new Error("Start connection lost"));
        if (failure === "malformed-json") {
          const malformed = response(null);
          malformed.json = async () => {
            throw new SyntaxError("Invalid JSON");
          };
          return Promise.resolve(malformed);
        }
        return Promise.resolve(
          response({
            state: "running",
            ...(failure === "empty-epoch" ? { epoch: "" } : {}),
          }),
        );
      });
      el<HTMLButtonElement>("start").click();
      await flush();
      expect(FakeWebSocket.instances).toHaveLength(0);
      expect(requests("/api/stop")).toHaveLength(0);
      expect(el("camera-release").hidden).toBe(false);
      expect(el("camera-release-message").textContent).toMatch(
        /unknown|unconfirmed|not confirmed/i,
      );
      expect(el("camera-release-message").textContent).toMatch(
        /restart.*service|restart.*vision/i,
      );
      expect(el<HTMLButtonElement>("start").disabled).toBe(true);
      expect(el<HTMLButtonElement>("camera-choice").disabled).toBe(true);
      el("start").dispatchEvent(new Event("click"));
      el("retry-camera-stop").dispatchEvent(new Event("click"));
      window.dispatchEvent(new Event("pagehide"));
      await flush();
      expect(requests("/api/start")).toHaveLength(1);
      expect(requests("/api/stop")).toHaveLength(0);
    },
  );
});
