// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPreGameSettings,
  preGameSettingsMarkup,
} from "../../apps/mirror/src/pre-game-settings";

let menu: ReturnType<typeof createPreGameSettings>;
let dialog: HTMLDialogElement;
const start = vi.fn();
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;

beforeEach(() => {
  start.mockClear();
  document.body.innerHTML = `<main><button id="open-settings">Settings</button><button id="replay">Replay</button>${preGameSettingsMarkup("Test game", "<p>Game options</p>", "<p>Video options</p>")}</main>`;
  dialog = document.querySelector("dialog")!;
  menu = createPreGameSettings(document.querySelector("main")!, start);
});
afterEach(() => menu.dispose());

describe("pre-game confirmation lifecycle", () => {
  it("opens idempotently, focuses Close and restores the requesting control", () => {
    menu.open(button("replay"));
    menu.open();
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(button("close-settings"));
    button("close-settings").click();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(button("replay"));
    expect(start).not.toHaveBeenCalled();
  });

  it("treats native Escape cancellation as close without starting", () => {
    menu.open();
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(button("open-settings"));
    expect(start).not.toHaveBeenCalled();
  });

  it("ignores hidden confirmation and confirms an open menu only once", () => {
    button("confirm-start").dispatchEvent(new Event("click"));
    expect(start).not.toHaveBeenCalled();
    menu.open();
    button("confirm-start").click();
    button("confirm-start").dispatchEvent(new Event("click"));
    expect(start).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
  });

  it("guards locked opens and forged confirmation until setup is available", () => {
    menu.setLocked(true);
    menu.open();
    expect(dialog.open).toBe(false);
    expect(button("open-settings").disabled).toBe(true);
    button("confirm-start").dispatchEvent(new Event("click"));
    expect(start).not.toHaveBeenCalled();
    menu.setLocked(false);
    menu.open();
    button("confirm-start").click();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("closes and detaches handlers on disposal", () => {
    menu.open();
    menu.dispose();
    expect(dialog.open).toBe(false);
    dialog.showModal();
    button("confirm-start").click();
    expect(start).not.toHaveBeenCalled();
  });

  it("keeps invalid confirmation open and focusable without locking the opener", () => {
    menu.dispose();
    let valid = false;
    const guard = vi.fn(() => {
      button("close-settings").focus();
      return valid;
    });
    menu = createPreGameSettings(document.querySelector("main")!, start, {
      canStart: guard,
    });
    menu.open();
    button("confirm-start").click();
    expect(guard).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(true);
    expect(start).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button("close-settings"));
    button("close-settings").click();
    menu.open();
    valid = true;
    button("confirm-start").click();
    expect(dialog.open).toBe(false);
    expect(start).toHaveBeenCalledOnce();
  });
});
