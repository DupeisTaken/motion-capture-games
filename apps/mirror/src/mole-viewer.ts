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

// Proposed continuity window: fresh input must remain ready before play/recovery.
const READY_HOLD_MS = 600;
const MAX_RECOVERY_GAP_MS = 2000;

const moleArt = `<svg viewBox="0 0 120 110" aria-hidden="true"><ellipse cx="60" cy="96" rx="52" ry="11" fill="#071d1a"/><path d="M19 88V55a41 41 0 0 1 82 0v33" fill="#ce9364"/><circle cx="25" cy="37" r="14" fill="#ce9364"/><circle cx="95" cy="37" r="14" fill="#ce9364"/><circle cx="25" cy="37" r="8" fill="#a7654c"/><circle cx="95" cy="37" r="8" fill="#a7654c"/><path d="M19 88V57a41 41 0 0 1 82 0v31" fill="#ce9364"/><ellipse cx="60" cy="72" rx="23" ry="18" fill="#f4cc9c"/><ellipse cx="60" cy="62" rx="10" ry="7" fill="#492e2b"/><circle cx="43" cy="50" r="4" fill="#272d29"/><circle cx="78" cy="50" r="4" fill="#272d29"/><path d="m51 80 9 5 9-5" fill="none" stroke="#734a3b" stroke-width="3" stroke-linecap="round"/><path d="M13 94h94" stroke="#74aa81" stroke-width="5" stroke-linecap="round"/></svg>`;

const modeCopy: Record<string, string> = {
  timed: "60 seconds. Make every mole count.",
  challenge: "Hit 15 moles before 60 seconds run out.",
  survival: "Keep going. Three escaped moles end the round.",
  practice: "No clock, no penalties. Find your rhythm.",
};

export function mountMoleGame(
  root: HTMLElement,
  deps: { now?: () => number; autoTick?: boolean; seed?: number } = {},
): { tick(): void; dispose(): void } {
  const now = deps.now || (() => performance.now());
  root.innerHTML = `
  <a class="skip" href="#game-stage">Skip to game</a>
  <header class="mm-header"><a class="mm-brand" href="/">✳ <span>Motion<span class="light">Studio</span></span></a><nav aria-label="Main"><a href="/">Tracking console</a><a class="current" href="/mole.html" aria-current="page">Mole Motion</a><a href="/dodgeball.html">Dodgeball</a></nav><span class="local-pill"><i></i> Local & private</span></header>
  <main class="mm-main"><div class="mm-heading"><div><p class="eyebrow">THE MOTION ARCADE <span>/</span> GAME 01</p><h1>Mole Motion<span class="heading-dot">.</span></h1><p class="intro">A little reach. A little rhythm. A whole lot of moles.</p></div><span class="experiment">Single player <span>Experimental</span></span></div>
  <div class="mm-layout"><aside class="mm-settings" aria-label="Game settings">
    <div class="settings-title"><h2>Make it your game</h2><span>01</span></div>
    <label for="mode-select">Play mode</label><select id="mode-select"><option value="timed">◷  Timed · 60 seconds</option><option value="challenge">◎  Challenge · 15 moles</option><option value="survival">♡  Survival · 3 misses</option><option value="practice">∞  Practice · no pressure</option></select><p id="mode-description" class="field-note">${modeCopy.timed}</p>
    <label for="difficulty-select">Difficulty</label><select id="difficulty-select"><option value="easy">Easy · room to warm up</option><option value="normal" selected>Normal · find your rhythm</option><option value="hard">Hard · stretch your reach</option></select><p class="field-note">Hard favors moles farther from your available contact points, within the play area.</p>
    <label>How to whack</label><div class="mm-segment" role="group" aria-label="Interaction"><button id="interaction-touch" aria-pressed="true">Touch</button><button id="interaction-push" aria-pressed="false">Push →</button></div><p id="interaction-note" class="field-note">Meet a mole with a hand or foot. Camera play uses wrist and ankle proxies.</p>
    <hr><label for="source-select">Input source</label><select id="source-select"><option value="camera">Camera · body tracking</option><option value="demo">Rehearsal · no camera</option></select>
    <div id="camera-release" hidden><p id="camera-release-message" class="field-note" role="status"></p><button id="retry-camera-stop" class="mm-secondary">Retry camera stop</button></div>
    <div id="demo-controls"><label for="demo-contact">Rehearsal contact</label><select id="demo-contact"><option value="left_wrist">Left wrist / hand</option><option value="right_wrist">Right wrist / hand</option><option value="left_hip">Left hip</option><option value="right_hip">Right hip</option><option value="left_foot">Left foot</option><option value="right_foot">Right foot</option></select><label class="check-row"><input id="demo-framing" type="checkbox" checked> Both feet in view</label></div>
    <div id="camera-controls" hidden>${cameraChoiceMarkup}<p class="field-note">Start only when ready. Vision owns the camera; frames stay local.</p><button id="source-connect" class="mm-secondary">Start camera</button><button id="source-stop" class="mm-text" disabled>Stop camera</button><details class="advanced-controls"><summary>Participant & tracking options</summary><label for="player-track">Participant override</label><select id="player-track"><option value="">Automatic · one participant</option></select><p class="field-note">Only needed with more than one participant. Selection is locked during a round.</p></details></div>
    <p id="player-binding" class="field-note" hidden></p><p id="player-status" class="player-readiness" role="status">Press Start round. We’ll wait until your input is ready.</p><div class="display-controls"><button id="open-game-display" class="mm-secondary">Open game window ↗</button><p id="display-status" class="field-note" role="status">Move the game window to your display; keep controls here.</p><label class="check-row"><input id="show-tracking" type="checkbox"> Show tracking diagnostics</label></div>
  </aside>
  <section class="mm-game" aria-label="Mole Motion game"><div class="scoreboard"><div class="score-item primary-score"><span>SCORE</span><strong id="score-value">000</strong></div><div class="score-item"><span id="time-label">TIME LEFT</span><strong id="time-value">1:00</strong></div><div class="score-item"><span>HITS</span><strong id="hits-value">0</strong></div><div class="score-item"><span>BEST STREAK</span><strong id="streak-value">0</strong></div><span id="source-label" class="source-tag">SYNTHETIC REHEARSAL</span></div>
    <div id="game-stage" class="mm-stage" tabindex="0" role="group" aria-label="Game play area. Rehearsal: move pointer or arrow keys to aim; Space to push."><canvas id="game-canvas" width="960" height="600" aria-label="Mirrored camera and game view"></canvas><div class="display-hud" aria-label="Live round score"><span>SCORE <strong id="display-score">000</strong></span><span>TIME <strong id="display-time">1:00</strong></span></div><div class="stage-label"><i></i><span id="stage-mode">TOUCH TO WHACK</span></div><div class="player-label">P1 <span id="stage-player">NOT JOINED</span></div><div id="mole-target" class="mole-target" hidden>${moleArt}</div><div id="hit-feedback" class="hit-feedback" aria-hidden="true"></div><div class="mm-overlay" id="game-overlay"><div class="overlay-mole">${moleArt}</div><p id="overlay-kicker">READY, SET, REACH</p><h2 id="overlay-title">Small moles.<br>Big moves.</h2><p id="overlay-copy">Press Start round and make your first move.<br>Keep your whole body inside the camera view.</p></div><div class="stage-bottom"><span id="stage-help">Rehearsal · move your cursor or use arrow keys</span><span>MIRRORED VIEW</span></div></div>
    <div class="target-track"><span id="target-life">Waiting for your first mole</span><progress id="target-progress" max="1" value="1" aria-label="Mole time remaining"></progress><span id="misses-value">0 escaped</span></div>
    <div class="game-actions"><button id="start-round" class="mm-primary">Start round <span>↗</span></button><button id="pause-round" class="mm-secondary" disabled>Pause</button><button id="resume-round" class="mm-primary" hidden>Resume · countdown</button><button id="end-round" class="mm-text" disabled>End round</button><button id="restart-round" class="mm-primary" hidden>Play again ↗</button><span id="game-status" role="status">Press Start round. Input checks happen automatically.</span></div>
    <p class="source-disclosure" id="source-disclosure">Synthetic controls, including simulated depth. This rehearsal does not measure camera or push accuracy.</p>
  </section></div>
  <section class="how-grid" aria-label="How to play"><article><span class="how-number">01</span><div><h2>Meet your mole</h2><p>Touch with a hand or foot. Push uses hips, hands or wrists with depth input.</p></div></article><article><span class="how-number">02</span><div><h2>Move, reset, repeat</h2><p>Each mole counts once. Move away or bring your push back before the next hit.</p></div></article><article><span class="how-number">03</span><div><h2>Stay in the picture</h2><p>Missing feet? Step back, check framing or clear an occlusion. Play pauses fairly.</p></div></article></section>
  <footer class="mm-footer"><span>Built for movement. Played in your space.</span><span>One player · English · M2 software preview</span></footer></main>`;

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
  let lastHits = 0,
    hitUntil = 0,
    demoTime = -Infinity;
  const cameraChoice = new CameraChoice(root);
  const releases = new CameraReleases(fetch, updateReleaseControls);
  const isDemo = () => select("source-select").value === "demo";
  const isJoined = () => (isDemo() ? demoJoined : !!session.binding);
  const active = () =>
    requested || ["countdown", "playing", "paused"].includes(game.state.phase);
  const display = createGameDisplay(get("game-stage"), {
    title: "Mole Motion",
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
    lastHits = 0;
    lastScore = 0;
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
    get("interaction-note").textContent = !demo
      ? "Camera supplies 2D only: hands/feet use wrist/ankle proxies. Push needs calibrated depth and is unavailable here."
      : interaction === "touch"
        ? "Meet a mole with a hand or foot. Camera play uses wrist and ankle proxies."
        : "Line up a hip, hand or wrist, then push toward the screen. Rehearsal simulates depth: tap or press Space.";
    for (const option of select("demo-contact").options)
      option.disabled =
        interaction === "touch"
          ? option.value.includes("hip")
          : option.value.includes("foot");
    if (select("demo-contact").selectedOptions[0]?.disabled)
      select("demo-contact").value = "left_wrist";
    get("mode-description").textContent = modeCopy[select("mode-select").value];
    get("source-label").textContent = demo
      ? "SYNTHETIC REHEARSAL"
      : "LOCAL CAMERA · 2D";
    get("stage-mode").textContent =
      interaction === "touch" ? "TOUCH TO WHACK" : "PUSH TO WHACK";
    get("source-disclosure").textContent = demo
      ? "Synthetic controls, including simulated depth. This rehearsal does not measure camera or push accuracy."
      : "Experimental camera contact play. Wrist/ankle proxies; physical accuracy, reach and latency need hardware trials. No recording.";
    get("stage-help").textContent = demo
      ? interaction === "touch"
        ? "Rehearsal · move your cursor or use arrow keys"
        : "Rehearsal · aim, then tap or press Space to push"
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
    const target = get("mole-target");
    target.hidden = !state.target || state.phase !== "playing";
    if (state.target) {
      const mole = state.target;
      const position = mapJoint(mole, rect);
      target.style.left = `${position.x}px`;
      target.style.top = `${position.y}px`;
      target.style.width = `${mole.radius * 2 * rect.width}px`;
      target.style.height = `${mole.radius * 2 * rect.height}px`;
      get("target-life").textContent =
        `${(mole.remainingMs / 1000).toFixed(1)}s to whack`;
      get<HTMLProgressElement>("target-progress").value =
        mole.remainingMs / TUNING[state.options.difficulty].lifetimeMs;
    } else
      get("target-life").textContent =
        state.phase === "results"
          ? "Round complete"
          : "Waiting for your next mole";
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
    const locked = active();
    for (const id of [
      "mode-select",
      "difficulty-select",
      "source-select",
      "demo-contact",
    ])
      get<HTMLSelectElement>(id).disabled = locked;
    get<HTMLButtonElement>("interaction-touch").disabled = locked;
    get<HTMLButtonElement>("interaction-push").disabled = locked || !isDemo();
    get<HTMLButtonElement>("start-round").disabled =
      state.phase !== "ready" || requested;
    get("start-round").hidden = state.phase !== "ready" || requested;
    get<HTMLButtonElement>("pause-round").disabled = ![
      "playing",
      "countdown",
    ].includes(state.phase);
    get("pause-round").hidden = ["paused", "results"].includes(state.phase);
    const needsNewRound =
      state.phase === "paused" && (readiness.requiresNewRound || needsNewOwner);
    get("resume-round").hidden =
      state.phase !== "paused" || needsNewRound || !manualPaused;
    get<HTMLButtonElement>("resume-round").disabled = !viewVisible();
    get<HTMLButtonElement>("end-round").disabled = !locked;
    get("restart-round").hidden = state.phase !== "results" && !needsNewRound;
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
        interaction === "touch"
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
    if (state.hits > lastHits) {
      hitUntil = t + 550;
      get("hit-feedback").textContent = `WHACK! +${state.score - lastScore}`;
    }
    lastHits = state.hits;
    lastScore = state.score;
    get("hit-feedback").hidden = t > hitUntil || hitUntil === 0;
  }
  let lastScore = 0;
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
  for (const value of ["touch", "push"] as const)
    listen(get(`interaction-${value}`), "click", () => {
      if (active() || (value === "push" && !isDemo())) return;
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
  listen(get("start-round"), "click", () => {
    requested = true;
    manualPaused = false;
    tick();
  });
  listen(get("pause-round"), "click", () => {
    manualPaused = true;
    game.pause("Paused by player.");
    tick();
  });
  listen(get("resume-round"), "click", () => {
    manualPaused = false;
    readySince = null;
    tick();
  });
  listen(get("end-round"), "click", () => {
    if (requested) resetGame();
    else game.finish();
    tick();
  });
  listen(get("restart-round"), "click", () => {
    const startAgain =
      needsNewOwner || game.readiness(now(), frame).requiresNewRound;
    resetGame();
    requested = startAgain;
    if (!isDemo()) ingestCamera();
    setMessage("Ready for another round. Adjust your setup or start again.");
    tick();
  });
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
  return {
    tick,
    dispose() {
      disposed = true;
      cameraChoice.dispose();
      listeners.abort();
      display.dispose();
      resize.disconnect();
      stopTicker();
      void stopCamera();
    },
  };
}
