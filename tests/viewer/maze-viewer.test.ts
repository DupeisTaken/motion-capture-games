// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountMaze } from "../../apps/mirror/src/maze-viewer";
import type { NavigationOwner } from "../../apps/mirror/src/app-navigation";
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
const dialog = () => get<HTMLDialogElement>("pre-game-settings");
const confirmRound = () => click("confirm-start");
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
  // Happy DOM 21 tests decimal steps with raw %, falsely rejecting even 8 % .01.
  // Keep real required/range/step attributes; compensate this unit-DOM defect only.
  for (const id of ["maze-width", "maze-depth"]) {
    const field = get<HTMLInputElement>(id);
    vi.spyOn(field.validity, "stepMismatch", "get").mockImplementation(() => {
      const steps =
        (field.valueAsNumber - Number(field.min)) / Number(field.step);
      return (
        Number.isFinite(steps) && Math.abs(steps - Math.round(steps)) > 1e-7
      );
    });
  }
});
afterEach(() => {
  workspace.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("virtual maze operator workflow", () => {
  it("exposes the shared departure contract as a callable method", () => {
    const owner: NavigationOwner = workspace;
    expect(typeof owner.navigationBlocker).toBe("function");
    expect(owner.navigationBlocker()).toBeNull();
  });
  it("requires shared setup confirmation before the first round and restores focus on Close or Escape", () => {
    expect(dialog().open).toBe(true);
    expect(document.activeElement).toBe(get("close-settings"));
    expect(
      dialog().querySelector("#video-settings-title")?.textContent,
    ).toContain("Video & input");
    expect(
      dialog().querySelector("#game-settings-title")?.textContent,
    ).toContain("Game settings");
    expect(get("maze-admin").contains(get("maze-config"))).toBe(false);
    click("close-settings");
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe(get("open-settings"));
    expect(status()).not.toContain("running");
    click("maze-start");
    expect(dialog().open).toBe(true);
    dialog().dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe(get("maze-start"));
    click("open-settings");
    confirmRound();
    expect(dialog().open).toBe(false);
    expect(status()).toContain("running");
    expect(document.activeElement).toBe(get("maze-map"));
  });
  it("finishes only on valid goal input and requires New round confirmation to reset", () => {
    const maze = generateMaze({
      widthM: 8,
      depthM: 8,
      difficulty: "medium",
      seed: "quiet-path-01",
      loops: true,
    });
    confirmRound();
    change("maze-quality", "uncertain");
    change("maze-x", String(maze.goal.x));
    change("maze-z", String(maze.goal.z));
    expect(status()).not.toContain("Goal reached");
    change("maze-quality", "ready");
    click("maze-start");
    expect(status()).toContain("Goal reached");
    expect(get<HTMLButtonElement>("maze-start").disabled).toBe(true);
    vi.advanceTimersByTime(300);
    expect(document.querySelector("[data-cue]")!.textContent).toBe(
      "Goal reached",
    );
    expect(document.querySelector("[data-level]")!.textContent).toBe("0");
    click("maze-reset");
    expect(dialog().open).toBe(true);
    click("close-settings");
    expect(status()).toContain("Goal reached");
    expect(Number(get<HTMLInputElement>("maze-x").value)).toBeCloseTo(
      maze.goal.x,
    );
    click("maze-reset");
    confirmRound();
    expect(status()).toContain("running");
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
    confirmRound();
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
    expect(dialog().open).toBe(true);
    expect(get("maze-facing").textContent).toBe("Torso");
    expect(audio.enable).not.toHaveBeenCalled();
    expect(audio.setLevel).not.toHaveBeenCalled();
    confirmRound();
    expect(status()).toContain("running");
    expect(audio.setLevel).not.toHaveBeenCalled();
    expect(
      get<HTMLSelectElement>("maze-source").querySelector<HTMLOptionElement>(
        '[value="physical"]',
      )!.disabled,
    ).toBe(true);
  });
  it("keeps head/torso independent and applies selected direction only after confirmation", () => {
    confirmRound();
    change("maze-head", "90");
    change("maze-torso", "0");
    const torso = get("maze-heading").getAttribute("d");
    click("open-settings");
    change("maze-orientation", "head");
    expect(get("maze-facing").textContent).toBe("Torso");
    click("close-settings");
    click("maze-start");
    expect(get("maze-heading").getAttribute("d")).toBe(torso);
    expect(get("maze-facing").textContent).toBe("Torso");
    click("open-settings");
    expect(get<HTMLSelectElement>("maze-orientation").value).toBe("head");
    confirmRound();
    change("maze-head", "90");
    expect(get("maze-facing").textContent).toBe("Head");
    expect(get("maze-heading").getAttribute("d")).not.toBe(torso);
    change("maze-quality", "head-missing");
    expect(status()).toContain("missing orientation");
    expect(get<HTMLButtonElement>("maze-start").disabled).toBe(true);
    expect(get("maze-avatar").getAttribute("visibility")).toBe("hidden");
    click("open-settings");
    change("maze-orientation", "torso");
    confirmRound();
    expect(get("maze-facing").textContent).toBe("Torso");
    expect(status()).toContain("running");
  });
  it.each(["missing", "uncertain", "stale"])(
    "suspends %s input and never resumes automatically",
    (quality) => {
      confirmRound();
      change("maze-quality", quality);
      expect(status()).toContain("Input unavailable");
      expect(get("maze-x-value").textContent).toBe("—");
      expect(get("maze-z-value").textContent).toBe("—");
      expect(get("maze-y-value").textContent).toBe("—");
      change("maze-quality", "ready");
      expect(get("maze-start").textContent).toContain("Resume");
    },
  );
  it("retains active layout and player through cancelled drafts, invalid confirmation and seed shuffle", () => {
    confirmRound();
    change("maze-x", "3");
    const layout = get("maze-map").innerHTML;
    click("open-settings");
    expect(status()).toContain("Setup open");
    change("maze-width", "4");
    click("maze-shuffle");
    expect(get("maze-map").innerHTML).toBe(layout);
    expect(get<HTMLInputElement>("maze-x").value).toBe("3");
    confirmRound();
    expect(dialog().open).toBe(true);
    expect(document.activeElement).toBe(get("maze-width"));
    expect(get("maze-config-status").textContent).toContain("5–10");
    expect(get("maze-map").innerHTML).toBe(layout);
    click("close-settings");
    expect(status()).toContain("Paused");
    click("maze-start");
    expect(status()).toContain("running");
    click("maze-reset");
    change("maze-width", "5.37");
    change("maze-depth", "9.63");
    change("maze-seed", "");
    confirmRound();
    expect(dialog().open).toBe(true);
    expect(document.activeElement).toBe(get("maze-seed"));
    change("maze-seed", "new-confirmed-seed");
    confirmRound();
    expect(dialog().open).toBe(false);
    expect(get("maze-size").textContent).toBe("5.37 × 9.63 m");
    expect(Number(get<HTMLInputElement>("maze-x").value)).toBeLessThan(1);
    expect(status()).toContain("running");
  });
  it("rejects forged physical input without hiding setup or changing the active maze", () => {
    const layout = get("maze-map").innerHTML;
    change("maze-source", "physical");
    confirmRound();
    expect(dialog().open).toBe(true);
    expect(get("maze-config-status").textContent).toContain(
      "Physical input is unavailable",
    );
    expect(document.activeElement).toBe(get("maze-source"));
    expect(get("maze-map").innerHTML).toBe(layout);
    change("maze-source", "synthetic");
    confirmRound();
    expect(status()).toContain("running");
  });
  it("reopens setup before any confirmed round even when pose input is unavailable", () => {
    click("close-settings");
    change("maze-quality", "missing");
    click("maze-start");
    expect(dialog().open).toBe(true);
    click("close-settings");
    const openWindow = vi.spyOn(window, "open").mockReturnValue(null);
    click("maze-window");
    expect(dialog().open).toBe(true);
    expect(openWindow).not.toHaveBeenCalled();
  });
  it("keeps pending audio activation silent while setup pauses the active round", async () => {
    confirmRound();
    let resolveEnable!: () => void;
    audio.enable.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveEnable = resolve;
      }),
    );
    click("maze-sound");
    click("open-settings");
    audio.enabled = true;
    resolveEnable();
    await Promise.resolve();
    await Promise.resolve();
    expect(dialog().open).toBe(true);
    expect(audio.setLevel).not.toHaveBeenCalled();
    click("close-settings");
    expect(status()).toContain("Paused");
    click("maze-start");
    expect(audio.setLevel).toHaveBeenCalled();
  });
  it("resumes the inline participant display with one focused button and preserves the player", () => {
    confirmRound();
    change("maze-x", "3");
    click("maze-start");
    expect(document.activeElement).toBe(get("maze-start"));
    click("maze-view");
    expect(get("maze-participant").contains(get("maze-resume"))).toBe(true);
    expect(document.activeElement).toBe(get("maze-resume"));
    click("maze-resume");
    expect(status()).toContain("running");
    expect(get<HTMLInputElement>("maze-x").value).toBe("3");
    expect(dialog().open).toBe(false);
    expect(get("maze-resume").hidden).toBe(true);
  });
  it("has a map-free participant preview and an explicit way back", () => {
    click("close-settings");
    click("maze-view");
    expect(get("maze-admin").hidden).toBe(true);
    expect(get("maze-participant").querySelector("svg")).toBeNull();
    expect(document.activeElement).toBe(get("maze-return"));
    click("maze-return");
    expect(get("maze-admin").hidden).toBe(false);
  });
  it("keeps blocked-popup recovery visible across updates", () => {
    confirmRound();
    vi.spyOn(window, "open").mockReturnValue(null);
    click("maze-window");
    vi.advanceTimersByTime(1000);
    expect(document.body.textContent).toContain("window blocked");
    expect(get("maze-start").textContent).not.toBe("Pause");
  });
  it("pauses on blur and survives a persisted back/forward-cache pagehide", () => {
    confirmRound();
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
    confirmRound();
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
    confirmRound();
    click("maze-sound");
    await Promise.resolve();
    await Promise.resolve();
    expect(audio.enable).toHaveBeenCalledOnce();
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
    confirmRound();
    change("maze-head", "45");
    expect(status()).toContain("running");
  });
});
