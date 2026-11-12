// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { MoleGame, TUNING } from "../../games/mole-motion/src/index";
import { renderMoleTargets } from "../../apps/mirror/src/mole-targets";

describe("Mole phase and outcome presentation", () => {
  it("shares contain/mirror geometry and shows non-scoring arrival separately from lifetime", () => {
    const state = new MoleGame().state;
    state.phase = "playing";
    state.targets = [
      {
        id: 1,
        kind: "mole",
        x: 0.25,
        y: 0.4,
        radius: 0.05,
        remainingMs: 4000,
        phase: "warning",
        warningMs: TUNING.targetWarningMs / 2,
      },
    ];
    const slots = Array.from({ length: 3 }, () => {
      const node = document.createElement("div");
      node.innerHTML =
        '<span class="target-cue"></span><progress max="1"></progress>';
      return node;
    });
    const effects = document.createElement("div");
    const rect = { x: 80, y: 20, width: 800, height: 600 };
    renderMoleTargets(slots, effects, state, rect);
    expect(slots[0].style.left).toBe("680px");
    expect(slots[0].style.top).toBe("260px");
    expect(slots[0].style.width).toBe("80px");
    expect(slots[0].dataset.phase).toBe("warning");
    expect(slots[0].textContent).toBe("READY");
    expect(slots[0].querySelector("progress")!.value).toBe(0.5);
    expect(slots[1].hidden).toBe(true);
    state.targets[0].phase = "active";
    state.targets[0].remainingMs = 2000;
    renderMoleTargets(slots, effects, state, rect);
    expect(slots[0].textContent).toBe("HIT");
    expect(slots[0].querySelector("progress")!.value).toBe(0.5);
    state.targets[0].kind = "bomb";
    state.targets[0].phase = "warning";
    renderMoleTargets(slots, effects, state, rect);
    expect(slots[2].textContent).toBe("BOMB SOON");
    expect(slots[2].getAttribute("aria-label")).toBe("bomb: bomb soon");
  });

  it("reconciles each bounded outcome once and clears effects outside active play", () => {
    const state = new MoleGame().state;
    state.phase = "playing";
    state.targetFeedback = [
      {
        id: 1,
        targetId: 1,
        kind: "bomb",
        x: 0.25,
        y: 0.4,
        radius: 0.05,
        outcome: "hit",
        points: -50,
        remainingMs: 500,
      },
      {
        id: 2,
        targetId: 2,
        kind: "mole",
        x: 0.7,
        y: 0.5,
        radius: 0.05,
        outcome: "expired",
        points: 0,
        remainingMs: 500,
      },
    ];
    const effects = document.createElement("div");
    const rect = { x: 0, y: 0, width: 800, height: 600 };
    renderMoleTargets([], effects, state, rect);
    const bomb = effects.firstElementChild;
    renderMoleTargets([], effects, state, rect);
    expect(effects.children).toHaveLength(2);
    expect(effects.firstElementChild).toBe(bomb);
    expect(bomb?.textContent).toBe("−50");
    expect(effects.lastElementChild?.textContent).toBe("ESCAPED");
    state.targetFeedback.shift();
    renderMoleTargets([], effects, state, rect);
    expect(effects.children).toHaveLength(1);
    state.phase = "paused";
    renderMoleTargets([], effects, state, rect);
    expect(effects.children).toHaveLength(0);
  });
});
