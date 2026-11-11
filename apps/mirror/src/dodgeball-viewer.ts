import {
  CameraChoice,
  cameraChoiceMarkup,
  type CameraSelection,
} from "./camera-choice";
import {
  DodgeGame,
  TUNING,
  type GameOptions,
} from "../../../games/dodgeball/src/index";
import { SinglePlayerSession } from "../../../packages/session/src/index";
import {
  containRect,
  decodeFramePacket,
  observationToDodgeFrame,
  observationSpaceRevision,
  syntheticBody,
  SYNTHETIC_BODY_BOUNDS,
  type DodgeMotionFrame,
  type GameMotionFrame,
  type Observation,
} from "../../../packages/motion/src/index";
import { drawDodgeScene } from "./dodgeball-renderer";
import { CameraReleases } from "./camera-release";
import { createGameDisplay } from "./game-display";
import {
  createPreGameSettings,
  preGameSettingsMarkup,
} from "./pre-game-settings";

const ballArt = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="46" fill="#ee8c67"/><path d="M17 44c29 16 57 17 87-1M21 83c28-18 54-18 79-1M59 14c-18 27-18 65 0 92M70 15c18 27 18 63 0 90" fill="none" stroke="#923f32" stroke-width="4"/><path d="M31 29a43 43 0 0 1 25-12" fill="none" stroke="#ffd0a0" stroke-width="6" stroke-linecap="round"/></svg>`;
const RECOVERY_GRACE_MS = 2_000;
const modeCopy: Record<string, string> = {
  timed: "60 active seconds. Dodge your way to a high score.",
  survival: "Three hits end the round. How long can you stay clear?",
  practice: "No clock, no penalties. Learn the warning, find your space.",
};

export function mountDodgeballGame(
  root: HTMLElement,
  deps: { now?: () => number; autoTick?: boolean; seed?: number } = {},
): { tick(): void; dispose(): void } {
  const now = deps.now || (() => performance.now());
  const setupMarkup = preGameSettingsMarkup(
    "Dodgeball",
    `<label for="mode-select">Play mode</label><select id="mode-select" aria-describedby="mode-description"><option value="timed">Timed · 60 seconds</option><option value="survival">Survival · 3 shields</option><option value="practice">Practice · no pressure</option></select><p id="mode-description" class="field-note">${modeCopy.timed}</p>
 <label for="difficulty-select">Difficulty</label><select id="difficulty-select"><option value="easy">Easy · time to react</option><option value="normal" selected>Normal · find your flow</option><option value="hard">Hard · think on your feet</option></select><p class="field-note">A ring marks the exact ball footprint. Move your whole body clear before it fills.</p>
 `,
    `<label for="source-select">Input source</label><select id="source-select"><option value="camera">Camera · body tracking</option><option value="demo">Rehearsal · no camera</option></select>

 <div id="setup-camera-release" hidden><p id="setup-release-message" class="field-note" role="status"></p><button id="setup-retry-camera-stop" class="mm-secondary">Retry camera stop</button></div><p id="setup-input-status" class="field-note" role="status"></p><div id="demo-controls"><p class="field-note">Move the body with your pointer, touch or arrow keys. This is a synthetic rehearsal.</p><label class="check-row"><input id="demo-framing" type="checkbox" checked> Both feet in view</label></div>
 <div id="camera-controls" hidden>${cameraChoiceMarkup}<p class="field-note">Start with one player in view and keep your whole body visible. Spectators can enter during play while the joined player stays tracked.</p><button id="source-connect" class="mm-secondary">Start camera</button><button id="setup-stop-camera" class="mm-text" disabled>Stop camera</button></div>
 <label class="check-row"><input id="show-tracking" type="checkbox"> Show tracking diagnostics</label>
 <div class="setup-tip"><span>PLAY WITH ROOM</span><p>Clear your space. Use comfortable steps; no jumping or sudden lunges needed.</p></div><button id="open-game-window" class="mm-secondary display-button">Open game window &#8599;</button><p id="display-status" class="field-note" role="status">Keep controls here. Put the game on another display.</p>
 `,
  );
  root.innerHTML = `
 <a class="skip" href="#game-stage">Skip to game</a>
 <header class="mm-header"><a class="mm-brand" href="/">✳ <span>Motion<span class="light">Studio</span></span></a><nav aria-label="Main"><a href="/" aria-label="All games">All games</a><a href="/diagnostics.html">Tracking console</a><a href="/mole.html">Slap a Mole</a><a class="current" href="/dodgeball.html" aria-current="page">Dodgeball</a><a href="/runner.html">Runner</a></nav><span class="local-pill"><i></i> Local & private</span></header>
 <main class="mm-main"><div class="mm-heading"><div><p class="eyebrow">THE MOTION ARCADE <span>/</span> GAME 02</p><h1>Dodgeball<span class="heading-dot">.</span></h1><p class="intro">Read the ring. Find your space. Make your move.</p></div><span class="experiment">Single player <span>Experimental</span></span></div>
 <div class="mm-layout play-layout">
 <div class="round-toolbar"><button id="open-settings" class="mm-secondary">Video & game settings</button><p id="player-binding" class="field-note" hidden></p><p id="player-status" class="field-note" role="status">Press Start. We will find one ready player.</p><button id="source-stop" class="mm-text" disabled>Stop camera</button></div><div id="camera-release" hidden><p id="camera-release-message" class="field-note" role="status"></p><button id="retry-camera-stop" class="mm-secondary">Retry camera stop</button></div>
  <section class="mm-game" aria-label="Dodgeball game"><div class="scoreboard"><div class="score-item primary-score"><span>SCORE</span><strong id="score-value">000</strong></div><div class="score-item"><span id="time-label">TIME LEFT</span><strong id="time-value">1:00</strong></div><div class="score-item"><span>DODGES</span><strong id="dodges-value">0</strong></div><div class="score-item"><span id="shields-label">HITS</span><strong id="hits-value">0</strong></div><span id="source-label" class="source-tag">SYNTHETIC REHEARSAL</span></div>
 <div id="game-stage" class="mm-stage" tabindex="0" role="group" aria-label="Dodgeball play area. Rehearsal: move your pointer, touch or use arrow keys to move the whole body."><canvas id="game-canvas" width="960" height="600" aria-label="Mirrored camera view and virtual ball warning"></canvas><div class="stage-label"><i></i><span>READ THE RING · DODGE THE BALL</span></div><div class="display-hud" aria-label="Live game score"><span>SCORE <strong id="display-score">000</strong></span><span id="display-clock-label">TIME <strong id="display-time">1:00</strong></span><span>DODGES <strong id="display-dodges">0</strong></span></div><div class="player-label">P1 <span id="stage-player">WAITING</span></div><div id="dodge-feedback" class="hit-feedback" aria-hidden="true" hidden></div><div class="mm-overlay" id="game-overlay"><div class="overlay-ball">${ballArt}</div><p id="overlay-kicker">READY, SET, SIDESTEP</p><h2 id="overlay-title">A little space.<br>A great escape.</h2><p id="overlay-copy">Press Start, then move clear of each warning ring. Keep your whole body in view.</p></div><div class="stage-bottom"><span id="stage-help">Rehearsal · pointer, touch or arrow keys to move</span><span>MIRRORED VIEW</span></div></div>
 <div class="target-track" id="warning-track"><span id="warning-life">Waiting for your first ball</span><progress id="warning-progress" max="1" value="0" aria-label="Ball phase time remaining"></progress><span id="streak-value">Best streak 0</span></div>
 <div class="game-actions"><button id="start-round" class="mm-primary">Set up round <span>↗</span></button><button id="pause-round" class="mm-secondary" disabled>Pause</button><button id="resume-round" class="mm-primary" hidden>Resume · countdown</button><button id="end-round" class="mm-text" disabled>End round</button><button id="restart-round" class="mm-primary" hidden>Play again ↗</button><span id="game-status" role="status">Press Start when you are ready.</span></div>
 <p class="source-disclosure" id="source-disclosure">Synthetic full-body rehearsal. Camera accuracy and physical latency still require hardware trials.</p></section></div>
 <section class="how-grid" aria-label="How to play"><article><span class="how-number">01</span><div><h2>Read the warning</h2><p>A striped amber ring shows where the ball will land. The ring stays still.</p></div></article><article><span class="how-number">02</span><div><h2>Move all of you</h2><p>Get your head, torso, arms and legs clear before the ring turns coral. Each clean escape builds your streak.</p></div></article><article><span class="how-number">03</span><div><h2>Stay in the picture</h2><p>Missing feet? Step back, adjust the camera or clear an occlusion. Tracking issues pause play fairly.</p></div></article></section>
 <footer class="mm-footer"><span>Built for movement. Played in your space.</span><span>One player · English · M4 software preview</span></footer>${setupMarkup}</main>`;
  const elements = new Map(
    [...root.querySelectorAll<HTMLElement>("[id]")].map((element) => [
      element.id,
      element,
    ]),
  );
  const get = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const element = elements.get(id) as T | undefined;
    if (!element) throw new Error(`Missing Dodgeball control: ${id}`);
    return element;
  };
  const select = (id: string) => get<HTMLSelectElement>(id);
  const listeners = new AbortController();
  const listen = (target: EventTarget, event: string, handler: EventListener) =>
    target.addEventListener(event, handler, { signal: listeners.signal });
  const display = createGameDisplay(get("game-stage"), {
    title: "Dodgeball",
    onStateChange(open) {
      get("display-status").textContent = open
        ? "Game window open. Close it to bring play back here."
        : "Keep controls here. Put the game on another display.";
      get("open-game-window").textContent = open
        ? "Return game to this page"
        : "Open game window";
      if (!disposed) render();
    },
    onVisibilityChange() {
      handleVisibility();
    },
  });
  const hidden = () => document.hidden && !display.visible;
  const session = new SinglePlayerSession();
  const nextSeed = () => deps.seed ?? Math.floor(Math.random() * 4_294_967_296);
  let game = new DodgeGame({}, nextSeed());
  let demoJoined = true,
    sequence = 0,
    demoEpoch = 1,
    demoTime = -Infinity;
  let frame: DodgeMotionFrame | null = null,
    observation: Observation | null = null;
  let receivedAt = 0,
    image: ImageBitmap | null = null;
  let socket: WebSocket | null = null,
    generation = 0,
    epoch = "",
    connecting = false;
  let cameraMessage = "Start the camera, then press Start round.";
  let armed = false;
  let manualPause = false;
  let ownershipChanged = false;
  let owner: { trackId: string; epoch: string; revision: string } | null = null;
  let lastOwnerAt = -Infinity;
  let lastCaptured = 0n;
  let lastProcessed = 0n;
  let disposed = false,
    pointer = { x: 0.5, y: 0.5 };
  let lastHits = 0,
    lastDodges = 0,
    feedbackUntil = 0;
  const cameraChoice = new CameraChoice(root);
  const releases = new CameraReleases(fetch, updateReleaseControls);
  const setup = createPreGameSettings(root, () => {
    resetGame();
    armed = true;
    if (!isDemo() && observation) ingestCamera();
    tick();
    get("game-stage").focus();
  });
  const isDemo = () => select("source-select").value === "demo";
  const isJoined = () => (isDemo() ? demoJoined : !!session.binding);
  const active = () =>
    ["countdown", "playing", "paused"].includes(game.state.phase);
  const config = (): Partial<GameOptions> => ({
    mode: select("mode-select").value as GameOptions["mode"],
    difficulty: select("difficulty-select").value as GameOptions["difficulty"],
  });
  function setMessage(message: string) {
    if (get("setup-input-status").textContent !== message)
      get("setup-input-status").textContent = message;
    if (get("game-status").textContent !== message)
      get("game-status").textContent = message;
  }
  function setPlayerStatus(message: string) {
    if (get("player-status").textContent !== message)
      get("player-status").textContent = message;
  }
  function updateReleaseControls() {
    if (disposed) return;
    const release = releases.state;
    cameraChoice.setLocked(connecting || !!epoch || release.pendingCount > 0);
    get("camera-release").hidden = release.pendingCount === 0;
    const message = get("camera-release-message");
    if (message.textContent !== release.message)
      message.textContent = release.message;
    get<HTMLButtonElement>("retry-camera-stop").disabled = release.releasing;
    get<HTMLButtonElement>("source-connect").disabled =
      connecting || !!epoch || release.pendingCount > 0;
    get<HTMLButtonElement>("source-stop").disabled = !epoch && !connecting;
    get<HTMLButtonElement>("setup-stop-camera").disabled =
      !epoch && !connecting;
    get("setup-camera-release").hidden = release.pendingCount === 0;
    get("setup-release-message").textContent = release.message;
    get<HTMLButtonElement>("setup-retry-camera-stop").disabled =
      release.releasing;
    if (!isDemo() && !epoch) setMessage(release.message || cameraMessage);
  }
  function updatePlayerBinding() {
    get("player-binding").hidden = isDemo() || !owner;
    get("player-binding").textContent = owner
      ? `Round belongs to ${owner.trackId}.`
      : "";
  }
  // Keep the round owner after session invalidation. A new track cannot inherit
  // its score. Explicit identity loss requires a new round; a short transport
  // gap may recover only when the same still-confident identity returns.
  function ingestCamera() {
    if (!observation) return;
    const source = observation;
    if (game.state.phase === "ready" && !armed) {
      owner = null;
      session.release();
      ownershipChanged = false;
    }
    const candidates = source.people.filter(
      (person) => person.trackId && person.identity === "confident",
    );
    const revision = observationSpaceRevision(source);
    if (
      owner &&
      (source.epoch !== owner.epoch ||
        revision !== owner.revision ||
        now() - lastOwnerAt > RECOVERY_GRACE_MS ||
        BigInt(source.capturedAtNs) <= lastCaptured ||
        BigInt(source.processedAtNs) < lastProcessed)
    )
      ownershipChanged = true;
    if (ownershipChanged) {
      frame = null;
      game.pause("Player or source changed. Start a new round.");
      return;
    }
    const participant = owner
      ? candidates.find((person) => person.trackId === owner!.trackId)
      : candidates.length === 1 && source.people.length === 1
        ? candidates[0]
        : null;
    const unique =
      participant &&
      source.people.filter((person) => person.trackId === participant.trackId)
        .length === 1;
    if (!unique || !participant) {
      if (owner) {
        ownershipChanged = true;
        game.pause("Player identity was lost. Start a new round.");
      }
      session.ingest(source, receivedAt);
      frame = null;
      lastCaptured = BigInt(source.capturedAtNs);
      lastProcessed = BigInt(source.processedAtNs);
      setPlayerStatus(
        owner
          ? "Player identity changed. Start a new round."
          : "Waiting for one clearly tracked player.",
      );
      return;
    }
    const base = session.binding
      ? session.ingest(source, receivedAt)
      : session.join(source, participant.trackId!, receivedAt);
    frame = cameraFrame(base);
    if (!base && !session.binding) {
      if (
        owner &&
        /clock|timing|geometry|source.*changed/i.test(session.reason || "")
      )
        ownershipChanged = true;
      else
        frame = cameraFrame(
          session.join(source, participant.trackId!, receivedAt),
        );
    }
    if (!owner && armed && frame && game.readiness(now(), frame).ready)
      owner = { trackId: participant.trackId!, epoch: source.epoch, revision };
    if (frame && owner) lastOwnerAt = receivedAt;
    lastCaptured = BigInt(source.capturedAtNs);
    lastProcessed = BigInt(source.processedAtNs);
    setPlayerStatus(
      frame
        ? "Player ready · tracking stays in the background."
        : "Waiting for fresh full-body tracking.",
    );
  }
  function resetGame() {
    armed = false;
    manualPause = false;
    ownershipChanged = false;
    owner = null;
    lastOwnerAt = -Infinity;
    lastCaptured = 0n;
    lastProcessed = 0n;
    session.release();
    frame = null;
    game = new DodgeGame(config(), nextSeed());
    lastHits = 0;
    lastDodges = 0;
    feedbackUntil = 0;
  }
  function updateSettings() {
    const demo = isDemo();
    get("demo-controls").hidden = !demo;
    get("game-stage").classList.toggle("camera-stage", !demo);
    get("camera-controls").hidden = demo;
    get("mode-description").textContent = modeCopy[select("mode-select").value];
    get("source-label").textContent = demo
      ? "SYNTHETIC REHEARSAL"
      : "LOCAL CAMERA · 2D";
    get("source-disclosure").textContent = demo
      ? "Synthetic full-body rehearsal. Camera accuracy and physical latency still require hardware trials."
      : "Experimental 2D camera play. All body joints must be observed; framing, identity and physical latency require hardware trials. No recording.";
    get("game-stage").setAttribute(
      "aria-label",
      demo
        ? "Dodgeball play area. Move your pointer, touch or use arrow keys to move the whole rehearsal body."
        : "Dodgeball play area. Move your whole body clear of each warning ring; keep both feet in view.",
    );
    get("stage-help").textContent = demo
      ? "Rehearsal · pointer, touch or arrow keys to move"
      : "Move left → go left · keep your whole body visible";
  }
  function demoFrame(t: number): DodgeMotionFrame | null {
    if (!demoJoined) return null;
    if (t > demoTime) {
      sequence++;
      demoTime = t;
    }
    return {
      version: 1,
      epoch: `rehearsal-${demoEpoch}`,
      sequence,
      atMs: demoTime,
      slotId: "player-1",
      identity: "confident",
      feetVisible: get<HTMLInputElement>("demo-framing").checked,
      depthAvailable: false,
      spaceRevision: "rehearsal-space-v1",
      contacts: [],
      body: syntheticBody(pointer.x, pointer.y),
    };
  }
  // Session supplies identity, source time and revision. Attach only its bound body.
  function cameraFrame(base: GameMotionFrame | null): DodgeMotionFrame | null {
    const binding = session.binding;
    return base && observation && binding
      ? observationToDodgeFrame(observation, base, binding.trackId)
      : null;
  }
  function render() {
    const state = game.state,
      t = now();
    const readiness = game.readiness(t, frame);
    const fresh =
      !!frame && t - frame.atMs <= TUNING.staleMs && t >= frame.atMs;
    const previewFresh = !!observation && t - receivedAt <= TUNING.staleMs;
    drawDodgeScene(
      get<HTMLCanvasElement>("game-canvas"),
      previewFresh ? observation : null,
      previewFresh ? image : null,
      fresh ? (frame?.body ?? []) : [],
      state.obstacle,
      true,
      get<HTMLInputElement>("show-tracking").checked && !display.isOpen,
    );
    const obstacle = state.obstacle;
    const phaseCopy =
      obstacle?.phase === "warning"
        ? "MOVE CLEAR"
        : obstacle?.phase === "danger"
          ? "BALL ACTIVE"
          : "NEXT BALL";
    get("warning-track").dataset.phase = obstacle?.phase || "idle";
    get("warning-life").textContent = obstacle
      ? `${phaseCopy} · ${(obstacle.remainingMs / 1000).toFixed(1)}s`
      : state.phase === "results"
        ? "Round complete"
        : "Waiting for your next ball";
    get<HTMLProgressElement>("warning-progress").value = obstacle
      ? obstacle.remainingMs / obstacle.durationMs
      : 0;
    get("score-value").textContent = String(state.score).padStart(3, "0");
    get("dodges-value").textContent = String(state.dodges);
    get("display-score").textContent = String(state.score).padStart(3, "0");
    get("display-dodges").textContent = String(state.dodges);
    get("streak-value").textContent = `Best streak ${state.bestCombo}`;
    get("shields-label").textContent =
      state.options.mode === "survival" ? "SHIELDS" : "HITS";
    get("hits-value").textContent =
      state.options.mode === "survival"
        ? String(Math.max(0, TUNING.survivalHits - state.hits))
        : String(state.hits);
    get("time-label").textContent =
      state.remainingMs === null ? "ACTIVE TIME" : "TIME LEFT";
    const seconds = Math.max(
      0,
      Math.ceil((state.remainingMs ?? state.elapsedMs) / 1000),
    );
    get("time-value").textContent =
      state.options.mode === "practice"
        ? "∞"
        : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    get("display-time").textContent = get("time-value").textContent;
    get("stage-player").textContent =
      isJoined() && readiness.ready && !ownershipChanged ? "READY" : "WAITING";
    if (ownershipChanged)
      setPlayerStatus(
        "New round needed. Participant identity or camera space changed.",
      );
    else if (!isDemo() && session.binding && !readiness.ready)
      setPlayerStatus(readiness.reason || "Waiting for ready input.");
    const needsNewRound =
      state.phase === "paused" &&
      (readiness.requiresNewRound || ownershipChanged);
    const locked = active() || armed;
    const configurationLocked = locked && !needsNewRound;
    for (const id of ["mode-select", "difficulty-select", "source-select"])
      get<HTMLSelectElement>(id).disabled = configurationLocked;
    get<HTMLButtonElement>("start-round").disabled =
      hidden() || state.phase !== "ready" || armed;
    get("start-round").hidden = state.phase !== "ready" || armed;
    get<HTMLButtonElement>("pause-round").disabled = ![
      "playing",
      "countdown",
    ].includes(state.phase);
    get("pause-round").hidden = ["paused", "results"].includes(state.phase);
    get("resume-round").hidden =
      state.phase !== "paused" || needsNewRound || !manualPause;
    get<HTMLButtonElement>("resume-round").disabled =
      !isJoined() || !readiness.ready || hidden();
    get<HTMLButtonElement>("end-round").disabled = !locked;
    get("restart-round").hidden = state.phase !== "results" && !needsNewRound;
    setup.setLocked(configurationLocked);
    get("restart-round").textContent = needsNewRound
      ? "Set up new round ↗"
      : "Play again ↗";
    updateReleaseControls();
    get("game-overlay").hidden =
      state.phase === "playing" ||
      (!isDemo() && state.phase === "ready" && previewFresh && !armed);
    get("overlay-kicker").textContent =
      state.phase === "paused"
        ? "TAKE A BREATH"
        : state.phase === "results"
          ? "THAT'S A ROUND"
          : state.phase === "countdown"
            ? "FIND YOUR SPACE"
            : "READY, SET, SIDESTEP";
    const title = get("overlay-title"),
      copy = get("overlay-copy");
    if (state.phase === "countdown") {
      title.textContent = String(
        Math.max(1, Math.ceil(state.countdownMs / 1000)),
      );
      copy.textContent = "Whole body in view. Get ready to move.";
      setMessage("Get ready…");
    } else if (state.phase === "paused") {
      const feet = frame && !frame.feetVisible;
      title.textContent = needsNewRound
        ? "Ready for a fresh round?"
        : feet
          ? "Keep both feet in view"
          : manualPause
            ? "Play paused"
            : "Finding you again";
      copy.textContent = needsNewRound
        ? "Player, source or tracking continuity changed. Start a new round to keep score ownership clear."
        : hidden()
          ? "Return to this tab to continue. Your round stays paused."
          : !readiness.ready
            ? `${readiness.reason || "Waiting for tracking."} Your time, ball and score are safe.`
            : manualPause
              ? "Choose Resume when you are ready."
              : "Tracking recovered. A short countdown brings you back.";
      setMessage(copy.textContent || "Waiting for tracking.");
    } else if (state.phase === "results") {
      title.textContent = "Nice escapes.";
      copy.textContent = `${state.dodges} clean dodges · ${state.score} points · best streak ${state.bestCombo}. ${state.result === "out-of-lives" ? "Three hits used your shields." : state.result === "time-up" ? "Time is up." : "Ready for another round?"}`;
      setMessage("Round complete. Play again or change your setup.");
    } else if (state.phase === "playing")
      setMessage(
        "Read the warning. Move your whole body clear before the ball lands.",
      );
    else {
      title.textContent = armed
        ? "Finding your player"
        : "A little space. A great escape.";
      copy.textContent = armed
        ? isDemo()
          ? readiness.reason || "Waiting for your full body."
          : "Keep one player in view. Your round begins as soon as tracking is ready."
        : "Press Start when you are ready. Keep your whole body in view.";
      setMessage(
        !isDemo() && (!epoch || connecting)
          ? releases.state.message || cameraMessage
          : armed
            ? "Start requested · waiting for ready tracking."
            : "Press Start when you are ready.",
      );
    }
    if (state.hits > lastHits || state.dodges > lastDodges) {
      feedbackUntil = t + 650;
      get("dodge-feedback").textContent =
        state.hits > lastHits
          ? state.options.mode === "practice"
            ? "KEEP MOVING"
            : "BALL HIT"
          : "CLEAN DODGE!";
      get("dodge-feedback").dataset.kind =
        state.hits > lastHits ? "hit" : "dodge";
    }
    lastHits = state.hits;
    lastDodges = state.dodges;
    get("dodge-feedback").hidden =
      t > feedbackUntil || feedbackUntil === 0 || state.phase !== "playing";
  }
  function tick() {
    if (disposed) return;
    const t = now();
    if (isDemo()) frame = demoFrame(t);
    if (owner && t - lastOwnerAt > RECOVERY_GRACE_MS && active())
      ownershipChanged = true;
    if (
      armed &&
      game.state.phase === "ready" &&
      !hidden() &&
      game.readiness(t, frame).ready
    ) {
      // Pin ownership only when a ready countdown is actually admitted. A queued
      // Start with no valid pose has no score owner and can keep waiting safely.
      const binding = session.binding;
      if (!isDemo() && !owner && binding && observation) {
        owner = {
          trackId: binding.trackId,
          epoch: binding.epoch,
          revision: observationSpaceRevision(observation),
        };
        lastOwnerAt = receivedAt;
      }
      armed = false;
      game.start(t);
    }
    game.step(t, frame);
    if (
      game.state.phase === "paused" &&
      !manualPause &&
      !ownershipChanged &&
      !hidden() &&
      game.readiness(t, frame).ready
    )
      game.resume(t);
    updatePlayerBinding();
    render();
  }
  async function stopCamera(
    message = "Camera stopped. Start it when you are ready.",
  ) {
    generation++;
    connecting = false;
    cameraMessage = message;
    releases.retain(epoch);
    epoch = "";
    socket?.close();
    socket = null;
    session.release();
    frame = null;
    observation = null;
    image?.close();
    image = null;
    if (active()) {
      ownershipChanged = true;
      game.pause(message);
    }
    setPlayerStatus(message);
    setMessage(message);
    updatePlayerBinding();
    updateReleaseControls();
    const released = await releases.retry();
    if (!disposed) render();
    return released;
  }
  async function startCamera() {
    if (connecting || epoch || releases.state.pendingCount > 0) return;
    let camera: CameraSelection;
    try {
      camera = cameraChoice.selection();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    const stopping = stopCamera("Starting local camera…");
    const preparing = generation;
    connecting = true;
    updateReleaseControls();
    const released = await stopping;
    if (!released || disposed || isDemo() || preparing !== generation) {
      if (preparing === generation) {
        connecting = false;
        updateReleaseControls();
      }
      return;
    }
    const own = ++generation;
    get<HTMLButtonElement>("source-connect").disabled = true;
    get<HTMLButtonElement>("source-stop").disabled = false;
    let decoding = false;
    try {
      const response = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "camera",
          algorithm: "rtmpose",
          tracker: "pose",
          ...camera,
          maxPeople: 3,
          independentPreview: false,
          demoScenario: "three",
        }),
      });
      const result = await response.json();
      if (!response.ok || result.state === "error")
        throw new Error(
          result.detail || result.message || "Camera could not start.",
        );
      if (own !== generation || disposed) {
        if (typeof result.epoch === "string")
          await releases.release(result.epoch);
        return;
      }
      if (typeof result.epoch !== "string" || !result.epoch)
        throw new Error("Camera did not acknowledge a source epoch.");
      epoch = result.epoch;
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/stream`,
      );
      socket = ws;
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        if (own === generation) ws.send(JSON.stringify({ type: "next" }));
      };
      let lastSequence = -1;
      ws.onmessage = async (event: MessageEvent<ArrayBuffer | string>) => {
        if (own !== generation || decoding || disposed) return;
        decoding = true;
        const arrival = now();
        try {
          if (typeof event.data === "string") {
            const status = JSON.parse(event.data);
            if (status.state === "error" || status.state === "idle")
              throw new Error(
                status.message || "Camera stopped. Reconnect to continue.",
              );
            if (status.state === "stale") {
              frame = null;
              observation = null;
              image?.close();
              image = null;
              session.release();
              game.pause("Camera input is stale. Waiting for recovery.");
            }
          } else {
            const packet = decodeFramePacket(event.data);
            if (
              packet.observation.source !== "camera" ||
              packet.observation.epoch !== epoch ||
              packet.observation.sequence <= lastSequence
            )
              throw new Error(
                "Camera stream changed or returned an old frame. Reconnect and start a new round.",
              );
            const decoded = await createImageBitmap(
              new Blob([new Uint8Array(packet.jpeg)], { type: "image/jpeg" }),
            );
            if (own !== generation || disposed) {
              decoded.close();
              return;
            }
            if (
              decoded.width !== packet.observation.image.width ||
              decoded.height !== packet.observation.image.height
            ) {
              decoded.close();
              throw new Error(
                "Camera image does not match its observation geometry.",
              );
            }
            lastSequence = packet.observation.sequence;
            image?.close();
            image = decoded;
            observation = packet.observation;
            receivedAt = arrival;
            connecting = false;
            ingestCamera();
            updatePlayerBinding();
          }
          tick();
        } catch (error) {
          if (own === generation)
            await stopCamera(
              error instanceof Error ? error.message : String(error),
            );
        } finally {
          decoding = false;
          if (own === generation && ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "next" }));
        }
      };
      ws.onerror = () => {
        if (own === generation)
          void stopCamera(
            "Connection failed. Run pnpm dev and start the camera again.",
          );
      };
      ws.onclose = () => {
        if (own === generation)
          void stopCamera("Camera connection closed. Start the camera again.");
      };
    } catch (error) {
      if (own === generation)
        await stopCamera(
          `Camera unavailable: ${error instanceof Error ? error.message : String(error)} Run pnpm dev to start the local vision service.`,
        );
    }
    if (!disposed) render();
  }

  listen(get("open-game-window"), "click", () => {
    if (display.isOpen) display.close();
    else if (!display.open())
      get("display-status").textContent =
        "Allow pop-ups for this site, then try again.";
  });
  listen(get("source-connect"), "click", () => void startCamera());
  listen(get("source-stop"), "click", () => void stopCamera());
  listen(get("setup-stop-camera"), "click", () => void stopCamera());
  listen(get("setup-retry-camera-stop"), "click", () => void releases.retry());
  listen(get("retry-camera-stop"), "click", () => void releases.retry());
  listen(select("source-select"), "change", () => {
    if (!isDemo()) void cameraChoice.refresh();
    void stopCamera();
    demoJoined = true;
    demoEpoch++;
    resetGame();
    updateSettings();
    setPlayerStatus(
      isDemo()
        ? "Rehearsal ready. Press Start."
        : "Start the camera, then press Start.",
    );
    tick();
  });
  for (const id of ["mode-select", "difficulty-select"])
    listen(get(id), "change", () => {
      resetGame();
      updateSettings();
      tick();
    });
  listen(get("show-tracking"), "change", () => render());
  listen(get("open-settings"), "click", () => setup.open());
  listen(get("start-round"), "click", () => setup.open(get("start-round")));
  listen(get("pause-round"), "click", () => {
    manualPause = true;
    game.pause("Paused by player.");
    tick();
  });
  listen(get("resume-round"), "click", () => {
    if (
      isJoined() &&
      !ownershipChanged &&
      !hidden() &&
      game.readiness(now(), frame).ready
    ) {
      manualPause = false;
      game.resume(now());
      tick();
      get("game-stage").focus();
    }
  });
  listen(get("end-round"), "click", () => {
    armed = false;
    game.finish();
    tick();
    get(
      game.state.phase === "results" ? "restart-round" : "start-round",
    ).focus();
  });
  listen(get("restart-round"), "click", () => setup.open(get("restart-round")));
  listen(get("demo-framing"), "change", () => tick());
  function aim(event: PointerEvent) {
    if (!isDemo()) return;
    const bounds = get("game-canvas").getBoundingClientRect();
    const rect = containRect(
      { width: 960, height: 600 },
      { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) },
    );
    const x = 1 - (event.clientX - bounds.left - rect.x) / rect.width,
      y = (event.clientY - bounds.top - rect.y) / rect.height;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1)
      pointer = {
        x: Math.max(
          SYNTHETIC_BODY_BOUNDS.left,
          Math.min(SYNTHETIC_BODY_BOUNDS.right, x),
        ),
        y: Math.max(
          SYNTHETIC_BODY_BOUNDS.top,
          Math.min(SYNTHETIC_BODY_BOUNDS.bottom, y),
        ),
      };
  }
  listen(get("game-stage"), "pointermove", (event) => {
    aim(event as PointerEvent);
  });
  listen(get("game-stage"), "pointerdown", (event) => {
    aim(event as PointerEvent);
    if (isDemo()) {
      get("game-stage").focus();
      tick();
    }
  });
  listen(get("game-stage"), "keydown", (event) => {
    if (!isDemo()) return;
    const key = event as KeyboardEvent;
    const directions: Record<string, [number, number]> = {
      // Source x increases toward screen-left after the single display mirror.
      ArrowLeft: [0.035, 0],
      ArrowRight: [-0.035, 0],
      ArrowUp: [0, -0.035],
      ArrowDown: [0, 0.035],
    };
    const direction = directions[key.key];
    if (!direction) return;
    pointer = {
      x: Math.max(
        SYNTHETIC_BODY_BOUNDS.left,
        Math.min(SYNTHETIC_BODY_BOUNDS.right, pointer.x + direction[0]),
      ),
      y: Math.max(
        SYNTHETIC_BODY_BOUNDS.top,
        Math.min(SYNTHETIC_BODY_BOUNDS.bottom, pointer.y + direction[1]),
      ),
    };
    key.preventDefault();
    tick();
  });
  function handleVisibility() {
    if (hidden()) {
      manualPause = true;
      game.pause("Tab hidden. Resume when you return.");
    }
    if (!disposed) render();
  }
  listen(document, "visibilitychange", handleVisibility);
  listen(window, "pagehide", () => void stopCamera());
  const resize = new ResizeObserver(() => render());
  resize.observe(get("game-canvas"));
  const stopTicker =
    deps.autoTick === false ? () => {} : display.startTicker(tick);
  updateSettings();
  void cameraChoice.refresh();
  tick();
  setup.open();
  return {
    tick,
    dispose() {
      disposed = true;
      setup.dispose();
      cameraChoice.dispose();
      display.dispose();
      listeners.abort();
      resize.disconnect();
      stopTicker();
      void stopCamera();
    },
  };
}
