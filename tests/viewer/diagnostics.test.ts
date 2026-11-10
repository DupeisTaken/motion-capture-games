import { describe, expect, it } from "vitest";
import {
  PreviewDiagnostics,
  sourceWorkMs,
} from "../../apps/mirror/src/diagnostics";
import fixture from "../../contracts/examples/synthetic-observation.json";
import type { Observation } from "../../contracts/generated/observation";

describe("bounded preview diagnostics", () => {
  it("retains only the latest 120 samples and calculates elapsed receive rate and nearest-rank p95", () => {
    const diagnostics = new PreviewDiagnostics();
    expect(diagnostics.rate()).toBeNull();
    for (let index = 0; index < 200; index++)
      diagnostics.add({
        processing: index,
        inference: 1,
        decode: 2,
        draw: 3,
        bytes: 4096,
        receivedAt: index * 50,
      });
    expect(diagnostics.samples).toHaveLength(120);
    expect(diagnostics.samples[0]?.processing).toBe(80);
    expect(diagnostics.percentile("processing", 0.95)).toBe(193);
    expect(diagnostics.rate()).toBe(20);
    diagnostics.reset();
    expect(diagnostics.samples).toHaveLength(0);
    expect(diagnostics.percentile("draw", 0.95)).toBe(0);
    expect(diagnostics.rate()).toBeNull();
  });
  it("subtracts source nanoseconds before converting to avoid losing precision", () => {
    const frame = {
      ...fixture,
      capturedAtNs: "10000000000000000000000000",
      processedAtNs: "10000000000000000000123456",
    } as Observation;
    expect(sourceWorkMs(frame)).toBe(0.123456);
  });
});
