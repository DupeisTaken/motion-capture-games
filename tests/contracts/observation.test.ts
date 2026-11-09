import { describe, expect, it } from "vitest";
import { parseObservation } from "../../contracts/src/validate";
import fixture from "../../contracts/examples/synthetic-observation.json";

const fresh = (): unknown => structuredClone(fixture);
type InvalidCase = [string, (value: Record<string, unknown>) => void];

describe("canonical observation boundary", () => {
  it("accepts a named-joint synthetic observation without enrolling anyone", () => {
    const result = parseObservation(fresh());
    expect(result.detectedCount).toBe(1);
    expect(result.people[0].joints.left_wrist?.x).toBe(0.3);
    expect(result).not.toHaveProperty("playerId");
  });

  it("preserves an off-image estimate and explicit missing coordinates", () => {
    const result = parseObservation(fresh());
    result.people[0].joints.right_wrist = {
      x: 1.2,
      y: 0.5,
      score: 0.7,
      status: "estimated",
      inFrame: false,
    };
    result.people[0].joints.left_ankle = {
      x: null,
      y: null,
      score: 0,
      status: "missing",
      inFrame: false,
    };
    expect(parseObservation(result).people[0].joints.right_wrist?.x).toBe(1.2);
  });

  it.each<InvalidCase>([
    [
      "wrong count",
      (value: Record<string, unknown>) => {
        value.detectedCount = 2;
      },
    ],
    [
      "wrong capacity flag",
      (value: Record<string, unknown>) => {
        value.capacityReached = true;
      },
    ],
    [
      "unsupported protocol",
      (value: Record<string, unknown>) => {
        value.version = 2;
      },
    ],
    [
      "numeric nanoseconds",
      (value: Record<string, unknown>) => {
        value.capturedAtNs = 123;
      },
    ],
    [
      "reversed source time",
      (value: Record<string, unknown>) => {
        value.processedAtNs = "1";
      },
    ],
    [
      "unlabeled synthetic input",
      (value: Record<string, unknown>) => {
        value.source = "camera";
      },
    ],
    [
      "unexpected score ownership",
      (value: Record<string, unknown>) => {
        value.playerId = "A";
      },
    ],
  ])("rejects %s", (_label, change) => {
    const value = structuredClone(fixture) as Record<string, unknown>;
    change(value);
    expect(() => parseObservation(value)).toThrow("Invalid observation");
  });

  it("accepts an empty scene and explicitly indicates a full detector budget", () => {
    const value = parseObservation(fresh());
    value.people = [];
    value.detectedCount = 0;
    expect(parseObservation(value).detectedCount).toBe(0);
    const full = parseObservation(fresh());
    full.capacity = 1;
    full.capacityReached = true;
    expect(parseObservation(full).capacityReached).toBe(true);
  });

  it("rejects synthetic timestamp quality on camera observations", () => {
    const value = parseObservation(fresh());
    value.source = "camera";
    value.algorithm = "mediapipe";
    expect(() => parseObservation(value)).toThrow("timestamp quality");
  });

  it("rejects duplicate camera-track ownership", () => {
    const value = structuredClone(fixture);
    value.people.push(structuredClone(value.people[0]));
    value.detectedCount = 2;
    expect(() => parseObservation(value)).toThrow(
      "assigned to multiple detections",
    );
  });

  it("rejects missing joints carrying invented measurements", () => {
    const value = parseObservation(fresh());
    value.people[0].joints.left_wrist = {
      x: 0,
      y: 0,
      score: 0,
      status: "missing",
      inFrame: false,
    };
    expect(() => parseObservation(value)).toThrow("Invalid observation");
  });

  it("rejects out-of-bounds joints claimed to be in frame", () => {
    const value = parseObservation(fresh());
    value.people[0].joints.left_wrist = {
      x: -0.1,
      y: 0.5,
      score: 0.9,
      status: "observed",
      inFrame: true,
    };
    expect(() => parseObservation(value)).toThrow("in-frame joint");
  });
});
