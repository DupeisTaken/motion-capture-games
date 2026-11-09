// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Observation } from "../../contracts/generated/observation";
import fixture from "../../contracts/examples/synthetic-observation.json";

const renderer = vi.hoisted(() => ({
  drawFrame: vi.fn(),
  drawStandby: vi.fn(),
}));
vi.mock("../../apps/mirror/src/renderer", () => renderer);

type FakeBitmap = {
  width: number;
  height: number;
  close: ReturnType<typeof vi.fn>;
};
const bitmap = (
  width = fixture.image.width,
  height = fixture.image.height,
): FakeBitmap => ({ width, height, close: vi.fn() });
const createBitmap = vi.fn(async () => bitmap());
let acknowledgedEpoch: string;
let startFailure: string | null;
const response = (body: unknown, ok = true): Response =>
  ({ ok, json: async () => body }) as Response;
const fetchMock = vi.fn(
  async (path: string, options?: RequestInit): Promise<Response> => {
    void options;
    if (path === "/api/start") {
      return startFailure
        ? response({ detail: startFailure }, false)
        : response({ state: "running", epoch: acknowledgedEpoch });
    }
    return response({ state: "idle" });
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
  readonly send = vi.fn();
  readonly close = vi.fn(() => {
    this.readyState = 3;
  });
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  open(): void {
    this.onopen?.();
  }
  async receive(data: ArrayBuffer | string): Promise<void> {
    await this.onmessage?.({ data });
  }
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing viewer element: ${id}`);
  return value as T;
}
async function flushPromises(): Promise<void> {
  // The UI awaits fetch, its JSON body and image decoding. No wall-clock sleeps.
  for (let index = 0; index < 24; index++) await Promise.resolve();
}
async function startViewer(
  source: "camera" | "demo" = "camera",
): Promise<FakeWebSocket> {
  if (source === "demo") element<HTMLButtonElement>("source-demo").click();
  element<HTMLButtonElement>("start").click();
  await flushPromises();
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("The viewer did not open a stream.");
  socket.open();
  return socket;
}
function observation(
  count: number,
  sequence = 1,
  changes: Partial<Observation> = {},
): Observation {
  return {
    ...(structuredClone(fixture) as Observation),
    epoch: "test-epoch",
    source: "camera",
    algorithm: "mediapipe",
    clock: {
      domain: "host-monotonic",
      quality: "host-read-completion",
      uncertaintyNs: null,
    },
    sequence,
    frameId: `synthetic-test-frame-${sequence}`,
    people: Array.from({ length: count }, (_, index) => ({
      ...structuredClone(fixture.people[0]),
      trackId: `track-${index + 1}`,
      identity: "confident",
      joints: Object.fromEntries(
        Object.entries(fixture.people[0].joints).map(([name, joint]) => [
          name,
          { ...joint },
        ]),
      ),
    })) as Observation["people"],
    detectedCount: count,
    ...changes,
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
const stopRequestCount = (): number =>
  fetchMock.mock.calls.filter(([path]) => path === "/api/stop").length;

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
  document.body.innerHTML = '<div id="app"></div>';
  acknowledgedEpoch = "test-epoch";
  startFailure = null;
  FakeWebSocket.instances = [];
  createBitmap.mockImplementation(async () => bitmap());
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("createImageBitmap", createBitmap);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    },
  );
  await import("../../apps/mirror/src/main");
  await flushPromises();
  // Keep source freshness distinct from the not-yet-running timestamp sentinel.
  vi.advanceTimersByTime(1);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("diagnostic viewer integration", () => {
  it("automatically updates three detections to an empty scene from source packets", async () => {
    const socket = await startViewer();
    await socket.receive(packet(observation(3)));
    expect(element("person-count").textContent).toBe("3");
    expect(element("people-overlay").textContent).toBe("3 people");
    expect(document.querySelectorAll(".person-row")).toHaveLength(3);
    expect(renderer.drawFrame.mock.calls.at(-1)?.[2].detectedCount).toBe(3);
    const body = JSON.parse(
      fetchMock.mock.calls.find(([path]) => path === "/api/start")?.[1]
        ?.body as string,
    );
    expect(body.maxPeople).toBe(6);
    expect(body).not.toHaveProperty("detectedCount");
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "next" }));

    await socket.receive(packet(observation(0, 2)));
    expect(element("person-count").textContent).toBe("0");
    expect(element("people-overlay").textContent).toBe("0 people");
    expect(document.querySelectorAll(".person-row")).toHaveLength(0);
    expect(element("person-list").textContent).toContain("No people detected");
    expect(renderer.drawFrame.mock.calls.at(-1)?.[2].detectedCount).toBe(0);
  });

  it("shows detector saturation honestly, then clears counts, warning and bitmap on stop", async () => {
    element<HTMLSelectElement>("capacity").value = "3";
    const image = bitmap();
    createBitmap.mockResolvedValueOnce(image);
    const socket = await startViewer();
    await socket.receive(
      packet(observation(3, 1, { capacity: 3, capacityReached: true })),
    );
    expect(element("capacity-warning").hidden).toBe(false);
    expect(element("capacity-warning").textContent).toContain(
      "additional people",
    );
    expect(element("count-label").textContent).toBe("at capacity");

    element<HTMLButtonElement>("stop").click();
    await flushPromises();
    expect(image.close).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(element("person-count").textContent).toBe("0");
    expect(element("count-label").textContent).toBe("detected");
    expect(element("capacity-warning").hidden).toBe(true);
    expect(element("standby").hidden).toBe(false);
    expect(element<HTMLButtonElement>("start").disabled).toBe(false);
    expect(element<HTMLButtonElement>("stop").disabled).toBe(true);
    expect(renderer.drawStandby).toHaveBeenCalled();
    expect(stopRequestCount()).toBe(1);
  });

  it("hides stale skeletons and count after the display freshness timeout", async () => {
    const image = bitmap();
    createBitmap.mockResolvedValueOnce(image);
    const socket = await startViewer();
    await socket.receive(packet(observation(2)));
    expect(element("person-count").textContent).toBe("2");
    vi.advanceTimersByTime(1800);
    expect(image.close).toHaveBeenCalledTimes(1);
    expect(element("person-count").textContent).toBe("0");
    expect(element("source-badge").textContent).toBe("Stale");
    expect(element("status-message").textContent).toContain(
      "Old skeletons are hidden",
    );
    expect(renderer.drawStandby).toHaveBeenCalled();
    expect(stopRequestCount()).toBe(0);
  });

  it("rejects an unexpected source epoch instead of adopting restarted identity", async () => {
    const image = bitmap();
    createBitmap.mockResolvedValueOnce(image);
    const socket = await startViewer();
    await socket.receive(packet(observation(1)));
    await socket.receive(
      packet(observation(3, 2, { epoch: "unexpected-restart" })),
    );
    expect(createBitmap).toHaveBeenCalledTimes(1);
    expect(image.close).toHaveBeenCalledTimes(1);
    expect(element("person-count").textContent).toBe("0");
    expect(element("status-title").textContent).toBe(
      "Preview could not continue",
    );
    expect(element("status-message").textContent).toContain("source restarted");
    expect(element<HTMLButtonElement>("start").disabled).toBe(false);
    expect(socket.close).toHaveBeenCalled();
  });

  it("returns actionable start errors and restores the operator controls", async () => {
    startFailure =
      "Camera permission denied. Allow camera access in system settings.";
    element<HTMLButtonElement>("start").click();
    await flushPromises();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(element("status-title").textContent).toBe("Unable to start");
    expect(element("status-message").textContent).toBe(startFailure);
    expect(element<HTMLButtonElement>("start").disabled).toBe(false);
    expect(element<HTMLButtonElement>("stop").disabled).toBe(true);
    expect(element<HTMLSelectElement>("algorithm").disabled).toBe(false);
    expect(element<HTMLButtonElement>("source-demo").disabled).toBe(false);
  });

  it("labels synthetic input and disables camera inference selection for that source", async () => {
    const socket = await startViewer("demo");
    expect(element<HTMLSelectElement>("algorithm").disabled).toBe(true);
    expect(element("camera-settings").hidden).toBe(true);
    expect(element("demo-settings").hidden).toBe(false);
    await socket.receive(
      packet(
        observation(3, 1, {
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
    expect(element("source-badge").textContent).toBe("Synthetic");
    expect(element("stage-source").textContent).toContain("no camera");
    expect(element("timing-note").textContent).toContain(
      "not inference or camera performance results",
    );
    const request = fetchMock.mock.calls.find(
      ([path]) => path === "/api/start",
    );
    expect(JSON.parse(request?.[1]?.body as string).source).toBe("demo");
    element<HTMLButtonElement>("stop").click();
    await flushPromises();
    expect(element<HTMLSelectElement>("algorithm").disabled).toBe(true);
    element<HTMLButtonElement>("source-camera").click();
    expect(element<HTMLSelectElement>("algorithm").disabled).toBe(false);
  });

  it("does not let a delayed decode error from an obsolete generation stop its replacement", async () => {
    let rejectOldDecode: ((reason: Error) => void) | undefined;
    const oldDecode = new Promise<FakeBitmap>((_resolve, reject) => {
      rejectOldDecode = reject;
    });
    createBitmap.mockReturnValueOnce(oldDecode);
    const firstSocket = await startViewer();
    const pendingOldFrame = firstSocket.receive(packet(observation(1)));
    await flushPromises();
    expect(createBitmap).toHaveBeenCalledTimes(1);
    element<HTMLButtonElement>("stop").click();
    await flushPromises();
    acknowledgedEpoch = "replacement-epoch";
    const replacement = await startViewer();
    await replacement.receive(
      packet(observation(3, 1, { epoch: "replacement-epoch" })),
    );
    expect(element("person-count").textContent).toBe("3");
    expect(stopRequestCount()).toBe(1);

    if (!rejectOldDecode) throw new Error("The old decoder was not installed.");
    rejectOldDecode(new Error("Obsolete image decode failed"));
    await pendingOldFrame;
    await flushPromises();
    expect(element("person-count").textContent).toBe("3");
    expect(replacement.close).not.toHaveBeenCalled();
    expect(element("status-title").textContent).toBe("Skeletons detected");
    expect(element<HTMLButtonElement>("stop").disabled).toBe(false);
    expect(stopRequestCount()).toBe(1);
  });

  it("rejects mismatched image and observation geometry before displaying a skeleton", async () => {
    const wrongImage = bitmap(100, 100);
    createBitmap.mockResolvedValueOnce(wrongImage);
    const socket = await startViewer();
    await socket.receive(packet(observation(1)));
    expect(wrongImage.close).toHaveBeenCalledTimes(1);
    expect(renderer.drawFrame).not.toHaveBeenCalled();
    expect(element("person-count").textContent).toBe("0");
    expect(element("status-message").textContent).toContain(
      "dimensions do not match",
    );
    expect(element<HTMLButtonElement>("start").disabled).toBe(false);
  });
});
