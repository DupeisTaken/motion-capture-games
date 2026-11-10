export interface CameraReleaseState {
  pendingCount: number;
  releasing: boolean;
  message: string | null;
}

/** Failed releases retain only acknowledged epochs; retries never stop an unknown owner. */
export class CameraReleases {
  private readonly pending = new Map<string, string | null>();
  private readonly requests = new Map<string, Promise<boolean>>();

  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly changed: () => void = () => {},
  ) {}

  get state(): CameraReleaseState {
    const failure = [...this.pending.values()].find((value) => value !== null);
    return {
      pendingCount: this.pending.size,
      releasing: this.requests.size > 0,
      message: failure
        ? `Camera release unconfirmed: ${failure} Local preview is stopped. Retry camera stop.`
        : this.pending.size
          ? "Releasing the camera…"
          : null,
    };
  }

  retain(epoch: string): void {
    if (epoch && !this.pending.has(epoch)) this.pending.set(epoch, null);
  }

  release(epoch: string): Promise<boolean> {
    if (!epoch) return Promise.resolve(true);
    this.retain(epoch);
    const existing = this.requests.get(epoch);
    if (existing) return existing;
    // Defer I/O until the request is registered, including synchronous fetch failures.
    const operation = Promise.resolve()
      .then(async () => {
        try {
          // Native Window.fetch rejects a class instance as its receiver.
          const response = await this.request.call(globalThis, "/api/stop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ epoch }),
            keepalive: true,
          });
          if (!response.ok) {
            const body: unknown = await response.json().catch(() => null);
            const detail =
              body &&
              typeof body === "object" &&
              "detail" in body &&
              typeof body.detail === "string"
                ? body.detail
                : `The vision service returned HTTP ${response.status}.`;
            throw new Error(detail);
          }
          this.pending.delete(epoch);
          return true;
        } catch (error) {
          this.pending.set(
            epoch,
            (error instanceof Error ? error.message : String(error)) ||
              "The camera release request failed.",
          );
          return false;
        }
      })
      .finally(() => {
        this.requests.delete(epoch);
        this.changed();
      });
    this.requests.set(epoch, operation);
    this.changed();
    return operation;
  }

  async retry(): Promise<boolean> {
    // Serialize cleanup rather than opening several control requests at once.
    for (const epoch of [...this.pending.keys()]) await this.release(epoch);
    return this.pending.size === 0;
  }
}
