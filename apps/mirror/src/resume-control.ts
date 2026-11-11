import "./resume-control.css";

/** Keep the one-step action with its stage, including after a window transfer. */
export function createResumeControl(
  button: HTMLButtonElement,
  stage: HTMLElement,
  signal: AbortSignal,
) {
  let offered = false;
  button.classList.add("game-resume");
  // Stage listeners interpret these same events as movement or push input.
  for (const name of [
    "pointerdown",
    "pointermove",
    "click",
    "keydown",
    "keyup",
  ])
    button.addEventListener(
      name,
      (event) => {
        // Preserve normal Tab navigation and the display window's Escape action.
        if ("key" in event && event.key !== "Enter" && event.key !== " ")
          return;
        event.stopPropagation();
        if ("repeat" in event && event.repeat) event.preventDefault();
      },
      { signal },
    );
  return {
    update(available = !button.hidden) {
      const doc = button.ownerDocument;
      const next = available && !button.disabled && !doc.hidden;
      if (next && !offered) button.focus({ preventScroll: true });
      else if (offered && !available && doc.activeElement === button)
        stage.focus({ preventScroll: true });
      offered = next;
    },
  };
}
