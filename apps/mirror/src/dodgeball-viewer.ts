import {
  DodgeGame,
  TUNING,
  bodyShapes,
  type GameOptions,
} from "../../../games/dodgeball/src/index";
import { SinglePlayerSession } from "../../../packages/session/src/index";
import {
  containRect,
  decodeFramePacket,
  observationToDodgeFrame,
  syntheticBody,
  SYNTHETIC_BODY_BOUNDS,
  type DodgeMotionFrame,
  type GameMotionFrame,
  type Observation,
} from "../../../packages/motion/src/index";
import { drawDodgeScene } from "./dodgeball-renderer";

const ballArt = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="46" fill="#ee8c67"/><path d="M17 44c29 16 57 17 87-1M21 83c28-18 54-18 79-1M59 14c-18 27-18 65 0 92M70 15c18 27 18 63 0 90" fill="none" stroke="#923f32" stroke-width="4"/><path d="M31 29a43 43 0 0 1 25-12" fill="none" stroke="#ffd0a0" stroke-width="6" stroke-linecap="round"/></svg>`;
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
  root.innerHTML = `
 <a class="skip" href="#game-stage">Skip to game</a>
 <header class="mm-header"><a class="mm-brand" href="/">✳ <span>Motion<span class="light">Studio</span></span></a><nav aria-label="Main"><a href="/">Tracking console</a><a href="/mole.html">Mole Motion</a><a class="current" href="/dodgeball.html" aria-current="page">Dodgeball</a></nav><span class="local-pill"><i></i> Local & private</span></header>
 <main class="mm-main"><div class="mm-heading"><div><p class="eyebrow">THE MOTION ARCADE <span>/</span> GAME 02</p><h1>Dodgeball<span class="heading-dot">.</span></h1><p class="intro">Read the ring. Find your space. Make your move.</p></div><span class="experiment">Single player <span>Experimental</span></span></div>
 <div class="mm-layout"><aside id="game-settings" class="mm-settings" aria-label="Game settings">
 <div class="settings-title"><h2>Find your flow</h2><span>02</span></div>
 <label for="mode-select">Play mode</label><select id="mode-select" aria-describedby="mode-description"><option value="timed">Timed · 60 seconds</option><option value="survival">Survival · 3 shields</option><option value="practice">Practice · no pressure</option></select><p id="mode-description" class="field-note">${modeCopy.timed}</p>
 <label for="difficulty-select">Difficulty</label><select id="difficulty-select"><option value="easy">Easy · time to react</option><option value="normal" selected>Normal · find your flow</option><option value="hard">Hard · think on your feet</option></select><p class="field-note">A ring marks the exact ball footprint. Move your whole body clear before it fills.</p>
 <hr><label for="source-select">Input source</label><select id="source-select"><option value="demo">Rehearsal · no camera</option><option value="camera">Camera · body tracking</option></select>
 <div id="demo-controls"><p class="field-note">Move the body with your pointer, touch or arrow keys. This is a synthetic rehearsal.</p><label class="check-row"><input id="demo-framing" type="checkbox" checked> Both feet in view</label></div>
 <div id="camera-controls" hidden><label for="camera-index">Native camera index</label><input id="camera-index" type="number" min="0" max="9" step="1" value="0"><p class="field-note">Frame your whole body. Vision owns the camera; frames stay local.</p><button id="source-connect" class="mm-secondary">Start camera</button><button id="source-stop" class="mm-text" disabled>Stop camera</button><label for="player-track">Player track</label><select id="player-track"><option value="">Start camera to see tracks</option></select></div>
 <button id="join-player" class="mm-secondary join">Join player 1</button><p id="player-status" class="field-note" role="status">Join explicitly, then start your round.</p>
 <div class="setup-tip"><span>PLAY WITH ROOM</span><p>Clear your space. Use comfortable steps; no jumping or sudden lunges needed.</p></div></aside>
 <section class="mm-game" aria-label="Dodgeball game"><div class="scoreboard"><div class="score-item primary-score"><span>SCORE</span><strong id="score-value">000</strong></div><div class="score-item"><span id="time-label">TIME LEFT</span><strong id="time-value">1:00</strong></div><div class="score-item"><span>DODGES</span><strong id="dodges-value">0</strong></div><div class="score-item"><span id="shields-label">HITS</span><strong id="hits-value">0</strong></div><span id="source-label" class="source-tag">SYNTHETIC REHEARSAL</span></div>
 <div id="game-stage" class="mm-stage" tabindex="0" role="group" aria-label="Dodgeball play area. Rehearsal: move your pointer, touch or use arrow keys to move the whole body."><canvas id="game-canvas" width="960" height="600" aria-label="Mirrored full-body view with visible collision footprint and ball warning"></canvas><div class="stage-label"><i></i><span>READ THE RING · DODGE THE BALL</span></div><div class="player-label">P1 <span id="stage-player">NOT JOINED</span></div><div id="dodge-feedback" class="hit-feedback" aria-hidden="true" hidden></div><div class="mm-overlay" id="game-overlay"><div class="overlay-ball">${ballArt}</div><p id="overlay-kicker">READY, SET, SIDESTEP</p><h2 id="overlay-title">A little space.<br>A great escape.</h2><p id="overlay-copy">Join a player, then move clear of each warning ring. Keep your whole body in view.</p></div><div class="stage-bottom"><span id="stage-help">Rehearsal · pointer, touch or arrow keys to move</span><span>MIRRORED VIEW</span></div></div>
 <div class="target-track" id="warning-track"><span id="warning-life">Waiting for your first ball</span><progress id="warning-progress" max="1" value="0" aria-label="Ball phase time remaining"></progress><span id="streak-value">Best streak 0</span></div>
 <div class="game-actions"><button id="start-round" class="mm-primary" disabled>Start round <span>↗</span></button><button id="pause-round" class="mm-secondary" disabled>Pause</button><button id="resume-round" class="mm-primary" hidden>Resume · countdown</button><button id="end-round" class="mm-text" disabled>End round</button><button id="restart-round" class="mm-primary" hidden>Play again ↗</button><span id="game-status" role="status">Join a player to begin.</span></div>
 <p class="source-disclosure" id="source-disclosure">Synthetic full-body rehearsal. Camera accuracy and physical latency still require hardware trials.</p></section></div>
 <section class="how-grid" aria-label="How to play"><article><span class="how-number">01</span><div><h2>Read the warning</h2><p>A striped amber ring shows where the ball will land. The ring stays still.</p></div></article><article><span class="how-number">02</span><div><h2>Move all of you</h2><p>Get your head, torso, arms and legs clear before the ring turns coral. Each clean escape builds your streak.</p></div></article><article><span class="how-number">03</span><div><h2>Stay in the picture</h2><p>Missing feet? Step back, adjust the camera or clear an occlusion. Tracking issues pause play fairly.</p></div></article></section>
 <footer class="mm-footer"><span>Built for movement. Played in your space.</span><span>One joined player · English · M4 software preview</span></footer></main>`;
  const get = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const element = root.querySelector<T>(`#${id}`);
    if (!element) throw new Error(`Missing Dodgeball control: ${id}`);
    return element;
  };
  const select = (id: string) => get<HTMLSelectElement>(id);
  const listeners = new AbortController();
  const listen = (target: EventTarget, event: string, handler: EventListener) =>
    target.addEventListener(event, handler, { signal: listeners.signal });
  const session = new SinglePlayerSession();
  const nextSeed = () => deps.seed ?? Math.floor(Math.random() * 4_294_967_296);
  let game = new DodgeGame({}, nextSeed());
  let demoJoined = false,
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
  let disposed = false,
    pointer = { x: 0.5, y: 0.5 };
  let lastHits = 0,
    lastDodges = 0,
    feedbackUntil = 0;
  const isDemo = () => select("source-select").value === "demo";
  const isJoined = () => (isDemo() ? demoJoined : !!session.binding);
  const active = () =>
    ["countdown", "playing", "paused"].includes(game.state.phase);
  const config = (): Partial<GameOptions> => ({
    mode: select("mode-select").value as GameOptions["mode"],
    difficulty: select("difficulty-select").value as GameOptions["difficulty"],
  });
  function setMessage(message: string) {
    if (get("game-status").textContent !== message)
      get("game-status").textContent = message;
  }
  function resetGame() {
    game = new DodgeGame(config(), nextSeed());
    lastHits = 0;
    lastDodges = 0;
    feedbackUntil = 0;
  }
  function updateSettings() {
    const demo = isDemo();
    get("demo-controls").hidden = !demo;
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
      : "Keep your whole body and both feet visible";
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
    get("stage-player").textContent = isJoined() ? "JOINED" : "NOT JOINED";
    const locked = active();
    for (const id of ["mode-select", "difficulty-select", "source-select"])
      get<HTMLSelectElement>(id).disabled = locked;
    get<HTMLButtonElement>("start-round").disabled =
      !isJoined() || state.phase !== "ready";
    get("start-round").hidden = state.phase !== "ready";
    get<HTMLButtonElement>("pause-round").disabled = ![
      "playing",
      "countdown",
    ].includes(state.phase);
    get("pause-round").hidden = ["paused", "results"].includes(state.phase);
    const needsNewRound =
      state.phase === "paused" && !!state.reason?.includes("Start a new round");
    get("resume-round").hidden = state.phase !== "paused" || needsNewRound;
    get<HTMLButtonElement>("resume-round").disabled =
      !isJoined() || !fresh || !frame?.feetVisible || !bodyShapes(frame.body);
    get<HTMLButtonElement>("end-round").disabled = !locked;
    get("restart-round").hidden = state.phase !== "results" && !needsNewRound;
    get("restart-round").textContent = needsNewRound
      ? "Set up new round ↗"
      : "Play again ↗";
    get<HTMLButtonElement>("join-player").disabled = isJoined() || connecting;
    get("game-overlay").hidden =
      state.phase === "playing" ||
      (!isDemo() && state.phase === "ready" && previewFresh);
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
      title.textContent = feet
        ? "Step back — keep both feet in view."
        : "Play paused";
      copy.textContent = feet
        ? "Adjust the camera framing or clear an occlusion if needed. Your time, ball and score are safe."
        : needsNewRound
          ? `${state.reason} Set up a new round to keep score ownership clear.`
          : `${state.reason || "Check tracking and rejoin if needed."} Resume when ready; the countdown gives you time.`;
      setMessage(
        feet
          ? "Both feet must be in view before resuming."
          : state.reason || "Paused",
      );
    } else if (state.phase === "results") {
      title.textContent = "Nice escapes.";
      copy.textContent = `${state.dodges} clean dodges · ${state.score} points · best streak ${state.bestCombo}. ${state.result === "out-of-lives" ? "Three hits used your shields." : state.result === "time-up" ? "Time is up." : "Ready for another round?"}`;
      setMessage("Round complete. Play again or change your setup.");
    } else if (state.phase === "playing")
      setMessage(
        "Read the warning. Move your whole body clear before the ball lands.",
      );
    else {
      title.textContent = "A little space. A great escape.";
      copy.textContent = isJoined()
        ? modeCopy[state.options.mode]
        : "Join a player, then move clear of each warning ring. Keep your whole body in view.";
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
    game.step(t, frame);
    if (!isDemo() && !session.binding)
      get("player-status").textContent =
        session.reason || "Choose your track and join explicitly.";
    render();
  }
  async function stopCamera(
    message = "Camera stopped. Start it and join again when ready.",
  ) {
    generation++;
    connecting = false;
    const ownedEpoch = epoch;
    epoch = "";
    socket?.close();
    socket = null;
    session.release();
    frame = null;
    observation = null;
    image?.close();
    image = null;
    if (active()) game.pause(message);
    get<HTMLButtonElement>("source-connect").disabled = false;
    get<HTMLButtonElement>("source-stop").disabled = true;
    select("player-track").replaceChildren(
      new Option("Start camera to see tracks", ""),
    );
    get("player-status").textContent = message;
    setMessage(message);
    if (ownedEpoch) {
      try {
        await fetch("/api/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ epoch: ownedEpoch }),
          keepalive: true,
        });
      } catch {
        /* The socket close also releases this owned epoch on the service. */
      }
    }
    if (!disposed) render();
  }
  async function startCamera() {
    const index = Number(get<HTMLInputElement>("camera-index").value);
    if (!Number.isInteger(index) || index < 0 || index > 9) {
      setMessage("Choose a camera index from 0 to 9.");
      return;
    }
    const pending = stopCamera("Starting local camera…");
    const requestGeneration = generation;
    await pending;
    if (disposed || isDemo() || requestGeneration !== generation) return;
    connecting = true;
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
          algorithm: "mediapipe",
          tracker: "pose",
          cameraIndex: index,
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
          await fetch("/api/stop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ epoch: result.epoch }),
          });
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
              game.pause("Camera input is stale. Join again after recovery.");
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
            frame = cameraFrame(session.ingest(observation, receivedAt));
            const trackSelect = select("player-track");
            const previous = trackSelect.value;
            trackSelect.replaceChildren(
              new Option("Choose the participant's track", ""),
            );
            for (const person of observation.people)
              if (person.trackId && person.identity === "confident")
                trackSelect.add(new Option(person.trackId, person.trackId));
            if (
              [...trackSelect.options].some(
                (option) => option.value === previous,
              )
            )
              trackSelect.value = previous;
            if (!session.binding)
              get("player-status").textContent =
                session.reason ||
                "Choose the participant's track, then join player 1.";
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
          void stopCamera(
            "Camera connection closed. Reconnect and join again.",
          );
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
  listen(select("source-select"), "change", () => {
    void stopCamera();
    demoJoined = false;
    demoEpoch++;
    resetGame();
    updateSettings();
    setMessage("Choose your input and join a player.");
    tick();
  });
  for (const id of ["mode-select", "difficulty-select"])
    listen(get(id), "change", () => {
      resetGame();
      updateSettings();
      tick();
    });
  listen(get("join-player"), "click", () => {
    if (isDemo()) {
      demoJoined = true;
      frame = demoFrame(now());
    } else if (observation)
      frame = cameraFrame(
        session.join(observation, select("player-track").value, receivedAt),
      );
    if (isJoined()) {
      get("player-status").textContent =
        "Player 1 joined. Keep both feet visible.";
      setMessage("Player 1 ready. Start your round.");
    } else
      setMessage(
        session.reason ||
          "Start the camera and choose a confident participant track first.",
      );
    tick();
  });
  listen(get("start-round"), "click", () => {
    if (isJoined()) {
      game.start(now());
      tick();
      get("game-stage").focus();
    }
  });
  listen(get("pause-round"), "click", () => {
    game.pause("Paused by player.");
    tick();
  });
  listen(get("resume-round"), "click", () => {
    if (isJoined()) {
      game.resume(now());
      tick();
      get("game-stage").focus();
    }
  });
  listen(get("end-round"), "click", () => {
    game.finish();
    tick();
    get("restart-round").focus();
  });
  listen(get("restart-round"), "click", () => {
    resetGame();
    setMessage("Ready for another round. Adjust your setup or start again.");
    tick();
    get("start-round").focus();
  });
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
  listen(document, "visibilitychange", () => {
    if (document.hidden) {
      game.pause("Tab hidden. Resume when you return.");
      if (!disposed) render();
    }
  });
  listen(window, "pagehide", () => void stopCamera());
  const resize = new ResizeObserver(() => render());
  resize.observe(get("game-canvas"));
  const timer = deps.autoTick === false ? null : window.setInterval(tick, 50);
  updateSettings();
  tick();
  return {
    tick,
    dispose() {
      disposed = true;
      listeners.abort();
      resize.disconnect();
      if (timer !== null) window.clearInterval(timer);
      void stopCamera();
    },
  };
}
