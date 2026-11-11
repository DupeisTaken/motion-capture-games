import "./rig-gameplay.css";
import { MoleGame, type GameState } from "../../../games/mole-motion/src/index";
import {
  containRect,
  mapJoint,
  type GameMotionFrame,
} from "../../../packages/motion/src/index";
import { createGameDisplay } from "./game-display";
import { moleArt } from "./mole-art";
import {
  resolveDisplayedCamera,
  type RigDisplayedCameraState,
} from "./rig-display-state";
import type { RigFrame, RigView } from "./rig-state";

const NS = "http://www.w3.org/2000/svg";
const MIRROR = true;
const SOURCE_FAILURES: Record<string, string> = {
  camera_unavailable: "The chosen recorded camera is unavailable.",
  primary_unavailable: "Choose an available recorded camera.",
  invalid_image_geometry: "The recorded image geometry is invalid.",
  invalid_timing: "Recorded source timing is invalid.",
  clock_mismatch: "Recorded source clocks cannot be compared.",
  future_input: "The recorded source is ahead of its evaluation time.",
  stale_input: "The chosen recorded source is stale.",
  no_visible_joints: "The chosen recorded source has no usable observations.",
  identity_uncertain: "The selected source association is uncertain.",
  time_uncertain: "The selected source exposure time is uncertain.",
  unverified_exposure_time: "The selected source exposure time is unverified.",
};

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes))
    node.setAttribute(name, String(value));
  return node;
}

/** One genuine game runtime with an explicit synthetic pointer controller.
 * Recorded body poses supply scene artwork only; they never become fresh game input.
 */
export function createRigGameplay(
  host: HTMLElement,
  options: { now?: () => number; autoTick?: boolean; seed?: number } = {},
) {
  const home = host.ownerDocument;
  const homeWindow = home.defaultView!;
  // Keep one clock domain even after adoption into a popup with its own time origin.
  const now = options.now ?? (() => homeWindow.performance.now());
  const game = new MoleGame(
    { mode: "practice", interaction: "touch", difficulty: "easy" },
    options.seed ?? 42,
  );
  host.innerHTML = `<div class="rig-game-controls"><div><h3>Slap a Mole · pointer rehearsal</h3><p class="rig-game-disclosure">Pointer or arrow keys control the aim cursor. The recorded person and XYZ do not control the score.</p></div><button id="rig-game-start" type="button">Start practice</button><button id="rig-game-pause" type="button">Pause</button><button id="rig-game-resume" type="button">Resume · countdown</button><button id="rig-game-end" type="button">End practice</button><button id="rig-game-open" type="button" aria-expanded="false">Open game display</button></div><p id="rig-game-location" class="rig-game-location" role="status">Both camera diagnostics stay in the operator workspace.</p><details id="rig-game-inline" class="rig-game-inline"><summary>Show inline gameplay preview</summary><div id="rig-game-stage" class="rig-game-stage" tabindex="0" role="group" aria-label="Slap a Mole pointer rehearsal. Move the pointer or use arrow keys. Recorded poses do not control scoring."><div class="rig-game-heading"><div><p id="rig-game-source-label" class="rig-game-source-label">Recorded synthetic scene · pointer controlled</p><h3>Slap a Mole</h3></div><div class="rig-game-hud"><span>SCORE <strong id="rig-game-score">0</strong></span><span>HITS <strong id="rig-game-hits">0</strong></span><span id="rig-game-phase">Ready</span></div></div><div class="rig-game-image"><svg id="rig-game-scene" role="img" aria-label="Selected synthetic camera scene and Slap a Mole gameplay" preserveAspectRatio="xMidYMid meet"></svg><div id="rig-game-notice" class="rig-game-notice" role="status"></div></div><p id="rig-game-reason" class="rig-game-reason" role="status"></p><p class="rig-game-limit">Synthetic pointer practice · no camera footage or body-controlled scoring · physical XYZ and maze input unavailable</p></div></details>`;
  const elements = new Map(
    [...host.querySelectorAll<HTMLElement>("[id]")].map((node) => [
      node.id,
      node,
    ]),
  );
  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    elements.get(id)! as T;
  const stage = get("rig-game-stage");
  const scene = get("rig-game-scene") as unknown as SVGSVGElement;
  const inline = get<HTMLDetailsElement>("rig-game-inline");
  const events = new homeWindow.AbortController();
  let enabled = true;
  let disposed = false;
  let source: RigDisplayedCameraState | null = null;
  let sourceKey = "";
  let renderedKey = "";
  let width = 1920;
  let height = 1080;
  let pointer = { x: 0.5, y: 0.5 };
  let pointerActive = true;
  let sequence = -1;
  let inputTime = -Infinity;
  let round = 0;
  let needsResume = false;
  let presentation: SVGGElement | null = null;
  let targetNode: SVGSVGElement | null = null;
  let cursorNode: SVGGElement | null = null;
  let lastClient: { x: number; y: number; document: Document } | null = null;
  const write = (id: string, value: string) => {
    const node = get(id);
    if (node.textContent !== value) node.textContent = value;
  };
  const display = createGameDisplay(stage, {
    title: "Slap a Mole · synthetic pointer practice",
    placeholderMessage:
      "The player game is in its own window. Both camera diagnostics and the camera chooser stay here.",
    returnButtonLabel: "Return game here",
    onStateChange(open) {
      write("rig-game-open", open ? "Return game here" : "Open game display");
      get("rig-game-open").setAttribute("aria-expanded", String(open));
      write(
        "rig-game-location",
        open
          ? "The same game is in its display window. Keep this operator page open."
          : "Both camera diagnostics stay in the operator workspace.",
      );
      render();
    },
    onVisibilityChange: visibility,
  });

  function failure(): string | null {
    if (!enabled) return "Gameplay is disabled during physical planning.";
    if (!source?.view)
      return SOURCE_FAILURES[source?.reasons[0] ?? "camera_unavailable"];
    if (!source.drawable)
      return (
        SOURCE_FAILURES[source.reasons[0]] ??
        "The selected source is unavailable."
      );
    const uncertain = source.warnings.find((warning) =>
      [
        "identity_uncertain",
        "time_uncertain",
        "unverified_exposure_time",
      ].includes(warning),
    );
    return uncertain ? SOURCE_FAILURES[uncertain] : null;
  }
  function visible() {
    // An expanded operator placeholder is not a playable display after adoption.
    return (
      display.visible ||
      (!display.isOpen &&
        stage.ownerDocument === home &&
        !home.hidden &&
        inline.open &&
        enabled)
    );
  }
  function pauseFor(reason: string) {
    game.pause(reason);
    needsResume = true;
    pointerActive = false;
    lastClient = null;
  }
  function visibility() {
    if (!disposed && !visible()) {
      pauseFor("The player display is hidden. Open it, aim and Resume.");
      render();
    }
  }
  function gameInput(t: number): GameMotionFrame {
    if (t > inputTime) {
      sequence++;
      inputTime = t;
    }
    return {
      version: 1,
      epoch: `rig-pointer-practice-${round}`,
      sequence,
      atMs: inputTime,
      slotId: "player-1",
      identity: "confident",
      feetVisible: true,
      depthAvailable: false,
      contacts: pointerActive ? [{ name: "right_wrist", ...pointer }] : [],
      // Score ownership belongs to this synthetic controller, never a camera track.
      spaceRevision: "synthetic-pointer-screen-space-v1",
    };
  }
  function paintSource(view: RigView) {
    width = view.imageSize[0];
    height = view.imageSize[1];
    scene.setAttribute("viewBox", `0 0 ${width} ${height}`);
    scene.dataset.cameraId = view.cameraId;
    scene.dataset.frameId = view.frameId;
    scene.replaceChildren();
    presentation = svg("g", {
      "data-game-layer": "presentation",
      transform: MIRROR ? `translate(${width} 0) scale(-1 1)` : "",
    });
    const artwork = svg("g", {
      id: "rig-game-background",
      "data-game-layer": "source",
      "data-camera-id": view.cameraId,
      "data-source-frame": view.frameId,
    });
    // Solid fills remain local after popup adoption, regardless of its base URL.
    artwork.append(svg("rect", { width, height, fill: "#153852" }));
    artwork.append(
      svg("path", {
        d: `M0 ${height * 0.88}Q${width / 2} ${height * 0.8} ${width} ${height * 0.88}V${height}H0Z`,
        fill: "#223a35",
      }),
    );
    const points = new Map(
      view.joints
        .filter(
          (j) =>
            j.x !== null &&
            j.y !== null &&
            Number.isFinite(j.x) &&
            Number.isFinite(j.y) &&
            j.x >= 0 &&
            j.x < width &&
            j.y >= 0 &&
            j.y < height,
        )
        .map((j) => [j.name, { x: j.x!, y: j.y! }]),
    );
    const torso = [
      "left_shoulder",
      "right_shoulder",
      "right_hip",
      "left_hip",
    ] as const;
    if (torso.every((name) => points.has(name)))
      artwork.append(
        svg("polygon", {
          points: torso
            .map((name) => {
              const p = points.get(name)!;
              return `${p.x},${p.y}`;
            })
            .join(" "),
          fill: "#51b2bd",
        }),
      );
    const limbs = [
      ["left_shoulder", "left_elbow"],
      ["left_elbow", "left_wrist"],
      ["right_shoulder", "right_elbow"],
      ["right_elbow", "right_wrist"],
      ["left_hip", "left_knee"],
      ["left_knee", "left_ankle"],
      ["right_hip", "right_knee"],
      ["right_knee", "right_ankle"],
    ] as const;
    for (const [a, b] of limbs) {
      const from = points.get(a),
        to = points.get(b);
      if (from && to)
        artwork.append(
          svg("line", {
            "data-from-joint": a,
            "data-to-joint": b,
            x1: from.x,
            y1: from.y,
            x2: to.x,
            y2: to.y,
            stroke:
              a.includes("hip") || a.includes("knee") ? "#75939d" : "#e2bd91",
            "stroke-width": width * 0.023,
            "stroke-linecap": "round",
          }),
        );
    }
    const head = points.get("nose");
    if (head)
      artwork.append(
        svg("circle", {
          "data-joint": "nose",
          cx: head.x,
          cy: head.y,
          r: width * 0.028,
          fill: "#e2bd91",
        }),
      );
    presentation.append(artwork);
    targetNode = svg("svg", {
      id: "rig-game-target",
      viewBox: "0 0 120 110",
      "data-game-layer": "target",
    });
    // Reuse the actual game's art, while the engine owns its hit region and score.
    targetNode.innerHTML = moleArt;
    const art = targetNode.querySelector("svg")!;
    targetNode.replaceChildren(...art.childNodes);
    cursorNode = svg("g", {
      id: "rig-game-cursor",
      "data-game-layer": "cursor",
    });
    cursorNode.append(
      svg("ellipse", {
        fill: "#f4f0b825",
        stroke: "#fff3a3",
        "stroke-width": width * 0.003,
      }),
      svg("path", { stroke: "#fff3a3", "stroke-width": width * 0.002 }),
    );
    presentation.append(targetNode, cursorNode);
    scene.append(presentation);
  }
  function render() {
    if (disposed) return;
    const state = game.state;
    const unavailable = failure();
    stage.dataset.cameraId = source?.selectedCameraId ?? "";
    stage.dataset.sourceState = unavailable
      ? "unavailable"
      : (source?.status ?? "unavailable");
    stage.dataset.phase = state.phase;
    write("rig-game-score", String(state.score));
    write("rig-game-hits", String(state.hits));
    write(
      "rig-game-phase",
      state.phase === "countdown"
        ? `${Math.ceil(state.countdownMs / 1000)}`
        : state.phase,
    );
    write(
      "rig-game-source-label",
      source?.view
        ? `${source.view.cameraId} · recorded synthetic scene · mirrored · pointer controlled`
        : "Recorded synthetic scene unavailable",
    );
    scene.toggleAttribute("hidden", !!unavailable);
    if (unavailable) {
      scene.replaceChildren();
      renderedKey = "";
      targetNode = null;
      cursorNode = null;
    } else if (source?.view && sourceKey !== renderedKey) {
      paintSource(source.view);
      renderedKey = sourceKey;
    }
    const playing = !unavailable && state.phase === "playing";
    if (targetNode) {
      targetNode.toggleAttribute("hidden", !playing || !state.target);
      if (state.target) {
        const target = state.target;
        targetNode.setAttribute(
          "x",
          String((target.x - target.radius) * width),
        );
        targetNode.setAttribute(
          "y",
          String((target.y - target.radius) * height),
        );
        targetNode.setAttribute("width", String(target.radius * 2 * width));
        targetNode.setAttribute("height", String(target.radius * 2 * height));
        // Override the application's generic 20px icon SVG rule for this game sprite.
        targetNode.style.width = `${target.radius * 2 * width}px`;
        targetNode.style.height = `${target.radius * 2 * height}px`;
        targetNode.dataset.x = String(target.x);
        targetNode.dataset.y = String(target.y);
        targetNode.dataset.radius = String(target.radius);
      }
    }
    if (cursorNode) {
      cursorNode.toggleAttribute("hidden", !pointerActive || !!unavailable);
      const p = mapJoint(pointer, { x: 0, y: 0, width, height }, false);
      cursorNode.querySelector("ellipse")!.setAttribute("cx", String(p.x));
      cursorNode.querySelector("ellipse")!.setAttribute("cy", String(p.y));
      cursorNode
        .querySelector("ellipse")!
        .setAttribute("rx", String(width * 0.012));
      cursorNode
        .querySelector("ellipse")!
        .setAttribute("ry", String(height * 0.012));
      cursorNode
        .querySelector("path")!
        .setAttribute(
          "d",
          `M${p.x - width * 0.018} ${p.y}H${p.x + width * 0.018}M${p.x} ${p.y - height * 0.018}V${p.y + height * 0.018}`,
        );
    }
    const notice =
      unavailable ??
      (state.phase === "ready"
        ? "Start pointer practice"
        : state.phase === "paused"
          ? "Paused · aim, then Resume"
          : state.phase === "countdown"
            ? String(Math.ceil(state.countdownMs / 1000))
            : state.phase === "results"
              ? "Practice complete"
              : "");
    write("rig-game-notice", notice);
    get("rig-game-notice").hidden = !notice;
    write(
      "rig-game-reason",
      unavailable ??
        (state.phase === "paused"
          ? (state.reason ?? "Resume when ready.")
          : "Touch a mole with the aim cursor. Move away before the next hit."),
    );
    const ready = !unavailable && visible();
    get<HTMLButtonElement>("rig-game-start").disabled =
      !enabled || !!unavailable || !["ready", "results"].includes(state.phase);
    get<HTMLButtonElement>("rig-game-pause").disabled = ![
      "playing",
      "countdown",
    ].includes(state.phase);
    get<HTMLButtonElement>("rig-game-resume").disabled =
      !ready || state.phase !== "paused";
    get<HTMLButtonElement>("rig-game-end").disabled = [
      "ready",
      "results",
    ].includes(state.phase);
    get<HTMLButtonElement>("rig-game-open").disabled = !enabled;
  }
  function tick() {
    if (disposed) return;
    const unavailable = failure();
    if (unavailable) pauseFor(unavailable);
    else if (!visible())
      pauseFor("The player display is hidden. Open it, aim and Resume.");
    else if (
      !needsResume &&
      ["playing", "countdown"].includes(game.state.phase)
    ) {
      const t = now();
      game.update(t, gameInput(t));
      if (game.state.phase === "paused") needsResume = true;
    }
    render();
  }
  function sourceChanged(next: RigFrame, cameraId: string | null) {
    source = resolveDisplayedCamera(next, cameraId);
    sourceKey = JSON.stringify([
      source.selectedCameraId,
      source.view?.frameId,
      source.view?.timeNs,
      source.view?.imageSize,
      source.view?.transformRevision,
      source.view?.joints,
      next.sequence,
    ]);
    const unavailable = failure();
    if (unavailable) pauseFor(unavailable);
    // Healthy source changes are presentation-only: no engine update or new input sample.
    render();
  }
  function aim(event: PointerEvent) {
    if (failure() || disposed) return;
    const bounds = scene.getBoundingClientRect();
    const rect = containRect(
      { width, height },
      { width: bounds.width, height: bounds.height },
    );
    const x = (event.clientX - bounds.left - rect.x) / rect.width;
    const y = (event.clientY - bounds.top - rect.y) / rect.height;
    if (
      x < 0 ||
      x > 1 ||
      y < 0 ||
      y > 1 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      pointerActive = false;
      lastClient = null;
      if (["playing", "countdown"].includes(game.state.phase))
        pauseFor("Aim inside the selected image, then Resume.");
    } else {
      const same =
        lastClient?.x === event.clientX &&
        lastClient?.y === event.clientY &&
        lastClient?.document === stage.ownerDocument;
      lastClient = {
        x: event.clientX,
        y: event.clientY,
        document: stage.ownerDocument,
      };
      if (!same || event.type === "pointerdown") {
        pointer = { x: MIRROR ? 1 - x : x, y };
        pointerActive = true;
      }
      if (event.type === "pointerdown") {
        event.preventDefault();
        stage.focus();
      }
    }
    render();
  }
  const listen = (target: EventTarget, name: string, callback: EventListener) =>
    target.addEventListener(name, callback, { signal: events.signal });
  // Only the playable viewport receives aim input; HUD and operator-control
  // navigation must not masquerade as a move into image letterboxing.
  const imageRegion = scene.parentElement!;
  listen(imageRegion, "pointermove", (event) => aim(event as PointerEvent));
  listen(imageRegion, "pointerdown", (event) => aim(event as PointerEvent));
  listen(stage, "pointercancel", () => {
    pauseFor("Pointer input was interrupted. Aim, then Resume.");
    render();
  });
  listen(stage, "keydown", (event) => {
    const key = event as KeyboardEvent;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [MIRROR ? 0.035 : -0.035, 0],
      ArrowRight: [MIRROR ? -0.035 : 0.035, 0],
      ArrowUp: [0, -0.035],
      ArrowDown: [0, 0.035],
    };
    if (!moves[key.key] || failure()) return;
    key.preventDefault();
    const [x, y] = moves[key.key];
    pointer = {
      x: Math.max(0, Math.min(1, pointer.x + x)),
      y: Math.max(0, Math.min(1, pointer.y + y)),
    };
    pointerActive = true;
    lastClient = null;
    render();
  });
  listen(get("rig-game-start"), "click", () => {
    if (failure() || !["ready", "results"].includes(game.state.phase)) return;
    inline.open = true;
    pointerActive = true;
    needsResume = false;
    round++;
    sequence = -1;
    inputTime = -Infinity;
    if (game.state.phase === "results") game.restart(now());
    else game.start(now());
    stage.focus();
    tick();
  });
  listen(get("rig-game-pause"), "click", () => {
    pauseFor("Paused by operator. Aim, then Resume.");
    render();
  });
  listen(get("rig-game-resume"), "click", () => {
    if (failure() || !visible() || game.state.phase !== "paused") return;
    // Resume is explicit intent to reuse the last valid logical aim. The engine's
    // countdown consumes that held position before scoring, so leaving the scene
    // to reach operator controls cannot deadlock recovery or manufacture a hit.
    pointerActive = true;
    lastClient = null;
    needsResume = false;
    game.resume(now());
    stage.focus();
    tick();
  });
  listen(get("rig-game-end"), "click", () => {
    game.finish();
    render();
  });
  listen(get("rig-game-open"), "click", () => {
    if (!enabled || disposed) return;
    if (display.isOpen) display.close();
    else if (!display.open()) {
      inline.open = true;
      write(
        "rig-game-location",
        "Popup blocked. Continue in the inline gameplay preview, or allow popups and retry.",
      );
      render();
    }
  });
  listen(inline, "toggle", visibility);
  listen(home, "visibilitychange", visibility);
  listen(homeWindow, "pagehide", () =>
    pauseFor("Operator page closed. Resume when ready."),
  );
  const stopTicker =
    options.autoTick === false ? () => {} : display.startTicker(tick, 50);
  render();
  return {
    setSource: sourceChanged,
    setEnabled(value: boolean) {
      if (disposed) return;
      enabled = value;
      if (!enabled) {
        pauseFor("Gameplay is disabled during physical planning.");
        display.close();
      }
      render();
    },
    pause() {
      pauseFor("Paused by operator. Aim, then Resume.");
      render();
    },
    tick,
    get state(): GameState {
      return game.state;
    },
    dispose() {
      if (disposed) return;
      game.pause("Gameplay closed.");
      disposed = true;
      stopTicker();
      events.abort();
      display.dispose();
      host.replaceChildren();
    },
  };
}
