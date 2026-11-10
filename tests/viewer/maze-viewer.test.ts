// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountMaze } from "../../apps/mirror/src/maze-viewer";
import { generateMaze } from "../../games/virtual-maze/src/index";

const audio = vi.hoisted(() => ({
  enabled: false,
  enable: vi.fn(),
  silence: vi.fn(),
  setLevel: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("../../apps/mirror/src/maze-audio", () => ({
  MazeAudio: class {
    get enabled() {
      return audio.enabled;
    }
    enable() {
      return audio.enable();
    }
    silence() {
      audio.silence();
    }
    setLevel(level: number, volume: number) {
      audio.setLevel(level, volume);
    }
    dispose() {
      audio.dispose();
    }
  },
}));
let workspace: ReturnType<typeof mountMaze>;
const get = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const click = (id: string) => get<HTMLButtonElement>(id).click();
function change(id: string, value: string) {
  get<HTMLInputElement>(id).value = value;
  get(id).dispatchEvent(new Event("input", { bubbles: true }));
}
const status = () => get("maze-session-status").textContent;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  audio.enabled = false;
  audio.enable.mockImplementation(async () => {
    audio.enabled = true;
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
  document.body.innerHTML = '<div id="root"></div>';
  workspace = mountMaze(get("root"));
});
afterEach(() => {
  workspace.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("virtual maze operator workflow", () => {
  it("finishes only on valid goal input, silences output and resets for another rehearsal", () => {
    const maze = generateMaze({
      widthM: 8,
      depthM: 8,
      difficulty: "medium",
      seed: "quiet-path-01",
      loops: true,
    });
    change("maze-x", String(maze.goal.x));
    change("maze-z", String(maze.goal.z));
    change("maze-quality", "uncertain");
    click("maze-start");
    expect(status()).not.toContain("Goal reached");
    change("maze-quality", "ready");
    click("maze-start");
    expect(status()).toContain("Goal reached");
    expect(get<HTMLButtonElement>("maze-start").disabled).toBe(true);
    expect(document.querySelector("[data-cue]")!.textContent).toBe(
      "Goal reached",
    );
    vi.advanceTimersByTime(300);
    expect(document.querySelector("[data-cue]")!.textContent).toBe(
      "Goal reached",
    );
    expect(document.querySelector("[data-level]")!.textContent).toBe("0");
    click("maze-reset");
    expect(status()).toContain("Ready for rehearsal");
    expect(get<HTMLButtonElement>("maze-start").disabled).toBe(false);
    expect(Number(get<HTMLInputElement>("maze-x").value)).toBeCloseTo(
      maze.start.x,
    );
  });
  it("guards pending audio activation when the workspace is disposed", async () => {
    let resolveEnable!: () => void;
    audio.enable.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveEnable = resolve;
      }),
    );
    click("maze-sound");
    expect(get<HTMLButtonElement>("maze-sound").disabled).toBe(true);
    workspace.dispose();
    const before = get("maze-audio-status").textContent;
    audio.enabled = true;
    resolveEnable();
    await Promise.resolve();
    await Promise.resolve();
    expect(get("maze-audio-status").textContent).toBe(before);
    expect(audio.setLevel).not.toHaveBeenCalled();
    expect(audio.dispose).toHaveBeenCalledOnce();
  });
  it("clears photo labels on replacement, rejects stale decode callbacks and releases failed images", () => {
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:synthetic-1")
      .mockReturnValueOnce("blob:synthetic-2");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const photo = get<HTMLInputElement>("maze-photo");
    const image = get<HTMLImageElement>("maze-photo-image");
    const loadFile = (name: string) => {
      Object.defineProperty(photo, "files", {
        configurable: true,
        value: [new File(["synthetic"], name, { type: "image/png" })],
      });
      photo.dispatchEvent(new Event("change"));
    };
    loadFile("first.png");
    const firstLoad = image.onload!;
    image.dispatchEvent(new Event("load"));
    change("maze-photo-x", "10");
    change("maze-photo-y", "90");
    click("maze-photo-add");
    expect(get("maze-photo-corners").textContent).toContain("10");
    loadFile("second.png");
    expect(revoke).toHaveBeenCalledWith("blob:synthetic-1");
    firstLoad.call(image, new Event("load"));
    expect(get("maze-photo-zone").hidden).toBe(true);
    image.dispatchEvent(new Event("error"));
    expect(get("maze-photo-status").textContent).toContain(
      "could not be decoded",
    );
    expect(revoke).toHaveBeenCalledWith("blob:synthetic-2");
    expect(create).toHaveBeenCalledTimes(2);
    expect(get("maze-photo-corners").textContent).not.toContain("10%");
  });
  it("updates live status only when its content changes", () => {
    click("maze-start");
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) =>
      changes.push(...records),
    );
    observer.observe(get("maze-session-status"), {
      childList: true,
      subtree: true,
      characterData: true,
    });
    vi.advanceTimersByTime(1000);
    expect(observer.takeRecords()).toHaveLength(0);
    expect(changes).toHaveLength(0);
    observer.disconnect();
  });
  it("opens no cameras or network and requires explicit start and audio", () => {
    expect(status()).toContain("Ready for rehearsal");
    expect(get("maze-facing").textContent).toBe("Torso");
    expect(audio.enable).not.toHaveBeenCalled();
    expect(audio.setLevel).not.toHaveBeenCalled();
    click("maze-start");
    expect(status()).toContain("running");
    expect(audio.setLevel).not.toHaveBeenCalled();
  });
  it("keeps head/torso independent and requires explicit resume after selected direction loss", () => {
    change("maze-head", "90");
    change("maze-torso", "0");
    click("maze-start");
    const torso = get("maze-heading").getAttribute("d");
    change("maze-orientation", "head");
    expect(get("maze-heading").getAttribute("d")).not.toBe(torso);
    expect(get("maze-facing").textContent).toBe("Head");
    change("maze-quality", "head-missing");
    expect(status()).toContain("missing orientation");
    expect(get<HTMLButtonElement>("maze-start").disabled).toBe(true);
    expect(get("maze-avatar").getAttribute("visibility")).toBe("hidden");
    change("maze-orientation", "torso");
    expect(get<HTMLButtonElement>("maze-start").disabled).toBe(false);
    expect(get("maze-start").textContent).toContain("Resume");
    expect(document.querySelector("[data-level]")!.textContent).toBe("0");
    click("maze-start");
    expect(status()).toContain("running");
  });
  it.each(["missing", "uncertain", "stale"])(
    "suspends %s input and never resumes automatically",
    (quality) => {
      click("maze-start");
      change("maze-quality", quality);
      expect(status()).toContain("Input unavailable");
      expect(get("maze-x-value").textContent).toBe("—");
      expect(get("maze-z-value").textContent).toBe("—");
      expect(get("maze-y-value").textContent).toBe("—");
      change("maze-quality", "ready");
      expect(get("maze-start").textContent).toContain("Resume");
    },
  );
  it("pauses for generation settings, retains a valid maze after invalid dimensions and resets deliberately", () => {
    click("maze-start");
    change("maze-width", "4");
    expect(get<HTMLButtonElement>("maze-start").disabled).toBe(true);
    get("maze-config").dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true }),
    );
    expect(get("maze-config-status").textContent).toContain("between 5 and 10");
    expect(get("maze-map").querySelectorAll("path").length).toBeGreaterThan(0);
    change("maze-width", "5");
    change("maze-depth", "10");
    get("maze-config").dispatchEvent(
      new Event("submit", { cancelable: true, bubbles: true }),
    );
    expect(get("maze-size").textContent).toBe("5 × 10 m");
    expect(get("maze-start").textContent).toBe("Start rehearsal");
    change("maze-x", "3");
    click("maze-reset");
    expect(Number(get<HTMLInputElement>("maze-x").value)).toBeLessThan(1);
  });
  it("has a map-free participant preview and an explicit way back", () => {
    click("maze-view");
    expect(get("maze-admin").hidden).toBe(true);
    expect(get("maze-participant").querySelector("svg")).toBeNull();
    expect(document.activeElement).toBe(get("maze-return"));
    click("maze-return");
    expect(get("maze-admin").hidden).toBe(false);
  });
  it("keeps blocked-popup recovery visible across updates", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    click("maze-window");
    vi.advanceTimersByTime(1000);
    expect(document.body.textContent).toContain("window blocked");
    expect(get("maze-start").textContent).not.toBe("Pause");
  });
  it("pauses on blur and survives a persisted back/forward-cache pagehide", () => {
    click("maze-start");
    window.dispatchEvent(new Event("blur"));
    expect(get("maze-start").textContent).toContain("Resume");
    click("maze-start");
    const pagehide = new Event("pagehide");
    Object.defineProperty(pagehide, "persisted", { value: true });
    window.dispatchEvent(pagehide);
    expect(audio.dispose).not.toHaveBeenCalled();
    click("maze-start");
    expect(status()).toContain("running");
    vi.advanceTimersByTime(200);
    expect(status()).toContain("running");
  });
  it("pauses when hidden and stops listeners/timers on final disposal", () => {
    click("maze-start");
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(get("maze-start").textContent).toContain("Resume");
    workspace.dispose();
    const before = status();
    click("maze-start");
    vi.advanceTimersByTime(1000);
    expect(status()).toBe(before);
    expect(audio.dispose).toHaveBeenCalledOnce();
  });
  it("requires audio activation and recovers browser-suspended audio in one action", async () => {
    click("maze-sound");
    await Promise.resolve();
    await Promise.resolve();
    expect(audio.enable).toHaveBeenCalledOnce();
    click("maze-start");
    expect(audio.setLevel).toHaveBeenCalled();
    audio.enabled = false;
    vi.advanceTimersByTime(100);
    expect(get("maze-sound").textContent).toBe("Retry sound");
    click("maze-sound");
    await Promise.resolve();
    await Promise.resolve();
    expect(audio.enable).toHaveBeenCalledTimes(2);
    click("maze-sound");
    expect(get("maze-audio-status").textContent).toContain("Sound off");
  });
  it("keeps rapid same-clock synthetic edits ready without weakening the input gate", () => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    change("maze-head", "20");
    change("maze-head", "30");
    change("maze-torso", "40");
    click("maze-start");
    change("maze-head", "45");
    expect(status()).toContain("running");
  });
});
