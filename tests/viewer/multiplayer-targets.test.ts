// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderMultiplayerTargets } from "../../apps/mirror/src/multiplayer-targets";

describe("multiplayer target presentation across game versions", () => {
  it("labels legacy active targets and v4 non-scoring arrival distinctly", () => {
    const stage = document.createElement("div");
    const container = document.createElement("div");
    stage.append(container);
    const target = {
      id: 1,
      kind: "mole" as const,
      x: 0.3,
      y: 0.5,
      radius: 0.06,
      remainingMs: 4000,
    };
    const rect = { x: 10, y: 20, width: 400, height: 250 };
    renderMultiplayerTargets(container, [target], rect);
    const element = container.firstElementChild as HTMLElement;
    expect(element.dataset.phase).toBe("active");
    expect(element.getAttribute("aria-label")).toBe("mole: hit");
    expect(element.style.left).toBe("290px");
    renderMultiplayerTargets(
      container,
      [{ ...target, phase: "warning", warningMs: 300 }],
      rect,
    );
    expect(element.dataset.phase).toBe("warning");
    expect(element.textContent).toContain("READY");
    expect(element.getAttribute("aria-label")).toBe("mole: ready");
    renderMultiplayerTargets(
      container,
      [{ ...target, kind: "bomb", phase: "warning", warningMs: 300 }],
      rect,
    );
    expect(element.dataset.phase).toBe("warning");
    expect(element.querySelector(".multiplayer-cue")?.textContent).toBe(
      "BOMB SOON",
    );
    expect(element.getAttribute("aria-label")).toBe("bomb: bomb soon");
    renderMultiplayerTargets(
      container,
      [{ ...target, kind: "bomb", phase: "active" }],
      rect,
      [{ id: 1, x: 0.3, y: 0.5, kind: "mole", outcome: "hit", points: 100 }],
    );
    expect(element.textContent).toContain("AVOID");
    expect(element.getAttribute("aria-label")).toBe("bomb: avoid");
    expect(stage.querySelector(".multiplayer-outcome")?.textContent).toBe(
      "+100",
    );
    renderMultiplayerTargets(container, [{ ...target, kind: "bomb" }], rect);
    expect(element.dataset.phase).toBe("active");
    expect(element.querySelector(".multiplayer-cue")?.textContent).toBe(
      "AVOID",
    );
    expect(element.getAttribute("aria-label")).toBe("bomb: avoid");
    renderMultiplayerTargets(container, [], rect);
    expect(element.hidden).toBe(true);
    expect(stage.querySelector(".multiplayer-outcome")).toBeNull();
  });
});
