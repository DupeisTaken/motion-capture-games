// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MazeCalibrationCapture } from "../../apps/mirror/src/maze-calibration-capture";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1;
  binaryType = "";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => Promise<void>) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) {
    Socket.instances.push(this);
  }
}
function packet(epoch = "own", sequence = 1, source = "camera") {
  const header = new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      epoch,
      sequence,
      source,
      image: { width: 640, height: 360 },
      capturedAtNs: "100",
      clockDomain: "host-monotonic",
      clockQuality: source === "camera" ? "host-read-completion" : "synthetic",
      captureFps: 30,
    }),
  );
  const bytes = new Uint8Array(4 + header.length + 4);
  new DataView(bytes.buffer).setUint32(0, header.length);
  bytes.set(header, 4);
  bytes.set([255, 216, 255, 217], 4 + header.length);
  return bytes.buffer;
}
const response = (data: object = { epoch: "own" }, ok = true) =>
  ({ ok, status: ok ? 200 : 409, json: async () => data }) as Response;
let capture: MazeCalibrationCapture;
let request: ReturnType<typeof vi.fn<typeof fetch>>;
let callbacks: {
  frame: ReturnType<
    typeof vi.fn<(image: ImageBitmap, width: number, height: number) => void>
  >;
  changed: ReturnType<typeof vi.fn<(message: string) => void>>;
  lost: ReturnType<typeof vi.fn<() => void>>;
};
beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  request = vi.fn<typeof fetch>().mockResolvedValue(response());
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 640, height: 360, close: vi.fn() }),
  );
  callbacks = { frame: vi.fn(), changed: vi.fn(), lost: vi.fn() };
  capture = new MazeCalibrationCapture(callbacks);
});
afterEach(async () => {
  capture.dispose();
  await Promise.resolve();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("maze calibration acquisition ownership", () => {
  it("does not acquire on mount and blocks departure through explicit start and acknowledged stop", async () => {
    expect(request).not.toHaveBeenCalled();
    expect(capture.navigationBlocker).toBeNull();
    const start = capture.start({ cameraIndex: 0 });
    expect(capture.navigationBlocker).toContain("Stop calibration");
    await start;
    expect(request.mock.calls[0][0]).toBe("/api/calibration/start");
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({
      source: "camera",
      cameraIndex: 0,
      independentPreview: true,
    });
    await capture.stop();
    expect(capture.navigationBlocker).toBeNull();
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({
      epoch: "own",
    });
  });
  it("pulls one preview at a time and decodes only its camera epoch", async () => {
    await capture.start({ cameraIndex: 0 });
    const socket = Socket.instances[0];
    socket.onopen!();
    expect(socket.send).toHaveBeenCalledTimes(1);
    await socket.onmessage!({ data: packet() });
    expect(callbacks.frame).toHaveBeenCalledTimes(1);
    expect(capture.fresh).toBe(true);
    expect(socket.send).toHaveBeenCalledTimes(2);
    await socket.onmessage!({ data: packet("other", 2) });
    expect(callbacks.frame).toHaveBeenCalledTimes(1);
    expect(callbacks.lost).toHaveBeenCalled();
    expect(capture.active).toBe(false);
  });
  it("rejects a synthetic preview pretending to calibrate a physical camera", async () => {
    await capture.start({ cameraIndex: 0 });
    await Socket.instances[0].onmessage!({ data: packet("own", 1, "demo") });
    expect(callbacks.frame).not.toHaveBeenCalled();
    expect(callbacks.lost).toHaveBeenCalled();
  });
  it("retains a departure blocker on failed release, forbids replacement and retries only its own epoch", async () => {
    request
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ detail: "driver busy" }, false))
      .mockResolvedValueOnce(response());
    await capture.start({ cameraIndex: 0 });
    await capture.stop();
    expect(capture.active).toBe(false);
    expect(capture.navigationBlocker).toBeTruthy();
    await capture.start({ cameraIndex: 1 });
    expect(request).toHaveBeenCalledTimes(2);
    await capture.stop();
    expect(request).toHaveBeenCalledTimes(3);
    expect(capture.navigationBlocker).toBeNull();
    expect(JSON.parse(String(request.mock.calls[2][1]?.body))).toEqual({
      epoch: "own",
    });
  });
  it("cleans a cancelled pending start when its late acknowledgement arrives", async () => {
    let resolve!: (value: Response) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const start = capture.start({ cameraIndex: 0 });
    await capture.stop();
    expect(capture.navigationBlocker).toBeTruthy();
    resolve(response({ epoch: "late-own" }));
    await start;
    expect(Socket.instances).toHaveLength(0);
    expect(request).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({
      epoch: "late-own",
    });
    expect(capture.navigationBlocker).toBeNull();
  });
  it("does not guess an owner after a lost start response", async () => {
    request.mockRejectedValueOnce(new Error("network lost"));
    await capture.start({ cameraIndex: 0 });
    expect(capture.navigationBlocker).toBeTruthy();
    expect(capture.message).toContain("ownership is unknown");
    await capture.stop();
    await capture.start({ cameraIndex: 1 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("keeps malformed successful start acknowledgements blocked for service recovery", async () => {
    request.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error("invalid json");
      },
    } as unknown as Response);
    await capture.start({ cameraIndex: 0 });
    expect(capture.navigationBlocker).toBeTruthy();
    expect(capture.message).toContain("unknown");
  });
  it.each([
    null,
    true,
    42,
    "epoch",
    [],
    {},
    { epoch: "" },
    { epoch: " " },
    { epoch: 123 },
  ])(
    "keeps unusable successful JSON acknowledgement %j blocked",
    async (body) => {
      request.mockResolvedValueOnce({
        ok: true,
        json: async () => body,
      } as Response);
      await capture.start({ cameraIndex: 0 });
      expect(capture.navigationBlocker).toBeTruthy();
      expect(capture.message).toContain("unknown");
      await capture.start({ cameraIndex: 1 });
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it("an idle-only conflict does not claim or stop another page's source", async () => {
    request.mockResolvedValueOnce(
      response({ detail: "Stop active source in owning page" }, false),
    );
    await capture.start({ cameraIndex: 0 });
    expect(capture.navigationBlocker).toBeNull();
    expect(callbacks.changed).toHaveBeenCalledWith(
      expect.stringContaining("owning page"),
    );
    await capture.stop();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("invalidates a silent preview and releases capture after the bounded wait", async () => {
    await capture.start({ cameraIndex: 0 });
    await vi.advanceTimersByTimeAsync(14000);
    expect(callbacks.lost).toHaveBeenCalled();
    expect(capture.active).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
