// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraSetup } from "../../apps/mirror/src/camera-setup";

const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const flush = async () => {
  for (let index = 0; index < 24; index++) await Promise.resolve();
};
const track = () => ({ stop: vi.fn() });
const stream = () => {
  const tracks = [track(), track()];
  return {
    tracks,
    value: { getTracks: () => tracks } as unknown as MediaStream,
  };
};
const camera = (deviceId: string, label: string, kind = "videoinput") => ({
  deviceId,
  label,
  kind,
});
let media: {
  getUserMedia: ReturnType<typeof vi.fn>;
  enumerateDevices: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
};
let busy: ReturnType<typeof vi.fn<(busy: boolean) => void>>;
let setup: CameraSetup;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = `<button id="discover-cameras"></button><button id="identify-camera"></button><select id="browser-camera"><option value=""></option></select><video id="camera-check-video"></video><div id="camera-check" hidden></div><button id="release-camera"></button><p id="camera-permission"></p>`;
  media = {
    getUserMedia: vi.fn(),
    enumerateDevices: vi.fn(async () => [
      camera("opaque-b", "USB camera B"),
      camera("opaque-a", "USB camera A"),
      camera("audio", "Microphone", "audioinput"),
    ]),
    addEventListener: vi.fn(),
  };
  vi.stubGlobal("navigator", { mediaDevices: media });
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ state: "idle" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  // Simulated streams have no device; preserve assignment without DOM's brand check.
  let assigned: MediaStream | null = null;
  Object.defineProperty(element("camera-check-video"), "srcObject", {
    configurable: true,
    get: () => assigned,
    set: (value: MediaStream | null) => {
      assigned = value;
    },
  });
  busy = vi.fn();
  setup = new CameraSetup({ busyChanged: busy });
});
afterEach(() => {
  setup.release();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("explicit camera setup", () => {
  it("does not request camera access until clicked, reveals labels and releases every discovery track", async () => {
    const acquired = stream();
    media.getUserMedia.mockResolvedValue(acquired.value);
    expect(media.getUserMedia).not.toHaveBeenCalled();
    element<HTMLButtonElement>("discover-cameras").click();
    expect(setup.busy).toBe(true);
    await flush();
    expect(media.getUserMedia).toHaveBeenCalledWith({
      video: true,
      audio: false,
    });
    expect(element<HTMLSelectElement>("browser-camera").options.length).toBe(2);
    expect(element("browser-camera").textContent).toContain("USB camera B");
    for (const item of acquired.tracks)
      expect(item.stop).toHaveBeenCalledTimes(1);
    expect(busy.mock.calls).toEqual([[true], [false]]);
    expect(setup.busy).toBe(false);
  });
  it("identifies by opaque device ID and releases capture before native operation", async () => {
    const initial = stream(),
      identified = stream();
    media.getUserMedia
      .mockResolvedValueOnce(initial.value)
      .mockResolvedValueOnce(identified.value);
    element<HTMLButtonElement>("discover-cameras").click();
    await flush();
    element<HTMLSelectElement>("browser-camera").value = "opaque-a";
    element<HTMLButtonElement>("identify-camera").click();
    await flush();
    expect(media.getUserMedia).toHaveBeenLastCalledWith({
      audio: false,
      video: { deviceId: { exact: "opaque-a" } },
    });
    expect(element("camera-check").hidden).toBe(false);
    expect(identified.tracks[0]!.stop).not.toHaveBeenCalled();
    setup.setLocked(true);
    expect(
      element<HTMLVideoElement>("camera-check-video").srcObject,
    ).toBeNull();
    expect(element("camera-check").hidden).toBe(true);
    expect(identified.tracks[0]!.stop).toHaveBeenCalledTimes(1);
    expect(element<HTMLButtonElement>("discover-cameras").disabled).toBe(true);
  });
  it("releases a late permission result after the page is hidden or setup invalidated", async () => {
    const acquired = stream();
    let resolve: ((value: MediaStream) => void) | undefined;
    media.getUserMedia.mockReturnValue(
      new Promise<MediaStream>((done) => {
        resolve = done;
      }),
    );
    element<HTMLButtonElement>("discover-cameras").click();
    await flush();
    setup.release();
    expect(setup.busy).toBe(true);
    resolve!(acquired.value);
    await flush();
    expect(acquired.tracks[0]!.stop).toHaveBeenCalledTimes(1);
    expect(media.enumerateDevices).not.toHaveBeenCalled();
    expect(setup.busy).toBe(false);
  });
  it("cleans up when enumeration fails, and recovers after permission denial", async () => {
    const acquired = stream();
    media.getUserMedia
      .mockResolvedValueOnce(acquired.value)
      .mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"));
    media.enumerateDevices.mockRejectedValueOnce(
      new Error("Enumeration failed"),
    );
    element<HTMLButtonElement>("discover-cameras").click();
    await flush();
    expect(acquired.tracks[0]!.stop).toHaveBeenCalledTimes(1);
    element<HTMLButtonElement>("discover-cameras").click();
    await flush();
    expect(element("camera-permission").textContent).toContain(
      "Camera access denied",
    );
    expect(element<HTMLButtonElement>("discover-cameras").disabled).toBe(false);
    expect(element("camera-check").hidden).toBe(true);
  });
  it("does not open a second owner while the native source is active", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: "running" }),
    });
    element<HTMLButtonElement>("discover-cameras").click();
    await flush();
    expect(media.getUserMedia).not.toHaveBeenCalled();
    expect(element("camera-permission").textContent).toContain(
      "Stop the active vision source",
    );
  });
  it("invalidates removed devices without prompting for camera permission again", async () => {
    const acquired = stream();
    media.getUserMedia.mockResolvedValue(acquired.value);
    element<HTMLButtonElement>("discover-cameras").click();
    await flush();
    const listener = media.addEventListener.mock.calls[0]![1];
    listener();
    expect(element<HTMLSelectElement>("browser-camera").value).toBe("");
    expect(element<HTMLButtonElement>("identify-camera").disabled).toBe(true);
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
  });
  it("provides a native fallback when the browser API is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    document.body.replaceChildren(
      ...[...document.body.children].map((child) => child.cloneNode(true)),
    );
    const unavailable = new CameraSetup({ busyChanged: busy });
    element<HTMLButtonElement>("discover-cameras").click();
    await flush();
    expect(element("camera-permission").textContent).toContain("unavailable");
    unavailable.release();
  });
});
