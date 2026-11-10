import type { Observation } from "../../../contracts/generated/observation";

export interface FrameSample {
  processing: number;
  inference: number;
  decode: number;
  draw: number;
  bytes: number;
  receivedAt: number;
}

/** A bounded rolling window; browser and source clocks are never subtracted. */
export class PreviewDiagnostics {
  readonly samples: FrameSample[] = [];
  reset() {
    this.samples.length = 0;
  }
  add(sample: FrameSample) {
    this.samples.push(sample);
    if (this.samples.length > 120) this.samples.shift();
  }
  percentile(key: "processing" | "decode" | "draw", fraction: number) {
    const values = this.samples
      .map((sample) => sample[key])
      .sort((a, b) => a - b);
    return values.length
      ? values[
          Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)
        ]!
      : 0;
  }
  rate() {
    const first = this.samples[0];
    const last = this.samples.at(-1);
    return first && last && last.receivedAt > first.receivedAt
      ? ((this.samples.length - 1) * 1000) /
          (last.receivedAt - first.receivedAt)
      : null;
  }
}

export function sourceWorkMs(frame: Observation) {
  return Number(BigInt(frame.processedAtNs) - BigInt(frame.capturedAtNs)) / 1e6;
}
