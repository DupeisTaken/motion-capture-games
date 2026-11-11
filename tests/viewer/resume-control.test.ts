// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Window as TestWindow } from "happy-dom";
import { createResumeControl } from "../../apps/mirror/src/resume-control";

afterEach(() => document.body.replaceChildren());

function mount() {
  document.body.innerHTML =
    '<div tabindex="0"><button hidden>Resume</button></div><button id="other">Other</button>';
  const stage = document.querySelector("div")!;
  const button = stage.querySelector("button")!;
  const abort = new AbortController();
  const control = createResumeControl(button, stage, abort.signal);
  return { stage, button, abort, control };
}

describe("one-press resume focus and input", () => {
  it("offers focus once, respects deliberate navigation, and returns focus to play", () => {
    const { stage, button, control } = mount();
    button.hidden = false;
    control.update();
    expect(document.activeElement).toBe(button);
    document.getElementById("other")!.focus();
    control.update();
    expect(document.activeElement?.id).toBe("other");
    button.focus();
    button.hidden = true;
    control.update();
    expect(document.activeElement).toBe(stage);
  });

  it("waits for availability without disturbing unrelated focus", () => {
    const { button, control } = mount();
    button.hidden = false;
    button.focus();
    control.update(false);
    expect(document.activeElement).toBe(button);
    button.disabled = true;
    control.update();
    document.getElementById("other")!.focus();
    button.disabled = false;
    control.update();
    expect(document.activeElement).toBe(button);
  });

  it("isolates pointer and keyboard activation from gameplay and cleans up listeners", () => {
    const { stage, button, control, abort } = mount();
    button.hidden = false;
    control.update();
    const movement = vi.fn();
    for (const name of [
      "pointerdown",
      "pointermove",
      "click",
      "keydown",
      "keyup",
    ])
      stage.addEventListener(name, movement);
    const resume = vi.fn();
    button.addEventListener("click", resume);
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    button.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    button.dispatchEvent(
      new KeyboardEvent("keyup", { key: " ", bubbles: true }),
    );
    button.click();
    expect(movement).not.toHaveBeenCalled();
    expect(resume).toHaveBeenCalledOnce();
    abort.abort();
    button.click();
    expect(movement).toHaveBeenCalledOnce();
  });

  it("uses the current document after reparenting and blocks held keys from that window", () => {
    const { stage, button, control } = mount();
    const popup = new TestWindow();
    popup.document.body.append(stage as never);
    button.hidden = false;
    control.update();
    expect(popup.document.activeElement).toBe(button);
    const held = new popup.KeyboardEvent("keydown", {
      key: "Enter",
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(held as never);
    expect(held.defaultPrevented).toBe(true);
    void popup.happyDOM.close();
  });

  it("preserves Tab navigation and Escape handling in the display window", () => {
    const { stage, button } = mount();
    const navigate = vi.fn();
    stage.addEventListener("keydown", navigate);
    for (const key of ["Tab", "Escape"])
      button.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});
