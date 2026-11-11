import type { GameTarget } from "../../../games/mole-motion/src/index";
import { mapJoint, type Rect } from "../../../packages/motion/src/index";
import { bombArt, moleArt } from "./mole-art";

type PresentedTarget = GameTarget & {
  phase?: "warning" | "active";
  warningMs?: number;
};
interface Outcome {
  id: number;
  x: number;
  y: number;
  kind: "mole" | "bomb";
  outcome: "hit" | "expired";
  points: number;
}

/** Optional phase/outcome fields also accept the pre-arrival game state format. */
export function renderMultiplayerTargets(
  container: HTMLElement,
  targets: readonly PresentedTarget[],
  rect: Rect,
  outcomes: readonly Outcome[] = [],
) {
  while (container.children.length < targets.length) {
    const target = container.ownerDocument.createElement("div");
    target.className = "multiplayer-target";
    container.append(target);
  }
  [...container.children].forEach((child, i) => {
    const target = targets[i],
      element = child as HTMLElement;
    element.hidden = !target;
    if (!target) return;
    const point = mapJoint(target, rect);
    element.dataset.targetId = String(target.id);
    element.dataset.x = String(target.x);
    element.dataset.y = String(target.y);
    element.dataset.phase = target.phase ?? "active";
    if (element.dataset.kind !== target.kind) {
      element.innerHTML = `${target.kind === "bomb" ? bombArt : moleArt}<span class="multiplayer-cue"></span>`;
      element.dataset.kind = target.kind;
    }
    const cue =
      target.phase === "warning"
        ? "READY"
        : target.kind === "bomb"
          ? "AVOID"
          : "HIT";
    element.querySelector("span")!.textContent = cue;
    element.setAttribute("aria-label", `${target.kind}: ${cue.toLowerCase()}`);
    element.style.cssText = `left:${point.x}px;top:${point.y}px;width:${2 * target.radius * rect.width}px;height:${2 * target.radius * rect.height}px`;
  });
  let feedback = container.nextElementSibling as HTMLElement | null;
  if (!feedback?.classList.contains("multiplayer-outcomes")) {
    feedback = container.ownerDocument.createElement("div");
    feedback.className = "multiplayer-outcomes";
    container.after(feedback);
  }
  feedback.replaceChildren(
    ...outcomes.slice(-12).map((outcome) => {
      const element = container.ownerDocument.createElement("span");
      const point = mapJoint(outcome, rect);
      element.className = "multiplayer-outcome";
      element.textContent =
        outcome.outcome === "expired"
          ? outcome.kind === "bomb"
            ? "SAFE"
            : "ESCAPED"
          : `${outcome.points > 0 ? "+" : ""}${outcome.points}`;
      element.style.cssText = `left:${point.x}px;top:${point.y}px`;
      return element;
    }),
  );
}
