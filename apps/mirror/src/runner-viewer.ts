import { createResumeControl } from "./resume-control";
import {
  RunnerGame,
  type RunnerOptions,
} from "../../../games/motion-runner/src/index";
import {
  RunnerPoseControls,
  type Lane,
  type RunnerInput,
} from "../../../games/motion-runner/src/index";
import {
  decodeFramePacket,
  type Observation,
} from "../../../packages/motion/src/index";
import { SinglePlayerSession } from "../../../packages/session/src/index";
import { CameraChoice, cameraChoiceMarkup } from "./camera-choice";
import { CameraReleases } from "./camera-release";
import { createRunnerRenderer } from "./runner-renderer";
import { RunnerPreview } from "./runner-preview";

type Skin = "nova" | "moss" | "ember";
const titles = { rail: "Neon Rails", gold: "Gold Rush" };
const practiceLabels = ["Left", "Center", "Right", "Jump", "Roll", "Stand"];

/** The app owns camera/session composition; the game only receives canonical input. */
export function mountRunnerGame(
  root: HTMLElement,
  deps: { now?: () => number; autoTick?: boolean; seed?: number } = {},
): { tick(): void; dispose(): void } {
  const now = deps.now ?? (() => performance.now());
  root.innerHTML = `
  <a class="skip" href="#game-stage">Skip to game</a>
  <header class="mm-header"><a class="mm-brand" href="/"><span>Motion<span class="light">Studio</span></span></a><nav aria-label="Main"><a href="/" aria-label="All games">All games</a><a href="/diagnostics.html">Tracking console</a><a href="/mole.html">Slap a Mole</a><a href="/dodgeball.html">Dodgeball</a><a href="/runner.html" class="current" aria-current="page">Runner</a></nav><span class="local-pill"><i></i> Local & private</span></header>
  <main class="runner-main"><div class="runner-heading"><div><p class="eyebrow">THE MOTION ARCADE <span>/</span> GAME 03</p><h1>Find your flow<span>.</span></h1><p>Three lanes. Two worlds. Your next great escape.</p></div><span class="runner-tag">1 PLAYER <span>EXPERIMENTAL</span></span></div>
  <div class="runner-layout"><section class="runner-play" aria-label="Motion runner">
    <div class="runner-stage" id="game-stage" tabindex="0" role="region" aria-label="Runner play area. Left, center and right choose lanes. Up or Space jumps. Hold Down to roll.">
      <canvas id="game-canvas" aria-label="Original three-dimensional runner world. Gameplay is shown instead of camera video.">Your browser needs WebGL to display the runner world.</canvas>
      <div class="runner-top"><div><span class="stage-eyebrow" id="source-label">BODY TRACKING</span><strong id="world-title">Neon Rails</strong></div><span id="player-badge">WAITING FOR PLAYER</span></div>
      <div class="runner-hud"><div><span>SCORE</span><strong id="score-value">00000</strong></div><div><span>COINS</span><strong id="coins-value">0</strong></div><div><span>DISTANCE</span><strong><span id="distance-value">0</span><small> m</small></strong></div><div><span>SHIELDS</span><strong id="lives-value">3</strong></div></div>
      <div class="runner-overlay" id="game-overlay"><div class="runner-overlay-card"><p id="overlay-kicker">YOUR BODY. YOUR CONTROLLER.</p><h2 id="overlay-title">A new kind of<br>runner's high.</h2><p id="overlay-copy">Step left or right. Jump the hurdles. Duck into a roll. The city is yours to explore.</p><button id="resume-round" class="runner-primary" hidden>Resume</button><button id="overlay-start" class="runner-primary">Start run <span>→</span></button></div></div>
      <div id="runner-feedback" class="runner-feedback" role="status" aria-live="polite" hidden></div>
      <button id="stage-pause" class="stage-pause" hidden>Pause</button>
      <div class="runner-bottom"><span id="action-label">CENTER · STANDING</span><span id="speed-label">0.0 m/s</span></div>
    </div>
    <div class="runner-toolbar"><p id="game-status" role="status" aria-live="polite">Choose your input, then start your run.</p><div><button id="start-round" class="runner-primary">Start run →</button><button id="pause-round" hidden>Pause</button><button id="new-round" hidden>New run</button><button id="end-round" hidden>End run</button></div></div>
    <div class="runner-controls" id="demo-controls"><span>REHEARSAL CONTROLS</span><div class="lane-buttons" role="group" aria-label="Choose lane"><button id="lane-left" aria-label="Select left lane">← <span>Left</span></button><button id="lane-center" aria-label="Select center lane">● <span>Center</span></button><button id="lane-right" aria-label="Select right lane"><span>Right</span> →</button></div><div class="action-buttons"><button id="jump-action">↑ <span>Jump</span></button><button id="duck-action" aria-pressed="false">↓ <span>Roll</span></button></div><p>Keyboard: ← / C / → lanes · Space jump · hold ↓ to roll.<br>Touch: tap a lane or Jump; hold Roll.</p></div>
    <section id="body-preview" class="body-preview" aria-label="Live body control preview" hidden><div class="preview-heading"><div><p class="eyebrow">LEARN YOUR CONTROLS</p><h2>Your movement, live.</h2></div><label class="runner-check"><input id="show-preview" type="checkbox" checked> Show camera</label></div><p>Move your mirrored image into a third to choose a lane. Set standing, then lift your head and torso to jump; lower both to roll.</p><div class="preview-picture"><canvas id="camera-preview" width="640" height="480" aria-label="Mirrored camera from the existing body tracking source"></canvas><svg id="preview-guides" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Lane thirds and calibrated head height guides"><path d="M33.333 0V100 M66.667 0V100" class="third-lines"/><g class="third-labels"><text x="16.67" y="9">LEFT</text><text x="50" y="9">CENTER</text><text x="83.33" y="9">RIGHT</text></g><g id="head-guides" hidden><line id="jump-guide" x1="0" x2="100"/><line id="standing-guide" x1="0" x2="100"/><line id="duck-guide" x1="0" x2="100"/><circle id="head-marker" r="1.8"/></g></svg><p id="preview-empty">Start camera to see your controls.</p></div><div class="preview-readout"><strong id="preview-action">WAITING FOR PLAYER</strong><span id="preview-freshness" role="status">Camera off</span><span id="preview-age"></span></div><p id="preview-thresholds">Head guides appear after Set standing reference. Green: jump · white: standing · amber: roll.</p></section>
    <div class="runner-principles"><p><strong>Move to a lane</strong><span>Left, center or right image third. Holding a position keeps your lane.</span></p><p><strong>Jump & roll</strong><span>Jump low hurdles. Duck under the overhead gates.</span></p><p><strong>Your run stays yours</strong><span>Spectators can enter the frame. The game pauses if it loses your tracking.</span></p></div>
  </section><aside class="runner-settings" aria-label="Run setup"><div class="runner-section-label"><span>MAKE IT YOURS</span><span>01</span></div><h2>Choose your escape.</h2>
    <label for="world-select">World</label><select id="world-select"><option value="rail">Neon Rails · the mint skyline</option><option value="gold">Gold Rush · a sunlit getaway</option></select><p class="field-note" id="world-description">A mint skyline, railway runs and colorful city streets.</p>
    <label for="skin-select">Runner skin</label><select id="skin-select"><option value="nova">Nova · cobalt & mint</option><option value="moss">Moss · forest explorer</option><option value="ember">Ember · sunset sprint</option></select><div class="skin-swatches" aria-hidden="true"><i class="nova"></i><i class="moss"></i><i class="ember"></i><span>All skins included. Same abilities.</span></div>
    <div class="runner-pace"><label class="runner-check pace-option"><input id="fast-start" type="checkbox" role="switch" aria-label="Fast start" aria-describedby="pace-description"><span><strong>Fast start</strong><small>A quicker opening pace.</small></span></label><p class="field-note" id="pace-description">Off: 10 m/s · On: 14 m/s. Both build up to 18 m/s.</p></div>
    <label class="runner-check"><input id="practice-mode" type="checkbox"> Practice · no penalties</label>
    <div class="runner-section-label input-section"><span>YOUR CONTROLLER</span><span>02</span></div><label for="source-select">Input</label><select id="source-select"><option value="demo">Rehearsal · keyboard & touch</option><option value="camera">Camera · body tracking</option></select>
    <div id="camera-controls">${cameraChoiceMarkup}<div class="camera-actions"><button id="source-connect">Start camera</button><button id="source-stop" disabled>Stop camera</button></div><p class="field-note" id="camera-status" role="status">Camera stays off until you choose Start camera. The learning preview shares body tracking; the game stays rendered.</p><div id="camera-release" hidden><p id="camera-release-message" role="status"></p><button id="retry-camera-stop">Retry camera stop</button></div><button id="calibrate-player" disabled>Set standing reference</button><p class="field-note">Stand comfortably with your head, shoulders and hips in view. Set this height again if the camera moves. Try the moves below if you like; they do not block Start.</p><div id="practice-checklist" aria-label="Optional camera movement practice">${practiceLabels.map((label, index) => `<span id="practice-${index}">${label}</span>`).join("")}</div><p class="field-note" id="practice-status" role="status">Set standing, try a move, then Start run when ready.</p></div>
    <div id="rehearsal-note" hidden><p class="rehearsal-note">Camera-free simulation. Choose Start run, then use the keyboard or touch controls.</p><details><summary>Tracking rehearsal</summary><label class="runner-check"><input id="demo-extra" type="checkbox"> Simulate a spectator</label><label class="runner-check"><input id="demo-missing" type="checkbox"> Simulate lost tracking</label></details></div>
    <div class="runner-safety"><strong>A little room to move.</strong><p>One player only. Clear space for small side steps, jumping and ducking. Tracking accuracy and physical timing are experimental.</p></div>
  </aside></div><footer class="runner-footer">Original worlds & characters · Local play · English <span>No recording. No camera image on the game screen.</span></footer></main>`;
  const get = <T extends HTMLElement = HTMLElement>(id: string) => {
    const value = root.querySelector<T>(`#${id}`);
    if (!value) throw new Error(`Missing runner element: ${id}`);
    return value;
  };
  const select = (id: string) => get<HTMLSelectElement>(id);
  const checked = (id: string) => get<HTMLInputElement>(id).checked;
  const setText = (id: string, value: string) => {
    if (get(id).textContent !== value) get(id).textContent = value;
  };
  const listeners = new AbortController();
  function listen(target: EventTarget, name: string, callback: EventListener) {
    target.addEventListener(name, callback, { signal: listeners.signal });
  }
  const resumeControl = createResumeControl(
    get<HTMLButtonElement>("resume-round"),
    get("game-stage"),
    listeners.signal,
  );
  const isDemo = () => select("source-select").value === "demo";
  const options = (): RunnerOptions => ({
    variant: select("world-select").value as RunnerOptions["variant"],
    practice: checked("practice-mode"),
    fastStart: checked("fast-start"),
  });
  const seed = () => deps.seed ?? Math.floor(Math.random() * 0x100000000);
  let game = new RunnerGame(options(), seed());
  let renderingUnavailable = false;
  const renderer = (() => {
    try {
      return createRunnerRenderer(get<HTMLCanvasElement>("game-canvas"));
    } catch {
      renderingUnavailable = true;
      return { render() {}, dispose() {} };
    }
  })();
  const session = new SinglePlayerSession({ recoveryWindowMs: 450 });
  const pose = new RunnerPoseControls();
  const preview = new RunnerPreview(get<HTMLCanvasElement>("camera-preview"));
  const cameraChoice = new CameraChoice(root);
  const releases = new CameraReleases(fetch, updateReleaseControls);
  let disposed = false;
  let manualPause = false;
  let ownershipChanged = false;
  let cameraInput: RunnerInput | null = null;
  let observation: Observation | null = null;
  let receivedAt = -Infinity;
  let trackingStale = false;
  let cameraEpoch = "";
  let generation = 0;
  let connecting = false;
  const pendingStarts = new Set<number>();
  let startupUncertain = false;
  let socket: WebSocket | null = null;
  let demoEpoch = 1;
  let demoSequence = 0;
  let demoLane: Lane = 0;
  let demoDuck = false;
  let pendingJump = false;
  let lastDemoInput: RunnerInput | null = null;
  let owner: { trackId: string; epoch: string } | null = null;
  let frameId = 0;
  let lastHits = 0;
  let lastCoins = 0;
  let feedbackUntil = 0;
  const practiced = new Set<number>();
  let calibratedBase: Parameters<RunnerPoseControls["calibrate"]>[1] | null =
    null;

  function active() {
    return ["countdown", "playing", "paused"].includes(game.state.phase);
  }
  function updateReleaseControls() {
    if (disposed) return;
    const release = releases.state;
    cameraChoice.setLocked(
      connecting ||
        pendingStarts.size > 0 ||
        !!cameraEpoch ||
        release.pendingCount > 0 ||
        startupUncertain,
    );
    get("camera-release").hidden = release.pendingCount === 0;
    setText("camera-release-message", release.message ?? "");
    get<HTMLButtonElement>("retry-camera-stop").disabled = release.releasing;
    get<HTMLButtonElement>("source-connect").disabled =
      connecting ||
      pendingStarts.size > 0 ||
      !!cameraEpoch ||
      release.pendingCount > 0 ||
      startupUncertain;
    get<HTMLButtonElement>("source-stop").disabled =
      !cameraEpoch && !connecting;
  }
  function cameraMessage(value: string) {
    setText("camera-status", value);
  }
  function resetRun() {
    game = new RunnerGame(options(), seed());
    // Reset status here so a new ready run cannot retain a pause/result cue.
    // Ordinary ready renders preserve actionable failed-start guidance.
    setText("game-status", "Choose your input, then start your run.");
    manualPause = false;
    ownershipChanged = false;
    demoEpoch++;
    demoSequence = 0;
    demoLane = 0;
    demoDuck = false;
    pendingJump = false;
    lastDemoInput = null;
    owner = null;
    session.release();
    pose.reset();
    calibratedBase = null;
    cameraInput = null;
    preview.clear();
    practiced.clear();
    lastHits = 0;
    lastCoins = 0;
    feedbackUntil = 0;
    if (!isDemo() && observation) ingestCamera();
  }
  function demoInput(t: number): RunnerInput {
    // Button events can share a renderer timestamp; only one source sample is
    // published for that time so duplicate input never becomes a second jump.
    if (lastDemoInput && lastDemoInput.atMs >= t) return lastDemoInput;
    const input: RunnerInput = {
      atMs: t,
      sequence: ++demoSequence,
      epoch: `runner-rehearsal-${demoEpoch}`,
      spaceRevision: "runner-rehearsal-v1",
      identity: checked("demo-missing") ? "missing" : "confident",
      participantCount: checked("demo-extra") ? 2 : 1,
      lane: demoLane,
      jump: pendingJump,
      duck: demoDuck,
      standing: !pendingJump && !demoDuck,
      valid: !checked("demo-missing"),
      reason: checked("demo-missing")
        ? "Tracking unavailable in this rehearsal."
        : undefined,
    };
    pendingJump = false;
    lastDemoInput = input;
    return input;
  }
  function recordPractice(input: RunnerInput) {
    if (!input.valid || input.identity !== "confident") return;
    practiced.add(input.lane + 1);
    if (input.jump) practiced.add(3);
    if (input.duck) practiced.add(4);
    if (input.standing && practiced.has(3) && practiced.has(4))
      practiced.add(5);
  }
  function ingestCamera() {
    if (!observation || ownershipChanged) return;
    const value = observation;
    const binding = session.binding;
    const selected = owner ?? binding;
    const participant = selected
      ? value.people.find(
          (person) =>
            person.trackId === selected.trackId &&
            person.identity === "confident",
        )
      : value.people.length === 1 && value.people[0].identity === "confident"
        ? value.people[0]
        : null;
    if (!binding && !participant?.trackId) {
      cameraInput = null;
      cameraMessage(
        value.people.length > 1
          ? "Stand alone in view to set up body controls."
          : "Keep the intended player clearly tracked with shoulders and hips in view.",
      );
      return;
    }
    const base = binding
      ? session.ingest(value, receivedAt)
      : !owner && participant?.trackId
        ? session.join(value, participant.trackId, receivedAt)
        : null;
    if (!base) {
      pose.suspend();
      calibratedBase = null;
      cameraInput = null;
      if (owner && !session.binding) ownershipChanged = true;
      if (active())
        game.pause(
          session.reason ?? "Waiting for the same player. Scoring is paused.",
        );
      cameraMessage(session.reason ?? "Waiting for fresh tracking.");
      return;
    }
    if (session.recovered) {
      pose.suspend();
      if (active())
        game.pause(
          "Tracking recovered. Stand comfortably for the recovery countdown.",
        );
    }
    calibratedBase = base;
    if (!pose.calibrated) {
      cameraInput = null;
      cameraMessage(
        "Player found. Stand comfortably, then choose Set standing reference.",
      );
      return;
    }
    cameraInput = pose.ingest(value, base, session.binding!.trackId);
    recordPractice(cameraInput);
    cameraMessage(
      cameraInput.valid
        ? "Body controls ready. Try the live preview, then Start run when ready."
        : (cameraInput.reason ?? "Keep your whole body in view."),
    );
  }
  function currentInput(t: number) {
    return isDemo()
      ? demoInput(t)
      : trackingStale || t - receivedAt > 350
        ? null
        : cameraInput;
  }
  function canStart(t: number, input: RunnerInput | null) {
    if (!isDemo() && !pose.calibrated) return false;
    return (
      !renderingUnavailable &&
      !ownershipChanged &&
      !document.hidden &&
      !!input &&
      input.standing &&
      !input.jump &&
      !input.duck &&
      game.readiness(t, input).ready
    );
  }
  function startRun() {
    if (game.state.phase !== "ready") return;
    const t = now(),
      input = currentInput(t);
    if (!canStart(t, input) || !input) {
      setText(
        "game-status",
        isDemo()
          ? "Release Jump or Roll and make sure tracking is ready before starting."
          : !pose.calibrated
            ? "Start the camera and set a comfortable standing reference in the live preview."
            : !input?.standing
              ? "Return to your comfortable standing reference before starting."
              : "Waiting for fresh control input from the same player.",
      );
      get(
        !isDemo() && !pose.calibrated ? "calibrate-player" : "game-stage",
      ).focus();
      return;
    }
    if (!isDemo() && session.binding)
      owner = {
        trackId: session.binding.trackId,
        epoch: session.binding.epoch,
      };
    manualPause = false;
    game.start(t, input);
    tick();
    get("game-stage").focus();
  }
  function renderPreview(t: number, input: RunnerInput | null) {
    get("body-preview").hidden = isDemo();
    const stale = trackingStale || t - receivedAt > 350;
    if (stale && preview.atMs !== -Infinity) preview.clear();
    const pixels = checked("show-preview") && !stale && t - preview.atMs <= 350;
    get("camera-preview").hidden = !pixels;
    get("preview-empty").hidden = pixels;
    setText(
      "preview-empty",
      !cameraEpoch
        ? "Start camera to see your controls."
        : stale
          ? "Tracking stale · scoring paused"
          : !checked("show-preview")
            ? "Camera hidden · controls still live"
            : "Waiting for camera picture…",
    );
    const feedback = !stale && input?.valid ? pose.feedback : null;
    get("head-guides").toggleAttribute("hidden", !feedback);
    if (feedback) {
      for (const [id, value] of [
        ["jump-guide", feedback.jumpY],
        ["standing-guide", feedback.standingY],
        ["duck-guide", feedback.duckY],
      ] as const) {
        get(id).setAttribute("y1", String(value * 100));
        get(id).setAttribute("y2", String(value * 100));
      }
      get("head-marker").setAttribute("cx", String(feedback.displayX * 100));
      get("head-marker").setAttribute("cy", String(feedback.headY * 100));
      setText(
        "preview-thresholds",
        `Head y ${(feedback.headY * 100).toFixed(1)}% · Jump above ${(feedback.jumpY * 100).toFixed(1)}% · Roll below ${(feedback.duckY * 100).toFixed(1)}% · ${feedback.evidence}. Green: jump · white: standing · amber: roll.`,
      );
    }
    setText(
      "preview-action",
      feedback && input
        ? `${["LEFT", "CENTER", "RIGHT"][input.lane + 1]} · ${input.jump || feedback.airborne ? "JUMP" : input.duck ? "ROLL" : input.standing ? "STANDING" : "SETTLING"}`
        : "WAITING FOR USABLE BODY",
    );
    setText(
      "preview-freshness",
      !cameraEpoch
        ? "Camera off"
        : stale
          ? "STALE · scoring paused"
          : input?.valid
            ? "Fresh body"
            : pose.calibrated
              ? (cameraInput?.reason ??
                "Occluded or uncertain · scoring paused")
              : "Live · set standing reference",
    );
    setText(
      "preview-age",
      !stale && input?.valid
        ? `Body ${Math.max(0, Math.round((t - input.atMs) / 50) * 50)} ms mapped age · ${pixels ? `picture ${Math.max(0, Math.round((t - preview.atMs) / 50) * 50)} ms receipt age` : "picture hidden or waiting"}`
        : "",
    );
  }
  function render(t: number, input: RunnerInput | null) {
    const state = game.state;
    get("game-stage").dataset.phase = state.phase;
    root.dataset.runnerPhase = state.phase;
    renderPreview(t, input);
    if (!renderingUnavailable)
      renderer.render(
        state,
        options().variant,
        select("skin-select").value as Skin,
      );
    if (state.hits > lastHits || state.coins > lastCoins) {
      setText(
        "runner-feedback",
        state.hits > lastHits
          ? state.options.practice
            ? "HIT · KEEP PRACTICING"
            : `HIT · ${state.lives} SHIELD${state.lives === 1 ? "" : "S"} LEFT`
          : `+${(state.coins - lastCoins) * 25} · COIN COLLECTED`,
      );
      get("runner-feedback").dataset.kind =
        state.hits > lastHits ? "hit" : "coin";
      feedbackUntil = state.elapsedMs + 850;
    }
    lastHits = state.hits;
    lastCoins = state.coins;
    get("runner-feedback").hidden =
      state.phase !== "playing" || state.elapsedMs >= feedbackUntil;
    setText("world-title", titles[options().variant]);
    setText(
      "source-label",
      isDemo() ? "CAMERA-FREE REHEARSAL" : "BODY TRACKING",
    );
    setText("score-value", String(state.score).padStart(5, "0"));
    setText("coins-value", String(state.coins));
    setText("distance-value", String(Math.floor(state.distance)));
    setText("lives-value", state.options.practice ? "∞" : String(state.lives));
    setText(
      "speed-label",
      `${state.options.fastStart ? "FAST · " : ""}${state.speed.toFixed(1)} m/s`,
    );
    setText(
      "action-label",
      `${["LEFT", "CENTER", "RIGHT"][(input?.lane ?? 0) + 1]} · ${state.jumpHeight > 0 ? "JUMPING" : state.duck ? "ROLLING" : "STANDING"}`,
    );
    const ready = game.readiness(t, input).ready && !ownershipChanged;
    setText("player-badge", ready ? "1 PLAYER · READY" : "WAITING FOR PLAYER");
    get("game-overlay").hidden = state.phase === "playing";
    get("overlay-start").hidden = state.phase !== "ready";
    get<HTMLButtonElement>("overlay-start").disabled = renderingUnavailable;
    get<HTMLButtonElement>("start-round").disabled = renderingUnavailable;
    get("overlay-start").textContent = isDemo()
      ? "Start run →"
      : "Start body-controlled run →";
    if (state.phase === "ready") {
      setText("overlay-kicker", "YOUR BODY. YOUR CONTROLLER.");
      setText(
        "overlay-title",
        options().variant === "rail"
          ? "Chase the mint skyline."
          : "Chase a little sunshine.",
      );
      setText(
        "overlay-copy",
        isDemo()
          ? "Choose a lane. Jump the hurdles. Roll under the gates. Keyboard and touch controls are ready."
          : "Set a comfortable standing reference. Try the live lane and head guides, then Start run when ready.",
      );
    } else if (state.phase === "countdown") {
      setText("overlay-kicker", "FIND YOUR FLOW");
      setText(
        "overlay-title",
        String(Math.max(1, Math.ceil(state.countdownMs / 1000))),
      );
      setText("overlay-copy", "Stand tall. Pick your lane. Here we go.");
    } else if (state.phase === "paused") {
      setText("overlay-kicker", "YOUR RUN IS SAFE");
      setText(
        "overlay-title",
        ownershipChanged || state.requiresNewRound
          ? "A fresh run is needed."
          : "Taking a breather.",
      );
      setText(
        "overlay-copy",
        ownershipChanged
          ? "Player or camera identity changed. Choose New run to keep score ownership clear."
          : (state.reason ??
              "The world, distance and scoring are frozen. Resume when you are ready."),
      );
    } else if (state.phase === "results") {
      setText("overlay-kicker", "THAT'S YOUR RUN");
      setText("overlay-title", "One more escape?");
      setText(
        "overlay-copy",
        `${Math.floor(state.distance)} meters · ${state.coins} coins · ${state.score} points. Choose New run to try again or explore another world.`,
      );
    }
    const locked = active();
    for (const id of [
      "world-select",
      "source-select",
      "practice-mode",
      "fast-start",
    ])
      get<HTMLInputElement>(id).disabled = locked;
    get("start-round").hidden = state.phase !== "ready";
    get("pause-round").hidden = !["playing", "countdown"].includes(state.phase);
    get("stage-pause").hidden = !["playing", "countdown"].includes(state.phase);
    get("resume-round").hidden =
      state.phase !== "paused" ||
      state.requiresNewRound ||
      ownershipChanged ||
      !manualPause;
    get<HTMLButtonElement>("resume-round").disabled =
      (!manualPause && (!ready || !input?.standing)) ||
      document.hidden ||
      renderingUnavailable;
    get("new-round").hidden =
      state.phase !== "paused" && state.phase !== "results";
    get("end-round").hidden = !locked;
    get("demo-controls").hidden = !isDemo();
    get("camera-controls").hidden = isDemo();
    get("rehearsal-note").hidden = !isDemo();
    get<HTMLButtonElement>("calibrate-player").disabled =
      locked ||
      !calibratedBase ||
      !observation ||
      trackingStale ||
      t - (calibratedBase?.atMs ?? -Infinity) > 350 ||
      t - receivedAt > 350;
    for (let index = 0; index < practiceLabels.length; index++) {
      get(`practice-${index}`).classList.toggle(
        "complete",
        practiced.has(index),
      );
      setText(
        `practice-${index}`,
        `${practiced.has(index) ? "✓ " : ""}${practiceLabels[index]}`,
      );
    }
    setText(
      "practice-status",
      practiced.size === practiceLabels.length
        ? "All movements rehearsed. Stand comfortably, then Start run."
        : `${practiced.size} / ${practiceLabels.length} optional moves tried. ${pose.calibrated ? "Stand comfortably, then Start run whenever ready." : "Set your standing reference first."}`,
    );
    for (const [id, lane] of [
      ["lane-left", -1],
      ["lane-center", 0],
      ["lane-right", 1],
    ] as const)
      get(id).setAttribute("aria-pressed", String(demoLane === lane));
    get("duck-action").setAttribute("aria-pressed", String(demoDuck));
    if (state.phase !== "ready")
      setText(
        "game-status",
        state.phase === "playing"
          ? "Keep moving. Jump low hurdles, roll under gates and sidestep the trains."
          : state.phase === "countdown"
            ? "Get ready…"
            : state.phase === "results"
              ? "Run complete. Choose New run to play again."
              : (state.reason ?? "Your run is paused."),
      );
    setText(
      "world-description",
      options().variant === "rail"
        ? "A mint skyline, railway runs and colorful city streets."
        : "Warm rooftops, palm-lined streets and a trail of gold.",
    );
    if (renderingUnavailable) {
      get("game-overlay").hidden = false;
      setText("overlay-kicker", "RENDERING UNAVAILABLE");
      setText("overlay-title", "Your run is paused.");
      setText(
        "overlay-copy",
        "The 3D graphics connection is unavailable. Restore WebGL or reload this page in a supported browser. Your run cannot advance while its world is hidden.",
      );
      setText(
        "game-status",
        "3D graphics unavailable. Restore WebGL or reload; gameplay is paused.",
      );
    }
    updateReleaseControls();
    resumeControl.update();
  }
  function tick() {
    if (disposed) return;
    if (!isDemo() && session.expire(now())) {
      pose.reset();
      calibratedBase = null;
      cameraInput = null;
      if (owner) ownershipChanged = true;
      if (active())
        game.pause(
          "Tracking recovery expired. Choose New run; score ownership stays protected.",
        );
      cameraMessage(session.reason ?? "Tracking expired. Set standing again.");
    }
    if (!isDemo() && (trackingStale || now() - receivedAt > 350))
      pose.suspend();
    const t = now(),
      input = currentInput(t);
    game.step(t, ownershipChanged || renderingUnavailable ? null : input);
    // Tracking pauses recover only with fresh, standing input from the same
    // owner. The game adds its countdown and clears the near hazard window.
    if (
      game.state.phase === "paused" &&
      !manualPause &&
      !renderingUnavailable &&
      !ownershipChanged &&
      !document.hidden &&
      input &&
      input.standing &&
      game.readiness(t, input).ready
    )
      game.resume(t, input);
    render(t, input);
  }
  async function stopCamera(
    message = "Camera stopped. Start it when you are ready.",
  ) {
    generation++;
    connecting = false;
    const ownEpoch = cameraEpoch;
    cameraEpoch = "";
    socket?.close();
    socket = null;
    session.release();
    pose.reset();
    calibratedBase = null;
    cameraInput = null;
    observation = null;
    trackingStale = false;
    receivedAt = -Infinity;
    preview.clear();
    if (active()) {
      ownershipChanged = true;
      game.pause(message);
    }
    cameraMessage(message);
    releases.retain(ownEpoch);
    updateReleaseControls();
    const released = await releases.retry();
    if (!disposed) tick();
    return released;
  }
  async function startCamera() {
    if (
      connecting ||
      pendingStarts.size > 0 ||
      cameraEpoch ||
      releases.state.pendingCount ||
      startupUncertain ||
      disposed
    )
      return;
    let camera;
    try {
      camera = cameraChoice.selection();
    } catch (error) {
      cameraMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    const own = ++generation;
    pendingStarts.add(own);
    connecting = true;
    cameraMessage("Starting local body tracking…");
    updateReleaseControls();
    let acknowledged = false;
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
      if (typeof result.epoch === "string" && result.epoch) {
        acknowledged = true;
        if (own !== generation || disposed || isDemo()) {
          await releases.release(result.epoch);
          return;
        }
        cameraEpoch = result.epoch;
      }
      if (!response.ok || result.state === "error") {
        acknowledged = true;
        throw new Error(
          result.detail || result.message || "Camera could not start.",
        );
      }
      if (!cameraEpoch)
        throw new Error("Camera start did not acknowledge its ownership.");
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/stream`,
      );
      socket = ws;
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        if (own === generation) ws.send(JSON.stringify({ type: "next" }));
      };
      let sequence = -1;
      ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
        if (own !== generation || disposed) return;
        try {
          if (typeof event.data === "string") {
            const status = JSON.parse(event.data);
            if (status.state === "error" || status.state === "idle")
              throw new Error(status.message || "Camera stopped.");
            if (status.state === "stale") {
              cameraInput = null;
              trackingStale = true;
              pose.suspend();
              preview.clear();
              game.pause("Tracking is stale. The world is paused.");
            }
          } else {
            const packet = decodeFramePacket(event.data);
            if (
              packet.observation.source !== "camera" ||
              packet.observation.epoch !== cameraEpoch ||
              packet.observation.sequence <= sequence
            )
              throw new Error(
                "Camera source or timing changed. Start a new run.",
              );
            sequence = packet.observation.sequence;
            observation = packet.observation;
            receivedAt = now();
            trackingStale = false;
            connecting = false;
            ingestCamera();
            if (checked("show-preview"))
              preview.push(packet.jpeg, receivedAt, now);
          }
          tick();
        } catch (error) {
          void stopCamera(
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          if (own === generation && ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "next" }));
        }
      };
      ws.onerror = () => {
        if (own === generation)
          void stopCamera(
            "Camera connection failed. Start the local vision service and try again.",
          );
      };
      ws.onclose = () => {
        if (own === generation)
          void stopCamera("Camera connection closed. Start the camera again.");
      };
    } catch (error) {
      if (!acknowledged) {
        startupUncertain = true;
        cameraMessage(
          "Camera start acknowledgement was lost. Restart the local vision service and reload this page before starting another camera.",
        );
      } else if (own === generation)
        await stopCamera(
          error instanceof Error ? error.message : String(error),
        );
    } finally {
      pendingStarts.delete(own);
      if (own === generation) connecting = false;
      if (!disposed) tick();
    }
  }
  for (const id of ["start-round", "overlay-start"])
    listen(get(id), "click", startRun);
  listen(get("new-round"), "click", () => {
    resetRun();
    tick();
    get("start-round").focus();
  });
  for (const id of ["pause-round", "stage-pause"])
    listen(get(id), "click", () => {
      manualPause = true;
      game.pause("Paused by player. Choose Resume when you are ready.");
      tick();
    });
  listen(get("resume-round"), "click", () => {
    if (
      document.hidden ||
      renderingUnavailable ||
      ownershipChanged ||
      game.state.phase !== "paused" ||
      game.state.requiresNewRound
    )
      return;
    // Standing/readiness may recover after this press; never ask for it twice.
    manualPause = false;
    tick();
    get("game-stage").focus({ preventScroll: true });
  });
  listen(get("end-round"), "click", () => {
    game.end();
    tick();
    get("new-round").focus();
  });
  listen(select("world-select"), "change", () => {
    resetRun();
    tick();
  });
  listen(get("practice-mode"), "change", () => {
    resetRun();
    tick();
  });
  listen(get("fast-start"), "change", () => {
    if (active()) {
      get<HTMLInputElement>("fast-start").checked =
        game.state.options.fastStart;
      return;
    }
    resetRun();
    tick();
  });
  listen(select("skin-select"), "change", () => tick());
  listen(select("source-select"), "change", () => {
    void stopCamera();
    resetRun();
    if (!isDemo()) void cameraChoice.refresh();
    tick();
  });
  listen(get("source-connect"), "click", () => void startCamera());
  listen(get("source-stop"), "click", () => void stopCamera());
  listen(get("retry-camera-stop"), "click", () => void releases.retry());
  listen(get("show-preview"), "change", () => {
    preview.clear();
    tick();
  });
  listen(get("calibrate-player"), "click", () => {
    const binding = session.binding;
    if (
      !observation ||
      !calibratedBase ||
      !binding ||
      active() ||
      trackingStale ||
      now() - receivedAt > 350
    )
      return;
    if (pose.calibrate(observation, calibratedBase, binding.trackId)) {
      practiced.clear();
      practiced.add(1);
      cameraMessage(
        "Standing reference set. Try a move in the preview, or stand comfortably and Start run.",
      );
    } else
      cameraMessage(
        "Stand comfortably with both shoulders or both hips visible, plus a shoulder and hip for height. Clear occlusion, then try Set standing reference again.",
      );
    tick();
  });
  function lane(value: Lane) {
    if (!isDemo()) return;
    demoLane = value;
    tick();
    get("game-stage").focus();
  }
  listen(get("lane-left"), "click", () => lane(-1));
  listen(get("lane-center"), "click", () => lane(0));
  listen(get("lane-right"), "click", () => lane(1));
  listen(get("jump-action"), "click", () => {
    if (isDemo()) {
      pendingJump = true;
      tick();
      get("game-stage").focus();
    }
  });
  function releaseDuck() {
    if (!demoDuck) return;
    demoDuck = false;
    tick();
  }
  listen(get("duck-action"), "pointerdown", (event) => {
    if (!isDemo()) return;
    event.preventDefault();
    demoDuck = true;
    (event.target as HTMLElement).setPointerCapture?.(
      (event as PointerEvent).pointerId,
    );
    tick();
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    listen(get("duck-action"), event, releaseDuck);
  listen(get("duck-action"), "keydown", (event) => {
    const key = event as KeyboardEvent;
    if (isDemo() && (key.key === " " || key.key === "Enter")) {
      key.preventDefault();
      demoDuck = true;
      tick();
    }
  });
  listen(get("duck-action"), "keyup", (event) => {
    const key = event as KeyboardEvent;
    if (key.key === " " || key.key === "Enter") releaseDuck();
  });
  for (const id of ["demo-extra", "demo-missing"])
    listen(get(id), "change", () => {
      tick();
    });
  listen(get("game-stage"), "keydown", (event) => {
    const key = event as KeyboardEvent;
    if (
      key.key === "Escape" &&
      ["playing", "countdown"].includes(game.state.phase)
    ) {
      manualPause = true;
      game.pause("Paused by player.");
      tick();
      return;
    }
    if (!isDemo() || key.repeat) return;
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        " ",
        "c",
        "C",
        "ArrowHome",
        "Home",
      ].includes(key.key)
    )
      return;
    key.preventDefault();
    if (key.key === "ArrowLeft") demoLane = -1;
    if (key.key === "ArrowRight") demoLane = 1;
    if (["c", "C", "Home", "ArrowHome"].includes(key.key)) demoLane = 0;
    if (key.key === "ArrowUp" || key.key === " ") pendingJump = true;
    if (key.key === "ArrowDown") demoDuck = true;
    tick();
  });
  listen(get("game-stage"), "keyup", (event) => {
    if ((event as KeyboardEvent).key === "ArrowDown") releaseDuck();
  });
  listen(window, "blur", () => {
    releaseDuck();
    if (active()) {
      manualPause = true;
      game.pause("Window lost focus. Resume when you return.");
      tick();
    }
  });
  listen(document, "visibilitychange", () => {
    if (document.hidden && active()) {
      manualPause = true;
      demoDuck = false;
      pendingJump = false;
      game.pause("Tab hidden. Resume when you return.");
    }
    tick();
  });
  listen(window, "pagehide", () => void stopCamera());
  listen(get("game-canvas"), "webglcontextlost", (event) => {
    event.preventDefault();
    renderingUnavailable = true;
    manualPause = true;
    game.pause("3D graphics connection lost. Restore WebGL before resuming.");
    tick();
  });
  listen(get("game-canvas"), "webglcontextrestored", () => {
    renderingUnavailable = false;
    manualPause = true;
    game.pause("3D graphics restored. Choose Resume when ready.");
    tick();
  });
  const resize = new ResizeObserver(() => tick());
  resize.observe(get("game-stage"));
  function animate() {
    tick();
    if (!disposed) frameId = requestAnimationFrame(animate);
  }
  if (deps.autoTick !== false) frameId = requestAnimationFrame(animate);
  if (!isDemo()) void cameraChoice.refresh();
  tick();
  return {
    tick,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      listeners.abort();
      resize.disconnect();
      cameraChoice.dispose();
      renderer.dispose();
      preview.dispose();
      void stopCamera();
    },
  };
}
