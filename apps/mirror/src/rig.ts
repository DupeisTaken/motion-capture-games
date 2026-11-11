import { mountAppNavigation } from "./app-navigation";
import "./style.css";
import "./rig.css";
import rawDataset from "./rig-rehearsal.json";
import { CameraChoice, cameraChoiceMarkupFor } from "./camera-choice";
import {
  assessRigFrame,
  loadRigDataset,
  selectRigFrame,
  validateRigPlan,
  type RigDataset,
  type RigFrame,
  type RigPoint,
} from "./rig-state";
import { renderRigSpace, renderRigView } from "./rig-renderer";
import { createRigGameplay } from "./rig-gameplay";
import {
  parseDisplayedCameraPreference,
  resolveDisplayedCamera,
} from "./rig-display-state";

const markup = `
  <a class="skip-link" href="#rig-workspace">Skip to two-view workspace</a>
  <header class="app-header"><a class="brand" href="/">Motion<span class="brand-light">Studio</span><span class="subtle-badge">LAB</span></a><span class="header-section">Operator / two-view workspace</span><a class="rig-console-link" href="/diagnostics.html">Single-camera console ↗</a></header>
  <main class="rig-workspace" id="rig-workspace">
    <div class="page-heading"><div><p class="eyebrow">RIG SETUP / FUTURE SPATIAL INPUT</p><h1>Two views. One shared space.</h1></div><span class="rig-origin-badge">Synthetic rehearsal</span></div>
    <p class="rig-intro">Explore how two camera angles become a position in meters. Plan camera roles separately. Live two-camera capture and maze input remain unavailable.</p>
    <p id="rig-load-error" class="rig-note" role="alert" hidden></p>
    <div class="rig-mode-tabs" role="tablist" aria-label="Workspace mode"><button type="button" role="tab" id="rig-tab-rehearsal" aria-controls="rig-rehearsal" aria-selected="true">Rehearse coordinates</button><button type="button" role="tab" id="rig-tab-planning" aria-controls="rig-planning" aria-selected="false" tabindex="-1">Plan physical rig</button></div>
    <section id="rig-rehearsal" role="tabpanel" aria-labelledby="rig-tab-rehearsal">
      <div class="rig-rehearsal-grid">
        <aside class="rig-panel rig-controls" aria-label="Rehearsal controls">
          <p class="eyebrow">01 / RECORDED SYNTHETIC SAMPLES</p><h2>Choose a situation</h2>
          <label class="field-label" for="rig-scenario">Scenario</label><select id="rig-scenario"></select><p id="rig-scenario-description" class="field-help"></p>
          <p id="rig-scenario-risk" class="rig-note"></p>
          <div class="rig-play-controls"><button type="button" id="rig-play" class="primary-button" aria-pressed="false">Play samples</button><button type="button" id="rig-reset" class="secondary-button">Reset</button></div>
          <label class="field-label" for="rig-frame">Recorded sample <output id="rig-frame-label" for="rig-frame">—</output></label><input id="rig-frame" type="range" min="0" max="0" step="1" value="0"><div class="rig-step-controls"><button type="button" id="rig-previous">← Previous</button><button type="button" id="rig-next">Next →</button></div>
          <p class="field-help">Playback steps through a bounded recording at 4 samples/s. It does not measure camera, inference or display FPS.</p>
          <dl class="rig-source-facts"><div><dt>Source sequence</dt><dd id="rig-sequence">—</dd></div><div><dt>Source time</dt><dd id="rig-source-time">—</dd></div><div><dt>Pair skew / uncertainty</dt><dd id="rig-pair-timing">—</dd></div><div><dt>Solver</dt><dd>Closest-ray midpoint</dd></div></dl>
          <p class="field-help">Anatomical left/right stays unchanged. View diagrams use canonical, unmirrored image pixels.</p>
        </aside>
        <div class="rig-observation-area">
          <div class="rig-view-pair" id="rig-view-pair" tabindex="0" aria-label="Synthetic camera views. Left and right arrow keys step samples; Space plays or pauses.">
            <article class="rig-panel rig-view-card"><div class="rig-panel-heading"><h2>Primary · reference view</h2><span class="subtle-badge">Synthetic</span></div><div id="rig-reference-view" class="rig-view-diagram"></div><p id="rig-reference-context" class="field-help rig-view-context"></p></article>
            <article class="rig-panel rig-view-card"><div class="rig-panel-heading"><h2>Secondary · supporting view</h2><span class="subtle-badge">Synthetic</span></div><div id="rig-support-view" class="rig-view-diagram"></div><p id="rig-support-context" class="field-help rig-view-context"></p></article>
          </div>
          <section class="rig-panel rig-space-panel" aria-label="Reconstructed rig coordinates"><div class="rig-panel-heading"><div><p class="eyebrow">02 / SHARED RIG SPACE</p><h2>Where is the participant?</h2></div><span id="rig-sample-state" class="subtle-badge">—</span></div><div class="rig-space-layout"><div><div id="rig-space" class="rig-space-diagram"></div><p class="rig-map-legend"><span><i class="rig-estimate-dot"></i>Reconstructed estimate</span><span><i class="rig-reference-dot"></i>Synthetic reference</span></p><p class="field-help">Plot: X −3 to 3 m, Z 0 to 6 m, including the display area. Synthetic gate volume: X −3 to 3 m, Y 0 to 2.6 m, Z 1 to 6 m. Camera markers show solver calibration; no physical volume is validated.</p></div><div class="rig-coordinate-panel"><h3>Hip midpoint · meters</h3><div class="rig-coordinate-table"><table><caption class="rig-visually-hidden">Reconstructed root compared with synthetic reference truth</caption><thead><tr><th scope="col">Axis</th><th scope="col">Estimate</th><th scope="col">Reference</th></tr></thead><tbody><tr><th scope="row">X</th><td id="rig-x">—</td><td id="rig-reference-x">—</td></tr><tr><th scope="row">Y</th><td id="rig-y">—</td><td id="rig-reference-y">—</td></tr><tr><th scope="row">Z</th><td id="rig-z">—</td><td id="rig-reference-z">—</td></tr></tbody></table></div><p id="rig-root-state" class="field-help"></p><p class="rig-difference">Reference difference <strong id="rig-reference-difference">—</strong></p><p class="field-help">Reference values exist only because this recording is synthetic. Small residuals cannot establish physical accuracy.</p><dl class="rig-source-facts"><div><dt>Accepted joints</dt><dd id="rig-joint-count">—</dd></div><div><dt>Rig association</dt><dd id="rig-track">—</dd></div><div><dt>Solver / reference baseline</dt><dd id="rig-baseline">—</dd></div></dl></div></div><div id="rig-quality" class="rig-quality" role="status" aria-live="polite"></div></section>
          <details id="rig-joint-details" class="rig-panel rig-joint-details" hidden><summary>Inspect named joint rejections</summary><ul id="rig-rejected-joints" tabindex="0" aria-label="Rejected anatomical joints"></ul></details>
          <section class="rig-panel rig-gameplay-panel" aria-label="Player gameplay rehearsal"><div class="rig-panel-heading"><div><p class="eyebrow">03 / PLAYER GAMEPLAY</p><h2>Slap a Mole · selected camera scene</h2></div><span class="subtle-badge">Pointer / keyboard rehearsal</span></div><p class="field-help">Both camera observations stay above for the operator. The player sees one selected synthetic scene with real game targets and scoring. Recorded bodies and XYZ do not control hits.</p><div class="rig-gameplay-selection" id="rig-gameplay-selection"><div><label class="field-label" for="rig-displayed-camera">Player gameplay camera</label><select id="rig-displayed-camera" aria-describedby="rig-display-preference-note"></select><p id="rig-display-preference-note" class="field-help">Chooses the player’s scene without changing camera roles or XYZ. Saved on this browser.</p></div><div class="rig-gameplay-source" aria-label="Selected gameplay source"><strong id="rig-selected-title">Waiting for a recorded view</strong><span id="rig-selected-state" class="subtle-badge">Unavailable</span><p id="rig-selected-context" class="field-help"></p><p id="rig-selected-unavailable" class="rig-note" hidden></p><p id="rig-selected-warning" class="field-help" role="status" aria-live="polite"></p></div></div><div id="rig-gameplay-host"></div></section>
        </div>
      </div>
    </section>
    <section id="rig-planning" role="tabpanel" aria-labelledby="rig-tab-planning" hidden>
      <div class="rig-planning-intro rig-note"><strong>Planning only · no camera is opened</strong><p>Refresh lists native device metadata. Assign fixed roles and record setup notes. This page cannot preview two live cameras, calibrate them or verify XYZ. Use the <a href="/diagnostics.html">single-camera console</a> to inspect one camera at a time.</p></div>
      <form id="rig-plan-form" class="rig-plan-grid">
        <fieldset class="rig-panel"><legend>Primary · reference camera</legend><p class="field-help">The reference role anchors the operator view. It does not mean the person standing on one side.</p>${cameraChoiceMarkupFor("reference")}</fieldset>
        <fieldset class="rig-panel"><legend>Secondary · supporting camera</legend><p class="field-help">An additional angle should cover the same volume. Role assignment follows the device identity through list reordering.</p>${cameraChoiceMarkupFor("support")}</fieldset>
        <section class="rig-panel rig-plan-notes" aria-label="Operator setup notes"><h2>Record the installation plan</h2><p class="field-help">Notes stay in this page’s memory and reset on reload; each field allows 1,000 characters. Operator records are distinct from measured evidence.</p><label class="field-label" for="rig-placement-notes">Placement and intended volume</label><textarea id="rig-placement-notes" rows="3" maxlength="1000" placeholder="Camera heights, approximate baseline, shared coverage and clear movement area"></textarea><label class="field-label" for="rig-calibration-notes">Calibration references to collect</label><textarea id="rig-calibration-notes" rows="2" maxlength="1000" placeholder="Exact image geometry, metric board, held-out distances, calibration revision"></textarea><label class="field-label" for="rig-timing-notes">Exposure and synchronization evidence to collect</label><textarea id="rig-timing-notes" rows="2" maxlength="1000" placeholder="Exposure source, clock mapping, offset/drift, uncertainty and fast-motion checks"></textarea><button class="primary-button rig-plan-check" type="submit">Check role plan</button><div id="rig-plan-result" class="rig-quality" role="status" aria-live="polite">Choose two different named devices, then check the plan. No capture starts.</div></section>
        <section class="rig-panel rig-readiness" aria-label="Physical input readiness"><p class="eyebrow">REQUIRED BEFORE LIVE SPATIAL INPUT</p><h2>Physical readiness remains unverified</h2><ul><li><strong>Two-view live capture</strong><span>Not implemented in this workspace</span></li><li><strong>Metric calibration</strong><span>Unverified · independent scale references required</span></li><li><strong>Exposure timing</strong><span>Unverified · host read time is insufficient</span></li><li><strong>Cross-view identity</strong><span>Unverified · no guessed score ownership</span></li><li><strong>Physical volume and accuracy</strong><span>Unverified · held-out static and dynamic trials required</span></li></ul><div class="rig-locked-status"><strong>Physical XYZ unavailable</strong><span>Future maze input remains disabled.</span></div></section>
      </form>
    </section>
    <section class="rig-persistent-limit" aria-label="Input availability"><span class="rig-origin-badge">Synthetic rehearsal</span><p><strong id="rig-physical-state">Physical XYZ unavailable</strong> · <span id="rig-maze-state">Maze input disabled</span>. Setup notes and sample playback cannot unlock either.</p></section>
    <footer><span>Camera tracks → rig association → future session input</span><span>Absolute position requires verified calibration, timing and identity.</span></footer>
  </main>`;

const reasonLabels: Record<string, string> = {
  missing: "Missing joint observations",
  identity_uncertain: "Cross-view identity is uncertain",
  pair_skew: "Exposure pair is too far apart",
  time_uncertain: "Source timing is uncertain",
  weak_geometry: "Camera rays give weak depth geometry",
  calibration_mismatch: "Calibration revision changed",
  unverified_exposure_time: "Exposure timing is unverified",
  stale_input: "Source input is stale",
  estimated_error: "Estimated spatial error exceeds the gate",
  outside_image: "Joint is outside an image",
  ray_gap: "Camera rays do not agree",
  reprojection: "Image reprojection exceeds the gate",
  transform_mismatch: "Image transform changed",
  future_input: "Source time is in the future",
  camera_unavailable: "The selected camera is unavailable in this recording",
  primary_unavailable: "No primary camera is available for the initial display",
  invalid_timing: "Recorded source timing is invalid",
  clock_mismatch: "Recorded source clocks cannot be compared",
  no_visible_joints: "No source joints are visible",
  missing_joints: "Some source joints are missing",
  invalid_image_geometry: "Recorded image geometry is invalid",
};
const DISPLAY_PREFERENCE_KEY =
  "motion-studio.rig.synthetic-displayed-camera.v1";
const metres = (point: RigPoint | null, axis: keyof RigPoint) => {
  if (!point) return "Unavailable";
  const rounded = point[axis].toFixed(3);
  return rounded === "-0.000" ? "0.000" : rounded;
};

export function createRigWorkspace(
  root: HTMLElement,
  input: unknown = rawDataset,
) {
  root.innerHTML = markup;
  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const events = new AbortController();
  const reference = new CameraChoice(root, "reference");
  const support = new CameraChoice(root, "support");
  let dataset: RigDataset | null = null;
  let scenarioId = "";
  let frameIndex = 0;
  let timer: number | null = null;
  let disposed = false;
  let playing = false;
  let preferenceAvailable = true;
  let displayedCameraId: string | null = null;
  let displayChoicesSignature = "";
  try {
    displayedCameraId = parseDisplayedCameraPreference(
      window.localStorage.getItem(DISPLAY_PREFERENCE_KEY),
    );
  } catch {
    preferenceAvailable = false;
  }
  const write = (id: string, value: string) => {
    const element = get(id);
    if (element.textContent !== value) element.textContent = value;
  };
  const gameplay = createRigGameplay(get("rig-gameplay-host"));
  gameplay.setEnabled(false);
  function saveDisplayPreference() {
    if (!displayedCameraId) return;
    if (preferenceAvailable) {
      try {
        window.localStorage.setItem(DISPLAY_PREFERENCE_KEY, displayedCameraId);
      } catch {
        preferenceAvailable = false;
      }
    }
    write(
      "rig-display-preference-note",
      preferenceAvailable
        ? "Chooses the player’s scene without changing camera roles or XYZ. Saved on this browser."
        : "Chooses the player’s scene without changing camera roles or XYZ. Browser storage is unavailable; the choice applies to this page only.",
    );
  }
  function renderSelected(frame: RigFrame) {
    const selected = resolveDisplayedCamera(frame, displayedCameraId);
    if (selected.selectedCameraId !== displayedCameraId) {
      displayedCameraId = selected.selectedCameraId;
      saveDisplayPreference();
    }
    const options = frame.views.map((view) => ({
      id: view.cameraId,
      label: `${view.cameraId} · ${view.role === "primary" ? "Primary / reference" : "Secondary / supporting"}`,
    }));
    if (
      displayedCameraId &&
      !options.some((option) => option.id === displayedCameraId)
    )
      options.push({
        id: displayedCameraId,
        label: `${displayedCameraId} · unavailable in this recording`,
      });
    const signature = JSON.stringify(options);
    if (signature !== displayChoicesSignature) {
      displayChoicesSignature = signature;
      get<HTMLSelectElement>("rig-displayed-camera").replaceChildren(
        ...options.map((item) => {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.label;
          return option;
        }),
      );
    }
    get<HTMLSelectElement>("rig-displayed-camera").value =
      displayedCameraId ?? "";
    const view = selected.view;
    get("rig-gameplay-selection").dataset.cameraId = displayedCameraId ?? "";
    get("rig-gameplay-selection").dataset.sourceStatus = selected.status;
    write(
      "rig-selected-title",
      view
        ? `${view.cameraId} · ${view.role === "primary" ? "Primary / reference" : "Secondary / supporting"}`
        : `${displayedCameraId ?? "Recorded camera"} · unavailable`,
    );
    write(
      "rig-selected-state",
      selected.status === "usable"
        ? "Recorded view available"
        : selected.status === "partial"
          ? "Partial recorded view"
          : "Displayed view unavailable",
    );
    get("rig-selected-unavailable").hidden = selected.drawable;
    const explanations = [...selected.reasons, ...selected.warnings].map(
      (reason) => reasonLabels[reason] || reason.replaceAll("_", " "),
    );
    write(
      "rig-selected-unavailable",
      explanations.join(" · ") || "No recorded camera view is available.",
    );
    write(
      "rig-selected-context",
      view
        ? `${view.cameraId} · source frame ${view.frameId} · ${view.imageSize.join(" × ")} · unmirrored · ${view.cameraTrackId} · source ${view.timeNs} ns (${view.clockDomain}, ${view.timestampKind}, uncertainty ${view.uncertaintyNs} ns) · recorded age ${selected.sourceAgeNs === null ? "unavailable" : `${(Number(selected.sourceAgeNs) / 1e6).toFixed(1)} ms`}`
        : "The preferred camera was not replaced by another view. Choose an available recorded camera to recover.",
    );
    write(
      "rig-selected-warning",
      explanations.join(" · ") ||
        "Recorded synthetic source only. Calibration, exposure timing and identity are not physically validated.",
    );
    if (!preferenceAvailable) saveDisplayPreference();
    gameplay.setSource(frame, displayedCameraId);
  }
  function pause() {
    playing = false;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    write("rig-play", "Play samples");
    get("rig-play").setAttribute("aria-pressed", "false");
  }
  function render() {
    if (!dataset || disposed) return;
    const { scenario, frame } = selectRigFrame(dataset, scenarioId, frameIndex);
    const quality = assessRigFrame(frame);
    const slider = get<HTMLInputElement>("rig-frame");
    slider.max = String(scenario.frames.length - 1);
    slider.value = String(frameIndex);
    write("rig-frame-label", `${frameIndex + 1} / ${scenario.frames.length}`);
    write("rig-scenario-description", scenario.description);
    write("rig-scenario-risk", scenario.risk);
    write("rig-sequence", String(frame.sequence));
    write("rig-source-time", `${frame.timeNs} ns · synthetic clock`);
    write(
      "rig-pair-timing",
      `${(Number(frame.timing.skewNs) / 1e6).toFixed(1)} / ${(Number(frame.timing.combinedUncertaintyNs) / 1e6).toFixed(1)} ms`,
    );
    for (const view of frame.views) {
      const role = view.role === "primary" ? "reference" : "support";
      renderRigView(get(`rig-${role}-view`), view);
      write(
        `rig-${role}-context`,
        `${view.cameraId} · ${view.imageSize.join(" × ")} · unmirrored · local track ${view.cameraTrackId} · identity ${view.identityConfirmed ? "confirmed in recording" : "uncertain"} · ${view.timestampKind}`,
      );
    }
    renderSelected(frame);
    renderRigSpace(get("rig-space"), frame);
    const estimate = frame.reconstruction.root;
    for (const axis of ["x", "y", "z"] as const) {
      write(`rig-${axis}`, metres(estimate, axis));
      write(`rig-reference-${axis}`, metres(frame.reference.root, axis));
    }
    write(
      "rig-reference-difference",
      estimate
        ? `${(Math.hypot(estimate.x - frame.reference.root.x, estimate.y - frame.reference.root.y, estimate.z - frame.reference.root.z) * 100).toFixed(1)} cm`
        : "Unavailable",
    );
    write(
      "rig-root-state",
      quality.rootAvailable
        ? "Both hips accepted in this synthetic sample."
        : "Hip midpoint unavailable. Both anatomical hips must pass every gate.",
    );
    write(
      "rig-joint-count",
      `${quality.availableJointCount} / ${quality.totalJointCount}`,
    );
    write(
      "rig-track",
      frame.reconstruction.rigTrackId || "Association unavailable",
    );
    write(
      "rig-baseline",
      `${frame.calibration.baselineM.toFixed(2)} / ${frame.calibration.referenceBaselineM.toFixed(2)} m`,
    );
    write(
      "rig-sample-state",
      quality.state === "sample-available"
        ? "Synthetic estimate available"
        : quality.state === "partial"
          ? "Partial synthetic sample"
          : "Estimate unavailable",
    );
    get("rig-sample-state").dataset.state = quality.state;
    const reasons = Object.entries(quality.rejections).map(
      ([reason, count]) =>
        `${reasonLabels[reason] || reason.replaceAll("_", " ")} (${count})`,
    );
    const rejected = frame.reconstruction.joints.filter(
      (joint) => joint.reason !== "observed",
    );
    const namedReason = (joint: (typeof rejected)[number]) => {
      const name = joint.name.replaceAll("_", " ");
      return `${name[0].toUpperCase()}${name.slice(1)} — ${reasonLabels[joint.reason] || joint.reason.replaceAll("_", " ")}`;
    };
    write(
      "rig-quality",
      reasons.length
        ? rejected.length <= 3
          ? rejected.map(namedReason).join(" · ")
          : reasons.join(" · ")
        : "This synthetic sample passes the declared software gates. Physical calibration and identity remain unverified.",
    );
    get("rig-joint-details").hidden = rejected.length <= 3;
    const items =
      rejected.length > 3
        ? rejected.map((joint) => {
            const item = document.createElement("li");
            item.textContent = namedReason(joint);
            return item;
          })
        : [];
    get("rig-rejected-joints").replaceChildren(...items);
    get("rig-quality").dataset.state = reasons.length ? "uncertain" : "sample";
    get<HTMLButtonElement>("rig-previous").disabled = frameIndex === 0;
    get<HTMLButtonElement>("rig-next").disabled =
      frameIndex === scenario.frames.length - 1;
  }
  function step(delta: number) {
    if (!dataset || disposed) return;
    const { scenario } = selectRigFrame(dataset, scenarioId, frameIndex);
    frameIndex = Math.max(
      0,
      Math.min(scenario.frames.length - 1, frameIndex + delta),
    );
    render();
  }
  function play() {
    if (!dataset || disposed || document.hidden || get("rig-rehearsal").hidden)
      return;
    if (playing) {
      pause();
      return;
    }
    const { scenario } = selectRigFrame(dataset, scenarioId, frameIndex);
    if (frameIndex === scenario.frames.length - 1) frameIndex = 0;
    playing = true;
    write("rig-play", "Pause samples");
    get("rig-play").setAttribute("aria-pressed", "true");
    render();
    const tick = () => {
      timer = null;
      if (!playing || disposed) return;
      step(1);
      if (frameIndex === scenario.frames.length - 1) pause();
      else timer = window.setTimeout(tick, 250);
    };
    timer = window.setTimeout(tick, 250);
  }
  function setMode(mode: "rehearsal" | "planning") {
    pause();
    gameplay.setEnabled(mode === "rehearsal" && dataset !== null);
    root.querySelectorAll<HTMLElement>(".rig-origin-badge").forEach((badge) => {
      badge.textContent =
        mode === "planning"
          ? "Physical planning · no capture"
          : "Synthetic rehearsal";
    });
    for (const name of ["rehearsal", "planning"] as const) {
      get(`rig-${name}`).hidden = name !== mode;
      get(`rig-tab-${name}`).setAttribute(
        "aria-selected",
        String(name === mode),
      );
      get(`rig-tab-${name}`).tabIndex = name === mode ? 0 : -1;
    }
    if (mode === "planning") get("rig-tab-planning").focus();
  }
  function validatePlan() {
    const first = reference.currentSelection(),
      second = support.currentSelection();
    const identity = (selection: typeof first) =>
      selection
        ? "cameraId" in selection
          ? selection.cameraId
          : `manual:${selection.cameraIndex}`
        : "";
    const result = validateRigPlan({
      primaryCameraId: identity(first),
      secondaryCameraId: identity(second),
      placementNotes: get<HTMLTextAreaElement>("rig-placement-notes").value,
      calibrationNotes: get<HTMLTextAreaElement>("rig-calibration-notes").value,
      synchronizationNotes: get<HTMLTextAreaElement>("rig-timing-notes").value,
    });
    const manual = [first, second].some(
      (selection) => selection && "cameraIndex" in selection,
    );
    const errors = [...result.errors];
    if (manual)
      errors.push(
        "Manual indices do not establish two distinct device identities. Choose named cameras to check the role plan.",
      );
    write(
      "rig-plan-result",
      errors.length
        ? errors.join(" ")
        : "Two distinct device roles recorded for this page. Placement, calibration, exposure timing and physical XYZ remain unverified; no camera was opened.",
    );
    get("rig-plan-result").dataset.state = errors.length
      ? "uncertain"
      : "sample";
  }
  const unsubscribe = [
    reference.onChange(validatePlan),
    support.onChange(validatePlan),
  ];
  const listen = (target: EventTarget, type: string, callback: EventListener) =>
    target.addEventListener(type, callback, { signal: events.signal });
  listen(get("rig-plan-form"), "submit", (event) => {
    event.preventDefault();
    validatePlan();
  });
  listen(get("rig-play"), "click", play);
  listen(get("rig-displayed-camera"), "change", () => {
    displayedCameraId = parseDisplayedCameraPreference(
      get<HTMLSelectElement>("rig-displayed-camera").value,
    );
    saveDisplayPreference();
    render();
  });
  listen(get("rig-reset"), "click", () => {
    pause();
    frameIndex = 0;
    render();
  });
  listen(get("rig-previous"), "click", () => {
    pause();
    step(-1);
  });
  listen(get("rig-next"), "click", () => {
    pause();
    step(1);
  });
  listen(get("rig-frame"), "input", () => {
    pause();
    frameIndex = Number(get<HTMLInputElement>("rig-frame").value);
    render();
  });
  listen(get("rig-scenario"), "change", () => {
    pause();
    scenarioId = get<HTMLSelectElement>("rig-scenario").value;
    frameIndex = 0;
    get<HTMLDetailsElement>("rig-joint-details").open = false;
    render();
  });
  const sampleKeys: EventListener = (event) => {
    const key = event as KeyboardEvent;
    if (key.key === "ArrowLeft" || key.key === "ArrowRight") {
      key.preventDefault();
      pause();
      step(key.key === "ArrowRight" ? 1 : -1);
    } else if (key.key === " ") {
      key.preventDefault();
      play();
    }
  };
  listen(get("rig-view-pair"), "keydown", sampleKeys);
  for (const name of ["rehearsal", "planning"] as const) {
    listen(get(`rig-tab-${name}`), "click", () => setMode(name));
    listen(get(`rig-tab-${name}`), "keydown", (event) => {
      const key = event as KeyboardEvent;
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(key.key)) {
        key.preventDefault();
        const next =
          key.key === "Home"
            ? "rehearsal"
            : key.key === "End"
              ? "planning"
              : name === "rehearsal"
                ? "planning"
                : "rehearsal";
        setMode(next);
        get(`rig-tab-${next}`).focus();
      }
    });
  }
  listen(document, "visibilitychange", () => {
    if (document.hidden) pause();
  });
  listen(window, "pagehide", (event) => {
    // BFCache preserves the usable page; ordinary navigation aborts metadata discovery too.
    if ((event as PageTransitionEvent).persisted) pause();
    else dispose();
  });
  try {
    dataset = loadRigDataset(input);
    scenarioId = dataset.cases[0].id;
    for (const scenario of dataset.cases) {
      const option = document.createElement("option");
      option.value = scenario.id;
      option.textContent = scenario.title;
      get<HTMLSelectElement>("rig-scenario").append(option);
    }
    render();
    gameplay.setEnabled(true);
  } catch (error) {
    dataset = null;
    gameplay.setEnabled(false);
    write(
      "rig-load-error",
      `Rehearsal data unavailable. ${error instanceof Error ? error.message : String(error)} Reload the page after repairing the local dataset. Physical XYZ remains unavailable.`,
    );
    get("rig-load-error").hidden = false;
    for (const id of [
      "rig-play",
      "rig-reset",
      "rig-frame",
      "rig-previous",
      "rig-next",
      "rig-scenario",
      "rig-displayed-camera",
    ])
      get<HTMLButtonElement>(id).disabled = true;
  }
  function dispose() {
    if (disposed) return;
    pause();
    disposed = true;
    gameplay.dispose();
    events.abort();
    unsubscribe.forEach((stop) => stop());
    reference.dispose();
    support.dispose();
  }
  return { dispose, navigationBlocker: () => gameplay.navigationBlocker() };
}

const app = document.querySelector<HTMLElement>("#app");
if (app) {
  const workspace = createRigWorkspace(app);
  const navigation = mountAppNavigation({ owner: workspace });
  if (import.meta.hot)
    import.meta.hot.dispose(() => {
      navigation.dispose();
      workspace.dispose();
    });
}
