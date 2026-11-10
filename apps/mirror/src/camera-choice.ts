import "./camera-choice.css";

const choice = (name: string, value: string) =>
  Object.assign(document.createElement("option"), { textContent: name, value });

type Camera = { id: string; name: string };
export type CameraSelection = { cameraId: string } | { cameraIndex: number };

function scopedId(prefix: string, id: string) {
  if (prefix && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(prefix))
    throw new Error("Camera choice prefix must be a simple HTML ID prefix.");
  return prefix ? `${prefix}-${id}` : id;
}

/** Separate camera roles share behavior, but every label/status keeps its own ID. */
export function cameraChoiceMarkupFor(prefix = "") {
  const id = (name: string) => scopedId(prefix, name);
  return `
  <div class="camera-choice">
    <label class="field-label" for="${id("camera-choice")}">Choose camera</label>
    <div class="camera-choice-row"><select id="${id("camera-choice")}" aria-describedby="${id("camera-choice-status")}"><option value="">Choose a camera</option><option value="manual">Manual camera index</option></select><button id="${id("refresh-cameras")}" type="button">Refresh</button></div>
    <p id="${id("camera-choice-status")}" class="field-note field-help" role="status">Refresh to find built-in and USB cameras. Nothing is recorded.</p>
    <div id="${id("manual-camera")}" class="camera-choice-manual" hidden><label class="field-label" for="${id("camera-index")}">Native camera index</label><input id="${id("camera-index")}" type="number" min="0" max="9" step="1" value="0" required><p class="field-note field-help">Advanced fallback. Indices can change after reconnecting a camera.</p></div>
  </div>`;
}

export const cameraChoiceMarkup = cameraChoiceMarkupFor();

/** Shared operator control; it lists metadata and never acquires a camera. */
export class CameraChoice {
  private readonly select: HTMLSelectElement;
  private readonly refreshButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly manual: HTMLElement;
  private readonly index: HTMLInputElement;
  private readonly listeners = new AbortController();
  private revision = 0;
  private loading = false;
  private locked = false;
  private disposed = false;
  private pendingRequest: AbortController | null = null;
  private readonly subscribers = new Set<() => void>();
  constructor(root: ParentNode = document, prefix = "") {
    const get = <T extends HTMLElement>(id: string) => {
      const element = root.querySelector<T>(`#${scopedId(prefix, id)}`);
      if (!element)
        throw new Error(
          `Camera choice markup missing: ${scopedId(prefix, id)}`,
        );
      return element;
    };
    this.select = get("camera-choice");
    this.refreshButton = get("refresh-cameras");
    this.status = get("camera-choice-status");
    this.manual = get("manual-camera");
    this.index = get("camera-index");
    this.refreshButton.addEventListener("click", () => void this.refresh(), {
      signal: this.listeners.signal,
    });
    this.select.addEventListener(
      "change",
      () => {
        this.update();
        this.notify();
      },
      {
        signal: this.listeners.signal,
      },
    );
    this.index.addEventListener("input", () => this.notify(), {
      signal: this.listeners.signal,
    });
    this.update();
  }
  private notify() {
    for (const listener of this.subscribers) listener();
  }
  onChange(listener: () => void): () => void {
    if (this.disposed) return () => {};
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }
  private update() {
    this.select.disabled = this.locked || this.loading;
    this.refreshButton.disabled = this.locked || this.loading;
    this.refreshButton.textContent = this.loading ? "Finding…" : "Refresh";
    this.select.setAttribute("aria-busy", String(this.loading));
    this.manual.hidden = this.select.value !== "manual";
    this.index.disabled = this.locked || this.loading || this.manual.hidden;
  }
  setLocked(value: boolean) {
    this.locked = value;
    this.update();
  }
  get label(): string {
    return this.select.selectedOptions[0]?.textContent || "Camera";
  }
  /** Read-only role validation must not focus controls or announce selection errors. */
  currentSelection(): CameraSelection | null {
    if (this.loading || this.disposed || !this.select.value) return null;
    if (this.select.value === "manual") {
      const value = Number(this.index.value);
      return this.index.value.trim() !== "" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 9
        ? { cameraIndex: value }
        : null;
    }
    return { cameraId: this.select.value };
  }
  selection(): CameraSelection {
    if (this.loading)
      throw new Error("Finding cameras. Wait a moment, then choose a camera.");
    if (this.select.value === "manual") {
      if (!this.index.checkValidity()) {
        this.index.reportValidity();
        throw new Error("Choose a whole native camera index from 0 to 9.");
      }
      return { cameraIndex: Number(this.index.value) };
    }
    if (!this.select.value) {
      this.select.focus();
      const message =
        "Choose a camera first. Reconnect USB cameras and press Refresh if needed.";
      this.status.textContent = message;
      throw new Error(message);
    }
    return { cameraId: this.select.value };
  }
  async refresh() {
    if (this.loading || this.locked || this.disposed) return;
    const own = ++this.revision;
    const previous = this.select.value;
    this.loading = true;
    this.status.textContent = "Finding connected cameras…";
    this.update();
    this.notify();
    const abort = new AbortController();
    this.pendingRequest = abort;
    const timeout = window.setTimeout(() => abort.abort(), 12000);
    try {
      const response = await fetch("/api/cameras", { signal: abort.signal });
      const data: { cameras?: Camera[]; detail?: string } =
        await response.json();
      if (!response.ok)
        throw new Error(data.detail || "Camera discovery unavailable.");
      const cameras = data.cameras;
      if (
        !Array.isArray(cameras) ||
        cameras.length > 32 ||
        cameras.some(
          (camera) =>
            !/^[a-f0-9]{64}$/.test(camera.id) ||
            typeof camera.name !== "string" ||
            !camera.name ||
            camera.name.length > 160,
        ) ||
        new Set(cameras.map((camera) => camera.id)).size !== cameras.length
      )
        throw new Error("Camera discovery returned an invalid device list.");
      if (own !== this.revision || this.disposed) return;
      this.select.replaceChildren(
        choice("Choose a camera", ""),
        ...cameras.map((camera, index) =>
          choice(
            cameras.filter((item) => item.name === camera.name).length > 1
              ? `${camera.name} · ${index + 1}`
              : camera.name,
            camera.id,
          ),
        ),
        choice("Manual camera index", "manual"),
      );
      const retained =
        previous === "manual" ||
        cameras.some((camera) => camera.id === previous);
      this.select.value = retained
        ? previous
        : !previous && cameras.length === 1
          ? cameras[0].id
          : "";
      this.status.textContent =
        previous && !retained
          ? "Selected camera disconnected. Choose a camera again; no replacement was selected."
          : cameras.length
            ? `${cameras.length} camera${cameras.length === 1 ? "" : "s"} available. Stop capture before changing cameras. Missing USB camera? Check its connection and accessory approval, then Refresh.`
            : "No cameras detected. Reconnect the USB camera, allow OS camera/accessory access, then Refresh.";
    } catch (error) {
      if (own !== this.revision || this.disposed) return;
      this.select.replaceChildren(
        choice("Choose a camera", ""),
        choice("Manual camera index", "manual"),
      );
      this.status.textContent = `${error instanceof Error && error.name !== "AbortError" ? error.message : "Camera discovery timed out."} Retry Refresh or choose the manual index.`;
    } finally {
      window.clearTimeout(timeout);
      if (this.pendingRequest === abort) this.pendingRequest = null;
      if (own === this.revision && !this.disposed) {
        this.loading = false;
        this.update();
        this.notify();
      }
    }
  }
  dispose() {
    this.disposed = true;
    this.revision++;
    this.listeners.abort();
    this.pendingRequest?.abort();
    this.subscribers.clear();
  }
}
