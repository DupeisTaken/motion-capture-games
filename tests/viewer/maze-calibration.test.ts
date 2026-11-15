// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mazeCalibrationMarkup,
  mountMazeCalibration,
} from "../../apps/mirror/src/maze-calibration";

const captures = vi.hoisted(() => ({
  instances: [] as Array<{
    busy: boolean;
    active: boolean;
    fresh: boolean;
    callbacks: {
      frame: (image: ImageBitmap, w: number, h: number) => void;
      changed: (message: string) => void;
      lost: () => void;
    };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("../../apps/mirror/src/maze-calibration-capture", () => ({
  MazeCalibrationCapture: class {
    busy = false;
    active = false;
    fresh = false;
    get navigationBlocker() {
      return this.busy ? "Stop calibration camera" : null;
    }
    start = vi.fn(async () => {
      this.busy = true;
      this.active = true;
      this.fresh = true;
      this.callbacks.changed("Live synthetic fixture");
    });
    stop = vi.fn(async () => {
      this.busy = false;
      this.active = false;
      this.fresh = false;
      this.callbacks.changed("Camera stopped");
    });
    constructor(
      public callbacks: (typeof captures.instances)[number]["callbacks"],
    ) {
      captures.instances.push(this);
    }
    dispose() {
      void this.stop();
    }
  },
}));
const get = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const click = (id: string) => get<HTMLButtonElement>(id).click();
const input = (id: string, value: string) => {
  get<HTMLInputElement>(id).value = value;
  get(id).dispatchEvent(new Event("input"));
};
const select = (id: string, value: string) => {
  get<HTMLSelectElement>(id).value = value;
  get(id).dispatchEvent(new Event("change"));
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
let ui: ReturnType<typeof mountMazeCalibration>;
const capture = () => captures.instances[0];
function mark(u: number, v: number) {
  input("cal-u", String(u * 100));
  input("cal-v", String(v * 100));
  click("cal-add");
}
async function start() {
  select("maze-cal-1-camera-choice", "manual");
  input("cal-optics", "Full frame; no zoom; locked focus");
  click("cal-start");
  await flush();
  capture().callbacks.frame({} as ImageBitmap, 640, 480);
  click("cal-freeze");
}
function measure() {
  mark(0.1, 0.9);
  mark(0.9, 0.9);
  mark(0.9, 0.1);
  mark(0.1, 0.1);
  // Corner snapshot cannot count as a new moved-reference placement.
  click("cal-freeze");
  capture().callbacks.frame({} as ImageBitmap, 640, 480);
  click("cal-freeze");
  mark(0.15, 0.8);
  mark(0.25, 0.8);
  click("cal-freeze");
  capture().callbacks.frame({} as ImageBitmap, 640, 480);
  click("cal-freeze");
  mark(0.46464466, 0.53535534);
  mark(0.53535534, 0.46464466);
  click("cal-freeze");
  capture().callbacks.frame({} as ImageBitmap, 640, 480);
  click("cal-freeze");
  mark(0.8, 0.25);
  mark(0.8, 0.15);
}
beforeEach(async () => {
  captures.instances = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as never);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url) => ({
      ok: true,
      json: async () =>
        url === "/api/cameras"
          ? { cameras: [] }
          : {
              schemaVersion: "floor-calibration/v1",
              homography: [
                [10, 0, -1],
                [0, -10, 9],
                [0, 0, 1],
              ],
              heldOut: { maxErrorM: 0.001, rmseM: 0.0005 },
            },
    })),
  );
  document.body.innerHTML = `<div id="root"><a id="route" href="/rig.html">Other tool</a><input id="maze-width" value="8" type="number"><input id="maze-depth" value="8" type="number"><dialog id="pre-game-settings">${mazeCalibrationMarkup()}</dialog></div>`;
  ui = mountMazeCalibration(get("root"));
  await flush();
});
afterEach(() => {
  ui.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
describe("guided maze floor measurements", () => {
  it("does not count an immediate Resume/Freeze double click as a new reference image", async () => {
    await start();
    mark(0.1, 0.9);
    mark(0.9, 0.9);
    mark(0.9, 0.1);
    mark(0.1, 0.1);
    click("cal-freeze");
    click("cal-freeze");
    expect(get("cal-result").textContent).toContain(
      "Wait for a new live image",
    );
    mark(0.15, 0.8);
    expect(get("cal-evidence").children[4].textContent).toContain("0/2");
    capture().callbacks.frame({} as ImageBitmap, 640, 480);
    click("cal-freeze");
    mark(0.15, 0.8);
    expect(get("cal-evidence").children[4].textContent).toContain("1/2");
  });
  it("enumerates metadata only and keeps physical-play limitations explicit", () => {
    expect(capture().start).not.toHaveBeenCalled();
    expect(
      vi.mocked(fetch).mock.calls.every(([url]) => url === "/api/cameras"),
    ).toBe(true);
    expect(get("root").textContent).toContain(
      "Physical maze play stays unavailable",
    );
    expect(ui.navigationBlocker).toBeNull();
  });
  it("blocks same-page route departure until acknowledged calibration release", async () => {
    await start();
    const departure = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    get("route").dispatchEvent(departure);
    expect(departure.defaultPrevented).toBe(true);
    expect(get("cal-capture-status").textContent).toContain("Stop calibration");
    expect(document.activeElement).toBe(get("cal-stop"));
    click("cal-stop");
    await flush();
    const released = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    get("route").dispatchEvent(released);
    expect(released.defaultPrevented).toBe(false);
  });
  it("requires locked optics and first-camera checks before camera 2", async () => {
    select("maze-cal-1-camera-choice", "manual");
    click("cal-start");
    expect(capture().start).not.toHaveBeenCalled();
    expect(get("cal-capture-status").textContent).toContain("Record and lock");
    select("cal-role", "1");
    select("maze-cal-2-camera-choice", "manual");
    input("cal-optics", "locked");
    click("cal-start");
    expect(get("cal-capture-status").textContent).toContain(
      "Complete camera 1",
    );
  });
  it("requires new frozen views between separated reference placements", async () => {
    await start();
    mark(0.1, 0.9);
    mark(0.9, 0.9);
    mark(0.9, 0.1);
    mark(0.1, 0.1);
    mark(0.15, 0.8);
    expect(get("cal-result").textContent).toContain("Resume live video");
    expect(get("cal-evidence").children[4].textContent).toContain("0/2");
  });
  it("fits only complete held-out measurements, exposes floor probe and invalidates geometry", async () => {
    await start();
    expect(ui.navigationBlocker).toBeTruthy();
    measure();
    expect(get<HTMLButtonElement>("cal-fit").disabled).toBe(false);
    click("cal-fit");
    await flush();
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url === "/api/calibration/floor")!;
    const payload = JSON.parse(String(call[1]?.body));
    expect(payload.reference.placements).toHaveLength(3);
    expect(payload.imageCorners.nearLeft).toEqual([0.1, 0.9]);
    expect(get("cal-result").textContent).toContain("floor checks passed");
    expect(get("cal-result").textContent).toContain(
      "Physical play remains gated",
    );
    mark(0.5, 0.5);
    expect(get("cal-result").textContent).toContain("X 4.000 m, Z 4.000 m");
    capture().callbacks.frame({} as ImageBitmap, 1280, 720);
    expect(get("cal-result").textContent).toContain("Image geometry changed");
    expect(get("cal-pair-status").textContent).toContain(
      "Camera 1: not calibrated",
    );
  });
  it("preserves role 1 checks across acknowledged stop and enforces distinct role 2 selection", async () => {
    await start();
    measure();
    click("cal-fit");
    await flush();
    click("cal-stop");
    await flush();
    expect(ui.navigationBlocker).toBeNull();
    select("cal-role", "1");
    select("maze-cal-2-camera-choice", "manual");
    input("cal-optics", "locked");
    click("cal-start");
    expect(get("cal-capture-status").textContent).toContain(
      "different physical camera",
    );
    input("maze-cal-2-camera-index", "1");
    click("cal-start");
    await flush();
    expect(capture().start).toHaveBeenCalledTimes(2);
    expect(get("cal-pair-status").textContent).toContain(
      "Camera 1: floor checks passed",
    );
  });
  it("invalidates both mappings when measured dimensions change", async () => {
    await start();
    measure();
    click("cal-fit");
    await flush();
    input("maze-width", "7.5");
    expect(get("cal-result").textContent).toContain("Repeat both");
    expect(get("cal-pair-status").textContent).toContain(
      "Camera 1: not calibrated",
    );
  });
  it("rejects a late fit response after geometry was invalidated", async () => {
    await start();
    measure();
    let done!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    click("cal-fit");
    input("maze-depth", "9");
    done({
      ok: true,
      json: async () => ({
        schemaVersion: "floor-calibration/v1",
        homography: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        heldOut: { maxErrorM: 0, rmseM: 0 },
      }),
    } as Response);
    await flush();
    expect(get("cal-pair-status").textContent).not.toContain("checks passed");
  });
  it("closing setup requests release and capture loss invalidates the current mapping", async () => {
    await start();
    measure();
    click("cal-fit");
    await flush();
    capture().callbacks.lost();
    expect(get("cal-result").textContent).toContain("invalidated");
    get("pre-game-settings").dispatchEvent(new Event("close"));
    await flush();
    expect(capture().stop).toHaveBeenCalled();
    expect(ui.navigationBlocker).toBeNull();
  });
});
