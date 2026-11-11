import { createResumeControl } from "./resume-control";
import { bombArt, moleArt } from "./mole-art";
import {
  CameraChoice,
  cameraChoiceMarkup,
  type CameraSelection,
} from "./camera-choice";
import {
  MoleGame,
  TUNING,
  type GameOptions,
} from "../../../games/mole-motion/src/index";
import { SinglePlayerSession } from "../../../packages/session/src/index";
import {
  containRect,
  decodeFramePacket,
  mapJoint,
  observationSpaceRevision,
  type ContactName,
  type GameMotionFrame,
  type Observation,
} from "../../../packages/motion/src/index";
import { drawMoleScene } from "./mole-renderer";
import { CameraReleases } from "./camera-release";
import { createGameDisplay } from "./game-display";
import {
  createPreGameSettings,
  preGameSettingsMarkup,
} from "./pre-game-settings";

// Proposed continuity window: fresh input must remain ready before play/recovery.
const READY_HOLD_MS = 600;
const MAX_RECOVERY_GAP_MS = 2000;

const targetSlots = ["mole-target", "mole-target-2", "bomb-target"] as const;
const bombWarning = `Avoid bombs · −${TUNING.bombPenalty} points`;

function targetMarkup(id: (typeof targetSlots)[number]): string {
  const bomb = id === "bomb-target";
  return `<div id="${id}" class="mole-target${bomb ? " mole-bomb" : ""}" hidden>${bomb ? bombArt : moleArt}<progress class="mole-lifetime" max="1" value="1" aria-label="${bomb ? "Bomb" : "Mole"} time remaining"></progress></div>`;
}

const modeCopy: Record<string, string> = {
  timed: "60 seconds. Make every mole count.",
  challenge: "Hit 15 moles before 60 seconds run out.",
  survival: "Keep going. Three escaped moles end the round.",
  practice: "No round timer or penalty for escaped moles.",
};

export function mountMoleGame(
  root: HTMLElement,
  deps: { now?: () => number; autoTick?: boolean; seed?: number } = {},
): { tick(): void; dispose(): void } {
  const now = deps.now || (() => performance.now());
  const setupMarkup = preGameSettingsMarkup(
    "Slap a Mole",
    `<label for="mode-select">Play mode</label><select id="mode-select"><option value="timed">◷  Timed · 60 seconds</option><option value="challenge">◎  Challenge · 15 moles</option><option value="survival">♡  Survival · 3 misses</option><option value="practice">∞  Practice · untimed</option></select><p id="mode-description" class="field-note">${modeCopy.timed}</p><p class="field-note">Whack the two moles as they appear. ${bombWarning}.</p>
    <label for="difficulty-select">Difficulty</label><select id="difficulty-select"><option value="easy">Easy · room to warm up</option><option value="normal" selected>Normal · find your rhythm</option><option value="hard">Hard · stretch your reach</option></select><p class="field-note">Hard favors moles farther from your available contact points, within the play area.</p>
    <label>How to whack</label><div class="mm-segment" role="group" aria-label="Interaction"><button id="interaction-touch" aria-pressed="true">Touch</button><button id="interaction-flick" aria-pressed="false">Flick</button><button id="interaction-push" aria-pressed="false">Push →</button></div><p id="interaction-note" class="field-note">Meet a mole with a hand or foot. Camera play uses wrist and ankle proxies.</p>
    `,
    `<label for="source-select">Input source</label><select id="source-select"><option value="camera">Camera · body tracking</option><option value="demo">Rehearsal · no camera</option></select>
    <div id="setup-camera-release" hidden><p id="setup-release-message" class="field-note" role="status"></p><button id="setup-retry-camera-stop" class="mm-secondary">Retry camera stop</button></div><p id="setup-input-status" class="field-note" role="status"></p><div id="demo-controls"><label for="demo-contact">Rehearsal contact</label><select id="demo-contact"><option value="left_wrist">Left wrist / hand</option><option value="right_wrist">Right wrist / hand</option><option value="left_hip">Left hip</option><option value="right_hip">Right hip</option><option value="left_foot">Left foot</option><option value="right_foot">Right foot</option></select><label class="check-row"><input id="demo-framing" type="checkbox" checked> Both feet in view</label></div>
    <div id="camera-controls" hidden>${cameraChoiceMarkup}<p class="field-note">Start only when ready. Vision owns the camera; frames stay local.</p><button id="source-connect" class="mm-secondary">Start camera</button><button id="setup-stop-camera" class="mm-text" disabled>Stop camera</button><details class="advanced-controls"><summary>Participant & tracking options</summary><label for="player-track">Participant override</label><select id="player-track"><option value="">Automatic · one participant</option></select><p class="field-note">Choose a player here if several people are in view before starting. Spectators can enter during play while the joined player stays tracked.</p></details></div>
    <div class="display-controls"><button id="open-game-display" class="mm-secondary">Open game window ↗</button><p id="display-status" class="field-note" role="status">Move the game window to your display; keep controls here.</p><label class="check-row"><input id="show-tracking" type="checkbox"> Show tracking diagnostics</label></div>
  `,
  );
  root.innerHTML = `
  <a class="skip" href="#game-stage">Skip to game</a>
  <header class="mm-header"><a class="mm-brand" href="/">✳ <span>Motion<span class="light">Studio</span></span></a><nav aria-label="Main"><a href="/" aria-label="All games">All games</a><a href="/diagnostics.html">Tracking console</a><a class="current" href="/mole.html" aria-current="page">Slap a Mole</a><a href="/dodgeball.html">Dodgeball</a><a href="/runner.html">Runner</a></nav><span class="local-pill"><i></i> Local & private</span></header>
  <main class="mm-main"><div class="mm-heading"><div><p class="eyebrow">THE MOTION ARCADE <span>/</span> GAME 01</p><h1>Slap a Mole<span class="heading-dot">.</span></h1><p class="intro">A little reach. A little rhythm. A whole lot of moles.</p></div><span class="experiment">Single player <span>Experimental</span></span></div>
  <div class="mm-layout play-layout">
  <div class="round-toolbar"><button id="open-settings" class="mm-secondary">Video & game settings</button><p id="player-binding" class="field-note" hidden></p><p id="player-status" class="player-readiness" role="status">Press Start round. We’ll wait until your input is ready.</p><button id="source-stop" class="mm-text" disabled>Stop camera</button></div><div id="camera-release" hidden><p id="camera-release-message" class="field-note" role="status"></p><button id="retry-camera-stop" class="mm-secondary">Retry camera stop</button></div>
  <section class="mm-game" aria-label="Slap a Mole game"><div class="scoreboard"><div class="score-item primary-score"><span>SCORE</span><strong id="score-value">000</strong></div><div class="score-item"><span id="time-label">TIME LEFT</span><strong id="time-value">1:00</strong></div><div class="score-item"><span>HITS</span><strong id="hits-value">0</strong></div><div class="score-item"><span>BEST STREAK</span><strong id="streak-value">0</strong></div><span id="source-label" class="source-tag">SYNTHETIC REHEARSAL</span></div>
    <div id="game-stage" class="mm-stage" tabindex="0" role="group" aria-label="Game play area. Rehearsal: move pointer or arrow keys to aim; Space to push."><canvas id="game-canvas" width="960" height="600" aria-label="Mirrored camera and game view"></canvas><div class="display-hud" aria-label="Live round score"><span>SCORE <strong id="display-score">000</strong></span><span>TIME <strong id="display-time">1:00</strong></span></div><div class="stage-label"><i></i><span id="stage-mode">TOUCH TO WHACK</span></div><div class="player-label">P1 <span id="stage-player">NOT JOINED</span></div>${targetSlots.map(targetMarkup).join("")}<div id="hit-feedback" class="hit-feedback" aria-hidden="true"></div><div class="mm-overlay" id="game-overlay"><div class="overlay-mole">${moleArt}</div><p id="overlay-kicker">READY, SET, REACH</p><h2 id="overlay-title">Small moles.<br>Big moves.</h2><p id="overlay-copy">Press Start round and make your first move.<br>Keep your whole body inside the camera view.</p><button id="resume-round" class="mm-primary" hidden>Resume</button></div><div class="stage-bottom"><span id="stage-help">Rehearsal · move your cursor or use arrow keys</span><span class="bomb-warning">${bombWarning}</span></div></div>
    <div class="target-track"><span id="target-life"></span><span id="misses-value">0 escaped</span></div>
    <div class="game-actions"><button id="start-round" class="mm-primary">Set up round <span>↗</span></button><button id="pause-round" class="mm-secondary" disabled>Pause</button><button id="end-round" class="mm-text" disabled>End round</button><button id="restart-round" class="mm-primary" hidden>Play again ↗</button><span id="game-status" role="status">Press Start round. Input checks happen automatically.</span></div>
    <p class="source-disclosure" id="source-disclosure">Synthetic controls, including simulated depth. This rehearsal does not measure camera or push accuracy.</p>
  </section></div>
  <section class="how-grid" aria-label="How to play"><article><span class="how-number">01</span><div><h2>Meet your mole</h2><p>Touch with a hand or foot, or choose Flick and flap your wrist near a mole. Push needs depth input.</p></div></article><article><span class="how-number">02</span><div><h2>Move, reset, repeat</h2><p>Each mole counts once. Move away after a touch, settle your hand after a flick, or bring your push back.</p></div></article><article><span class="how-number">03</span><div><h2>Stay in the picture</h2><p>Missing feet? Step back, check framing or clear an occlusion. Play pauses fairly.</p></div></article></section>
  <footer class="mm-footer"><span>Built for movement. Played in your space.</span><span>One player · English · M2 software preview</span></footer>${setupMarkup}</main>`;

  // Cache references before the stage moves to its separate display document.
  const controls = new Map(
    [...root.querySelectorAll<HTMLElement>("[id]")].map((element) => [
      element.id,
      element,
    ]),
  );
  const get = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const element = controls.get(id) as T | undefined;
    if (!element) throw new Error(`Missing game control: ${id}`);
    return element;
  };
  const select = (id: string) => get<HTMLSelectElement>(id);
  const listeners = new AbortController();
  const listen = (target: EventTarget, event: string, handler: EventListener) =>
    target.addEventListener(event, handler, { signal: listeners.signal });
  const resumeControl = createResumeControl(
    get<HTMLButtonElement>("resume-round"),
    get("game-stage"),
    listeners.signal,
  );
  const session = new SinglePlayerSession();
  const nextSeed = () => deps.seed ?? Math.floor(Math.random() * 4_294_967_296);
  let game = new MoleGame({}, nextSeed());
  let interaction: GameOptions["interaction"] = "touch";
  let demoJoined = false,
    sequence = 0,
    demoEpoch = 1;
  let frame: GameMotionFrame | null = null;
  let observation: Observation | null = null;
  let receivedAt = 0,
    image: ImageBitmap | null = null;
  let socket: WebSocket | null = null,
    generation = 0,
    epoch = "",
    connecting = false;
  let cameraMessage = "Start the camera, then press Start round.";
  let requested = false,
    manualPaused = false,
    needsNewOwner = false;
  let readySince: number | null = null;
  let cameraLastReceipt = 0;
  let roundOwner: { trackId: string; epoch: string; revision: string } | null =
    null;
  let disposed = false,
    pushUntil = -1,
    pointer = { x: 0.28, y: 0.5 };
  let lastStrikeSequence: number | null = null,
    hitUntil = 0,
    demoTime = -Infinity;
  const cameraChoice = new CameraChoice(root);
  const releases = new CameraReleases(fetch, updateReleaseControls);
  const setup = createPreGameSettings(root, () => {
    resetGame();
    requested = true;
    manualPaused = false;
    if (!isDemo()) ingestCamera();
    tick();
    get("game-stage").focus();
  });
  const isDemo = () => select("source-select").value === "demo";
  const isJoined = () => (isDemo() ? demoJoined : !!session.binding);
  const active = () =>
    requested || ["countdown", "playing", "paused"].includes(game.state.phase);
  const display = createGameDisplay(get("game-stage"), {
    title: "Slap a Mole",
    onStateChange(open) {
      get("open-game-display").textContent = open
        ? "Return game here"
        : "Open game window ↗";
      get("display-status").textContent = open
        ? "Game window open. Controls stay here."
        : "Move the game window to your display; keep controls here.";
      render();
    },
    onVisibilityChange: visibilityChanged,
  });
  const viewVisible = () => !document.hidden || display.visible;
  const config = (): Partial<GameOptions> => ({
    mode: select("mode-select").value as GameOptions["mode"],
    difficulty: select("difficulty-select").value as GameOptions["difficulty"],
    interaction,
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
  function updateTrackChoices() {
    const control = select("player-track");
    const binding = session.binding;
    const tracks = (observation?.people ?? [])
      .filter(
        (person) =>
          person.trackId &&
          person.identity === "confident" &&
          observation!.people.filter(
            (other) => other.trackId === person.trackId,
          ).length === 1,
      )
      .map((person) => person.trackId!)
      .sort();
    const choices = [...control.options].map((option) => option.value);
    // Preserve native selector focus and the open menu when only poses moved.
    if (JSON.stringify(choices) !== JSON.stringify(["", ...tracks])) {
      const previous = binding?.trackId ?? control.value;
      control.replaceChildren(
        new Option("Automatic · one participant", ""),
        ...tracks.map((track) => new Option(track, track)),
      );
      if (tracks.includes(previous)) control.value = previous;
    }
    control.disabled = game.state.phase !== "ready" || tracks.length === 0;

    get("player-binding").hidden = isDemo() || !binding;
    get("player-binding").textContent = binding
      ? `Player 1 · ${binding.trackId}`
      : "";
  }
  function resetGame() {
    game = new MoleGame(config(), nextSeed());
    lastStrikeSequence = null;
    hitUntil = 0;
    pushUntil = -1;
    requested = false;
    manualPaused = false;
    needsNewOwner = false;
    readySince = null;
    roundOwner = null;
    if (!isDemo()) {
      session.release();
      frame = null;
    }
  }
  function updateSettings() {
    const demo = isDemo();
    get("demo-controls").hidden = !demo;
    get("camera-controls").hidden = demo;
    get<HTMLButtonElement>("interaction-push").disabled = !demo || active();
    get("interaction-touch").setAttribute(
      "aria-pressed",
      String(interaction === "touch"),
    );
    get("interaction-push").setAttribute(
      "aria-pressed",
      String(interaction === "push"),
    );
    get("interaction-flick").setAttribute(
      "aria-pressed",
      String(interaction === "flick"),
    );
    get("interaction-note").textContent =
      interaction === "flick"
        ? demo
          ? "Aim near a mole, pause briefly, then flick the cursor or press an arrow key. Settle briefly before the next flick."
          : "Hold your wrist near a mole, then give a quick flap. Settle briefly to rearm. Your wrist must visibly move; finger-only flaps are not tracked."
        : !demo
          ? "Camera supplies 2D only: hands/feet use wrist/ankle proxies. Push needs calibrated depth and is unavailable here."
          : interaction === "touch"
            ? "Meet a mole with a hand or foot. Camera play uses wrist and ankle proxies."
            : "Line up a hip, hand or wrist, then push toward the screen. Rehearsal simulates depth: tap or press Space.";
    for (const option of select("demo-contact").options)
      option.disabled =
        interaction === "push"
          ? option.value.includes("foot")
          : option.value.includes("hip") ||
            (interaction === "flick" && option.value.includes("foot"));
    if (select("demo-contact").selectedOptions[0]?.disabled)
      select("demo-contact").value = "left_wrist";
    get("mode-description").textContent = modeCopy[select("mode-select").value];
    get("source-label").textContent = demo
      ? "SYNTHETIC REHEARSAL"
      : "LOCAL CAMERA · 2D";
    get("stage-mode").textContent =
      interaction === "flick"
        ? "FLICK TO WHACK"
        : interaction === "touch"
          ? "TOUCH TO WHACK"
          : "PUSH TO WHACK";
    get("source-disclosure").textContent = demo
      ? "Synthetic controls, including simulated depth. This rehearsal does not measure camera or push accuracy."
      : "Experimental camera contact play. Wrist/ankle proxies; physical accuracy, reach and latency need hardware trials. No recording.";
    get("stage-help").textContent = demo
      ? interaction === "flick"
        ? "Rehearsal · aim, settle, flick or tap ← →"
        : interaction === "touch"
          ? "Rehearsal · move your cursor or use arrow keys"
          : "Rehearsal · aim, then tap or press Space to push"
      : interaction === "flick"
        ? "Flick near a mole · settle between flaps"
        : "Move left → go left · keep hands and both feet visible";
  }
  function demoFrame(t: number): GameMotionFrame | null {
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
      depthAvailable: true,
      spaceRevision: "rehearsal-space-v1",
      contacts: [
        {
          name: select("demo-contact").value as ContactName,
          ...pointer,
          towardScreenM: t < pushUntil ? 0.18 : 0,
        },
      ],
    };
  }
  function render() {
    const state = game.state;
    const t = now();
    const readiness = game.readiness(t, frame);
    const fresh = frame && t - frame.atMs <= TUNING.staleMs && t >= frame.atMs;
    const previewFresh = observation && t - receivedAt <= TUNING.staleMs;
    const rect = drawMoleScene(
      get<HTMLCanvasElement>("game-canvas"),
      previewFresh ? observation : null,
      previewFresh ? image : null,
      fresh ? (frame?.contacts ?? []) : [],
      true,
      get<HTMLInputElement>("show-tracking").checked && !display.isOpen,
      isDemo(),
    );
    const moles = state.targets.filter((target) => target.kind === "mole");
    const bomb = state.targets.find((target) => target.kind === "bomb");
    const visibleTargets = [moles[0], moles[1], bomb];
    const lifetime = TUNING[state.options.difficulty].lifetimeMs;
    get("target-life").textContent = `${lifetime / 1000}s per target`;
    targetSlots.forEach((id, index) => {
      const element = get(id);
      const target = visibleTargets[index];
      element.hidden = !target || state.phase !== "playing";
      if (element.hidden || !target) return;
      const position = mapJoint(target, rect);
      element.dataset.targetId = String(target.id);
      element.style.left = `${position.x}px`;
      element.style.top = `${position.y}px`;
      element.style.width = `${target.radius * 2 * rect.width}px`;
      element.style.height = `${target.radius * 2 * rect.height}px`;
      element.querySelector("progress")!.value = target.remainingMs / lifetime;
    });
    get("score-value").textContent = String(state.score).padStart(3, "0");
    get("hits-value").textContent =
      `${state.hits}${state.options.mode === "challenge" ? " / 15" : ""}`;
    get("streak-value").textContent = String(state.bestCombo);
    get("misses-value").textContent =
      `${state.misses}${state.options.mode === "survival" ? " / 3" : ""} escaped`;
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
    get("stage-player").textContent =
      isJoined() && readiness.ready && !needsNewOwner ? "READY" : "WAITING";
    if (needsNewOwner)
      setPlayerStatus(
        "New round needed. Participant identity or camera space changed.",
      );
    else if (!isDemo() && session.binding && !readiness.ready)
      setPlayerStatus(readiness.reason || "Waiting for ready input.");
    get("display-score").textContent = get("score-value").textContent;
    get("display-time").textContent = get("time-value").textContent;
    const needsNewRound =
      state.phase === "paused" && (readiness.requiresNewRound || needsNewOwner);
    const locked = active();
    const configurationLocked = locked && !needsNewRound;
    for (const id of [
      "mode-select",
      "difficulty-select",
      "source-select",
      "demo-contact",
    ])
      get<HTMLSelectElement>(id).disabled = configurationLocked;
    get<HTMLButtonElement>("interaction-touch").disabled = configurationLocked;
    get<HTMLButtonElement>("interaction-flick").disabled = configurationLocked;
    get<HTMLButtonElement>("interaction-push").disabled =
      configurationLocked || !isDemo();
    get<HTMLButtonElement>("start-round").disabled =
      state.phase !== "ready" || requested;
    get("start-round").hidden = state.phase !== "ready" || requested;
    get<HTMLButtonElement>("pause-round").disabled = ![
      "playing",
      "countdown",
    ].includes(state.phase);
    get("pause-round").hidden = ["paused", "results"].includes(state.phase);
    get("resume-round").hidden =
      state.phase !== "paused" || needsNewRound || !manualPaused;
    get<HTMLButtonElement>("resume-round").disabled = !viewVisible();
    get<HTMLButtonElement>("end-round").disabled = !locked;
    get("restart-round").hidden = state.phase !== "results" && !needsNewRound;
    setup.setLocked(configurationLocked);
    get("restart-round").textContent = needsNewRound
      ? "Start new round ↗"
      : "Play again ↗";
    updateReleaseControls();
    const overlay = get("game-overlay");
    overlay.hidden =
      state.phase === "playing" ||
      (!isDemo() && state.phase === "ready" && !!previewFresh && !requested);
    overlay.classList.toggle("camera-notice", !isDemo() && !!previewFresh);
    get("overlay-kicker").textContent =
      state.phase === "paused"
        ? "TAKE A BREATH"
        : state.phase === "results"
          ? "THAT'S A ROUND"
          : state.phase === "countdown"
            ? "FIND YOUR SPACE"
            : "READY, SET, REACH";
    get("game-overlay").classList.toggle(
      "resume-menu",
      state.phase === "paused",
    );
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
        ? "New round needed"
        : manualPaused
          ? "Take a breath"
          : feet
            ? "Keep both feet in view"
            : "Finding your movement";
      copy.textContent = needsNewRound
        ? "The participant or camera space changed. Start a new round to keep score ownership clear. Your previous score stays here until then."
        : manualPaused
          ? "Your time and score are safe. Choose Resume when ready."
          : !readiness.ready
            ? readiness.reason ||
              "Waiting for the same participant. Keep your whole body in view."
            : "Tracking is steady. Restarting with a short countdown…";
      setMessage(
        needsNewRound
          ? "Participant changed. Set up a new round."
          : manualPaused
            ? "Paused. Resume when ready."
            : "Tracking paused · score and time saved · recovery is automatic.",
      );
    } else if (state.phase === "results") {
      title.textContent =
        state.result === "challenge-won" ? "Challenge cleared!" : "Nice moves.";
      copy.textContent = `${state.hits} moles whacked · ${state.score} points · best streak ${state.bestCombo}. ${state.result === "out-of-lives" ? "Three moles escaped." : state.result === "time-up" ? "Time is up." : "Ready for another round?"}`;
      setMessage("Round complete. Play again or change your setup.");
    } else if (state.phase === "playing") {
      setMessage(
        interaction === "flick"
          ? "Round in play. Flick near a mole, then settle your hand to reset."
          : interaction === "touch"
            ? "Round in play. Meet a mole, then move away to reset."
            : "Round in play. Aim, push, then return to reset.",
      );
    } else if (state.phase === "ready") {
      title.textContent = requested
        ? "Finding your movement"
        : "Small moles. Big moves.";
      copy.textContent = requested
        ? !isDemo() && !epoch
          ? "Start the camera to continue. Your round is ready when you are."
          : readiness.reason ||
            "Hold steady for a moment. Your countdown is coming."
        : "Press Start round. Keep your whole body in view; play begins when tracking is ready.";
      setMessage(
        !isDemo() && !epoch && !requested
          ? releases.state.message || cameraMessage
          : requested
            ? "Waiting for ready input · no round time is being used."
            : "Press Start round. We’ll check your input automatically.",
      );
    }
    const feedback = get("hit-feedback");
    const strike = state.lastStrike;
    if (strike && strike.sequence !== lastStrikeSequence) {
      lastStrikeSequence = strike.sequence;
      hitUntil = t + 850;
      feedback.classList.toggle("bomb-feedback", strike.bombPenalty > 0);
      const whack = strike.molePoints ? `WHACK! +${strike.molePoints}` : "";
      const blast = strike.bombPenalty ? `BOMB! −${strike.bombPenalty}` : "";
      feedback.textContent = [whack, blast].filter(Boolean).join(" · ");
    }
    feedback.hidden =
      hitUntil === 0 ||
      t > hitUntil ||
      (state.phase !== "playing" && state.phase !== "results");
    resumeControl.update();
  }
  function ingestCamera() {
    if (!observation) return;
    const revision = observationSpaceRevision(observation);
    const receiptGap = cameraLastReceipt ? receivedAt - cameraLastReceipt : 0;
    cameraLastReceipt = receivedAt;
    const tracks = observation.people.filter(
      (person) =>
        person.trackId &&
        person.identity === "confident" &&
        observation!.people.filter((other) => other.trackId === person.trackId)
          .length === 1,
    );
    const override = select("player-track").value;
    // Explicit identity loss cannot prove who returned: restart rather than attach an old score.
    if (
      roundOwner &&
      (receiptGap > MAX_RECOVERY_GAP_MS ||
        tracks.filter((person) => person.trackId === roundOwner!.trackId)
          .length !== 1)
    )
      needsNewOwner = true;
    if (!roundOwner && !override && tracks.length !== 1) {
      session.release();
      readySince = null;
    }
    if (
      roundOwner &&
      (roundOwner.epoch !== observation.epoch ||
        roundOwner.revision !== revision)
    )
      needsNewOwner = true;
    const previousBinding = session.binding;
    frame = previousBinding ? session.ingest(observation, receivedAt) : null;
    if (previousBinding && !session.binding) {
      readySince = null;
      if (
        !/missing or uncertain|Tracking was interrupted/.test(
          session.reason || "",
        )
      )
        needsNewOwner = !!roundOwner;
    }
    if (!session.binding && !needsNewOwner) {
      // Automatic admission is only for a unique confident identity, never array order.
      const desired =
        roundOwner?.trackId ||
        override ||
        (tracks.length === 1 ? tracks[0].trackId : "");
      const person = tracks.find((track) => track.trackId === desired);
      if (person) frame = session.join(observation, desired!, receivedAt);
      else if (
        roundOwner &&
        tracks.length === 1 &&
        tracks[0].trackId !== roundOwner.trackId
      )
        needsNewOwner = true;
      if (!person)
        setPlayerStatus(
          tracks.length > 1
            ? "More than one participant. Keep one in view or choose a participant in advanced options."
            : "Waiting for one confidently tracked participant.",
        );
    }
    if (session.binding)
      setPlayerStatus("Participant found. Keep your whole body in view.");
  }
  function tick() {
    if (disposed) return;
    const t = now();
    if (isDemo()) {
      demoJoined = true;
      frame = demoFrame(t);
    }
    game.update(t, frame);
    const ready =
      game.readiness(t, frame).ready && viewVisible() && !needsNewOwner;
    if (!ready) readySince = null;
    else readySince ??= t;
    const steady = ready && (isDemo() || t - readySince! >= READY_HOLD_MS);
    if (requested && game.state.phase === "ready" && steady) {
      requested = false;
      const binding = session.binding;
      if (binding && observation)
        roundOwner = {
          trackId: binding.trackId,
          epoch: binding.epoch,
          revision: observationSpaceRevision(observation),
        };
      game.start(t);
    } else if (game.state.phase === "paused" && !manualPaused && steady)
      game.resume(t);
    updateTrackChoices();
    render();
  }
  async function stopCamera(
    message = "Camera stopped. Start it again when ready.",
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
    if (roundOwner) needsNewOwner = true;
    readySince = null;
    cameraLastReceipt = 0;
    if (active()) game.pause(message);
    select("player-track").replaceChildren(
      new Option("Automatic · one participant", ""),
    );
    setPlayerStatus(message);
    setMessage(message);
    updateTrackChoices();
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
              readySince = null;
              game.pause(
                "Camera input is stale. Waiting for the same participant.",
              );
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
            updateTrackChoices();
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
  listen(get("source-connect"), "click", () => void startCamera());
  listen(get("source-stop"), "click", () => void stopCamera());
  listen(get("setup-stop-camera"), "click", () => void stopCamera());
  listen(get("setup-retry-camera-stop"), "click", () => void releases.retry());
  listen(get("retry-camera-stop"), "click", () => void releases.retry());
  listen(select("source-select"), "change", () => {
    if (!isDemo()) void cameraChoice.refresh();
    void stopCamera();
    demoJoined = false;
    demoEpoch++;
    interaction = "touch";
    resetGame();
    updateSettings();
    setPlayerStatus(
      isDemo()
        ? "Rehearsal ready. Press Start round."
        : "Start the camera, then press Start round.",
    );
    setMessage("Choose your input and press Start round.");
    tick();
  });
  for (const id of ["mode-select", "difficulty-select"])
    listen(get(id), "change", () => {
      resetGame();
      updateSettings();
      tick();
    });
  for (const value of ["touch", "flick", "push"] as const)
    listen(get(`interaction-${value}`), "click", () => {
      if (
        get<HTMLButtonElement>("confirm-start").disabled ||
        (value === "push" && !isDemo())
      )
        return;
      interaction = value;
      resetGame();
      updateSettings();
      tick();
    });
  listen(select("player-track"), "change", () => {
    if (game.state.phase !== "ready") return;
    session.release();
    readySince = null;
    ingestCamera();
    tick();
  });
  listen(get("show-tracking"), "change", () => render());
  listen(get("open-game-display"), "click", () => {
    if (display.isOpen) display.close();
    else if (!display.open())
      get("display-status").textContent =
        "Allow pop-ups for this local page, then try again.";
  });
  listen(get("open-settings"), "click", () => setup.open());
  listen(get("start-round"), "click", () => setup.open(get("start-round")));
  listen(get("pause-round"), "click", () => {
    manualPaused = true;
    game.pause("Paused by player.");
    tick();
  });
  listen(get("resume-round"), "click", () => {
    if (
      !viewVisible() ||
      needsNewOwner ||
      game.state.phase !== "paused" ||
      game.readiness(now(), frame).requiresNewRound
    )
      return;
    manualPaused = false;
    readySince = null;
    tick();
    get("game-stage").focus({ preventScroll: true });
  });
  listen(get("end-round"), "click", () => {
    if (requested) resetGame();
    else game.finish();
    tick();
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
    const next = {
      x: 1 - (event.clientX - bounds.left - rect.x) / rect.width,
      y: (event.clientY - bounds.top - rect.y) / rect.height,
    };
    if (next.x >= 0 && next.x <= 1 && next.y >= 0 && next.y <= 1)
      pointer = next;
  }
  listen(get("game-stage"), "pointermove", (event) =>
    aim(event as PointerEvent),
  );
  listen(get("game-stage"), "pointerdown", (event) => {
    aim(event as PointerEvent);
    if (isDemo()) {
      get("game-stage").focus();
      pushUntil = now() + 180;
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
    if (key.key === " ") {
      if (!key.repeat) pushUntil = now() + 180;
    } else if (directions[key.key]) {
      const [x, y] = directions[key.key];
      pointer = {
        x: Math.max(0, Math.min(1, pointer.x + x)),
        y: Math.max(0, Math.min(1, pointer.y + y)),
      };
    } else return;
    key.preventDefault();
    tick();
  });
  function visibilityChanged() {
    if (!viewVisible()) {
      manualPaused = true;
      readySince = null;
      game.pause("Game hidden. Resume when you return.");
      pushUntil = -1;
      if (!disposed) render();
    }
  }
  listen(document, "visibilitychange", visibilityChanged);
  listen(window, "pagehide", () => {
    void stopCamera();
  });
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
      listeners.abort();
      display.dispose();
      resize.disconnect();
      stopTicker();
      void stopCamera();
    },
  };
}
