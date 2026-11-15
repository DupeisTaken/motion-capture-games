/** Optional pixels from the existing packet stream. At most one decode is in flight. */
export class RunnerPreview {
  private context: CanvasRenderingContext2D | null;
  private revision = 0;
  private busy = false;
  private disposed = false;
  private drawnAt = -Infinity;
  constructor(private canvas: HTMLCanvasElement) {
    this.context = canvas.getContext("2d");
  }
  get atMs(): number {
    return this.drawnAt;
  }
  clear(): void {
    this.revision++;
    this.drawnAt = -Infinity;
    this.context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  push(jpeg: Uint8Array, receivedAt: number, now: () => number): void {
    if (
      this.busy ||
      this.disposed ||
      !this.context ||
      typeof createImageBitmap !== "function"
    )
      return;
    this.busy = true;
    const revision = this.revision;
    // Decode never blocks pose ingestion or the next source request. Drops are
    // intentional: optional preview work must not grow the acquisition queue.
    void createImageBitmap(
      new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
    )
      .then((bitmap) => {
        try {
          if (
            this.disposed ||
            revision !== this.revision ||
            now() - receivedAt > 350
          )
            return;
          this.canvas.width = bitmap.width;
          this.canvas.height = bitmap.height;
          this.canvas.style.aspectRatio = `${bitmap.width} / ${bitmap.height}`;
          this.context!.drawImage(bitmap, 0, 0);
          this.drawnAt = receivedAt;
        } finally {
          bitmap.close();
        }
      })
      .catch(() => {
        /* Pixels are optional; tracking errors are handled separately. */
      })
      .finally(() => {
        this.busy = false;
      });
  }
  dispose(): void {
    this.disposed = true;
    this.clear();
  }
}
