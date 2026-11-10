/** A bounded two-second window. Counts actual draws/receipts, never requested FPS. */
export class FrameRate {
  private times: number[] = [];
  record(now: number): void {
    this.times.push(now);
    while (
      this.times.length > 1 &&
      (now - this.times[0] > 2000 || this.times.length > 1000)
    )
      this.times.shift();
  }
  value(now: number): number | null {
    if (this.times.length < 2 || now - this.times.at(-1)! > 1000) return null;
    const elapsed = this.times.at(-1)! - this.times[0];
    return elapsed > 0 ? ((this.times.length - 1) * 1000) / elapsed : null;
  }
  reset(): void {
    this.times = [];
  }
}
