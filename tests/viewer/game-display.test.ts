// @vitest-environment happy-dom
import { Window as TestWindow } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameDisplay } from "../../apps/mirror/src/game-display";

let popup: Window;
let stage: HTMLElement;
let display: ReturnType<typeof createGameDisplay>;
const changed = vi.fn();

beforeEach(() => {
  document.body.innerHTML =
    '<main><button id="open">Open</button><section id="stage" tabindex="0"><canvas></canvas><p>Score 120</p></section><p id="after">After</p></main>';
  document.head.innerHTML =
    '<style>.game {color:red}</style><link rel="stylesheet">';
  popup = new TestWindow({ url: "http://localhost/" }) as unknown as Window;
  vi.spyOn(window, "open").mockReturnValue(popup);
  vi.spyOn(popup, "focus").mockImplementation(() => {});
  vi.spyOn(popup, "close").mockImplementation(() => {});
  stage = document.getElementById("stage")!;
  display = createGameDisplay(stage, {
    title: "Synthetic game",
    onStateChange: changed,
  });
});
afterEach(() => {
  display.dispose();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe("single-owner game window", () => {
  it("moves the same live canvas/HUD, carries styles and restores DOM order and focus", () => {
    const opener = document.getElementById("open")!;
    opener.focus();
    const canvas = stage.querySelector("canvas");
    const pointer = vi.fn();
    stage.addEventListener("pointerdown", pointer);
    expect(display.open()).toBe(true);
    expect(popup.document.querySelector("canvas")).toBe(canvas);
    expect(popup.document.body.textContent).toContain("Score 120");
    expect(
      popup.document.querySelectorAll('style,link[rel="stylesheet"]'),
    ).toHaveLength(2);
    expect(
      popup.document.querySelector('meta[name="viewport"]'),
    ).not.toBeNull();
    stage.dispatchEvent(new Event("pointerdown"));
    expect(pointer).toHaveBeenCalledOnce();
    expect(document.querySelector(".game-display-placeholder")).not.toBeNull();
    display.close();
    expect(stage.nextElementSibling?.id).toBe("after");
    expect(document.activeElement).toBe(opener);
    expect(changed.mock.calls.map(([open]) => open)).toEqual([true, false]);
  });
  it("leaves stage and controls intact when popups are blocked, and reuses an open window", () => {
    vi.mocked(window.open).mockReturnValueOnce(null);
    expect(display.open()).toBe(false);
    expect(stage.parentElement?.tagName).toBe("MAIN");
    expect(display.open()).toBe(true);
    display.open();
    expect(window.open).toHaveBeenCalledTimes(2);
    expect(popup.focus).toHaveBeenCalledOnce();
  });
  it("restores the stage on popup close or Escape without changing its contents", () => {
    display.open();
    popup.dispatchEvent(new Event("pagehide"));
    expect(stage.ownerDocument).toBe(document);
    expect(display.isOpen).toBe(false);
    display.open();
    popup.document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape" }),
    );
    expect(stage.ownerDocument).toBe(document);
    expect(stage.textContent).toBe("Score 120");
  });
  it("migrates exactly one tick interval to the play window and back", () => {
    const hostSet = vi
      .spyOn(window as Window, "setInterval")
      .mockReturnValue(1);
    const hostClear = vi
      .spyOn(window, "clearInterval")
      .mockImplementation(() => {});
    const popupSet = vi.spyOn(popup, "setInterval").mockReturnValue(2);
    const popupClear = vi
      .spyOn(popup, "clearInterval")
      .mockImplementation(() => {});
    const tick = vi.fn();
    const stop = display.startTicker(tick);
    expect(hostSet).toHaveBeenCalledWith(tick, 50);
    display.open();
    expect(hostClear).toHaveBeenCalledWith(1);
    expect(popupSet).toHaveBeenCalledWith(tick, 50);
    display.close();
    expect(popupClear).toHaveBeenCalledWith(2);
    expect(hostSet).toHaveBeenCalledTimes(2);
    stop();
  });
  it("provides fullscreen fallback when the API is absent and stops reopening after disposal", () => {
    display.open();
    Object.defineProperty(stage, "requestFullscreen", {
      value: undefined,
      configurable: true,
    });
    popup.document.querySelector("button")!.click();
    expect(popup.document.querySelector("button")!.textContent).toBe(
      "Use window maximize",
    );
    display.dispose();
    expect(display.open()).toBe(false);
    expect(stage.ownerDocument).toBe(document);
  });
});
