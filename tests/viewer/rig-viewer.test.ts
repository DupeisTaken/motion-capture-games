// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Window as TestWindow } from "happy-dom";
import { createRigWorkspace } from "../../apps/mirror/src/rig";
import dataset from "../../apps/mirror/src/rig-rehearsal.json";

let workspace: ReturnType<typeof createRigWorkspace>;
const fetchMock = vi.fn();
const acquire = vi.fn();
const websocket = vi.fn();
const displayPreferenceKey = "motion-studio.rig.synthetic-displayed-camera.v1";
const sampleCount = dataset.cases[0].frames.length;
const frameLabel = (sample: number) => `${sample} / ${sampleCount}`;
const cameraA = { id: "a".repeat(64), name: "Reference USB" };
const cameraB = { id: "b".repeat(64), name: "Supporting USB" };
const get = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const click = (id: string) => get<HTMLButtonElement>(id).click();
function change(id: string, value: string) {
  get<HTMLSelectElement>(id).value = value;
  get(id).dispatchEvent(new Event("change", { bubbles: true }));
}
function selectCase(id: string) {
  change("rig-scenario", id);
}
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
function response(cameras: unknown) {
  return { ok: true, json: async () => ({ cameras }) } as Response;
}
function physicalStaysUnavailable() {
  expect(get("rig-physical-state").textContent).toBe(
    "Physical XYZ unavailable",
  );
  expect(get("rig-maze-state").textContent).toBe("Maze input disabled");
  expect(acquire).not.toHaveBeenCalled();
  expect(websocket).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls.every(([url]) => url === "/api/cameras")).toBe(
    true,
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("WebSocket", websocket);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: acquire },
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  fetchMock.mockReset().mockResolvedValue(response([cameraA, cameraB]));
  acquire.mockReset();
  websocket.mockReset();
  window.localStorage.removeItem(displayPreferenceKey);
  document.body.innerHTML = '<div id="rig-test-root"></div>';
  workspace = createRigWorkspace(get("rig-test-root"));
});
afterEach(() => {
  workspace.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("two-view operator workspace", () => {
  it("switches the actual displayed camera without changing roles, source panels or XYZ", () => {
    const primary = dataset.cases[0].frames[0].views[0].cameraId;
    const secondary = dataset.cases[0].frames[0].views[1].cameraId;
    expect(get<HTMLSelectElement>("rig-displayed-camera").value).toBe(primary);
    expect(get("rig-selected-diagram").innerHTML).toBe(
      get("rig-reference-view").innerHTML,
    );
    const invariant = [
      get("rig-space").innerHTML,
      get("rig-x").textContent,
      get("rig-reference-context").textContent,
      get("rig-support-context").textContent,
    ];
    change("rig-displayed-camera", secondary);
    expect(get("rig-selected-diagram").innerHTML).toBe(
      get("rig-support-view").innerHTML,
    );
    expect(get("rig-selected-context").textContent).toContain(secondary);
    expect(get("rig-selected-context").textContent).toContain(
      "synthetic-exposure",
    );
    expect(get("rig-selected-context").textContent).toContain(
      "uncertainty 500000 ns",
    );
    expect([
      get("rig-space").innerHTML,
      get("rig-x").textContent,
      get("rig-reference-context").textContent,
      get("rig-support-context").textContent,
    ]).toEqual(invariant);
    expect(window.localStorage.getItem(displayPreferenceKey)).toBe(secondary);
    selectCase("missing-hip");
    expect(get<HTMLSelectElement>("rig-displayed-camera").value).toBe(
      secondary,
    );
    expect(get("rig-selected-stage").dataset.sourceStatus).toBe("partial");
    expect(get("rig-selected-diagram").hidden).toBe(false);
    physicalStaysUnavailable();
  });
  it("restores a stable display preference on reload and preserves an unavailable choice until recovery", () => {
    const secondary = dataset.cases[0].frames[0].views[1].cameraId;
    change("rig-displayed-camera", secondary);
    workspace.dispose();
    workspace = createRigWorkspace(get("rig-test-root"));
    expect(get<HTMLSelectElement>("rig-displayed-camera").value).toBe(
      secondary,
    );
    workspace.dispose();
    window.localStorage.setItem(
      displayPreferenceKey,
      "saved-camera-not-in-recording",
    );
    workspace = createRigWorkspace(get("rig-test-root"));
    expect(get<HTMLSelectElement>("rig-displayed-camera").value).toBe(
      "saved-camera-not-in-recording",
    );
    expect(get("rig-selected-diagram").children).toHaveLength(0);
    expect(get("rig-selected-unavailable").hidden).toBe(false);
    expect(get("rig-selected-context").textContent).toContain("not replaced");
    change("rig-displayed-camera", secondary);
    expect(get("rig-selected-diagram").innerHTML).toBe(
      get("rig-support-view").innerHTML,
    );
  });
  it("keeps selection usable if browser preference storage is blocked", () => {
    workspace.dispose();
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    workspace = createRigWorkspace(get("rig-test-root"));
    const secondary = dataset.cases[0].frames[0].views[1].cameraId;
    change("rig-displayed-camera", secondary);
    expect(get("rig-selected-stage").dataset.cameraId).toBe(secondary);
    expect(get("rig-display-preference-note").textContent).toContain(
      "this page only",
    );
    expect(get("rig-selected-diagram").children).not.toHaveLength(0);
  });
  it("clears stale displayed geometry while retaining the two diagnostic sources and recovers", () => {
    selectCase("stale-input");
    expect(get("rig-selected-diagram").children).toHaveLength(0);
    expect(get("rig-selected-unavailable").textContent).toContain("stale");
    expect(get("rig-reference-view").querySelector("svg")).not.toBeNull();
    expect(get("rig-support-view").querySelector("svg")).not.toBeNull();
    selectCase("nominal");
    expect(get("rig-selected-diagram").hidden).toBe(false);
    expect(get("rig-selected-unavailable").hidden).toBe(true);
  });
  it("moves one selected stage to a window and keeps choice and samples synchronized before safe return", () => {
    const popup = new TestWindow({ url: location.href }) as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    vi.spyOn(popup, "focus").mockImplementation(() => {});
    vi.spyOn(popup, "close").mockImplementation(() => {});
    const stage = get("rig-selected-stage");
    click("rig-display-window");
    expect(popup.document.getElementById("rig-selected-stage")).toBe(stage);
    expect(document.getElementById("rig-selected-stage")).toBeNull();
    expect(get("rig-reference-view").querySelector("svg")).not.toBeNull();
    const secondary = dataset.cases[0].frames[0].views[1].cameraId;
    change("rig-displayed-camera", secondary);
    click("rig-next");
    expect(
      popup.document.getElementById("rig-selected-stage")?.dataset.cameraId,
    ).toBe(secondary);
    expect(
      popup.document.getElementById("rig-selected-diagram")?.innerHTML,
    ).toBe(get("rig-support-view").innerHTML);
    expect(
      popup.document.getElementById("rig-selected-context")?.textContent,
    ).toContain(`source frame ${dataset.cases[0].frames[1].views[1].frameId}`);
    popup.dispatchEvent(new Event("pagehide"));
    expect(get("rig-selected-stage")).toBe(stage);
    expect(get("rig-display-window").textContent).toBe("Open display window");
    expect(window.open).toHaveBeenCalledOnce();
    physicalStaysUnavailable();
  });
  it("retains inline output when a popup is blocked and closes it on physical planning or disposal", () => {
    const popup = new TestWindow({ url: location.href }) as unknown as Window;
    vi.spyOn(window, "open").mockReturnValueOnce(null).mockReturnValue(popup);
    vi.spyOn(popup, "focus").mockImplementation(() => {});
    vi.spyOn(popup, "close").mockImplementation(() => {});
    const stage = get("rig-selected-stage");
    click("rig-display-window");
    expect(get("rig-selected-stage")).toBe(stage);
    expect(get("rig-display-location").textContent).toContain("blocked");
    click("rig-display-window");
    click("rig-tab-planning");
    expect(popup.close).toHaveBeenCalledOnce();
    expect(get("rig-selected-stage")).toBe(stage);
    expect(stage.hidden).toBe(true);
    expect(document.activeElement).toBe(get("rig-tab-planning"));
    const calls = vi.mocked(window.open).mock.calls.length;
    get("rig-display-window").dispatchEvent(new Event("click"));
    expect(window.open).toHaveBeenCalledTimes(calls);
    click("rig-tab-rehearsal");
    expect(stage.hidden).toBe(false);
    click("rig-display-window");
    workspace.dispose();
    expect(popup.close).toHaveBeenCalledTimes(2);
    expect(get("rig-selected-stage")).toBe(stage);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("starts with bounded synthetic samples and no device or capture request", () => {
    expect(get("rig-space").closest("section")?.nextElementSibling?.id).toBe(
      "rig-view-pair",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(get<HTMLSelectElement>("rig-scenario").options.length).toBe(
      dataset.cases.length,
    );
    expect(get("rig-frame-label").textContent).toBe(frameLabel(1));
    expect(get("rig-root-state").textContent).toContain("Both hips accepted");
    expect(get("rig-x").textContent).not.toBe("Unavailable");
    expect(
      get("rig-reference-view")
        .querySelector("svg")
        ?.getAttribute("aria-label"),
    ).toContain("unmirrored");
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map(
      (element) => element.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    physicalStaysUnavailable();
  });
  it("removes previous root coordinates and estimate markers on missing, identity and stale cases", () => {
    for (const [id, reason] of [
      ["missing-hip", "Missing joint"],
      ["uncertain-identity", "identity"],
      ["stale-input", "stale"],
    ]) {
      selectCase("nominal");
      expect(get("rig-x").textContent).not.toBe("Unavailable");
      selectCase(id);
      expect(get("rig-x").textContent).toBe("Unavailable");
      expect(get("rig-y").textContent).toBe("Unavailable");
      expect(get("rig-z").textContent).toBe("Unavailable");
      expect(get("rig-reference-x").textContent).not.toBe("Unavailable");
      expect(
        get("rig-space").querySelector('circle[fill="#235ac4"]'),
      ).toBeNull();
      expect(get("rig-quality").textContent?.toLowerCase()).toContain(
        reason.toLowerCase(),
      );
      if (id === "missing-hip") {
        expect(get("rig-quality").textContent).toContain("Left hip");
        expect(get("rig-joint-details").hidden).toBe(true);
      }
    }
    physicalStaysUnavailable();
  });
  it("keeps biased accepted estimates separate from synthetic reference truth", () => {
    selectCase("scale-bias");
    expect(get("rig-z").textContent).not.toBe(
      get("rig-reference-z").textContent,
    );
    expect(
      parseFloat(get("rig-reference-difference").textContent!),
    ).toBeGreaterThan(10);
    expect(get("rig-scenario-risk").textContent?.toLowerCase()).toMatch(
      /scale|bias|calibration/,
    );
    physicalStaysUnavailable();
  });
  it("offers named wrist and hip reasons in a collapsed list for a pair-wide rejection", () => {
    selectCase("exposure-skew");
    expect(get("rig-x").textContent).toBe("Unavailable");
    const details = get<HTMLDetailsElement>("rig-joint-details");
    expect(details.hidden).toBe(false);
    expect(details.open).toBe(false);
    details.open = true;
    const items = [...get("rig-rejected-joints").querySelectorAll("li")].map(
      (item) => item.textContent,
    );
    expect(items).toHaveLength(17);
    expect(items).toContain("Left wrist — Exposure pair is too far apart");
    expect(items).toContain("Left hip — Exposure pair is too far apart");
    selectCase("nominal");
    expect(details.hidden).toBe(true);
    expect(details.open).toBe(false);
    expect(get("rig-rejected-joints").children).toHaveLength(0);
  });
  it.each([-0.0004, -0.0000001])(
    "displays a root X of %s without a negative sign after rounding to zero",
    (x) => {
      workspace.dispose();
      const input = structuredClone(dataset);
      const sample = input.cases[0].frames[0];
      const shift = x - sample.reconstruction.root!.x;
      sample.reconstruction.root!.x = x;
      for (const joint of sample.reconstruction.joints)
        if (joint.name === "left_hip" || joint.name === "right_hip")
          joint.x = joint.x! + shift;
      workspace = createRigWorkspace(get("rig-test-root"), input);
      expect(get("rig-load-error").hidden).toBe(true);
      expect(get("rig-x").textContent).toBe("0.000");
      expect(get("rig-reference-x").textContent).toBe("0.000");
    },
  );
  it("keeps camera and display labels separate when the weak-baseline markers nearly coincide", () => {
    selectCase("weak-geometry");
    const svg = get("rig-space").querySelector("svg")!;
    const label = (text: string) =>
      [...svg.querySelectorAll("text")].find(
        (node) => node.textContent === text,
      )!;
    const primary = label("Reference");
    const secondary = label("Supporting");
    const display = label("Display / floor origin");
    expect(
      Number(secondary.getAttribute("x")) - Number(primary.getAttribute("x")),
    ).toBeGreaterThan(250);
    expect(
      Math.abs(
        Number(primary.getAttribute("y")) - Number(display.getAttribute("y")),
      ),
    ).toBeGreaterThanOrEqual(15);
    const markers = [...svg.querySelectorAll('rect[fill="#536a89"]')];
    expect(markers).toHaveLength(2);
    expect(
      Math.abs(
        Number(markers[0].getAttribute("x")) -
          Number(markers[1].getAttribute("x")),
      ),
    ).toBeLessThan(10);
  });
  it("steps through samples with keyboard, scrubs, resets and stops at the recording end", () => {
    get("rig-view-pair").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(get("rig-frame-label").textContent).toBe(frameLabel(2));
    get<HTMLInputElement>("rig-frame").value = String(sampleCount - 2);
    get("rig-frame").dispatchEvent(new Event("input"));
    expect(get("rig-frame-label").textContent).toBe(
      frameLabel(sampleCount - 1),
    );
    get("rig-view-pair").dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    vi.advanceTimersByTime(1000);
    expect(get("rig-frame-label").textContent).toBe(frameLabel(sampleCount));
    expect(get("rig-play").textContent).toBe("Play samples");
    expect(get<HTMLButtonElement>("rig-next").disabled).toBe(true);
    click("rig-reset");
    expect(get("rig-frame-label").textContent).toBe(frameLabel(1));
  });
  it("pauses on visibility loss, scenario changes and mode switches with accurate origin labels", () => {
    click("rig-play");
    vi.advanceTimersByTime(250);
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    const at = get("rig-frame-label").textContent;
    vi.advanceTimersByTime(1000);
    expect(get("rig-frame-label").textContent).toBe(at);
    expect(get("rig-play").textContent).toBe("Play samples");
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    click("rig-play");
    selectCase("missing-hip");
    vi.advanceTimersByTime(1000);
    expect(get("rig-frame-label").textContent).toBe(frameLabel(1));
    click("rig-play");
    click("rig-tab-planning");
    vi.advanceTimersByTime(1000);
    expect(get("rig-rehearsal").hidden).toBe(true);
    expect(get("rig-planning").hidden).toBe(false);
    expect(get("rig-play").textContent).toBe("Play samples");
    expect(
      [...document.querySelectorAll(".rig-origin-badge")].every(
        (badge) => badge.textContent === "Physical planning · no capture",
      ),
    ).toBe(true);
    get("rig-tab-planning").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    );
    expect(get("rig-tab-rehearsal").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(get("rig-tab-rehearsal"));
    expect(
      [...document.querySelectorAll(".rig-origin-badge")].every(
        (badge) => badge.textContent === "Synthetic rehearsal",
      ),
    ).toBe(true);
    physicalStaysUnavailable();
  });
  it("discovers metadata only on explicit refresh and rejects duplicate roles", async () => {
    click("rig-tab-planning");
    expect(fetchMock).not.toHaveBeenCalled();
    click("reference-refresh-cameras");
    click("support-refresh-cameras");
    await flush();
    change("reference-camera-choice", cameraA.id);
    change("support-camera-choice", cameraA.id);
    expect(get("rig-plan-result").textContent).toMatch(/different devices/);
    change("support-camera-choice", cameraB.id);
    get<HTMLTextAreaElement>("rig-calibration-notes").value =
      "Operator note; calibration has not been measured.";
    get("rig-plan-form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(get("rig-plan-result").textContent).toMatch(
      /Two distinct device roles recorded/,
    );
    expect(get<HTMLTextAreaElement>("rig-calibration-notes").maxLength).toBe(
      1000,
    );
    expect(get("rig-plan-result").textContent).toContain("remain unverified");
    physicalStaysUnavailable();
  });
  it("retains role identities through reordered discovery and clears disconnected devices", async () => {
    click("rig-tab-planning");
    click("reference-refresh-cameras");
    click("support-refresh-cameras");
    await flush();
    change("reference-camera-choice", cameraA.id);
    change("support-camera-choice", cameraB.id);
    fetchMock.mockResolvedValue(response([cameraB, cameraA]));
    click("reference-refresh-cameras");
    click("support-refresh-cameras");
    await flush();
    expect(get<HTMLSelectElement>("reference-camera-choice").value).toBe(
      cameraA.id,
    );
    expect(get<HTMLSelectElement>("support-camera-choice").value).toBe(
      cameraB.id,
    );
    fetchMock.mockResolvedValue(response([cameraA]));
    click("support-refresh-cameras");
    await flush();
    expect(get<HTMLSelectElement>("support-camera-choice").value).toBe("");
    expect(get("rig-plan-result").textContent).toContain(
      "Choose a device for each camera role",
    );
    physicalStaysUnavailable();
  });
  it("does not assert distinct physical devices from manual or mixed aliases", async () => {
    click("rig-tab-planning");
    change("reference-camera-choice", "manual");
    change("support-camera-choice", "manual");
    expect(get("rig-plan-result").textContent).toContain("different devices");
    expect(get("rig-plan-result").textContent).toContain("do not establish");
    click("reference-refresh-cameras");
    await flush();
    change("reference-camera-choice", cameraA.id);
    expect(get("rig-plan-result").textContent).toContain("do not establish");
    expect(get("rig-plan-result").textContent).not.toContain(
      "Two distinct device roles recorded",
    );
    physicalStaysUnavailable();
  });
  it("disposes playback, listeners and pending metadata discovery on ordinary pagehide", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    });
    click("reference-refresh-cameras");
    click("rig-play");
    vi.advanceTimersByTime(250);
    window.dispatchEvent(new Event("pagehide"));
    expect(signal?.aborted).toBe(true);
    const at = get("rig-frame-label").textContent;
    vi.advanceTimersByTime(1000);
    click("rig-next");
    expect(get("rig-frame-label").textContent).toBe(at);
    workspace.dispose();
  });
  it("pauses a cached page without destroying controls needed on restoration", () => {
    click("rig-play");
    const pagehide = new Event("pagehide");
    Object.defineProperty(pagehide, "persisted", { value: true });
    window.dispatchEvent(pagehide);
    vi.advanceTimersByTime(1000);
    expect(get("rig-frame-label").textContent).toBe(frameLabel(1));
    click("rig-next");
    expect(get("rig-frame-label").textContent).toBe(frameLabel(2));
  });
  it("fails closed on malformed local rehearsal data while keeping capture unavailable", () => {
    workspace.dispose();
    workspace = createRigWorkspace(get("rig-test-root"), {
      ...dataset,
      origin: "live-camera",
    });
    expect(get("rig-load-error").hidden).toBe(false);
    expect(get("rig-load-error").textContent).toContain(
      "Rehearsal data unavailable",
    );
    expect(get<HTMLButtonElement>("rig-play").disabled).toBe(true);
    expect(get<HTMLButtonElement>("rig-next").disabled).toBe(true);
    physicalStaysUnavailable();
  });
});
