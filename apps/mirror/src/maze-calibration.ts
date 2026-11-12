import { CameraChoice, cameraChoiceMarkupFor } from "./camera-choice";
import { MazeCalibrationCapture } from "./maze-calibration-capture";
import {
  projectFloorContact,
  type FloorMapping,
} from "../../../packages/motion/src/floor-mapping";
import "./maze-calibration.css";

const corners = [
  "Near left · origin (0, 0)",
  "Near right · (width, 0)",
  "Far right · (width, depth)",
  "Far left · (0, depth)",
];
const placements = [
  "Near-left area · edge along width",
  "Centre area · edge diagonally",
  "Far-right area · edge along depth",
];
type Point = [number, number];
interface Evidence {
  corners: Point[];
  references: Point[][];
  geometry: string;
  size: [number, number];
  mapping: FloorMapping | null;
  quality: string;
}
const empty = (): Evidence => ({
  corners: [],
  references: [[], [], []],
  geometry: "",
  size: [0, 0],
  mapping: null,
  quality: "Not calibrated",
});

export function mazeCalibrationMarkup() {
  return `<section class="maze-panel maze-calibration"><details id="maze-calibration"><summary>Live floor calibration · cameras 1 → 2</summary>
  <p class="maze-hint">First set your measured width and depth in Game settings. Fix both cameras in place. Mark the four named floor corners, then move a measured rigid ruler or checkerboard edge to three separated positions. Keep it flat on the floor. Camera pixels stay in memory.</p>
  <p class="calibration-warning">Floor mapping only. Physical maze play stays unavailable: facing, synchronized body position and identity are not established by this procedure.</p>
  <label for="cal-role">Camera role</label><select id="cal-role"><option value="0">Camera 1 · primary floor view</option><option value="1">Camera 2 · alternate floor view</option></select>
  <div id="cal-camera-1">${cameraChoiceMarkupFor("maze-cal-1")}</div><div id="cal-camera-2" hidden>${cameraChoiceMarkupFor("maze-cal-2")}</div>
  <label for="cal-optics">Locked image / lens setup</label><input id="cal-optics" type="text" maxlength="160" placeholder="e.g. full frame, no zoom, focus locked at floor">
  <p class="maze-hint">Record crop, rotation, focus, optical and digital zoom. Lock automatic focus/zoom. Any change or camera movement needs new calibration; hidden lens changes cannot be detected automatically.</p>
  <div class="calibration-actions"><button id="cal-start" type="button" class="maze-button">Start camera 1</button><button id="cal-stop" type="button" class="maze-button" disabled>Stop camera / retry stop</button></div>
  <p id="cal-capture-status" class="maze-hint" role="status">Camera off. Start is the only action that acquires a camera.</p>
  <div class="calibration-preview"><canvas id="cal-preview" width="640" height="360" aria-label="Raw camera preview; freeze then mark named floor points"></canvas><svg id="cal-marks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg><span id="cal-frame-label">Camera off</span></div>
  <button id="cal-freeze" type="button" class="maze-button maze-wide" disabled>Freeze current view to mark points</button>
  <p id="cal-step" class="maze-hint" role="status">Start camera, wait for a live frame, then freeze it.</p>
  <div class="maze-pair"><div><label for="cal-u">Image X · %</label><input id="cal-u" type="number" min="0" max="100" step="0.01" value="50"></div><div><label for="cal-v">Image Y · %</label><input id="cal-v" type="number" min="0" max="100" step="0.01" value="50"></div></div>
  <button id="cal-add" type="button" class="maze-button maze-wide" disabled>Mark next point / probe floor</button>
  <div class="calibration-actions"><button id="cal-undo" type="button" class="maze-button" disabled>Undo last point</button><button id="cal-reset" type="button" class="maze-button">Clear this camera calibration</button></div>
  <label for="cal-reference-length">Independently measured reference length · m</label><input id="cal-reference-length" type="number" min="0.2" max="2" step="0.001" value="1">
  <p class="maze-hint">Measure the edge with a tape, including print scale. It is checked after the floor fit, never used to fit it. Near-left: lay the edge along width. Centre: turn it diagonally. Far-right: lay it along depth. Span at least 40% of both field dimensions. Resume live video between placements.</p>
  <ol id="cal-evidence" class="maze-hint"></ol><button id="cal-fit" type="button" class="maze-button primary maze-wide" disabled>Check held-out distances & fit floor</button>
  <p id="cal-result" class="maze-hint" role="status">No floor mapping. A single object at one position cannot establish arbitrary camera geometry.</p>
  <p id="cal-pair-status" class="maze-hint" role="status">Camera 1: not calibrated. Camera 2: not calibrated.</p>
  <button id="cal-invalidate" type="button" class="maze-button maze-wide">Camera moved / lens changed · invalidate both</button>
  <p class="maze-hint">After both roles pass, you have two independently checked floor mappings with matching named corners, not stereo extrinsics or validated XYZ. A tiny fit error from four corners is expected and is not independent accuracy evidence. Lens distortion and manual marking errors need physical checks across the field.</p>
  </details></section>`;
}

/** Manual-corner fallback follows the same measured checks as a detected planar marker. */
export function mountMazeCalibration(root: HTMLElement) {
  const get = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const input = (id: string) => get<HTMLInputElement>(id);
  const button = (id: string) => get<HTMLButtonElement>(id);
  const canvas = get<HTMLCanvasElement>("cal-preview");
  const listeners = new AbortController();
  const choices = [
    new CameraChoice(root, "maze-cal-1"),
    new CameraChoice(root, "maze-cal-2"),
  ];
  const evidence: Evidence[] = [empty(), empty()];
  const optics = ["", ""];
  let role = 0,
    frozen = false,
    hasFrame = false,
    disposed = false,
    version = 0,
    fitting = false;
  let referenceFreeze = -1;
  let displayedFrame = 0,
    lastFrozenFrame = -1;
  let drawn: Point[] = [];
  const current = () => evidence[role];
  const dimensions = () => [
    input("maze-width").valueAsNumber,
    input("maze-depth").valueAsNumber,
  ];
  const geometryKey = (w: number, h: number) =>
    JSON.stringify([
      choices[role].currentSelection(),
      w,
      h,
      input("cal-optics").value.trim(),
      ...dimensions(),
    ]);
  function say(id: string, text: string) {
    if (!disposed) get(id).textContent = text;
  }
  function drawMarks() {
    get("cal-marks").innerHTML = drawn
      .map(
        ([u, v], i) =>
          `<circle cx="${u * 100}" cy="${v * 100}" r="1.3" fill="#ffce5b" stroke="#172a3d" stroke-width=".3"/><text x="${Math.min(93, u * 100 + 2)}" y="${Math.max(5, v * 100 - 2)}" font-size="4" fill="#ffce5b" stroke="#172a3d" stroke-width=".12">${i + 1}</text>`,
      )
      .join("");
  }
  function clearView() {
    displayedFrame = 0;
    lastFrozenFrame = -1;
    hasFrame = false;
    frozen = false;
    drawn = [];
    drawMarks();
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    say("cal-frame-label", "Camera off");
  }
  function invalidate(message: string, both = false) {
    version++;
    if (both) {
      evidence[0] = empty();
      evidence[1] = empty();
    } else evidence[role] = empty();
    drawn = [];
    drawMarks();
    referenceFreeze = -1;
    say("cal-result", message);
    render();
  }
  const capture = new MazeCalibrationCapture({
    changed(message) {
      say("cal-capture-status", message);
      if (!capture.active && !capture.busy) clearView();
      render();
    },
    lost() {
      clearView();
      invalidate(
        "Preview lost. This camera's calibration was invalidated. Start again and repeat its measurements.",
      );
    },
    frame(image, w, h) {
      if (disposed) return;
      const e = current(),
        key = geometryKey(w, h);
      if (e.geometry && e.geometry !== key) {
        frozen = false;
        invalidate(
          "Image geometry changed. Repeat this camera's corners and distance checks.",
        );
      }
      current().geometry = key;
      current().size = [w, h];
      hasFrame = true;
      if (!frozen) {
        displayedFrame++;
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")?.drawImage(image, 0, 0);
        say("cal-frame-label", `Live · ${w} × ${h} · unmirrored`);
      }
      render();
    },
  });
  function render() {
    if (disposed) return;
    const e = current();
    choices.forEach((choice) => choice.setLocked(capture.busy));
    get<HTMLSelectElement>("cal-role").disabled = capture.busy || fitting;
    input("cal-optics").disabled = capture.busy;
    button("cal-start").disabled = capture.busy || fitting;
    button("cal-start").textContent = `Start camera ${role + 1}`;
    button("cal-stop").disabled = !capture.busy;
    button("cal-freeze").disabled = !hasFrame || !capture.active;
    button("cal-freeze").textContent = frozen
      ? "Resume live view · move reference to next position"
      : "Freeze current view to mark points";
    button("cal-add").disabled = !frozen || !capture.fresh || fitting;
    button("cal-undo").disabled = !e.corners.length || fitting;
    button("cal-fit").disabled =
      fitting ||
      !capture.fresh ||
      e.corners.length !== 4 ||
      e.references.some((points) => points.length !== 2);
    get("cal-evidence").replaceChildren(
      ...[
        ...corners.map(
          (name, i) => `${name}: ${e.corners[i] ? "marked" : "waiting"}`,
        ),
        ...placements.map(
          (name, i) =>
            `${name}: ${e.references[i].length}/2 reference endpoints`,
        ),
      ].map((text) =>
        Object.assign(document.createElement("li"), { textContent: text }),
      ),
    );
    say(
      "cal-pair-status",
      evidence
        .map(
          (item, i) =>
            `Camera ${i + 1}: ${item.mapping ? item.quality : "not calibrated"}`,
        )
        .join(". ") + ". Physical maze remains unavailable.",
    );
    const placement = e.references.findIndex((p) => p.length < 2);
    say(
      "cal-step",
      e.mapping
        ? "Floor mapping checked. Mark a known floor contact to inspect X/Z; elevated points are invalid."
        : !hasFrame
          ? "Start camera, wait for a live frame, then freeze it."
          : !frozen
            ? "Live view. Freeze after positioning the reference flat on the floor."
            : e.corners.length < 4
              ? `Mark floor corner ${e.corners.length + 1}/4: ${corners[e.corners.length]}.`
              : placement >= 0
                ? `${placements[placement]}: mark reference endpoint ${e.references[placement].length + 1}/2.${referenceFreeze === placement || e.references[placement].length ? "" : " Resume live, move the reference, then freeze a new view first."}`
                : "All measurements marked. Check held-out distances to fit the floor.",
    );
  }
  function listen(target: EventTarget, type: string, callback: EventListener) {
    target.addEventListener(type, callback, { signal: listeners.signal });
  }
  listen(button("cal-start"), "click", () => {
    try {
      const [width, depth] = dimensions();
      if (![width, depth].every((n) => Number.isFinite(n) && n >= 5 && n <= 10))
        throw new Error(
          "Set measured width/depth between 5 and 10 m before calibration.",
        );
      if (!input("cal-optics").value.trim())
        throw new Error(
          "Record and lock crop, focus and zoom before starting.",
        );
      const selection = choices[role].selection();
      if (role === 1 && !evidence[0].mapping)
        throw new Error(
          "Complete camera 1's floor checks first, Stop it, then connect camera 2.",
        );
      const other = evidence[1 - role];
      if (
        other.geometry &&
        JSON.stringify(selection) ===
          JSON.stringify(JSON.parse(other.geometry)[0])
      )
        throw new Error(
          "Choose a different physical camera for the second role.",
        );
      invalidate(
        "New capture epoch. Repeat this camera's calibration; other camera evidence is retained.",
      );
      clearView();
      void capture.start(selection);
    } catch (error) {
      say(
        "cal-capture-status",
        error instanceof Error ? error.message : "Choose a camera.",
      );
    }
  });
  listen(button("cal-stop"), "click", () => {
    clearView();
    void capture.stop();
  });
  listen(get("cal-role"), "change", () => {
    optics[role] = input("cal-optics").value;
    role = Number(get<HTMLSelectElement>("cal-role").value);
    input("cal-optics").value = optics[role];
    get("cal-camera-1").hidden = role !== 0;
    get("cal-camera-2").hidden = role !== 1;
    clearView();
    version++;
    say(
      "cal-result",
      current().mapping
        ? current().quality
        : "Choose this camera and Start. Keep the same named physical floor corners in both views.",
    );
    render();
  });
  listen(button("cal-freeze"), "click", () => {
    if (!capture.fresh) {
      say(
        "cal-result",
        "No fresh frame to freeze. Wait for live video or restart the camera.",
      );
      return;
    }
    if (!frozen && displayedFrame <= lastFrozenFrame) {
      say(
        "cal-result",
        "Wait for a new live image before freezing another reference placement.",
      );
      return;
    }
    frozen = !frozen;
    drawn = [];
    drawMarks();
    if (frozen) {
      lastFrozenFrame = displayedFrame;
      referenceFreeze =
        current().corners.length === 4
          ? current().references.findIndex((p) => p.length < 2)
          : -1;
      say(
        "cal-frame-label",
        `Frozen calibration image · ${current().size.join(" × ")}`,
      );
    }
    render();
  });
  function add(point: Point) {
    if (
      !frozen ||
      !capture.fresh ||
      fitting ||
      !point.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
    )
      return;
    const e = current();
    if (e.mapping) {
      const position = projectFloorContact(e.mapping, point, {
        revision: e.mapping.revision,
        geometryKey: e.geometry,
        onFloor: true,
      });
      say(
        "cal-result",
        position
          ? `Marked floor contact: X ${position.x.toFixed(3)} m, Z ${position.z.toFixed(3)} m · ${e.mapping.revision}. Manual floor probe only; no body/facing input.`
          : "Contact is outside the calibrated floor or geometry is invalid. Do not clamp it into the maze.",
      );
      drawn = [point];
      drawMarks();
      return;
    }
    if (e.corners.length < 4) e.corners.push(point);
    else {
      const placement = e.references.findIndex((p) => p.length < 2);
      if (placement < 0) return;
      if (referenceFreeze !== placement) {
        say(
          "cal-result",
          `Resume live video, move the reference to ${placements[placement]}, then freeze a fresh view.`,
        );
        return;
      }
      e.references[placement].push(point);
    }
    version++;
    drawn.push(point);
    drawMarks();
    render();
  }
  listen(button("cal-add"), "click", () =>
    add([
      input("cal-u").valueAsNumber / 100,
      input("cal-v").valueAsNumber / 100,
    ]),
  );
  listen(canvas, "click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const pointer = event as MouseEvent;
    add([
      (pointer.clientX - rect.left) / rect.width,
      (pointer.clientY - rect.top) / rect.height,
    ]);
  });
  listen(button("cal-undo"), "click", () => {
    const e = current();
    e.mapping = null;
    e.quality = "Not calibrated";
    const last = [...e.references].reverse().find((p) => p.length);
    if (last) last.pop();
    else e.corners.pop();
    version++;
    drawn = [];
    drawMarks();
    render();
  });
  listen(button("cal-reset"), "click", () =>
    invalidate("Cleared. Repeat corners and all three reference placements."),
  );
  listen(button("cal-invalidate"), "click", () => {
    frozen = false;
    invalidate(
      "Camera/lens changed: both mappings invalidated. Lock the setup and repeat both roles.",
      true,
    );
  });
  for (const id of ["maze-width", "maze-depth", "cal-reference-length"])
    listen(input(id), "input", () =>
      invalidate(
        "Dimensions or reference length changed. Repeat both cameras' measurements.",
        true,
      ),
    );
  listen(input("cal-optics"), "input", () =>
    invalidate("Lens/image setup changed. Repeat this camera's calibration."),
  );
  choices.forEach((choice, i) =>
    choice.onChange(() => {
      evidence[i] = empty();
      version++;
      render();
    }),
  );
  listen(button("cal-fit"), "click", () => {
    void fit();
  });
  async function fit() {
    const e = current(),
      own = version,
      ownRole = role;
    if (
      !capture.fresh ||
      e.corners.length !== 4 ||
      e.references.some((p) => p.length !== 2)
    )
      return;
    const length = input("cal-reference-length").valueAsNumber;
    if (!Number.isFinite(length) || length < 0.2 || length > 2) {
      say("cal-result", "Measure a reference length from 0.2 to 2 m.");
      return;
    }
    fitting = true;
    render();
    say("cal-result", "Checking geometry and independent distances…");
    try {
      const [widthM, depthM] = dimensions();
      const response = await fetch("/api/calibration/floor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          widthM,
          depthM,
          imageCorners: Object.fromEntries(
            ["nearLeft", "nearRight", "farRight", "farLeft"].map((key, i) => [
              key,
              e.corners[i],
            ]),
          ),
          reference: {
            lengthM: length,
            placements: placements.map((name, i) => ({
              name,
              endpoints: e.references[i],
            })),
          },
        }),
        signal: AbortSignal.timeout(12000),
      });
      const data = (await response.json()) as {
        detail?: string;
        homography?: number[][];
        schemaVersion?: string;
        heldOut?: { maxErrorM: number; rmseM: number };
      };
      if (disposed || own !== version || ownRole !== role) return;
      if (!response.ok)
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Floor checks failed. Re-mark corners/reference and retry.",
        );
      if (
        data.schemaVersion !== "floor-calibration/v1" ||
        !Array.isArray(data.homography) ||
        data.homography.length !== 3 ||
        data.homography.some(
          (row) =>
            !Array.isArray(row) ||
            row.length !== 3 ||
            !row.every(Number.isFinite),
        ) ||
        !Number.isFinite(data.heldOut?.maxErrorM) ||
        !Number.isFinite(data.heldOut?.rmseM)
      )
        throw new Error(
          "Invalid floor calibration response. Restart the local service and retry.",
        );
      e.mapping = {
        revision: `floor-${ownRole + 1}-${crypto.randomUUID()}`,
        geometryKey: e.geometry,
        widthM,
        depthM,
        homography: data.homography,
      };
      e.quality = `floor checks passed · max reference error ${data.heldOut!.maxErrorM.toFixed(3)} m`;
      say(
        "cal-result",
        `${e.quality}. Revision ${e.mapping.revision}. Mark a known floor contact to inspect X/Z. Stop camera ${role + 1} before choosing the other role. Physical play remains gated.`,
      );
    } catch (error) {
      if (own === version && !disposed) {
        e.mapping = null;
        say(
          "cal-result",
          `${error instanceof Error ? error.message : "Calibration failed."} Undo/re-mark the reference or clear and repeat. No mapping accepted.`,
        );
      }
    } finally {
      fitting = false;
      render();
    }
  }
  listen(get("pre-game-settings"), "close", () => {
    clearView();
    void capture.stop();
  });
  listen(root, "click", (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
      "a[href]",
    );
    if (!link || link.target === "_blank" || !capture.navigationBlocker) return;
    event.preventDefault();
    say("cal-capture-status", capture.navigationBlocker);
    const dialog = get<HTMLDialogElement>("pre-game-settings");
    if (!dialog.open) dialog.showModal();
    get<HTMLDetailsElement>("maze-calibration").open = true;
    button("cal-stop").focus();
  });
  // Device enumeration is metadata-only. No preview or camera starts on page load.
  choices.forEach((choice) => {
    void choice.refresh();
  });
  render();
  return {
    get navigationBlocker() {
      return capture.navigationBlocker;
    },
    dispose() {
      disposed = true;
      version++;
      listeners.abort();
      choices.forEach((choice) => choice.dispose());
      capture.dispose();
    },
  };
}
