interface CameraSetupOptions {
  busyChanged: (busy: boolean) => void;
}

const get = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const option = (label: string, value: string) =>
  Object.assign(document.createElement("option"), {
    textContent: label,
    value,
  });

function cameraError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera access denied. Allow camera access for this page in browser settings, or use the native index below with OS permission.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "Camera unavailable. Reconnect it and discover cameras again.";
  if (name === "NotReadableError")
    return "Camera is busy or blocked by the OS. Stop other capture apps and check system camera permission.";
  return error instanceof Error
    ? error.message
    : "Camera discovery failed. Retry or use the native index.";
}

/** Browser capture is an explicit setup aid, never the diagnostic frame source. */
export class CameraSetup {
  private stream: MediaStream | null = null;
  private pending = false;
  private locked = false;
  private revision = 0;
  private readonly devices = navigator.mediaDevices;
  private readonly discover = get<HTMLButtonElement>("discover-cameras");
  private readonly identify = get<HTMLButtonElement>("identify-camera");
  private readonly select = get<HTMLSelectElement>("browser-camera");
  private readonly video = get<HTMLVideoElement>("camera-check-video");

  constructor(private readonly options: CameraSetupOptions) {
    this.discover.addEventListener("click", () => void this.open(false));
    this.identify.addEventListener("click", () => void this.open(true));
    get("release-camera").addEventListener("click", () => this.release());
    this.select.addEventListener("change", () => this.release());
    this.devices?.addEventListener("devicechange", () => {
      this.release();
      this.select.replaceChildren(option("Discover cameras again", ""));
      this.message(
        "Device list changed. Discover again; recheck the native index.",
      );
      this.update();
    });
    this.update();
  }
  get busy() {
    return this.pending;
  }
  get active() {
    return this.pending || this.stream !== null;
  }
  setLocked(locked: boolean) {
    this.locked = locked;
    if (locked) this.release();
    this.update();
  }
  release() {
    this.revision++;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    get("camera-check").hidden = true;
    this.update();
  }
  private message(text: string) {
    get("camera-permission").textContent = text;
  }
  private update() {
    this.discover.disabled = this.locked || this.pending;
    this.select.disabled = this.locked || this.pending || !this.select.value;
    this.identify.disabled = this.locked || this.pending || !this.select.value;
  }
  private async open(identify: boolean) {
    if (this.locked || this.pending) return;
    this.release();
    if (!this.devices?.getUserMedia || !this.devices.enumerateDevices) {
      this.message(
        "Browser camera discovery is unavailable. Use localhost/HTTPS, or select the native index with OS camera permission.",
      );
      return;
    }
    const revision = this.revision;
    this.pending = true;
    this.options.busyChanged(true);
    this.update();
    this.message("Waiting for camera permission. No microphone is requested.");
    let acquired: MediaStream | null = null;
    try {
      const status = await fetch("/api/status");
      if (!status.ok)
        throw new Error(
          "Vision service unavailable. Start pnpm dev, then retry discovery.",
        );
      const state = await status.json();
      if (!["idle", "error"].includes(state.state))
        throw new Error(
          "Stop the active vision source before browser camera discovery, including previews in other tabs.",
        );
      if (revision !== this.revision) return;
      acquired = await this.devices.getUserMedia({
        audio: false,
        video: identify ? { deviceId: { exact: this.select.value } } : true,
      });
      if (revision !== this.revision) return;
      if (identify) {
        this.stream = acquired;
        this.video.srcObject = acquired;
        get("camera-check").hidden = false;
        await this.video.play();
        if (revision !== this.revision) return;
        // Ownership moves only after playback succeeds; finally releases on failure.
        acquired = null;
        this.message(
          "Identification only. Match this view to the native index; Start releases this browser camera first.",
        );
      } else {
        const devices = await this.devices.enumerateDevices();
        if (revision !== this.revision) return;
        const cameras = devices.filter(
          (device) => device.kind === "videoinput" && device.deviceId,
        );
        this.select.replaceChildren(
          ...cameras.map((camera, index) =>
            option(
              camera.label || `Unlabeled camera ${index + 1}`,
              camera.deviceId,
            ),
          ),
        );
        if (!cameras.length)
          this.select.append(option("No cameras exposed", ""));
        this.message(
          cameras.length
            ? `${cameras.length} camera${cameras.length === 1 ? "" : "s"} found. Browser capture released. Identify a device, then verify its native index.`
            : "No cameras exposed by the browser. Reconnect a camera or use a native index.",
        );
      }
    } catch (error) {
      if (revision === this.revision) {
        this.release();
        this.message(cameraError(error));
      }
    } finally {
      acquired?.getTracks().forEach((track) => track.stop());
      this.pending = false;
      this.options.busyChanged(false);
      this.update();
    }
  }
}
