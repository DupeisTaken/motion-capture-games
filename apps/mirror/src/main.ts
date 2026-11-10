import "./style.css";
import type { Observation } from "../../../contracts/generated/observation";
import { decodeFramePacket } from "../../../packages/motion/src/index";
import { drawFrame, drawStandby } from "./renderer";
import { CameraSetup } from "./camera-setup";
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
    <span class="header-section">Motion capture / Test console · <a href="/mole.html">Mole Motion ↗</a> · <a href="/dodgeball.html">Dodgeball ↗</a></span>
    <span class="local-indicator"><span></span> Local processing · no recording</span>
  </header>
  <main id="workspace">
    <div class="page-heading"><div><p class="eyebrow">M1 / SINGLE-VIEW DIAGNOSTICS</p><h1>Tracking console</h1></div><p>One source. Every stage in view.</p><span class="phase-label">Experimental <span>v0.1</span></span></div>
    <div class="workspace-grid">
      <aside class="control-panel" aria-label="Input and detection settings">
        <section class="control-section"><h2><span class="section-index">01</span> Input source</h2>
          <div class="segmented" role="group" aria-label="Input source"><button id="source-camera" aria-pressed="true">Camera</button><button id="source-demo" aria-pressed="false">Synthetic scene</button></div>
          <div id="camera-settings">
            <button id="discover-cameras" class="discovery-button">${icon("camera")} Allow & discover cameras</button>
            <p id="camera-permission" class="field-help" role="status">Explicit browser permission reveals camera names. Native capture also needs OS permission.</p>
            <label class="field-label" for="browser-camera">Browser camera reference</label><div class="device-row"><select id="browser-camera" disabled><option value="">Discover cameras first</option></select><button id="identify-camera" class="small-button" disabled>Identify</button></div>
            <div id="camera-check" hidden><video id="camera-check-video" muted playsinline aria-label="Temporary camera identification preview"></video><button id="release-camera" class="small-button">Release browser camera</button></div>
            <div class="index-row"><label class="field-label" for="camera-index">Native camera index</label><input id="camera-index" type="number" min="0" max="9" step="1" value="0" required aria-describedby="camera-mapping"></div>
            <p id="camera-mapping" class="field-help">Browser IDs do not map to native indices. Identify the device, then verify index 0–9 in the live preview.</p>
          </div>
          <div id="demo-settings" hidden><label class="field-label" for="demo-scenario">Test scene</label><select id="demo-scenario"><option value="three">Three moving people</option><option value="cycle">People enter and leave</option><option value="empty">Empty scene</option></select><p class="field-help">Generated joints. Camera and pose inference are bypassed.</p></div>
        </section>
        <section class="control-section"><h2><span class="section-index">02</span> Detection pipeline</h2>
          <label class="field-label" for="algorithm">Pose model</label><select id="algorithm"><option value="mediapipe">MediaPipe · landmarks</option><option value="rtmpose">RTMPose · detector + pose</option></select>
          <div class="field-pair"><div><label class="field-label" for="tracker">Association</label><select id="tracker"><option value="pose">Pose assisted</option><option value="iou">Box overlap</option></select></div><div><label class="field-label" for="capacity">Detection cap</label><select id="capacity"><option value="1">1 person</option><option value="3">3 people</option><option value="6" selected>6 people</option></select></div></div>
          <div class="range-label"><label for="confidence">Joint visibility threshold</label><output id="confidence-value" for="confidence">0.50</output></div><input id="confidence" type="range" min="0.1" max="0.9" step="0.05" value="0.5"><p class="field-help">Display filter only. Model scores are not probabilities.</p>
        </section>
        <div class="run-controls"><button id="start" class="primary-button">${icon("play")}<span>Start camera</span></button><button id="stop" class="secondary-button" disabled>${icon("stop")}<span>Stop</span></button></div>
        <p class="privacy-note">Stop before changing source or pipeline.</p>
      </aside>
      <section class="viewer-panel" aria-label="Body skeleton viewport">
        <div class="viewer-toolbar"><div class="viewer-title"><span id="source-dot" class="source-dot"></span><strong id="viewport-title">Camera preview</strong><span id="source-badge" class="subtle-badge">Standby</span></div><button id="fullscreen" class="icon-button" aria-label="Expand viewer" title="Expand viewer">${icon("expand")}</button></div>
        <div class="stage" id="stage">
          <canvas id="skeleton-canvas" width="1280" height="800" aria-label="Mirrored camera image and detected body skeletons"></canvas>
          <div class="stage-corner stage-top"><span class="view-label" id="view-label">Mirrored view</span><span class="people-overlay" id="people-overlay">0 people</span></div>
          <div class="standby" id="standby"><span class="standby-icon">${icon("camera")}</span><h2>Ready to observe</h2><p>Allow camera discovery, or use a native index.<br>Synthetic scenes work without a camera.</p></div>
          <div class="stage-corner stage-bottom"><span id="stage-source">No source connected</span><span id="frame-state">Waiting for frames</span></div>
        </div>
        <div class="view-options"><label><input id="mirror" type="checkbox" checked>Mirror</label><label><input id="show-video" type="checkbox" checked>Image</label><label><input id="show-boxes" type="checkbox" checked>Bounds</label><span class="view-hint">Anatomical L/R preserved</span></div>
        <div class="status-banner" id="status-banner" role="status"><span class="status-symbol"></span><div><strong id="status-title">Ready when you are</strong><p id="status-message">Choose an input source, then start the preview.</p></div></div>
      </section>
      <div class="diagnostic-column">
      <section class="telemetry" aria-label="Preview diagnostics"><div class="panel-heading"><h2><span class="section-index">03</span> Performance</h2><span class="subtle-badge">Last 120 frames</span></div>
        <dl class="metric-grid">
          <div class="metric-primary"><dt>Preview updates</dt><dd><strong id="update-rate">—</strong><span>/s</span></dd></div>
          <div class="metric-primary"><dt>Pose inference</dt><dd><strong id="inference-time">—</strong><span>ms</span></dd></div>
          <div><dt>Source processing</dt><dd><strong id="processing-time">—</strong><span>ms</span></dd></div>
          <div><dt>Processing p95</dt><dd><strong id="processing-p95">—</strong><span>ms</span></dd></div>
          <div><dt>JPEG + validation¹</dt><dd><strong id="decode-time">—</strong><span>ms</span></dd></div>
          <div><dt>Canvas draw²</dt><dd><strong id="draw-time">—</strong><span>ms</span></dd></div>
          <div><dt>Read → processed</dt><dd><strong id="source-work">—</strong><span>ms</span></dd></div>
          <div><dt>Last arrival age</dt><dd><strong id="arrival-age">—</strong><span>ms</span></dd></div>
          <div><dt>Packet size</dt><dd><strong id="packet-size">—</strong><span>KiB</span></dd></div>
          <div><dt>Skipped captures</dt><dd id="capture-drops">—</dd></div>
          <div><dt>Source image</dt><dd id="source-size">—</dd></div>
          <div><dt>Samples</dt><dd id="sample-count">—</dd></div>
        </dl>
        <p id="timing-note" class="field-help">Timing will appear when the source is running.</p>
        <p class="metric-footnote">¹ Packet validation + JPEG decode. ² Draw submission, not screen presentation. Arrival age uses the browser clock.</p>
      </section>
      <section class="stream-panel" aria-label="Stream context"><h2><span class="section-index">05</span> Stream context</h2><dl class="stream-fields">
        <div><dt>Frame / epoch</dt><dd><span id="stream-sequence">—</span> / <span id="stream-epoch">—</span></dd></div>
        <div><dt>Model</dt><dd id="stream-model">—</dd></div><div><dt>Camera / tracker</dt><dd id="stream-camera">—</dd></div>
        <div><dt>Clock quality</dt><dd id="stream-clock">—</dd></div><div><dt>Space / transform</dt><dd id="stream-space">—</dd></div>
        <div><dt>Calibration</dt><dd id="stream-calibration">—</dd></div>
      </dl><p class="field-help">Paired image + pose · latest frame only. Exposure and physical latency unverified.</p></section>
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
get<HTMLSelectElement>("capacity").value = "6";
let source: "camera" | "demo" = "camera";
let running = false;
let generation = 0;
let socket: WebSocket | null = null;
let lastFrame: Observation | null = null;
let lastImage: ImageBitmap | null = null;
let lastUpdate = 0;
let lastSequence = -1;
let epoch = "";
let hiddenStop = false;
let peopleSignature = "";
let telemetryUpdatedAt = -Infinity;
const diagnostics = new PreviewDiagnostics();
const cameraSetup = new CameraSetup({
  busyChanged: (busy) => {
    startButton.disabled = running || busy;
    sourceButtons.forEach((button) => (button.disabled = running || busy));
  },
});

const renderOptions = () => ({
  mirror: get<HTMLInputElement>("mirror").checked,
  showImage: get<HTMLInputElement>("show-video").checked,
  showBoxes: get<HTMLInputElement>("show-boxes").checked,
  confidence: Number(get<HTMLInputElement>("confidence").value),
});

function setStatus(title: string, message: string, state = "ready") {
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
  for (const id of [
    "update-rate",
    "inference-time",
    "source-size",
    "capture-drops",
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
  ])
    get(id).textContent = "—";
  get("stream-epoch").title = "";
  get("timing-note").textContent =
    "No current observation. Start or recover the source to see diagnostics.";
}
function updateTelemetry() {
  const sample = diagnostics.samples.at(-1);
  if (!sample || !lastFrame) return;
  const now = performance.now();
  if (now - telemetryUpdatedAt < 250) return;
  telemetryUpdatedAt = now;
  const frame = lastFrame;
  write("update-rate", diagnostics.rate()?.toFixed(1) ?? "—");
  write(
    "inference-time",
    frame.source === "demo" ? "n/a" : sample.inference.toFixed(1),
  );
  write("processing-time", sample.processing.toFixed(1));
  write(
    "processing-p95",
    diagnostics.percentile("processing", 0.95).toFixed(1),
  );
  write("decode-time", sample.decode.toFixed(1));
  write("draw-time", sample.draw.toFixed(1));
  write("source-work", sourceWorkMs(frame).toFixed(1));
  write("arrival-age", Math.max(0, now - lastUpdate).toFixed(0));
  write("packet-size", (sample.bytes / 1024).toFixed(1));
  write("sample-count", String(diagnostics.samples.length));
  write("capture-drops", String(frame.metrics.captureDrops));
  write("source-size", `${frame.image.width} × ${frame.image.height}`);
  write("stream-sequence", String(frame.sequence));
  write("stream-epoch", frame.epoch.slice(0, 8));
  get("stream-epoch").title = frame.epoch;
  write("stream-model", frame.modelId);
  write("stream-camera", `${frame.cameraId} / ${frame.tracker}`);
  write("stream-clock", frame.clock.quality);
  write(
    "stream-space",
    `${frame.coordinateSpace} / v${frame.transformRevision}`,
  );
  write("stream-calibration", frame.calibrationId ?? "Uncalibrated");
}
function redraw() {
  if (lastFrame && lastImage)
    drawFrame(canvas, lastImage, lastFrame, renderOptions());
  else drawStandby(canvas);
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
function setControls(active: boolean) {
  running = active;
  cameraSetup.setLocked(active);
  startButton.disabled = active || cameraSetup.busy;
  stopButton.disabled = !active;
  sourceButtons.forEach((button) => (button.disabled = active));
  controls.forEach((id) => ((get(id) as HTMLInputElement).disabled = active));
}
async function request(path: string, data?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : body.message || "The vision service could not complete this request.",
    );
  return body;
}
async function stop(
  message = "The source is stopped. Start a preview to continue.",
) {
  generation++;
  socket?.close();
  socket = null;
  setControls(true);
  stopButton.disabled = true;
  lastFrame = null;
  lastImage?.close();
  lastImage = null;
  lastUpdate = 0;
  clearTelemetry();
  clearObservations("No active detections.");
  redraw();
  get("standby").hidden = false;
  get("source-badge").textContent = "Stopped";
  get("frame-state").textContent = "Source stopped";
  get("stage-source").textContent = "No source connected";
  setStatus("Preview stopped", message);
  try {
    await request("/api/stop", epoch ? { epoch } : undefined);
  } catch {
    setStatus(
      "Service unavailable",
      "The preview is stopped locally. Restart pnpm dev to reconnect to the vision service.",
      "error",
    );
  } finally {
    setControls(false);
    get<HTMLSelectElement>("algorithm").disabled = source === "demo";
  }
}
async function start() {
  if (running || cameraSetup.busy) return;
  const indexInput = get<HTMLInputElement>("camera-index");
  if (source === "camera" && !indexInput.checkValidity()) {
    setStatus(
      "Invalid camera index",
      "Choose a whole native camera index from 0 to 9.",
      "error",
    );
    indexInput.reportValidity();
    return;
  }
  cameraSetup.release();
  const ownGeneration = ++generation;
  setControls(true);
  clearObservations("Waiting for the first detection.");
  setStatus(
    "Starting preview",
    source === "camera"
      ? "Opening the selected camera and loading the local model…"
      : "Preparing the generated test scene…",
    "starting",
  );
  lastSequence = -1;
  epoch = "";
  diagnostics.reset();
  telemetryUpdatedAt = -Infinity;
  let rendering = false;
  try {
    const result = await request("/api/start", {
      source,
      algorithm: get<HTMLSelectElement>("algorithm").value,
      tracker: get<HTMLSelectElement>("tracker").value,
      cameraIndex: Number(get<HTMLInputElement>("camera-index").value),
      maxPeople: Number(get<HTMLSelectElement>("capacity").value),
      demoScenario: get<HTMLSelectElement>("demo-scenario").value,
    });
    if (ownGeneration !== generation) return;
    if (result.state === "error") throw new Error(result.message);
    if (typeof result.epoch === "string") epoch = result.epoch;
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/stream`,
    );
    ws.binaryType = "arraybuffer";
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "next" }));
    ws.onmessage = async (event: MessageEvent<ArrayBuffer | string>) => {
      if (ownGeneration !== generation || rendering) return;
      rendering = true;
      try {
        if (typeof event.data === "string") {
          const status = JSON.parse(event.data);
          if (status.state === "error")
            throw new Error(status.message || "Vision source failed.");
          if (status.state === "idle") {
            await stop("The source stopped. Start it again to reconnect.");
            return;
          }
          if (status.state === "stale") {
            lastFrame = null;
            lastImage?.close();
            lastImage = null;
            lastUpdate = 0;
            get("source-badge").textContent = "Stale";
            get("frame-state").textContent = "No recent frame";
            clearObservations(
              "The source observation is too old. Waiting for fresh input.",
            );
            clearTelemetry();
            redraw();
          }
          setStatus(
            status.state === "stale"
              ? "Waiting for fresh input"
              : "Waiting for a frame",
            status.message || "The source is preparing its next observation.",
            status.state === "stale" ? "uncertain" : "starting",
          );
        } else {
          const decodeStarted = performance.now();
          const { observation, jpeg } = decodeFramePacket(event.data);
          if (!epoch) epoch = observation.epoch;
          if (observation.epoch !== epoch)
            throw new Error(
              "The source restarted. Start the preview again to establish a new stream.",
            );
          if (observation.sequence <= lastSequence)
            throw new Error(
              "The source returned an outdated frame. Restart the preview.",
            );
          const image = await createImageBitmap(
            new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
          );
          if (
            image.width !== observation.image.width ||
            image.height !== observation.image.height
          ) {
            image.close();
            throw new Error(
              "Frame image dimensions do not match its observations.",
            );
          }
          if (ownGeneration !== generation) {
            image.close();
            return;
          }
          lastSequence = observation.sequence;
          lastImage?.close();
          lastImage = image;
          lastFrame = observation;
          lastUpdate = performance.now();
          const decodeMs = lastUpdate - decodeStarted;
          get("standby").hidden = true;
          get("source-badge").textContent =
            observation.source === "demo" ? "Synthetic" : "Live";
          get("viewport-title").textContent =
            observation.source === "demo"
              ? "Synthetic test scene"
              : "Camera preview";
          get("stage-source").textContent =
            observation.source === "demo"
              ? "Generated input · no camera"
              : `${observation.algorithm === "mediapipe" ? "MediaPipe" : "RTMPose"} · camera ${get<HTMLInputElement>("camera-index").value}`;
          write("frame-state", `Frame ${observation.sequence}`);
          write(
            "timing-note",
            observation.source === "demo"
              ? "Synthetic observations. These are not inference or camera performance results."
              : "Paired preview follows inference cadence. Capture is host read completion; physical latency is unmeasured.",
          );
          updatePeople(observation);
          const drawStarted = performance.now();
          redraw();
          diagnostics.add({
            processing: observation.metrics.processingMs,
            inference: observation.metrics.inferenceMs,
            decode: decodeMs,
            draw: performance.now() - drawStarted,
            bytes: event.data.byteLength,
            receivedAt: lastUpdate,
          });
          updateTelemetry();
          const ambiguous = observation.people.some(
            (person) => person.identity === "ambiguous",
          );
          setStatus(
            observation.source === "demo"
              ? "Synthetic scene running"
              : observation.detectedCount === 0
                ? "Looking for people"
                : ambiguous
                  ? "Identity needs recovery"
                  : "Skeletons detected",
            ambiguous
              ? "Overlapping people have uncertain association. Their skeletons are shown without claiming identity."
              : observation.source === "demo"
                ? "Generated observations exercise the same renderer and contract as camera input."
                : "Count updates automatically. Step into view with your shoulders, hips and hands visible.",
            ambiguous ? "uncertain" : "running",
          );
        }
      } catch (error) {
        if (ownGeneration !== generation) return;
        await stop();
        setStatus(
          "Preview could not continue",
          error instanceof Error ? error.message : String(error),
          "error",
        );
      } finally {
        rendering = false;
        if (ownGeneration === generation && ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "next" }));
      }
    };
    ws.onerror = () => {
      if (ownGeneration === generation)
        void stop(
          "The connection failed. Check that the vision service is running.",
        );
    };
    ws.onclose = () => {
      if (ownGeneration === generation && running)
        void stop("The connection closed. Start the preview to reconnect.");
    };
  } catch (error) {
    if (ownGeneration !== generation) return;
    await stop();
    setStatus(
      "Unable to start",
      error instanceof Error ? error.message : String(error),
      "error",
    );
  }
}
sourceButtons.forEach((button, index) =>
  button.addEventListener("click", () => {
    source = index === 0 ? "camera" : "demo";
    cameraSetup.release();
    write(
      "viewport-title",
      source === "camera" ? "Camera preview" : "Synthetic test scene",
    );
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
["mirror", "show-video", "show-boxes", "confidence"].forEach((id) =>
  get(id).addEventListener("input", () => {
    get("confidence-value").textContent = Number(
      get<HTMLInputElement>("confidence").value,
    ).toFixed(2);
    get("view-label").textContent = renderOptions().mirror
      ? "Mirrored view"
      : "Camera view";
    redraw();
    if (lastFrame) updatePeople(lastFrame);
  }),
);
get("fullscreen").addEventListener("click", () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else
    void get("stage")
      .requestFullscreen()
      .catch(() =>
        setStatus(
          "Full screen unavailable",
          "Your browser does not support this full-screen view. You can continue in the current window.",
        ),
      );
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cameraSetup.release();
  if (document.hidden && running) {
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
  socket?.close();
  if (running && epoch)
    void fetch("/api/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epoch }),
      keepalive: true,
    }).catch(() => {});
});
window.setInterval(() => {
  updateTelemetry();
  if (running && lastUpdate > 0 && performance.now() - lastUpdate > 1500) {
    lastUpdate = 0;
    lastFrame = null;
    lastImage?.close();
    lastImage = null;
    clearObservations("No fresh detections. Waiting for the source.");
    clearTelemetry();
    drawStandby(canvas);
    get("source-badge").textContent = "Stale";
    get("frame-state").textContent = "No recent frame";
    setStatus(
      "Waiting for fresh input",
      "No frame has arrived for 1.5 seconds. Old skeletons are hidden.",
      "uncertain",
    );
  }
}, 300);
new ResizeObserver(redraw).observe(canvas);
drawStandby(canvas);
void fetch("/api/status")
  .then(async (response) => {
    if (!response.ok) throw new Error("Unavailable");
    const status = await response.json();
    if (status.state === "running")
      setStatus(
        "A source is already running",
        "Start a preview to replace the existing diagnostic source.",
      );
  })
  .catch(() =>
    setStatus(
      "Vision service offline",
      "Run pnpm dev from the repository to start the local vision service and viewer.",
      "error",
    ),
  );
