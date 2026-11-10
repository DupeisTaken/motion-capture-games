import { describe, expect, it } from "vitest";
import fixture from "../../apps/mirror/src/rig-rehearsal.json";
import {
  assessRigFrame,
  loadRigDataset,
  selectRigFrame,
  validateRigPlan,
} from "../../apps/mirror/src/rig-state";

const data = loadRigDataset(fixture);
const first = (caseId: string) => selectRigFrame(data, caseId, 0).frame;

describe("recorded two-camera rehearsal", () => {
  it("keeps source roles, provenance and reference truth distinct", () => {
    const frame = first("nominal");
    expect(data.origin).toBe("synthetic-rehearsal");
    expect(data.recorded).toBe(true);
    expect(frame.views.map((view) => view.role)).toEqual([
      "primary",
      "secondary",
    ]);
    expect(frame.views[0].cameraId).not.toBe(frame.views[1].cameraId);
    expect(frame.views[0].cameraTrackId).not.toBe(frame.views[1].cameraTrackId);
    expect(frame.reconstruction.root).not.toEqual(frame.reference.root);
    expect(selectRigFrame(data, "nominal", 11).frame.sequence).toBe(11);
  });

  it("never turns a simulated available sample into physical or maze readiness", () => {
    for (const scenario of data.cases)
      for (const frame of scenario.frames) {
        const readiness = assessRigFrame(frame);
        expect(readiness.physicallyValidated).toBe(false);
        expect(readiness.mazeReady).toBe(false);
        expect(readiness.blockers).not.toHaveLength(0);
      }
    expect(assessRigFrame(first("nominal")).state).toBe("sample-available");
    expect(assessRigFrame(first("scale-bias")).rootAvailable).toBe(true);
  });

  it("exposes unavailable hip root while retaining usable independent joints", () => {
    const frame = first("missing-hip");
    const readiness = assessRigFrame(frame);
    expect(frame.reconstruction.root).toBeNull();
    expect(readiness.state).toBe("partial");
    expect(readiness.rootAvailable).toBe(false);
    expect(readiness.availableJointCount).toBe(16);
    expect(readiness.rejections).toEqual({ missing: 1 });
  });

  it.each([
    ["stale-input", "stale_input"],
    ["uncertain-identity", "identity_uncertain"],
    ["exposure-skew", "pair_skew"],
    ["time-uncertain", "time_uncertain"],
    ["weak-geometry", "weak_geometry"],
    ["calibration-changed", "calibration_mismatch"],
  ])("reports %s rejection truthfully", (caseId, reason) => {
    const readiness = assessRigFrame(first(caseId));
    expect(readiness.state).toBe("unavailable");
    expect(readiness.sampleAvailable).toBe(false);
    expect(readiness.rejections).toEqual({ [reason]: 17 });
  });

  it("rejects changed origin, nonfinite positions, duplicate roles and false root", () => {
    for (const mutate of [
      (copy: typeof fixture) => {
        copy.origin = "live";
      },
      (copy: typeof fixture) => {
        copy.cases[0].frames[0].views[0].positionM!.x = NaN;
      },
      (copy: typeof fixture) => {
        copy.cases[0].frames[0].views[1].role = "primary";
      },
      (copy: typeof fixture) => {
        copy.cases[0].frames[0].views[1].cameraId =
          copy.cases[0].frames[0].views[0].cameraId;
      },
      (copy: typeof fixture) => {
        copy.cases[0].frames[0].reconstruction.root = null;
      },
      (copy: typeof fixture) => {
        copy.cases[0].frames[0].timing.skewNs = "1";
      },
      (copy: typeof fixture) => {
        copy.cases[0].frames[0].reconstruction.joints[0].reason = "__proto__";
      },
      (copy: typeof fixture) => {
        copy.cases[0].frames[0].views[0].timeVerified = false;
      },
    ]) {
      const copy = structuredClone(fixture);
      mutate(copy);
      expect(() => loadRigDataset(copy)).toThrow("Invalid rig rehearsal");
    }
  });

  it("rejects invalid recorded selection without inventing a sample", () => {
    expect(() => selectRigFrame(data, "unknown", 0)).toThrow();
    for (const index of [-1, 12, NaN, 0.5])
      expect(() => selectRigFrame(data, "nominal", index)).toThrow();
  });

  it("validates separate role planning without letting manual notes unlock readiness", () => {
    const plan = {
      primaryCameraId: "device-a",
      secondaryCameraId: "device-b",
      placementNotes: "Both cameras positioned",
      calibrationNotes: "Board photographed",
      synchronizationNotes: "Flashing light observed",
    };
    expect(validateRigPlan(plan)).toEqual({
      valid: true,
      errors: [],
      physicallyValidated: false,
      mazeReady: false,
    });
    expect(
      validateRigPlan({ ...plan, secondaryCameraId: " device-a " }).valid,
    ).toBe(false);
    expect(validateRigPlan({ ...plan, primaryCameraId: "" }).valid).toBe(false);
    expect(
      validateRigPlan({ ...plan, calibrationNotes: "x".repeat(1001) }).valid,
    ).toBe(false);
    expect(assessRigFrame(first("uncertain-identity")).sampleAvailable).toBe(
      false,
    );
  });
});
