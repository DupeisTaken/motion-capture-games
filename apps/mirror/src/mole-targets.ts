import { TUNING, type GameState } from "../../../games/mole-motion/src/index";
import { mapJoint, type Rect } from "../../../packages/motion/src/index";

/** Paint game-owned phases/outcomes in the same source rectangle as contacts. */
export function renderMoleTargets(
  slots: readonly HTMLElement[],
  effects: HTMLElement,
  state: GameState,
  rect: Rect,
): void {
  const moles = state.targets.filter((target) => target.kind === "mole");
  const targets = [
    moles[0],
    moles[1],
    state.targets.find((t) => t.kind === "bomb"),
  ];
  const lifetime = TUNING[state.options.difficulty].lifetimeMs;
  slots.forEach((element, index) => {
    const target = targets[index];
    element.hidden = !target || state.phase !== "playing";
    if (element.hidden || !target) return;
    const point = mapJoint(target, rect);
    element.dataset.targetId = String(target.id);
    element.dataset.phase = target.phase ?? "active";
    element.style.left = `${point.x}px`;
    element.style.top = `${point.y}px`;
    element.style.width = `${target.radius * 2 * rect.width}px`;
    element.style.height = `${target.radius * 2 * rect.height}px`;
    const warning = target.phase === "warning";
    const label = element.querySelector<HTMLElement>(".target-cue")!;
    label.textContent = warning
      ? target.kind === "bomb"
        ? "BOMB SOON"
        : "READY"
      : target.kind === "bomb"
        ? "AVOID"
        : "HIT";
    element.setAttribute(
      "aria-label",
      `${target.kind}: ${label.textContent.toLowerCase()}`,
    );
    const progress = element.querySelector("progress")!;
    progress.value = warning
      ? 1 - (target.warningMs ?? 0) / TUNING.targetWarningMs
      : target.remainingMs / lifetime;
    progress.setAttribute(
      "aria-label",
      warning ? "Arrival progress" : "Time remaining",
    );
  });
  const events = state.phase === "playing" ? (state.targetFeedback ?? []) : [];
  // Reconcile bounded engine events; render ticks never manufacture game outcomes.
  const ids = new Set(events.map((event) => String(event.id)));
  for (const child of [...effects.children])
    if (!ids.has((child as HTMLElement).dataset.eventId!)) child.remove();
  for (const event of events) {
    let element = effects.querySelector<HTMLElement>(
      `[data-event-id="${event.id}"]`,
    );
    if (!element) {
      element = effects.ownerDocument.createElement("div");
      element.dataset.eventId = String(event.id);
      element.className = `target-outcome ${event.kind} ${event.outcome}`;
      element.textContent =
        event.outcome === "expired"
          ? event.kind === "bomb"
            ? "SAFE"
            : "ESCAPED"
          : event.kind === "bomb"
            ? `−${TUNING.bombPenalty}`
            : `+${event.points}`;
      effects.append(element);
    }
    const point = mapJoint(event, rect);
    element.style.left = `${point.x}px`;
    element.style.top = `${point.y}px`;
    element.style.width = `${event.radius * 2 * rect.width}px`;
    element.style.height = `${event.radius * 2 * rect.height}px`;
  }
}
