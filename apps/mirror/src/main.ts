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
    <a class="brand" href="/" aria-label="Motion Studio home"><span class="brand-symbol">${icon("body")}</span><span>Motion<span class="brand-light">Studio</span></span></a>
    <span class="header-section">Body tracking / Diagnostic workspace</span>
    <span class="local-indicator"><span></span> Local processing</span>
  </header>
  <main id="workspace">
    <div class="page-heading"><div><p class="eyebrow">The motion layer</p><h1>Skeleton viewer</h1><p>See the people. Follow the joints. Build from here.</p></div><span class="phase-label">Diagnostic preview <span>v0.1</span></span></div>
    <div class="workspace-grid">
      <section class="viewer-panel" aria-label="Body skeleton viewport">
        <div class="viewer-toolbar"><div class="viewer-title"><span id="source-dot" class="source-dot"></span><strong id="viewport-title">Camera preview</strong><span id="source-badge" class="subtle-badge">Standby</span></div><button id="fullscreen" class="icon-button" aria-label="Expand viewer" title="Expand viewer">${icon("expand")}</button></div>
        <div class="stage" id="stage">
          <canvas id="skeleton-canvas" width="1280" height="800" aria-label="Mirrored camera image and detected body skeletons"></canvas>
          <div class="stage-corner stage-top"><span class="view-label" id="view-label">Mirrored view</span><span class="people-overlay" id="people-overlay">0 people</span></div>
          <div class="standby" id="standby"><span class="standby-icon">${icon("camera")}</span><h2>Your movement starts here</h2><p>Start a camera to detect people automatically,<br>or explore with a synthetic scene.</p></div>
          <div class="stage-corner stage-bottom"><span id="stage-source">No source connected</span><span id="frame-state">Waiting for frames</span></div>
        </div>
        <div class="view-options"><label><input id="mirror" type="checkbox" checked><span>Mirror view</span></label><label><input id="show-video" type="checkbox" checked><span>Show image</span></label><label><input id="show-boxes" type="checkbox" checked><span>Person bounds</span></label><span class="view-hint">Anatomical left / right stays consistent</span></div>
        <div class="status-banner" id="status-banner" role="status"><span id="status-symbol" class="status-symbol"></span><div><strong id="status-title">Ready when you are</strong><p id="status-message">Choose an input source, then start the preview.</p></div></div>
      </section>
      <aside class="control-panel" aria-label="Input and detection settings">
        <section class="control-section"><h2>Input source</h2><div class="segmented" role="group" aria-label="Input source"><button id="source-camera" aria-pressed="true">Camera</button><button id="source-demo" aria-pressed="false">Synthetic scene</button></div>
          <div id="camera-settings"><label class="field-label" for="camera-index">Camera index</label><input id="camera-index" type="number" min="0" max="9" value="0"><p class="field-help">0 is usually the built-in or first connected camera.</p></div>
          <div id="demo-settings" hidden><label class="field-label" for="demo-scenario">Test scene</label><select id="demo-scenario"><option value="three">Three moving people</option><option value="cycle">People enter and leave</option><option value="empty">Empty scene</option></select><p class="field-help">Generated bodies for testing. No camera or person inference.</p></div>
        </section>
        <section class="control-section"><h2>Detection pipeline</h2><label class="field-label" for="algorithm">Pose model</label><select id="algorithm"><option value="rtmpose">RTMPose · detector + pose</option><option value="mediapipe">MediaPipe · comparison baseline</option></select><label class="field-label" for="tracker">Person association</label><select id="tracker"><option value="pose">Pose assisted</option><option value="iou">Box overlap</option></select><div class="capacity-row"><label class="field-label" for="capacity">Detection capacity</label><select id="capacity"><option value="3">3 people</option><option value="6" selected>6 people</option></select></div><p class="field-help">Count is automatic. Capacity limits the people examined per frame.</p>
          <div class="range-label"><label for="confidence">Joint visibility threshold</label><output id="confidence-value" for="confidence">0.50</output></div><input id="confidence" type="range" min="0.1" max="0.9" step="0.05" value="0.5"><p class="field-help">Hides uncertain joints and their bones. A model score is not a probability.</p>
        </section>
        <div class="run-controls"><button id="start" class="primary-button">${icon("play")}<span>Start camera</span></button><button id="stop" class="secondary-button" disabled>${icon("stop")}<span>Stop</span></button></div>
        <p class="privacy-note">Processed on this computer. Preview frames are not saved.</p>
      </aside>
      <section class="observations" aria-label="Detection observations">
        <div class="observation-heading"><div><h2>People in view</h2><p>Current detections, separate from game player slots.</p></div><div class="count-readout"><strong id="person-count">0</strong><span id="count-label">detected</span></div></div>
        <div id="person-list" class="person-list"><p class="empty-people">Detected bodies will appear here automatically.</p></div>
        <p id="capacity-warning" class="capacity-warning" hidden>Detection capacity reached. There may be additional people outside the returned detections.</p>
      </section>
      <section class="telemetry" aria-label="Preview diagnostics"><h2>At a glance</h2><dl><div><dt>Render FPS</dt><dd id="update-rate">— <span>/s</span></dd></div><div><dt>Camera / source FPS</dt><dd id="camera-rate">—</dd></div><div><dt>Pose FPS</dt><dd id="pose-rate">—</dd></div><div><dt>Overlay gap</dt><dd id="overlay-gap">—</dd></div><div><dt>Inference time</dt><dd id="inference-time">— <span>ms</span></dd></div><div><dt>Source image</dt><dd id="source-size">—</dd></div><div><dt>Skipped captures</dt><dd id="capture-drops">—</dd></div></dl><p id="timing-note">Timing will appear when the source is running.</p></section>
    </div>
    <footer><span><span class="footer-marker"></span> Observation → motion → future game input</span><span>Single-view diagnostics. Identity through occlusion is not guaranteed.</span></footer>
  </main>`;

function get<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
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
let sockets: WebSocket[] = [];
let lastPreview: PreviewFrame | null = null;
let animation: number | null = null;
let poseReceivedAt = 0;
const renderRate = new FrameRate();
const poseRate = new FrameRate();
let lastFrame: Observation | null = null;
let lastImage: ImageBitmap | null = null;
let lastUpdate = 0;
let epoch = "";
let hiddenStop = false;

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
  for (const id of [
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
function redraw() {
  if (lastPreview && lastImage) {
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
  } else drawStandby(canvas);
}
function animate(now: number) {
  if (!running) {
    animation = null;
    return;
  }
  if (lastPreview && lastImage && performance.now() - lastUpdate <= 1500) {
    redraw();
    renderRate.record(now);
  }
  animation = requestAnimationFrame(animate);
}
function updatePeople(frame: Observation) {
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
    const joints = Object.values(person.joints).filter(
      (joint) =>
        joint.inFrame &&
        joint.status === "observed" &&
        joint.score >= renderOptions().confidence,
    ).length;
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
  else clearObservations("No people detected. Move into the camera view.");
}
function setControls(active: boolean) {
  running = active;
  startButton.disabled = active;
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
  sockets.forEach((socket) => socket.close());
  sockets = [];
  if (animation !== null) cancelAnimationFrame(animation);
  animation = null;
  renderRate.reset();
  poseRate.reset();
  lastPreview = null;
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
  const ownGeneration = ++generation;
  setControls(true);
  clearObservations("Waiting for the first detection.");
  setStatus(
    "Starting preview",
    "Opening the source and loading the local model…",
    "starting",
  );
  epoch = "";
  const sequences = { preview: -1, observations: -1 };
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
    if (typeof result.epoch !== "string")
      throw new Error("Missing source epoch.");
    epoch = result.epoch;
    animation = requestAnimationFrame(animate);
    for (const kind of ["preview", "observations"] as const) {
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/${kind}?epoch=${encodeURIComponent(epoch)}`,
      );
      ws.binaryType = "arraybuffer";
      sockets.push(ws);
      let decoding = false;
      ws.onopen = () => ws.send(JSON.stringify({ type: "next" }));
      ws.onmessage = async (event: MessageEvent<ArrayBuffer | string>) => {
        if (ownGeneration !== generation || decoding) return;
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
              if (observation.epoch !== epoch)
                throw new Error(
                  "The source restarted. Start the preview again.",
                );
              if (observation.sequence <= sequences.observations)
                throw new Error("Outdated pose observation.");
              sequences.observations = observation.sequence;
              lastFrame = observation;
              poseReceivedAt = performance.now();
              poseRate.record(poseReceivedAt);
            } else throw new Error("Unexpected preview control message.");
          } else {
            if (kind !== "preview")
              throw new Error("Unexpected binary observation.");
            const { preview, jpeg } = decodePreviewPacket(event.data);
            if (preview.epoch !== epoch)
              throw new Error("The source restarted. Start the preview again.");
            if (preview.sequence <= sequences.preview)
              throw new Error("The source returned an outdated frame.");
            const image = await createImageBitmap(
              new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
            );
            if (
              image.width !== preview.image.width ||
              image.height !== preview.image.height
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
            sequences.preview = preview.sequence;
            lastImage?.close();
            lastImage = image;
            lastPreview = preview;
            lastUpdate = performance.now();
            get("standby").hidden = true;
            get("source-badge").textContent =
              preview.source === "demo" ? "Synthetic" : "Live";
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
          decoding = false;
          if (ownGeneration === generation && ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "next" }));
        }
      };
      ws.onerror = () => {
        if (ownGeneration === generation)
          void stop("The connection failed. Check the vision service.");
      };
      ws.onclose = () => {
        if (ownGeneration === generation && running)
          void stop("The connection closed. Start the preview to reconnect.");
      };
    }
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
      : `${get<HTMLSelectElement>("algorithm").value === "rtmpose" ? "RTMPose" : "MediaPipe"} · camera ${get<HTMLInputElement>("camera-index").value}`;
  get("frame-state").textContent = `Frame ${lastPreview.sequence}`;
  get("source-size").textContent =
    `${lastPreview.image.width} × ${lastPreview.image.height}`;
  get("inference-time").textContent = freshPose
    ? `${freshPose.metrics.inferenceMs.toFixed(0)} ms`
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
    source = index === 0 ? "camera" : "demo";
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
    if (lastFrame && performance.now() - poseReceivedAt <= 500)
      updatePeople(lastFrame);
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
  sockets.forEach((socket) => socket.close());
  if (running && epoch)
    void fetch("/api/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epoch }),
      keepalive: true,
    }).catch(() => {});
});
window.setInterval(() => {
  if (running && lastUpdate > 0 && performance.now() - lastUpdate > 1500) {
    lastUpdate = 0;
    lastFrame = null;
    lastPreview = null;
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
