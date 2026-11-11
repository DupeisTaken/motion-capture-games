import "./multiplayer.css";
import { MultiplayerGame, type MultiplayerKind } from "./multiplayer-game";
import { PLAYER_SLOT_IDS } from "../../../packages/session/src/index";
import {
  MoleGame,
  type GameOptions as MoleOptions,
} from "../../../games/mole-motion/src/index";
import type { GameOptions as DodgeOptions } from "../../../games/dodgeball/src/index";
import {
  type DodgeMotionFrame,
  type Observation,
} from "../../../packages/motion/src/index";
import { drawMoleScene } from "./mole-renderer";
import { drawDodgeScene } from "./dodgeball-renderer";
import { renderMultiplayerTargets } from "./multiplayer-targets";

/** Adds enrollment and parallel games to the existing camera owner, never acquisition. */
export function createMultiplayerView(
  root: HTMLElement,
  kind: MultiplayerKind,
  options: () => Partial<MoleOptions> | Partial<DodgeOptions>,
  now: () => number,
  seed = 1,
  onEnable: () => void = () => {},
) {
  const match = new MultiplayerGame(kind, options, seed);
  const abort = new AbortController();
  const mode = document.createElement("label");
  mode.className = "check-row";
  mode.innerHTML =
    '<input id="multiplayer-enabled" type="checkbox"> Multiplayer · experimental 1–3 players';
  root.querySelector("#camera-controls")!.append(mode);
  const toggle = mode.querySelector("input")!;
  const board = document.createElement("section");
  board.className = "multiplayer-board";
  board.hidden = true;
  board.setAttribute("aria-label", "Multiplayer lobby and games");
  board.innerHTML = `<header class="multiplayer-heading"><div><p class="eyebrow">PLAY TOGETHER</p><h2>One camera. Your own score.</h2><p>Match the track labels in an unstarted panel, select that track, then Enroll. Unenrolled people are spectators.</p></div><span class="multiplayer-capacity">Up to 3 · software preview</span></header><p class="multiplayer-policy">Each player has independent targets, score and active time. Only your body controls your panel. Tracking uncertainty freezes your game; other players continue. Physical capacity and identity continuity are unmeasured.</p><p id="multiplayer-spectators" role="status"></p><p id="multiplayer-message" role="status">Start the camera, then enroll each participant.</p><div class="multiplayer-actions"><button id="multiplayer-start" class="mm-primary">Start enrolled players</button><button id="multiplayer-settings" class="mm-secondary">Video & game settings</button></div><div class="multiplayer-grid">${PLAYER_SLOT_IDS.map((id, i) => `<article class="multiplayer-slot" data-slot="${id}"><header><h3>Player ${i + 1}</h3><strong class="multiplayer-score" aria-label="Player ${i + 1} score">0</strong></header><div class="multiplayer-enrollment"><label for="${id}-track">Visible participant</label><select id="${id}-track"><option value="">Select track explicitly</option></select><button class="mm-secondary" data-action="join">Enroll</button><button class="mm-text" data-action="leave" disabled>Leave & clear score</button></div><p class="multiplayer-binding">No participant enrolled</p><div class="multiplayer-stage"><canvas width="640" height="400" aria-label="Player ${i + 1} mirrored game view"></canvas><div class="multiplayer-targets"></div></div><p class="multiplayer-state" role="status">Choose a participant to join.</p><p class="multiplayer-stats">No round started</p><div class="multiplayer-actions"><button class="mm-secondary" data-action="pause" disabled>Pause</button><button class="mm-secondary" data-action="resume" disabled>Resume</button><button class="mm-text" data-action="start" disabled>New round</button></div></article>`).join("")}</div>`;
  root.querySelector(".mm-game")!.after(board);
  let observation: Observation | null = null;
  let image: ImageBitmap | null = null;
  let receivedAt = -Infinity;
  const get = <T extends HTMLElement>(
    selector: string,
    owner: ParentNode = board,
  ) => owner.querySelector<T>(selector)!;
  const message = (text: string) => {
    get("#multiplayer-message").textContent = text;
  };
  const slots = new Map(
    PLAYER_SLOT_IDS.map((id) => [id, get<HTMLElement>(`[data-slot="${id}"]`)]),
  );
  const source = root.querySelector<HTMLSelectElement>("#source-select")!;
  const badge = root.querySelector<HTMLElement>(".experiment")!;
  const originalBadge = badge.innerHTML;
  const footer = root.querySelector<HTMLElement>(".mm-footer span:last-child")!;
  const originalFooter = footer.textContent;
  const enabled = () => toggle.checked && source.value === "camera";
  function render() {
    const active = enabled();
    board.hidden = !active;
    root.classList.toggle("multiplayer-active", active);
    const modeName = active ? "multiplayer" : "single";
    if (badge.dataset.mode !== modeName) {
      badge.dataset.mode = modeName;
      badge.innerHTML = active
        ? "1–3 players <span>Experimental</span>"
        : originalBadge;
      footer.textContent = active
        ? "1–3 players · English · software preview"
        : originalFooter;
    }
    if (active) {
      root.querySelector<HTMLElement>("#player-status")!.textContent =
        "Multiplayer lobby · enroll each participant explicitly. Each panel has its own game and score.";
      root.querySelector<HTMLElement>("#player-binding")!.hidden = true;
    }
    toggle.disabled = source.value !== "camera";
    if (active) source.disabled = match.runtimes.size > 0;
    // A distinct board cannot silently move with the single-player popup stage.
    const popup = root.querySelector<HTMLButtonElement>(
      kind === "mole" ? "#open-game-display" : "#open-game-window",
    );
    if (popup) popup.disabled = active;
    if (!active) return;
    const fresh = observation && now() - receivedAt <= 350;
    const spectators = observation ? match.session.spectators(observation) : [];
    get("#multiplayer-spectators").textContent =
      `Spectators: ${spectators.length}${spectators.length ? " · " + spectators.map((p) => p.trackId || "unassigned").join(", ") : ""}`;
    for (const id of PLAYER_SLOT_IDS) {
      const element = slots.get(id)!;
      const status = match.session.status(id);
      const runtime = match.runtimes.get(id);
      const choice = get<HTMLSelectElement>("select", element);
      const tracks = (fresh ? observation!.people : [])
        .filter(
          (p) =>
            p.trackId &&
            p.identity === "confident" &&
            observation!.people.filter((other) => other.trackId === p.trackId)
              .length === 1,
        )
        .map((p) => p.trackId!)
        .sort();
      if (
        JSON.stringify([...choice.options].map((o) => o.value)) !==
        JSON.stringify(["", ...tracks])
      ) {
        const previous = choice.value;
        choice.replaceChildren(
          new Option("Select track explicitly", ""),
          ...tracks.map((track) => new Option(track, track)),
        );
        if (tracks.includes(previous)) choice.value = previous;
      }
      choice.disabled = !!status.binding;
      get<HTMLButtonElement>('[data-action="join"]', element).disabled =
        !!status.binding || !fresh;
      get<HTMLButtonElement>('[data-action="leave"]', element).disabled =
        !status.binding;
      get(".multiplayer-binding", element).textContent = status.binding
        ? `Enrolled: ${status.binding.trackId}`
        : "No participant enrolled";
      const state = runtime?.game.state;
      element.dataset.status = status.status;
      element.dataset.phase = state?.phase ?? "empty";
      get(".multiplayer-score", element).textContent = String(
        state?.score ?? 0,
      );
      const countdown =
        state?.phase === "countdown"
          ? ` · ${Math.max(1, Math.ceil(state.countdownMs / 1000))}`
          : "";
      get(".multiplayer-state", element).textContent =
        status.status === "rejoin-required"
          ? `${status.reason} Leave, then enroll explicitly for a fresh score.`
          : state?.reason ||
            (state
              ? `${state.phase}${countdown}${runtime?.requested ? " · waiting for ready input" : ""}`
              : "Choose a participant to join.");
      get(".multiplayer-stats", element).textContent = state
        ? `${(state.elapsedMs / 1000).toFixed(1)} active seconds · ${state.hits} hits${runtime?.game instanceof MoleGame ? ` · ${runtime.game.state.misses} escaped` : runtime ? ` · ${(runtime.game as import("../../../games/dodgeball/src/index").DodgeGame).state.dodges} dodges` : ""}`
        : "No round started";
      get<HTMLButtonElement>('[data-action="pause"]', element).disabled =
        !state || !["playing", "countdown"].includes(state.phase);
      get<HTMLButtonElement>('[data-action="resume"]', element).disabled =
        state?.phase !== "paused" || status.status !== "ready";
      get<HTMLButtonElement>('[data-action="start"]', element).disabled =
        !runtime ||
        !["ready", "results"].includes(state!.phase) ||
        status.status === "rejoin-required";
      const canvas = get<HTMLCanvasElement>("canvas", element);
      const targets = get(".multiplayer-targets", element);
      if (kind === "mole") {
        const game = runtime?.game as MoleGame | undefined;
        const frame = status.status === "ready" ? runtime?.frame : null;
        const rect = drawMoleScene(
          canvas,
          fresh ? observation : null,
          fresh ? image : null,
          frame?.contacts ?? [],
          true,
          !state || state.phase === "ready",
          false,
          game?.touchRegions(frame?.contacts ?? []) ?? [],
        );
        const visible =
          game?.state.phase === "playing" ? game.state.targets : [];
        const feedback = game?.state as MoleGame["state"] & {
          targetFeedback?: Parameters<typeof renderMultiplayerTargets>[3];
        };
        renderMultiplayerTargets(
          targets,
          visible,
          rect,
          game?.state.phase === "playing"
            ? (feedback?.targetFeedback ?? [])
            : [],
        );
      } else {
        const frame =
          status.status === "ready"
            ? (runtime?.frame as DodgeMotionFrame | null)
            : null;
        const game = runtime?.game as
          import("../../../games/dodgeball/src/index").DodgeGame | undefined;
        drawDodgeScene(
          canvas,
          fresh ? observation : null,
          fresh ? image : null,
          frame?.body ?? [],
          game?.state.obstacle ?? null,
          true,
          !state || state.phase === "ready",
        );
      }
    }
  }
  toggle.addEventListener(
    "change",
    () => {
      if (toggle.checked) onEnable();
      if (!toggle.checked && match.runtimes.size) {
        toggle.checked = true;
        message(
          "Leave each player before returning to single player. Leaving clears that slot’s score.",
        );
      }
      render();
    },
    { signal: abort.signal },
  );
  source.addEventListener(
    "change",
    (event) => {
      if (match.runtimes.size) {
        source.value = "camera";
        event.stopImmediatePropagation();
        message("Leave enrolled players before changing the input source.");
      }
      render();
    },
    { signal: abort.signal },
  );
  get("#multiplayer-settings").addEventListener(
    "click",
    () => root.querySelector<HTMLButtonElement>("#open-settings")!.click(),
    { signal: abort.signal },
  );
  get("#multiplayer-start").addEventListener(
    "click",
    () => {
      match.start();
      message(
        "Waiting for usable input in each enrolled slot. Each player has their own countdown.",
      );
    },
    { signal: abort.signal },
  );
  for (const [id, element] of slots)
    element.addEventListener(
      "click",
      (event) => {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>(
          "[data-action]",
        )?.dataset.action;
        if (action === "join")
          message(
            match.join(
              id,
              get<HTMLSelectElement>("select", element).value,
              now(),
            )
              ? "Player enrolled. Start when ready."
              : match.session.status(id).reason ||
                  "Choose a fresh confident track not already enrolled. Capacity: 3.",
          );
        if (action === "leave") {
          match.leave(id);
          message(
            "Slot released and score cleared. Re-enrollment always starts a fresh game.",
          );
        }
        if (action === "pause") match.pause(id);
        if (action === "resume") match.resume(id);
        if (action === "start") match.start(id);
        render();
      },
      { signal: abort.signal },
    );
  return {
    enabled,
    start() {
      match.start();
      render();
    },
    ingest(value: Observation, bitmap: ImageBitmap | null, at: number) {
      observation = value;
      image = bitmap;
      receivedAt = at;
      if (enabled()) match.ingest(value, at);
    },
    tick() {
      if (enabled()) match.tick(now(), !document.hidden);
      render();
    },
    interrupt(reason: string, requireRejoin = false) {
      observation = null;
      image = null;
      match.interrupt(reason, requireRejoin);
      render();
    },
    dispose() {
      abort.abort();
      board.remove();
      mode.remove();
      root.classList.remove("multiplayer-active");
    },
  };
}
