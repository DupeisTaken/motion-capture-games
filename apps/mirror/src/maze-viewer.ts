import {
  generateMaze,
  sampleMaze,
  type Maze,
  type MazeConfig,
} from "../../../games/virtual-maze/src/index";
import {
  assessMazePose,
  type MazePoseSample,
  type MazeInputCursor,
} from "../../../packages/motion/src/maze-input";
import { MazeAudio } from "./maze-audio";
import { setMazeText } from "./maze-dom";
import {
  mazeCueMarkup,
  mazeParticipantContent,
  mazeParticipantDocument,
} from "./maze-display";
import {
  mountMazePhotoCorners,
  mazePhotoCornersMarkup,
} from "./maze-photo-corners";

export function mountMaze(root: HTMLElement) {
  root.innerHTML = `
  <a class="skip-link" href="#maze-map">Skip to maze</a>
  <header class="maze-header"><a class="brand" href="/">Motion<span class="brand-light">Studio</span></a><a href="/rig.html">Two-camera workspace ↗</a><a href="/mole.html">Mole Motion ↗</a><span class="maze-badge">Synthetic rehearsal</span></header>
  <main class="maze-workspace"><div class="maze-title"><div><p class="maze-eyebrow">Movement lab / Virtual maze</p><h1>Find your way by sound.</h1><p>Build a maze. Follow the quiet. Keep the map with the operator.</p></div><button id="maze-view" class="maze-button">Preview participant display</button></div>
  <div id="maze-admin"><div class="maze-grid">
    <form id="maze-config" class="maze-panel" aria-label="Maze generation"><p class="maze-eyebrow">01 / Build</p><h2>Maze settings</h2><div class="maze-pair"><div><label for="maze-width">Width · m</label><input id="maze-width" type="number" min="5" max="10" step="0.5" value="8" required></div><div><label for="maze-depth">Depth · m</label><input id="maze-depth" type="number" min="5" max="10" step="0.5" value="8" required></div></div><p class="maze-hint">Each side from 5 to 10 meters.</p>
    <label for="maze-difficulty">Difficulty</label><select id="maze-difficulty"><option value="easy">Easy · wider passages</option><option value="medium" selected>Medium · more decisions</option><option value="hard">Hard · finer maze</option></select><label class="maze-switch"><input id="maze-loops" type="checkbox" checked>Internal loops</label><p class="maze-hint">With loops enabled, an interior goal defeats both tested left-hand and right-hand wall followers.</p>
    <label for="maze-seed">Layout seed</label><input id="maze-seed" type="text" value="quiet-path-01" maxlength="80" required><button type="submit" class="maze-button primary maze-wide">Generate maze</button><button type="button" id="maze-shuffle" class="maze-button maze-wide">New random seed</button><p id="maze-config-status" class="maze-hint" role="status">Dimensions describe a virtual floor plan.</p>
    <h3>Direction source</h3><label for="maze-orientation">Orientation</label><select id="maze-orientation"><option value="torso">Torso</option><option value="head">Head</option></select><p class="maze-hint">Head direction is not eye gaze. Missing direction pauses the cue.</p></form>
    <section class="maze-panel maze-stage-panel" aria-label="Operator maze map"><div class="maze-toolbar"><h2>Operator map</h2><span id="maze-topology" class="maze-live"></span></div><div class="maze-map"><svg id="maze-map" viewBox="-0.6 -0.6 9.2 9.2" role="img" aria-label="Virtual maze with player position and facing" tabindex="0"></svg></div><div class="maze-legend"><span><i class="maze-key"></i>Player & selected facing</span><span><i class="maze-key start"></i>Start</span><span><i class="maze-key goal"></i>Goal</span></div><dl class="maze-stats"><div><dt>Floor plan</dt><dd id="maze-size"></dd></div><div><dt>Wall ahead</dt><dd id="maze-distance">—</dd></div><div><dt>Orientation</dt><dd id="maze-facing">Torso</dd></div></dl><div class="maze-session"><div class="maze-actions"><button id="maze-start" class="maze-button primary">Start rehearsal</button><button id="maze-reset" class="maze-button">Reset player</button><button id="maze-window" class="maze-button">Open participant window ↗</button></div><p id="maze-window-status" class="maze-hint" role="status" hidden></p><p id="maze-session-status" class="maze-status" role="status">Ready for rehearsal. Start to activate feedback.</p><p class="maze-hint">Click or drag on the map; arrow keys move X/Z. Virtual walls warn but do not block physical movement.</p></div></section>
    <section class="maze-panel maze-feedback" aria-label="Feedback and rehearsal controls"><h2>02 / Sound & input</h2>${mazeCueMarkup()}<div><button id="maze-sound" class="maze-button maze-wide">Enable sound</button><p id="maze-audio-status" class="maze-hint" role="status">Sound off · visual cue available</p><label for="maze-volume">Master volume</label><input id="maze-volume" type="range" min="0" max="100" value="40"><p class="maze-hint">Relative signal level; not measured decibels.</p></div><div><dl class="maze-coordinates"><div><dt>X · m</dt><dd id="maze-x-value">—</dd></div><div><dt>Y · m</dt><dd id="maze-y-value">—</dd></div><div><dt>Z · m</dt><dd id="maze-z-value">—</dd></div></dl><label for="maze-x">Player X</label><input id="maze-x" type="range" min="0" max="8" step="0.01"><label for="maze-z">Player Z</label><input id="maze-z" type="range" min="0" max="8" step="0.01"><label for="maze-torso">Torso heading · <output id="maze-torso-value">0°</output></label><input id="maze-torso" type="range" min="-180" max="180" value="0"><label for="maze-head">Head heading · <output id="maze-head-value">0°</output></label><input id="maze-head" type="range" min="-180" max="180" value="0"><p class="maze-hint">0° faces into the floor plan (+Z); +90° faces right (+X). Y is a synthetic hip height.</p><label for="maze-quality">Input rehearsal</label><select id="maze-quality"><option value="ready">Valid synthetic input</option><option value="missing">Missing position</option><option value="uncertain">Uncertain identity</option><option value="stale">Stale observation</option><option value="head-missing">Head direction unavailable</option><option value="torso-missing">Torso direction unavailable</option></select></div></section>
  </div><div class="maze-bottom">${mazePhotoCornersMarkup()}
  <section class="maze-panel"><h2>Physical rig readiness</h2><p class="maze-hint">Live two-camera input is unavailable in this version. Rehearsal opens no cameras and uses one synthetic player. Corner images alone cannot enable physical play.</p><p class="maze-hint">Physical input needs calibrated metric XYZ, a verified participant identity, source timing, the selected head or torso direction, and held-out scale checks. A hardware buzzer also needs a specified output interface.</p><a href="/rig.html">Inspect the two-camera workspace ↗</a></section></div></div>
  <section id="maze-participant" class="maze-participant" aria-label="Participant buzzer display" hidden>${mazeParticipantContent("maze-return")}</section>
  <p class="maze-limit">Experimental software rehearsal · English · position and direction are simulated. No physical accuracy, calibrated sound level or end-to-end latency has been certified.</p></main>`;

  const get = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const input = (id: string) => get<HTMLInputElement>(id);
  const select = (id: string) => get<HTMLSelectElement>(id);
  const photoCorners = mountMazePhotoCorners(root);
  const audio = new MazeAudio();
  const listeners = new AbortController();
  type MazeEvents = HTMLElementEventMap & WindowEventMap & DocumentEventMap;
  function listen<K extends keyof MazeEvents>(
    target: EventTarget,
    type: K,
    callback: (event: MazeEvents[K]) => void,
  ) {
    target.addEventListener(type, callback as EventListener, {
      signal: listeners.signal,
    });
  }
  let maze: Maze;
  let phase: "ready" | "playing" | "paused" | "finished" = "ready";
  let cursor: MazeInputCursor | null = null;
  let sequence = 0;
  let syntheticNowMs = 10000;
  let dirty = false;
  let soundWanted = false;
  let participantWindow: Window | null = null;
  let participantMode = false;
  let disposed = false;

  function renderMap() {
    const map = get<SVGSVGElement & HTMLElement>("maze-map");
    map.setAttribute(
      "viewBox",
      `-0.6 -0.6 ${maze.config.widthM + 1.2} ${maze.config.depthM + 1.2}`,
    );
    map.innerHTML = `<title>Operator-only maze, ${maze.config.widthM} by ${maze.config.depthM} meters</title><rect x="0" y="0" width="${maze.config.widthM}" height="${maze.config.depthM}" rx="0.05" fill="white" stroke="#d3deeb" stroke-width="0.02"/><g transform="translate(0 ${maze.config.depthM}) scale(1 -1)">${maze.walls.map((w) => `<path d="M${w.a.x} ${w.a.z} L${w.b.x} ${w.b.z}" stroke="#5c718d" stroke-width="0.045" stroke-linecap="round"/>`).join("")}<circle cx="${maze.start.x}" cy="${maze.start.z}" r="0.14" fill="#edb24c"/><circle cx="${maze.goal.x}" cy="${maze.goal.z}" r="0.19" fill="#15977a"/><circle cx="${maze.goal.x}" cy="${maze.goal.z}" r="0.08" fill="white"/><g id="maze-avatar"><path id="maze-ray" stroke="#76aaa9" stroke-width="0.04" stroke-dasharray="0.09 0.07"/><path id="maze-heading" fill="#235ac4"/><circle id="maze-player" r="0.12" fill="#235ac4" stroke="white" stroke-width="0.04"/></g></g><text x="0" y="-0.22" fill="#52647a" font-size="0.16">FAR LEFT</text><text x="${maze.config.widthM}" y="-0.22" text-anchor="end" fill="#52647a" font-size="0.16">FAR RIGHT</text><text x="0" y="${maze.config.depthM + 0.35}" fill="#52647a" font-size="0.16">NEAR LEFT / ORIGIN</text><text x="${maze.config.widthM}" y="${maze.config.depthM + 0.35}" text-anchor="end" fill="#52647a" font-size="0.16">NEAR RIGHT</text>`;
  }
  function resetPlayer() {
    if (disposed) return;
    input("maze-x").max = String(maze.config.widthM);
    input("maze-z").max = String(maze.config.depthM);
    input("maze-x").value = String(maze.start.x);
    input("maze-z").value = String(maze.start.z);
    input("maze-head").value = "0";
    input("maze-torso").value = "0";
    select("maze-quality").value = "ready";
    cursor = null;
    phase = "ready";
    audio.silence();
  }
  function generate() {
    if (disposed) return;
    try {
      maze = generateMaze({
        widthM: Number(input("maze-width").value),
        depthM: Number(input("maze-depth").value),
        difficulty: select("maze-difficulty").value as MazeConfig["difficulty"],
        seed: input("maze-seed").value,
        loops: input("maze-loops").checked,
      });
      dirty = false;
      renderMap();
      resetPlayer();
      setMazeText(
        get("maze-size"),
        `${maze.config.widthM} × ${maze.config.depthM} m`,
      );
      setMazeText(
        get("maze-topology"),
        maze.config.loops
          ? `${maze.cycleCount} loops · hand rules fail`
          : `Perfect maze · ${maze.columns} × ${maze.rows}`,
      );
      setMazeText(
        get("maze-config-status"),
        `Generated ${maze.columns} × ${maze.rows} cells. Seed: ${maze.config.seed}`,
      );
      get("maze-config-status").classList.remove("maze-error");
    } catch (error) {
      dirty = true;
      phase = "paused";
      audio.silence();
      setMazeText(
        get("maze-config-status"),
        error instanceof Error ? error.message : "Invalid maze settings",
      );
      get("maze-config-status").classList.add("maze-error");
    }
    tick();
  }
  function makeSample(now: number): MazePoseSample {
    const direction = (id: string) => {
      const angle = (Number(input(id).value) * Math.PI) / 180;
      return { x: Math.sin(angle), y: 0, z: Math.cos(angle) };
    };
    const quality = select("maze-quality").value;
    return {
      origin: "synthetic",
      coordinateSpace: "calibrated-rig-meters",
      rigTrackId: "synthetic-rig-player",
      slotId: "maze-player-1",
      epoch: "maze-rehearsal-1",
      calibrationId: "synthetic-local-floor",
      clockDomain: "synthetic-browser-clock",
      sequence: ++sequence,
      sourceTimeMs: now - (quality === "stale" ? 1000 : 0),
      timeUncertaintyMs: 0,
      positionM:
        quality === "missing"
          ? null
          : {
              x: Number(input("maze-x").value),
              y: 1,
              z: Number(input("maze-z").value),
            },
      headForward: quality === "head-missing" ? null : direction("maze-head"),
      torsoForward:
        quality === "torso-missing" ? null : direction("maze-torso"),
      confidence: 1,
      identityConfirmed: quality !== "uncertain",
      timingVerified: true,
    };
  }
  function tick() {
    if (disposed || !maze) return;
    // Rehearsal owns this simulated clock. Repeated browser timestamps still
    // produce ordered synthetic samples; physical source-clock rules stay strict.
    const now = (syntheticNowMs = Math.max(
      performance.now() + 10000,
      syntheticNowMs + 0.001,
    ));
    const mode = select("maze-orientation").value as "head" | "torso";
    const assessed = assessMazePose(makeSample(now), {
      rigTrackId: "synthetic-rig-player",
      slotId: "maze-player-1",
      epoch: "maze-rehearsal-1",
      calibrationId: "synthetic-local-floor",
      clockDomain: "synthetic-browser-clock",
      nowSourceTimeMs: now,
      maxAgeMs: 250,
      maxFutureMs: 5,
      maxTimeUncertaintyMs: 5,
      minimumConfidence: 0.7,
      orientationSource: mode,
      lastAccepted: cursor,
    });
    let level = 0;
    let cueText = phase === "finished" ? "Goal reached" : "Rehearsal paused";
    let status = dirty
      ? "Settings changed. Generate the maze before starting."
      : phase === "ready"
        ? "Ready for rehearsal. Start to activate feedback."
        : phase === "paused"
          ? "Paused. Resume when ready."
          : phase === "finished"
            ? "Goal reached. Reset the player or generate another maze."
            : "Rehearsal running · follow the quieter direction.";
    const valid = assessed.status === "ready";
    get("maze-avatar").setAttribute("visibility", valid ? "visible" : "hidden");
    if (!valid) setMazeText(get("maze-distance"), "—");
    setMazeText(
      get("maze-x-value"),
      valid ? assessed.positionM.x.toFixed(2) : "—",
    );
    setMazeText(
      get("maze-y-value"),
      valid ? assessed.positionM.y.toFixed(2) : "—",
    );
    setMazeText(
      get("maze-z-value"),
      valid ? assessed.positionM.z.toFixed(2) : "—",
    );
    if (valid) {
      cursor = assessed.cursor;
      const { positionM: p, forward: f } = assessed;
      const sample = sampleMaze(maze, p, Math.atan2(f.x, f.z));
      const px = -f.z * 0.13,
        pz = f.x * 0.13;
      get("maze-player").setAttribute("cx", String(p.x));
      get("maze-player").setAttribute("cy", String(p.z));
      get("maze-heading").setAttribute(
        "d",
        `M${p.x + f.x * 0.4} ${p.z + f.z * 0.4} L${p.x + px + f.x * 0.13} ${p.z + pz + f.z * 0.13} L${p.x - px + f.x * 0.13} ${p.z - pz + f.z * 0.13} Z`,
      );
      const ray = Math.min(sample.distanceM ?? 1.7, 1.7);
      get("maze-ray").setAttribute(
        "d",
        `M${p.x} ${p.z} L${p.x + f.x * ray} ${p.z + f.z * ray}`,
      );
      setMazeText(
        get("maze-distance"),
        sample.distanceM === null ? "Open" : `${sample.distanceM.toFixed(2)} m`,
      );
      if (phase === "playing" && !dirty) {
        if (sample.atGoal && !sample.touchingWall && sample.inside) {
          phase = "finished";
          status = "Goal reached. Reset the player or generate another maze.";
          cueText = "Goal reached";
        } else {
          level = sample.intensity;
          cueText = !sample.inside
            ? "Outside the play area"
            : sample.touchingWall
              ? "Wall contact · step back"
              : level >= 0.6
                ? "Wall nearby"
                : level >= 0.15
                  ? "Wall ahead"
                  : "Open direction";
        }
      }
    } else {
      cueText = "Input unavailable";
      if (phase === "playing") phase = "paused";
      status = `Input unavailable: ${assessed.reason.replaceAll("-", " ")}. Restore input, then resume.`;
    }
    if (dirty || phase !== "playing") level = 0;
    const percent = Math.round(level * 100);
    setMazeText(get("maze-facing"), mode === "head" ? "Head" : "Torso");
    for (const id of ["maze-head", "maze-torso"])
      setMazeText(get(`${id}-value`), `${input(id).value}°`);
    setMazeText(get("maze-session-status"), status);
    get<HTMLButtonElement>("maze-start").disabled =
      dirty || !valid || phase === "finished";
    setMazeText(
      get("maze-start"),
      phase === "playing"
        ? "Pause"
        : phase === "paused"
          ? "Resume rehearsal"
          : "Start rehearsal",
    );
    root
      .querySelectorAll<HTMLElement>("[data-level]")
      .forEach((el) => setMazeText(el, String(percent)));
    root
      .querySelectorAll<HTMLElement>("[data-cue]")
      .forEach((el) => setMazeText(el, cueText));
    root
      .querySelectorAll<HTMLElement>("[data-participant-status]")
      .forEach((el) => setMazeText(el, status));
    updateMeters(root, percent);
    if (soundWanted && audio.enabled && phase === "playing" && valid && !dirty)
      audio.setLevel(level, Number(input("maze-volume").value) / 100);
    else audio.silence();
    if (soundWanted) {
      setMazeText(
        get("maze-sound"),
        audio.enabled ? "Mute sound" : "Retry sound",
      );
      setMazeText(
        get("maze-audio-status"),
        audio.enabled
          ? "Sound enabled · follows the cue while running"
          : "Browser sound suspended. Select Retry sound.",
      );
    }
    if (participantWindow?.closed) participantWindow = null;
    if (participantWindow) {
      const doc = participantWindow.document;
      doc
        .querySelectorAll("[data-level]")
        .forEach((el) => setMazeText(el, String(percent)));
      doc
        .querySelectorAll("[data-cue]")
        .forEach((el) => setMazeText(el, cueText));
      doc
        .querySelectorAll("[data-participant-status]")
        .forEach((el) => setMazeText(el, status));
      const toggle = doc.querySelector<HTMLButtonElement>(
        "#participant-toggle",
      );
      if (toggle) {
        setMazeText(toggle, phase === "playing" ? "Pause" : "Resume rehearsal");
        toggle.disabled = dirty || !valid || phase === "finished";
      }
      updateMeters(doc, percent);
    }
  }
  function updateMeters(scope: ParentNode, percent: number) {
    scope.querySelectorAll<HTMLElement>(".maze-meter").forEach((meter) =>
      Array.from(meter.children).forEach((bar, i) => {
        bar.classList.toggle("on", i < Math.ceil(percent / 10));
        bar.classList.toggle("hot", i >= 7 && i < Math.ceil(percent / 10));
      }),
    );
  }
  function pause() {
    if (disposed) return;
    if (phase === "playing") phase = "paused";
    audio.silence();
    tick();
  }
  function toggle() {
    if (disposed || dirty || phase === "finished") return;
    phase = phase === "playing" ? "paused" : "playing";
    tick();
  }
  function preview(value: boolean) {
    if (disposed) return;
    if (value) get("maze-window-status").hidden = true;
    participantMode = value;
    get("maze-admin").hidden = value;
    get("maze-participant").hidden = !value;
    setMazeText(
      get("maze-view"),
      value ? "Return to operator map" : "Preview participant display",
    );
    if (value) get("maze-return").focus();
    else get("maze-view").focus();
  }
  listen(get("maze-config"), "submit", (event) => {
    event.preventDefault();
    generate();
  });
  for (const id of [
    "maze-width",
    "maze-depth",
    "maze-difficulty",
    "maze-loops",
    "maze-seed",
  ])
    listen(get(id), "input", () => {
      dirty = true;
      pause();
    });
  listen(get("maze-shuffle"), "click", () => {
    input("maze-seed").value =
      `maze-${Math.random().toString(36).slice(2, 10)}`;
    generate();
  });
  listen(get("maze-start"), "click", toggle);
  listen(get("maze-reset"), "click", () => {
    resetPlayer();
    tick();
  });
  listen(get("maze-view"), "click", () => preview(!participantMode));
  listen(get("maze-return"), "click", () => preview(false));
  for (const id of [
    "maze-x",
    "maze-z",
    "maze-head",
    "maze-torso",
    "maze-quality",
    "maze-volume",
    "maze-orientation",
  ])
    listen(get(id), "input", tick);
  listen(get("maze-sound"), "click", async () => {
    if (soundWanted && audio.enabled) {
      soundWanted = false;
      audio.silence();
      setMazeText(get("maze-sound"), "Enable sound");
      setMazeText(get("maze-audio-status"), "Sound off · visual cue available");
      return;
    }
    get<HTMLButtonElement>("maze-sound").disabled = true;
    try {
      await audio.enable();
      if (disposed) return;
      soundWanted = audio.enabled;
      setMazeText(
        get("maze-sound"),
        soundWanted ? "Mute sound" : "Retry sound",
      );
      setMazeText(
        get("maze-audio-status"),
        soundWanted
          ? "Sound enabled · follows the cue while running"
          : "Sound suspended. Select Retry sound.",
      );
      tick();
    } catch {
      if (disposed) return;
      soundWanted = false;
      audio.silence();
      setMazeText(
        get("maze-audio-status"),
        "Sound unavailable. Check browser audio access and retry.",
      );
    } finally {
      if (!disposed) get<HTMLButtonElement>("maze-sound").disabled = false;
    }
  });
  const map = get<SVGSVGElement & HTMLElement>("maze-map");
  function move(event: PointerEvent) {
    if (disposed) return;
    const rect = map.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const point = map.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = map.getScreenCTM();
    if (!matrix) return;
    const local = point.matrixTransform(matrix.inverse());
    input("maze-x").value = String(
      Math.max(0, Math.min(maze.config.widthM, local.x)),
    );
    input("maze-z").value = String(
      Math.max(0, Math.min(maze.config.depthM, maze.config.depthM - local.y)),
    );
    tick();
  }
  listen(map, "pointerdown", (event) => {
    map.focus();
    map.setPointerCapture(event.pointerId);
    move(event);
  });
  listen(map, "pointermove", (event) => {
    if (map.hasPointerCapture(event.pointerId)) move(event);
  });
  listen(map, "keydown", (event) => {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-0.1, 0],
      ArrowRight: [0.1, 0],
      ArrowUp: [0, 0.1],
      ArrowDown: [0, -0.1],
    };
    const direction = delta[event.key];
    if (!direction) return;
    event.preventDefault();
    input("maze-x").value = String(
      Math.max(
        0,
        Math.min(
          maze.config.widthM,
          Number(input("maze-x").value) + direction[0],
        ),
      ),
    );
    input("maze-z").value = String(
      Math.max(
        0,
        Math.min(
          maze.config.depthM,
          Number(input("maze-z").value) + direction[1],
        ),
      ),
    );
    tick();
  });
  listen(get("maze-window"), "click", () => {
    if (participantWindow && !participantWindow.closed) {
      get("maze-window-status").hidden = true;
      participantWindow.focus();
      return;
    }
    pause();
    const opened = window.open(
      "",
      "maze-participant",
      "popup,width=720,height=720",
    );
    if (!opened) {
      get("maze-window-status").hidden = false;
      setMazeText(
        get("maze-window-status"),
        "Participant window blocked. Use Preview participant display or allow this popup.",
      );
      return;
    }
    participantWindow = opened;
    get("maze-window-status").hidden = true;
    opened.document.open();
    opened.document.write(mazeParticipantDocument());
    opened.document.close();
    listen(
      opened.document.querySelector("#participant-toggle")!,
      "click",
      toggle,
    );
    listen(opened, "blur", pause);
    listen(opened, "pagehide", pause);
    tick();
  });
  const visibility = () => {
    if (document.hidden) pause();
  };
  listen(window, "blur", pause);
  listen(document, "visibilitychange", visibility);
  generate();
  const timer = window.setInterval(tick, 100);
  function dispose() {
    if (disposed) return;
    disposed = true;
    listeners.abort();
    window.clearInterval(timer);
    photoCorners.dispose();
    audio.dispose();
    participantWindow?.close();
  }
  // Back/forward cache preserves this DOM and runtime; restore it paused and usable.
  function onPageHide(event: PageTransitionEvent) {
    pause();
    if (!event.persisted) dispose();
  }
  listen(window, "pagehide", onPageHide);
  return { dispose };
}
