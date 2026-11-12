import { decodePreviewPacket } from "../../../packages/motion/src/index";
import { CameraReleases } from "./camera-release";
import type { CameraSelection } from "./camera-choice";

interface CaptureCallbacks {
  frame: (image: ImageBitmap, width: number, height: number) => void;
  changed: (message: string) => void;
  lost: () => void;
}

/** One acknowledged vision epoch; preview and calibration never reopen the device. */
export class MazeCalibrationCapture {
  private socket: WebSocket | null = null;
  private epoch: string | null = null;
  private pending = false;
  private disposed = false;
  private uncertainStart = false;
  private generation = 0;
  private lastFrameAt = 0;
  private readonly releases: CameraReleases;
  private readonly timer: number;
  constructor(private readonly callbacks: CaptureCallbacks) {
    this.releases = new CameraReleases(fetch, () =>
      this.callbacks.changed(this.message),
    );
    this.timer = window.setInterval(() => {
      if (this.epoch && performance.now() - this.lastFrameAt > 12000)
        void this.fail(
          "No fresh preview. Stop/retry; check the service log, USB connection and local models.",
        );
    }, 1000);
  }
  get busy() {
    return (
      this.pending ||
      this.epoch !== null ||
      this.releases.state.pendingCount > 0 ||
      this.uncertainStart
    );
  }
  get active() {
    return this.epoch !== null;
  }
  get navigationBlocker(): string | null {
    return this.busy
      ? "Stop calibration camera and wait for acknowledged release before leaving. Retry camera stop if needed. If start ownership is unknown, restart the local service and reload."
      : null;
  }
  get fresh() {
    return this.active && performance.now() - this.lastFrameAt < 1500;
  }
  get message() {
    return (
      this.releases.state.message ||
      (this.uncertainStart
        ? "Start ownership is unknown after a lost response. Restart the local vision service, then reload this page; do not open another camera."
        : this.pending
          ? "Starting camera…"
          : this.epoch
            ? "Live preview · raw, unmirrored image. No video is stored."
            : "Camera stopped. Choose a role and explicitly Start camera.")
    );
  }
  async start(selection: CameraSelection) {
    if (this.busy || this.disposed) return;
    this.pending = true;
    const own = ++this.generation;
    this.callbacks.changed(this.message);
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 20000);
    let responseReceived = false;
    let failureMessage: string | null = null;
    try {
      const response = await fetch("/api/calibration/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "camera",
          ...selection,
          independentPreview: true,
          maxPeople: 1,
        }),
        signal: abort.signal,
      });
      responseReceived = true;
      // Capture may be running after any successful but unusable acknowledgement.
      if (response.ok) this.uncertainStart = true;
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        if (response.ok) this.uncertainStart = true;
        throw new Error("Camera returned an unreadable start response.");
      }
      const data =
        body && typeof body === "object"
          ? (body as { epoch?: unknown; detail?: unknown })
          : {};
      if (!response.ok)
        throw new Error(
          (typeof data.detail === "string" && data.detail) ||
            "Camera start failed. Check the local vision service.",
        );
      if (
        typeof data.epoch !== "string" ||
        !data.epoch.trim() ||
        data.epoch.length > 128
      ) {
        this.uncertainStart = true;
        throw new Error(this.message);
      }
      this.uncertainStart = false;
      if (own !== this.generation || this.disposed) {
        await this.releases.release(data.epoch);
        return;
      }
      this.epoch = data.epoch;
      this.lastFrameAt = performance.now();
      this.openStream(data.epoch, own);
    } catch (error) {
      if (!responseReceived) this.uncertainStart = true;
      failureMessage = this.uncertainStart
        ? this.message
        : error instanceof Error
          ? error.message
          : "Camera start failed.";
      return;
    } finally {
      window.clearTimeout(timeout);
      this.pending = false;
      this.callbacks.changed(failureMessage || this.message);
    }
  }
  private openStream(epoch: string, own: number) {
    const socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/preview?epoch=${encodeURIComponent(epoch)}`,
    );
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    let sequence = -1;
    const current = () =>
      !this.disposed && this.generation === own && this.socket === socket;
    socket.onopen = () => {
      if (current()) socket.send('{"type":"next"}');
    };
    socket.onmessage = async (event: MessageEvent) => {
      if (!current()) return;
      try {
        if (!(event.data instanceof ArrayBuffer)) {
          const status = JSON.parse(String(event.data)) as {
            state?: string;
            message?: string;
            epoch?: string;
          };
          if (
            status.epoch !== epoch ||
            status.state === "error" ||
            status.state === "idle"
          )
            throw new Error(
              status.message || "Camera source changed. Start again.",
            );
          this.callbacks.changed(
            status.message || "Waiting for a fresh camera frame…",
          );
        } else {
          const { preview, jpeg } = decodePreviewPacket(event.data);
          if (
            preview.source !== "camera" ||
            preview.epoch !== epoch ||
            preview.sequence <= sequence
          )
            throw new Error(
              "Incompatible or outdated preview. Stop and Start camera again.",
            );
          const receivedAt = performance.now();
          const image = await createImageBitmap(
            new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
          );
          try {
            if (!current()) return;
            if (
              image.width !== preview.image.width ||
              image.height !== preview.image.height
            )
              throw new Error(
                "Preview dimensions disagree. Restart calibration.",
              );
            if (performance.now() - receivedAt > 1500)
              throw new Error(
                "Preview decode is stale. Retry at a supported camera mode.",
              );
            sequence = preview.sequence;
            this.lastFrameAt = receivedAt;
            this.callbacks.frame(image, image.width, image.height);
          } finally {
            image.close();
          }
        }
      } catch (error) {
        if (current())
          await this.fail(
            error instanceof Error ? error.message : "Preview failed.",
          );
      } finally {
        // Pull only after decode completes: at most one packet is in flight.
        if (current() && socket.readyState === WebSocket.OPEN)
          socket.send('{"type":"next"}');
      }
    };
    socket.onclose = () => {
      if (current())
        void this.fail(
          "Preview disconnected. Check camera/service, then Start again.",
        );
    };
    socket.onerror = () => {
      if (current())
        void this.fail(
          "Preview connection failed. Check the local service and retry.",
        );
    };
  }
  private async fail(message: string) {
    this.callbacks.lost();
    await this.stop();
    this.callbacks.changed(this.releases.state.message || message);
  }
  async stop() {
    this.generation++;
    this.socket?.close();
    this.socket = null;
    const epoch = this.epoch;
    this.epoch = null;
    if (epoch) await this.releases.release(epoch);
    else if (!this.pending) await this.releases.retry();
    this.callbacks.changed(this.message);
  }
  dispose() {
    this.disposed = true;
    window.clearInterval(this.timer);
    void this.stop();
  }
}
