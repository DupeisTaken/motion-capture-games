import {
  CameraChoice,
  cameraChoiceMarkup,
  type CameraSelection,
} from "./camera-choice";
import "./style.css";
import type { Observation } from "../../../contracts/generated/observation";
import {
  canOverlay,
  decodePreviewPacket,
  parseObservation,
  type PreviewFrame,
} from "../../../packages/motion/src/index";
import { FrameRate } from "./frame-rate";
import { drawFrame, drawStandby } from "./renderer";
import { CameraSetup } from "./camera-setup";
import { CameraReleases } from "./camera-release";
import { PreviewDiagnostics, sourceWorkMs } from "./diagnostics";

const icon = (name: "body" | "play" | "stop" | "expand" | "camera") => {
  const paths = {
    body: '<circle cx="12" cy="4" r="2"/><path d="M5 8h14M12 6v8m0 0-5 7m5-7 5 7"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
    expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    camera:
      '<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="4"/><path d="m8 6 1-3h6l1 3"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <a class="skip-link" href="#workspace">Skip to viewer</a>
  <header class="app-header">
    <a class="brand" href="/" aria-label="Motion Studio home"><span class="brand-symbol">${icon("body")}</span>Motion<span class="brand-light">Studio</span><span class="subtle-badge">LAB</span></a>
    <span class="header-section">Motion capture / Test console · <a href="/rig.html">Two-camera workspace ↗</a> · <a href="/mole.html">Slap a Mole ↗</a> · <a href="/dodgeball.html">Dodgeball ↗</a> · <a href="/maze.html">Virtual Maze ↗</a></span>
    <span class="local-indicator"><span></span> Local processing · no recording</span>
  </header>
  <main id="workspace">
    <div class="page-heading"><div><p class="eyebrow">M1 / SINGLE-VIEW DIAGNOSTICS</p><h1>Tracking console</h1></div><p>One source. Every stage in view.</p><span class="phase-label">Experimental <span>v0.1</span></span></div>
    <div class="workspace-grid">
      <aside class="control-panel" aria-label="Input and detection settings">
        <section class="control-section"><h2><span class="section-index">01</span> Input source</h2>
          <div class="segmented" role="group" aria-label="Input source"><button id="source-camera" aria-pressed="true">Camera</button><button id="source-demo" aria-pressed="false">Synthetic scene</button></div>
          <div id="camera-settings">
            ${cameraChoiceMarkup}
            <details class="camera-advanced"><summary>Browser camera identification</summary>
            <button id="discover-cameras" class="discovery-button">${icon("camera")} Allow & discover cameras</button>
            <p id="camera-permission" class="field-help" role="status">Explicit browser permission reveals camera names. Native capture also needs OS permission.</p>
            <label class="field-label" for="browser-camera">Browser camera reference</label><div class="device-row"><select id="browser-camera" disabled><option value="">Discover cameras first</option></select><button id="identify-camera" class="small-button" disabled>Identify</button></div>
            <div id="camera-check" hidden><video id="camera-check-video" muted playsinline aria-label="Temporary camera identification preview"></video><button id="release-camera" class="small-button">Release browser camera</button></div>
            </details>
          </div>
          <div id="demo-settings" hidden><label class="field-label" for="demo-scenario">Test scene</label><select id="demo-scenario"><option value="three">Three moving people</option><option value="cycle">People enter and leave</option><option value="empty">Empty scene</option></select><p class="field-help">Generated joints. Camera and pose inference are bypassed.</p></div>
        </section>
        <section class="control-section"><h2><span class="section-index">02</span> Detection pipeline</h2>
          <label class="field-label" for="algorithm">Pose model</label><select id="algorithm"><option value="rtmpose">RTMPose · detector + pose</option><option value="mediapipe">MediaPipe · comparison baseline</option></select>
          <div class="field-pair"><div><label class="field-label" for="tracker">Association</label><select id="tracker"><option value="pose">Pose assisted</option><option value="iou">Box overlap</option></select></div><div><label class="field-label" for="capacity">Detection cap</label><select id="capacity"><option value="1">1 person</option><option value="3">3 people</option><option value="6" selected>6 people</option></select></div></div>
          <div class="range-label"><label for="confidence">Joint visibility threshold</label><output id="confidence-value" for="confidence">0.50</output></div><input id="confidence" type="range" min="0.1" max="0.9" step="0.05" value="0.5"><p class="field-help">Display filter only. Model scores are not probabilities.</p>
        </section>
        <div class="run-controls"><button id="start" class="primary-button">${icon("play")}<span>Start camera</span></button><button id="stop" class="secondary-button" disabled>${icon("stop")}<span>Stop</span></button></div>
        <div id="camera-release" hidden><p id="camera-release-message" class="field-help" role="status"></p><button id="retry-camera-stop" class="secondary-button">Retry camera stop</button></div>
        <p class="privacy-note">Stop before changing source or pipeline.</p>
      </aside>
      <section class="viewer-panel" aria-label="Body skeleton viewport">
        <div class="viewer-toolbar"><div class="viewer-title"><span id="source-dot" class="source-dot"></span><strong id="viewport-title">Camera preview</strong><span id="source-badge" class="subtle-badge">Standby</span></div><button id="fullscreen" class="icon-button" aria-label="Expand viewer" title="Expand viewer">${icon("expand")}</button></div>
        <div class="stage" id="stage">
          <canvas id="skeleton-canvas" width="1280" height="800" aria-label="Mirrored camera image and detected body skeletons"></canvas>
          <div class="stage-corner stage-top"><span class="view-label" id="view-label">Mirrored view</span><span class="people-overlay" id="people-overlay">0 people</span></div>
          <div class="standby" id="standby"><span class="standby-icon">${icon("camera")}</span><h2 id="standby-title">Ready to observe</h2><p id="standby-message">Choose an input source, then start the preview.</p></div>
          <div class="stage-corner stage-bottom"><span id="stage-source">No source connected</span><span id="frame-state">Waiting for frames</span></div>
        </div>
        <div class="view-options"><label><input id="mirror" type="checkbox" checked>Mirror</label><label><input id="show-video" type="checkbox" checked>Image</label><label><input id="show-tracking" type="checkbox" checked>Tracking overlay</label><label><input id="show-boxes" type="checkbox" checked>Bounds</label><span class="view-hint">Untinted camera · anatomical L/R preserved</span></div>
        <div class="status-banner" id="status-banner" role="status"><span class="status-symbol"></span><div><strong id="status-title">Ready when you are</strong><p id="status-message">Choose an input source, then start the preview.</p></div></div>
      </section>
      <div class="diagnostic-column">
      <section class="telemetry" aria-label="Preview diagnostics"><div class="panel-heading"><h2><span class="section-index">03</span> Performance</h2><span class="subtle-badge">Last 120 poses</span></div>
        <dl class="metric-grid">
          <div class="metric-primary"><dt>Render FPS</dt><dd><strong id="update-rate">—</strong><span>/s</span></dd></div>
          <div><dt>Camera / source FPS</dt><dd id="camera-rate">—</dd></div><div><dt>Pose FPS</dt><dd id="pose-rate">—</dd></div><div><dt>Overlay gap</dt><dd id="overlay-gap">—</dd></div><div class="metric-primary"><dt>Pose inference</dt><dd><strong id="inference-time">—</strong><span>ms</span></dd></div>
          <div><dt>Source processing</dt><dd><strong id="processing-time">—</strong><span>ms</span></dd></div>
          <div><dt>Processing p95</dt><dd><strong id="processing-p95">—</strong><span>ms</span></dd></div>
          <div><dt>JPEG + validation¹</dt><dd><strong id="decode-time">—</strong><span>ms</span></dd></div>
          <div><dt>Canvas draw²</dt><dd><strong id="draw-time">—</strong><span>ms</span></dd></div>
          <div><dt>Read → processed</dt><dd><strong id="source-work">—</strong><span>ms</span></dd></div>
          <div><dt>Last arrival age</dt><dd><strong id="arrival-age">—</strong><span>ms</span></dd></div>
          <div><dt>Image packet</dt><dd><strong id="packet-size">—</strong><span>KiB</span></dd></div>
          <div><dt>Skipped captures</dt><dd id="capture-drops">—</dd></div>
          <div><dt>Source image</dt><dd id="source-size">—</dd></div>
          <div><dt>Samples</dt><dd id="sample-count">—</dd></div>
        </dl>
        <p id="timing-note" class="field-help">Timing will appear when the source is running.</p>
        <p class="metric-footnote">¹ Packet validation + JPEG decode. ² Draw submission, not screen presentation. Arrival age uses the browser clock.</p>
      </section>
      <section class="stream-panel" aria-label="Stream context"><h2><span class="section-index">05</span> Stream context</h2><dl class="stream-fields">
        <div><dt>Pose / epoch</dt><dd><span id="stream-sequence">—</span> / <span id="stream-epoch">—</span></dd></div>
        <div><dt>Model</dt><dd id="stream-model">—</dd></div><div><dt>Camera / tracker</dt><dd id="stream-camera">—</dd></div>
        <div><dt>Clock quality</dt><dd id="stream-clock">—</dd></div><div><dt>Space / transform</dt><dd id="stream-space">—</dd></div>
        <div><dt>Calibration</dt><dd id="stream-calibration">—</dd></div>
      </dl><p class="field-help">Independent image + pose · 0–150 ms overlay hold. Exposure and physical latency unverified.</p></section>
      </div>
      <section class="observations" aria-label="Detection observations">
        <div class="observation-heading"><div><h2><span class="section-index">04</span> People in view</h2><p>Current detections · not enrolled players</p></div><div class="count-readout"><strong id="person-count">0</strong><span id="count-label">detected</span></div></div>
        <div id="person-list" class="person-list"><p class="empty-people">Detected bodies will appear here automatically.</p></div>
        <p id="capacity-warning" class="capacity-warning" hidden>Detection capacity reached. There may be additional people outside the returned detections.</p>
      </section>

    </div>
    <footer><span><span class="footer-marker"></span> Observation → motion → future game input</span><span>Identity through occlusion is not guaranteed.</span></footer>
  </main>`;

const elements = new Map<string, HTMLElement>();
function get<T extends HTMLElement>(id: string): T {
  if (!elements.has(id)) elements.set(id, document.getElementById(id)!);
  return elements.get(id) as T;
}
function write(id: string, text: string) {
  const element = get(id);
  if (element.textContent !== text) element.textContent = text;
}
const canvas = get<HTMLCanvasElement>("skeleton-canvas");
const sourceButtons = [
  get<HTMLButtonElement>("source-camera"),
  get<HTMLButtonElement>("source-demo"),
];
const controls = [
  "camera-index",
  "algorithm",
  "tracker",
  "capacity",
  "demo-scenario",
];
const startButton = get<HTMLButtonElement>("start");
const stopButton = get<HTMLButtonElement>("stop");
let source: "camera" | "demo" = "camera";
let running = false;
let generation = 0;
interface CaptureGeneration {
  id: number;
  epoch: string;
  closed: boolean;
  sockets: WebSocket[];
  animation: number | null;
  release: Promise<boolean> | null;
}
let capture: CaptureGeneration | null = null;
// Cancellation clears local work, but startup must settle before replacing its owner.
let pendingStart: CaptureGeneration | null = null;
let unknownOwnership: string | null = null;
let lastPreview: PreviewFrame | null = null;
let poseReceivedAt = 0;
const renderRate = new FrameRate();
const poseRate = new FrameRate();
let lastFrame: Observation | null = null;
let lastImage: ImageBitmap | null = null;
const MAX_PREVIEW_ARRIVAL_AGE_MS = 1500;
let lastUpdate = 0;
let hiddenStop = false;
let peopleSignature = "";
let lastDecodeMs = 0;
let lastDrawMs = 0;
let lastPreviewBytes = 0;
let status = {
  title: "Ready when you are",
  message: "Choose an input source, then start the preview.",
  state: "ready",
};
const diagnostics = new PreviewDiagnostics();
const cameraChoice = new CameraChoice();
const cameraSetup = new CameraSetup({
  busyChanged: () => updateControls(),
});
const releases = new CameraReleases(fetch, () => {
  updateControls();
  renderStatus();
});

const renderOptions = () => ({
  mirror: get<HTMLInputElement>("mirror").checked,
  showImage: get<HTMLInputElement>("show-video").checked,
  showBoxes: get<HTMLInputElement>("show-boxes").checked,
  showTracking: get<HTMLInputElement>("show-tracking").checked,
  confidence: Number(get<HTMLInputElement>("confidence").value),
});

function setStatus(title: string, message: string, state = "ready") {
  status = { title, message, state };
  renderStatus();
}
function renderStatus() {
  let { title, message, state } = status;
  // Cleanup warnings outrank delayed setup, fullscreen and visibility callbacks.
  const release = releases.state;
  if (unknownOwnership) {
    title = "Source ownership unknown";
    message = unknownOwnership;
    state = "error";
  } else if (release.pendingCount) {
    title = release.releasing
      ? "Releasing the camera"
      : "Camera release unconfirmed";
    message = release.message!;
    state = release.releasing ? "starting" : "error";
  } else if (pendingStart?.closed) {
    title = "Waiting for startup acknowledgement";
    message =
      "The preview is stopped locally. Waiting for the source epoch so its camera can be released safely.";
    state = "starting";
  }
  if (get("status-title").textContent !== title)
    get("status-title").textContent = title;
  if (get("status-message").textContent !== message)
    get("status-message").textContent = message;
  get("status-banner").dataset.state = state;
  get("source-dot").dataset.state = state;
}
function clearObservations(message: string) {
  peopleSignature = "";
  get("person-count").textContent = "0";
  get("count-label").textContent = "detected";
  get("people-overlay").textContent = "0 people";
  get("person-list").replaceChildren(
    Object.assign(document.createElement("p"), {
      className: "empty-people",
      textContent: message,
    }),
  );
  get("capacity-warning").hidden = true;
}
function clearTelemetry() {
  diagnostics.reset();
  get("stream-epoch").title = "";
  for (const id of [
    "processing-time",
    "processing-p95",
    "decode-time",
    "draw-time",
    "source-work",
    "arrival-age",
    "packet-size",
    "sample-count",
    "stream-sequence",
    "stream-epoch",
    "stream-model",
    "stream-camera",
    "stream-clock",
    "stream-space",
    "stream-calibration",
    "update-rate",
    "camera-rate",
    "pose-rate",
    "overlay-gap",
    "inference-time",
    "source-size",
    "capture-drops",
  ])
    get(id).textContent = "—";
  get("timing-note").textContent =
    "No current observation. Start or recover the source to see diagnostics.";
}
function clearStalePreview() {
  lastUpdate = 0;
  lastFrame = null;
  lastPreview = null;
  lastImage?.close();
  lastImage = null;
  clearObservations("No fresh detections. Waiting for the source.");
  clearTelemetry();
  drawStandby(canvas);
  get("viewport-title").textContent = "Waiting for fresh input";
  get("stage-source").textContent = "Source active · waiting for a fresh image";
  get("standby-title").textContent = "Waiting for fresh input";
  get("standby-message").textContent =
    "The source is still running. Waiting for a fresh image; Stop remains available.";
  get("standby").hidden = false;
  get("source-badge").textContent = "Stale";
  get("frame-state").textContent = "No recent frame";
  setStatus(
    "Waiting for fresh input",
    "No fresh image is available within the 1.5-second browser budget, including decoding. Old images and skeletons are hidden.",
    "uncertain",
  );
}
function redraw() {
  if (
    lastPreview &&
    lastImage &&
    performance.now() - lastUpdate <= MAX_PREVIEW_ARRIVAL_AGE_MS
  ) {
    const drawStarted = performance.now();
    const pose =
      performance.now() - poseReceivedAt <= 500 &&
      canOverlay(lastPreview, lastFrame)
        ? lastFrame
        : null;
    drawFrame(
      canvas,
      lastImage,
      pose ?? { image: lastPreview.image, people: [] },
      renderOptions(),
    );
    lastDrawMs = performance.now() - drawStarted;
  } else drawStandby(canvas);
}
function isCurrent(own: CaptureGeneration) {
  return !own.closed && capture === own && own.id === generation;
}
function animate(own: CaptureGeneration, now: number) {
  if (!isCurrent(own) || !running) return;
  try {
    if (
      lastPreview &&
      lastImage &&
      performance.now() - lastUpdate <= MAX_PREVIEW_ARRIVAL_AGE_MS
    ) {
      redraw();
      renderRate.record(now);
    }
    own.animation = requestAnimationFrame((time) => animate(own, time));
  } catch (error) {
    void stop(errorMessage(error), "Preview could not continue", "error");
  }
}
function updatePeople(frame: Observation) {
  const confidence = renderOptions().confidence;
  const visibleCounts = frame.people.map(
    (person) =>
      Object.values(person.joints).filter(
        (joint) =>
          joint.inFrame &&
          joint.status === "observed" &&
          joint.score >= confidence,
      ).length,
  );
  // Position changes belong to the canvas. Keep unchanged operator rows intact.
  const signature = JSON.stringify([
    frame.detectedCount,
    frame.capacityReached,
    frame.people.map((person, index) => [
      person.trackId,
      person.identity,
      visibleCounts[index],
    ]),
  ]);
  if (peopleSignature === signature) return;
  peopleSignature = signature;
  get("person-count").textContent = String(frame.detectedCount);
  get("people-overlay").textContent =
    `${frame.detectedCount} ${frame.detectedCount === 1 ? "person" : "people"}`;
  get("count-label").textContent = frame.capacityReached
    ? "at capacity"
    : "detected";
  get("capacity-warning").hidden = !frame.capacityReached;
  const children = frame.people.map((person, index) => {
    const row = document.createElement("div");
    row.className = "person-row";
    row.dataset.identity = person.identity;
    const number = document.createElement("span");
    number.className = "person-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const detail = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = person.trackId
      ? `Track ${person.trackId}`
      : "Association uncertain";
    const joints = visibleCounts[index];
    const note = document.createElement("span");
    note.textContent = `${joints} visible joints · ${person.identity === "confident" ? "associated" : person.identity}`;
    detail.append(name, note);
    const state = document.createElement("span");
    state.className = "identity-indicator";
    state.textContent =
      person.identity === "ambiguous"
        ? "Uncertain"
        : person.identity === "tentative"
          ? "New track"
          : "Tracking";
    row.append(number, detail, state);
    return row;
  });
  if (children.length) get("person-list").replaceChildren(...children);
  else {
    clearObservations("No people detected. Move into the camera view.");
    peopleSignature = signature;
  }
}
function controlsLocked() {
  return (
    running ||
    !!pendingStart ||
    releases.state.pendingCount > 0 ||
    !!unknownOwnership
  );
}
function updateControls() {
  const locked = controlsLocked();
  const release = releases.state;
  cameraSetup.setLocked(locked);
  startButton.disabled = locked || cameraSetup.busy;
  stopButton.disabled = !capture || capture.closed;
  sourceButtons.forEach(
    (button) => (button.disabled = locked || cameraSetup.busy),
  );
  controls.forEach((id) => ((get(id) as HTMLInputElement).disabled = locked));
  cameraChoice.setLocked(locked);
  get<HTMLSelectElement>("algorithm").disabled = locked || source === "demo";
  get("camera-release").hidden =
    !release.pendingCount && !unknownOwnership && !pendingStart?.closed;
  write(
    "camera-release-message",
    unknownOwnership ||
      release.message ||
      (pendingStart?.closed
        ? "Startup is still pending. A late acknowledgement will be released before another preview can start."
        : ""),
  );
  get<HTMLButtonElement>("retry-camera-stop").hidden = !release.pendingCount;
  get<HTMLButtonElement>("retry-camera-stop").disabled = release.releasing;
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function releaseCapture(own: CaptureGeneration) {
  if (!own.epoch) return Promise.resolve(true);
  return (own.release ??= releases.release(own.epoch));
}
function teardown(own: CaptureGeneration) {
  if (own.closed) return;
  own.closed = true;
  // Detach both channels before closing either; stale callbacks never own new work.
  own.sockets.forEach((socket) => {
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
  });
  own.sockets.forEach((socket) => socket.close());
  own.sockets = [];
  if (own.animation !== null) cancelAnimationFrame(own.animation);
  own.animation = null;
  if (capture !== own) return;
  capture = null;
  running = false;
  renderRate.reset();
  poseRate.reset();
  lastPreview = null;
  lastFrame = null;
  lastImage?.close();
  lastImage = null;
  lastUpdate = 0;
  clearTelemetry();
  clearObservations("No active detections.");
  get("standby").hidden = false;
  get("standby-title").textContent = "Ready to observe";
  get("standby-message").textContent =
    "Choose an input source, then start the preview.";
  get("viewport-title").textContent =
    source === "demo" ? "Synthetic test scene" : "Camera preview";
  get("source-badge").textContent = "Stopped";
  get("frame-state").textContent = "Source stopped";
  get("stage-source").textContent = "No source connected";
  // A native reset clears retained pixels even if the standby renderer fails.
  const width = canvas.width;
  canvas.width = width;
  redraw();
}
async function stop(
  message = "The source is stopped. Start a preview to continue.",
  title = "Preview stopped",
  state = "ready",
) {
  const own = capture;
  generation++;
  // Register scoped cleanup before any fallible display reset can interrupt it.
  const released = own ? releaseCapture(own) : Promise.resolve(true);
  try {
    if (own) teardown(own);
  } catch (error) {
    title = "Preview display unavailable";
    message = `Local preview cleanup encountered a display error: ${errorMessage(error)} Camera release is tracked separately.`;
    state = "error";
  }
  updateControls();
  setStatus(title, message, state);
  await released;
}
async function start() {
  if (controlsLocked() || cameraSetup.busy || document.hidden) return;
  let camera: CameraSelection = { cameraIndex: 0 };
  if (source === "camera") {
    try {
      camera = cameraChoice.selection();
    } catch (error) {
      setStatus(
        "Choose a camera",
        error instanceof Error ? error.message : String(error),
        "error",
      );
      return;
    }
  }
  cameraSetup.release();

  const own: CaptureGeneration = {
    id: ++generation,
    epoch: "",
    closed: false,
    sockets: [],
    animation: null,
    release: null,
  };
  capture = own;
  pendingStart = own;
  updateControls();
  clearObservations("Waiting for the first detection.");
  setStatus(
    "Starting preview",
    "Opening the source and loading the local model…",
    "starting",
  );
  const sequences = { preview: -1, observations: -1 };
  let rejected = false;
  try {
    const response = await fetch("/api/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source,
        algorithm: get<HTMLSelectElement>("algorithm").value,
        tracker: get<HTMLSelectElement>("tracker").value,
        ...camera,
        maxPeople: Number(get<HTMLSelectElement>("capacity").value),
        demoScenario: get<HTMLSelectElement>("demo-scenario").value,
      }),
    });
    rejected = !response.ok;
    const result = await response.json();
    if (rejected)
      throw new Error(
        typeof result?.detail === "string"
          ? result.detail
          : result?.message || "The vision service rejected this request.",
      );
    // An accepted epoch owns cleanup even after cancellation or an error status.
    if (typeof result?.epoch === "string" && result.epoch.trim())
      own.epoch = result.epoch;
    if (!own.epoch)
      throw new Error("Missing source epoch in the startup acknowledgement.");
    if (!isCurrent(own)) {
      await releaseCapture(own);
      return;
    }
    if (result.state === "error")
      throw new Error(result.message || "Vision source failed.");
    running = true;
    own.animation = requestAnimationFrame((time) => animate(own, time));
    for (const kind of ["preview", "observations"] as const) {
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/${kind}?epoch=${encodeURIComponent(own.epoch)}`,
      );
      ws.binaryType = "arraybuffer";
      own.sockets.push(ws);
      let decoding = false;
      const requestNext = () => {
        if (!isCurrent(own) || ws.readyState !== WebSocket.OPEN) return;
        try {
          ws.send(JSON.stringify({ type: "next" }));
        } catch (error) {
          void stop(errorMessage(error), "Preview could not continue", "error");
        }
      };
      ws.onopen = requestNext;
      ws.onmessage = async (event: MessageEvent<ArrayBuffer | string>) => {
        if (!isCurrent(own) || decoding) return;
        decoding = true;
        try {
          if (typeof event.data === "string") {
            const message = JSON.parse(event.data);
            if (message.type === "status") {
              if (message.state === "error")
                throw new Error(message.message || "Vision source failed.");
              if (message.state === "idle") {
                await stop("The source stopped. Start again to reconnect.");
                return;
              }
              if (message.state === "stale" && kind === "observations") {
                lastFrame = null;
                clearObservations(
                  "Pose input is too old. Camera preview continues independently.",
                );
              }
            } else if (kind === "observations") {
              const observation = parseObservation(message);
              if (observation.epoch !== own.epoch)
                throw new Error(
                  "The source restarted. Start the preview again.",
                );
              if (observation.sequence <= sequences.observations)
                throw new Error("Outdated pose observation.");
              sequences.observations = observation.sequence;
              lastFrame = observation;
              poseReceivedAt = performance.now();
              poseRate.record(poseReceivedAt);
              diagnostics.add({
                processing: observation.metrics.processingMs,
                inference: observation.metrics.inferenceMs,
                decode: lastDecodeMs,
                draw: lastDrawMs,
                bytes: lastPreviewBytes,
                receivedAt: poseReceivedAt,
              });
            } else throw new Error("Unexpected preview control message.");
          } else {
            if (kind !== "preview")
              throw new Error("Unexpected binary observation.");
            const decodeStarted = performance.now();
            const { preview, jpeg } = decodePreviewPacket(event.data);
            if (preview.epoch !== own.epoch)
              throw new Error("The source restarted. Start the preview again.");
            if (preview.sequence <= sequences.preview)
              throw new Error("The source returned an outdated frame.");
            const image = await createImageBitmap(
              new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
            );
            if (!isCurrent(own)) {
              image.close();
              return;
            }
            // Decoding spends the browser arrival-age budget; it cannot renew an old image.
            if (
              performance.now() - decodeStarted >
              MAX_PREVIEW_ARRIVAL_AGE_MS
            ) {
              image.close();
              clearStalePreview();
              return;
            }
            if (
              image.width !== preview.image.width ||
              image.height !== preview.image.height
            ) {
              image.close();
              throw new Error(
                "Frame image dimensions do not match its observations.",
              );
            }
            sequences.preview = preview.sequence;
            lastImage?.close();
            lastImage = image;
            lastPreview = preview;
            lastUpdate = decodeStarted;
            lastDecodeMs = performance.now() - decodeStarted;
            lastPreviewBytes = event.data.byteLength;
            get("standby").hidden = true;
            get("source-badge").textContent =
              preview.source === "demo" ? "Synthetic" : "Live";
          }
        } catch (error) {
          if (!isCurrent(own)) return;
          await stop(
            errorMessage(error),
            "Preview could not continue",
            "error",
          );
        } finally {
          decoding = false;
          requestNext();
        }
      };
      ws.onerror = () => {
        if (isCurrent(own))
          void stop("The connection failed. Check the vision service.");
      };
      ws.onclose = () => {
        if (isCurrent(own))
          void stop("The connection closed. Start the preview to reconnect.");
      };
    }
  } catch (error) {
    if (!own.epoch && !rejected)
      unknownOwnership = `Source ownership is unknown: startup could not be acknowledged. ${errorMessage(error)} The service may still own a source, but this page has no safe owner epoch. Restart the local vision service, then reload this page before starting again.`;
    if (isCurrent(own))
      await stop(errorMessage(error), "Unable to start", "error");
    else await releaseCapture(own);
  } finally {
    if (pendingStart === own) pendingStart = null;
    updateControls();
    renderStatus();
  }
}
// Operator DOM updates run at 4 Hz, independently of camera, pose and display work.
window.setInterval(() => {
  if (!running || !lastPreview || !lastImage) return;
  const now = performance.now();
  const freshPose = lastFrame && now - poseReceivedAt <= 500 ? lastFrame : null;
  const fps = (value: number | null) =>
    value === null ? "—" : value.toFixed(1);
  get("update-rate").textContent = fps(renderRate.value(now));
  get("camera-rate").textContent = fps(lastPreview.captureFps || null);
  get("pose-rate").textContent = fps(poseRate.value(now));
  const gap = freshPose
    ? Number(
        BigInt(lastPreview.capturedAtNs) - BigInt(freshPose.capturedAtNs),
      ) / 1e6
    : null;
  get("overlay-gap").textContent =
    gap === null
      ? "—"
      : `${gap.toFixed(0)} ms${canOverlay(lastPreview, freshPose) ? "" : " · hidden"}`;
  get("viewport-title").textContent =
    source === "demo" ? "Synthetic test scene" : "Camera preview";
  get("stage-source").textContent =
    source === "demo"
      ? "Generated input · no camera"
      : `${get<HTMLSelectElement>("algorithm").value === "rtmpose" ? "RTMPose" : "MediaPipe"} · ${cameraChoice.label}`;
  get("frame-state").textContent = `Frame ${lastPreview.sequence}`;
  get("source-size").textContent =
    `${lastPreview.image.width} × ${lastPreview.image.height}`;
  get("inference-time").textContent = freshPose
    ? freshPose.source === "demo"
      ? "n/a"
      : freshPose.metrics.inferenceMs.toFixed(1)
    : "—";
  get("capture-drops").textContent = freshPose
    ? String(freshPose.metrics.captureDrops)
    : "—";
  get("timing-note").textContent =
    source === "demo"
      ? "Synthetic observations. These are not inference or camera performance results. Render FPS counts redraws, not new source frames."
      : "Render, camera and pose rates are separate. Overlays are held up to 150 ms behind video, then hidden. Capture time is host read completion, not verified exposure or motion-to-display latency.";
  if (freshPose) updatePeople(freshPose);
  else
    clearObservations(
      "Waiting for fresh pose input; camera preview remains independent.",
    );
  const sample = diagnostics.samples.at(-1);
  write("decode-time", lastDecodeMs.toFixed(1));
  write("draw-time", lastDrawMs.toFixed(1));
  write("arrival-age", Math.max(0, now - lastUpdate).toFixed(0));
  write("packet-size", (lastPreviewBytes / 1024).toFixed(1));
  write("sample-count", String(diagnostics.samples.length));
  if (freshPose && sample) {
    write("processing-time", sample.processing.toFixed(1));
    write(
      "processing-p95",
      diagnostics.percentile("processing", 0.95).toFixed(1),
    );
    write("source-work", sourceWorkMs(freshPose).toFixed(1));
    write("stream-sequence", String(freshPose.sequence));
    write("stream-epoch", freshPose.epoch.slice(0, 8));
    get("stream-epoch").title = freshPose.epoch;
    write("stream-model", freshPose.modelId);
    write("stream-camera", `${freshPose.cameraId} / ${freshPose.tracker}`);
    write("stream-clock", freshPose.clock.quality);
    write(
      "stream-space",
      `${freshPose.coordinateSpace} / v${freshPose.transformRevision}`,
    );
    write("stream-calibration", freshPose.calibrationId ?? "Uncalibrated");
  } else {
    for (const id of [
      "processing-time",
      "processing-p95",
      "source-work",
      "stream-sequence",
      "stream-epoch",
      "stream-model",
      "stream-camera",
      "stream-clock",
      "stream-space",
      "stream-calibration",
    ])
      write(id, "—");
  }
  const ambiguous = freshPose?.people.some(
    (person) => person.identity === "ambiguous",
  );
  setStatus(
    source === "demo"
      ? "Synthetic scene running"
      : !freshPose
        ? "Waiting for pose input"
        : freshPose.detectedCount === 0
          ? "Looking for people"
          : ambiguous
            ? "Identity needs recovery"
            : "Skeletons detected",
    ambiguous
      ? "Overlapping people have uncertain association. No identity is asserted."
      : source === "demo"
        ? "Generated observations exercise the same renderer and contract as camera input."
        : "Camera preview runs independently. Pose updates and display draws are measured separately.",
    ambiguous ? "uncertain" : "running",
  );
}, 250);
sourceButtons.forEach((button, index) =>
  button.addEventListener("click", () => {
    if (controlsLocked() || cameraSetup.busy) return;
    source = index === 0 ? "camera" : "demo";
    cameraSetup.release();
    sourceButtons.forEach((item, position) =>
      item.setAttribute("aria-pressed", String(position === index)),
    );
    get("camera-settings").hidden = source !== "camera";
    get("demo-settings").hidden = source !== "demo";
    get<HTMLSelectElement>("algorithm").disabled = source === "demo";
    startButton.querySelector("span")!.textContent =
      source === "camera" ? "Start camera" : "Start synthetic scene";
  }),
);
startButton.addEventListener("click", () => void start());
stopButton.addEventListener("click", () => void stop());
get("retry-camera-stop").addEventListener("click", () => void releases.retry());
["mirror", "show-video", "show-boxes", "show-tracking", "confidence"].forEach(
  (id) =>
    get(id).addEventListener("input", () => {
      get("confidence-value").textContent = Number(
        get<HTMLInputElement>("confidence").value,
      ).toFixed(2);
      get("view-label").textContent = renderOptions().mirror
        ? "Mirrored view"
        : "Camera view";
      redraw();
      if (lastFrame && performance.now() - poseReceivedAt <= 500)
        updatePeople(lastFrame);
    }),
);
get("fullscreen").addEventListener("click", () => {
  const ownGeneration = generation;
  if (document.fullscreenElement) void document.exitFullscreen();
  else
    void get("stage")
      .requestFullscreen()
      .catch(() => {
        if (ownGeneration === generation)
          setStatus(
            "Full screen unavailable",
            "Your browser does not support this full-screen view. You can continue in the current window.",
          );
      });
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cameraSetup.release();
  if (document.hidden && capture) {
    hiddenStop = true;
    void stop(
      "The preview stopped while this tab was hidden. Restart when ready.",
    );
  } else if (!document.hidden && hiddenStop) {
    hiddenStop = false;
    setStatus(
      "Preview paused",
      "The tab was hidden. Start the preview again when you are ready.",
    );
  }
});
window.addEventListener("pagehide", () => {
  cameraSetup.release();
  hiddenStop = true;
  void stop("The page was hidden. Start the preview again when ready.");
});
window.setInterval(() => {
  if (
    running &&
    lastUpdate > 0 &&
    performance.now() - lastUpdate > MAX_PREVIEW_ARRIVAL_AGE_MS
  ) {
    clearStalePreview();
  }
}, 300);
new ResizeObserver(redraw).observe(canvas);
drawStandby(canvas);
void fetch("/api/status")
  .then(async (response) => {
    if (!response.ok) throw new Error("Unavailable");
    const status = await response.json();
    if (generation === 0 && status.state === "running")
      setStatus(
        "A source is already running",
        "Start a preview to replace the existing diagnostic source.",
      );
  })
  .catch(() => {
    if (generation === 0)
      setStatus(
        "Vision service offline",
        "Run pnpm dev from the repository to start the local vision service and viewer.",
        "error",
      );
  });

void cameraChoice.refresh();
