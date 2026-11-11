import "./maze-participant.css";
import participantStyles from "./maze-participant.css?inline";

/** One cue structure for the operator, inline preview and participant window. */
export function mazeCueMarkup(): string {
  const bars = Array.from(
    { length: 10 },
    (_, index) => `<i style="--bar-height:${22 + index * 4}px"></i>`,
  ).join("");
  return `<div class="maze-cue"><p class="maze-eyebrow">Directional wall cue</p><strong><span data-level>0</span><small> %</small></strong><div class="maze-meter" aria-hidden="true">${bars}</div><p data-cue>Rehearsal paused</p></div>`;
}

/** Fixed, map-free participant content; all dynamic values are assigned as text. */
export function mazeParticipantContent(
  buttonId: "maze-return" | "participant-toggle",
): string {
  const popup = buttonId === "participant-toggle";
  const heading = popup ? "h1" : "h2";
  return `<div><p class="maze-eyebrow">Virtual maze / Synthetic rehearsal</p><${heading}>Listen for the open path.</${heading}>${mazeCueMarkup()}<p data-participant-status>Rehearsal paused</p><button id="${buttonId}" class="maze-button">${popup ? "Resume rehearsal" : "Return to operator map"}</button>${popup ? "<p>Keep the operator page open. Sound is controlled there.</p>" : ""}</div>`;
}

/** Vite supplies the same CSS source to the page bundle and the local popup. */
export function mazeParticipantDocument(): string {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Virtual Maze · Participant</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${participantStyles}</style></head><body class="maze-popup-page"><main class="maze-participant" aria-label="Participant buzzer display">${mazeParticipantContent("participant-toggle")}</main></body></html>`;
}
