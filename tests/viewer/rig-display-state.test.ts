import { describe, expect, it, vi } from "vitest";
import fixture from "../../apps/mirror/src/rig-rehearsal.json";
import {
  loadRigDataset,
  selectRigFrame,
  type RigFrame,
} from "../../apps/mirror/src/rig-state";
import {
  DISPLAY_SOURCE_MAX_AGE_NS,
  parseDisplayedCameraPreference,
  resolveDisplayedCamera,
} from "../../apps/mirror/src/rig-display-state";

const data = loadRigDataset(fixture);
const sample = (caseId = "nominal"): RigFrame =>
  structuredClone(selectRigFrame(data, caseId, 0).frame);

describe("displayed synthetic camera state", () => {
  it("defaults to the primary role only without a preference, independent of view order", () => {
    const frame = sample();
    frame.views.reverse();
    const state = resolveDisplayedCamera(frame, null);
    expect(state.selectedCameraId).toBe("camera-0");
    expect(state.view?.role).toBe("primary");
    expect(state.status).toBe("usable");
    frame.views.forEach((view) => {
      view.role = "secondary";
    });
    expect(resolveDisplayedCamera(frame, null).reasons).toEqual([
      "primary_unavailable",
    ]);
    expect(resolveDisplayedCamera(frame, "camera-1").view?.cameraId).toBe(
      "camera-1",
    );
  });

  it("preserves the chosen identity through reordering and changes of role", () => {
    const frame = sample();
    const selected = resolveDisplayedCamera(frame, "camera-1");
    expect(selected.view).toBe(frame.views[1]);
    frame.views[0].role = "secondary";
    frame.views[1].role = "primary";
    frame.views.reverse();
    const restored = resolveDisplayedCamera(frame, selected.selectedCameraId);
    expect(restored.selectedCameraId).toBe("camera-1");
    expect(restored.view?.cameraTrackId).toBe("local-1-0");
    expect(restored.view?.role).toBe("primary");
  });

  it("keeps an absent saved identity unavailable instead of substituting a camera", () => {
    const frame = sample();
    const preference = parseDisplayedCameraPreference("camera-1");
    frame.views[1].cameraId = "replacement";
    const absent = resolveDisplayedCamera(frame, preference);
    expect(absent.selectedCameraId).toBe("camera-1");
    expect(absent.view).toBeNull();
    expect(absent.drawable).toBe(false);
    expect(absent.reasons).toEqual(["camera_unavailable"]);
    expect(
      resolveDisplayedCamera(sample(), absent.selectedCameraId).view?.cameraId,
    ).toBe("camera-1");
  });

  it("does not pick a first match when a camera identity is duplicated", () => {
    const frame = sample();
    frame.views[1].cameraId = frame.views[0].cameraId;
    expect(resolveDisplayedCamera(frame, "camera-0").drawable).toBe(false);
    expect(resolveDisplayedCamera(frame, "camera-0").view).toBeNull();
  });

  it("keeps missing hips source-specific and renders the remaining joints", () => {
    const frame = sample("missing-hip");
    expect(frame.reconstruction.root).toBeNull();
    expect(resolveDisplayedCamera(frame, "camera-0").status).toBe("usable");
    const secondary = resolveDisplayedCamera(frame, "camera-1");
    expect(secondary.status).toBe("partial");
    expect(secondary.drawable).toBe(true);
    expect(secondary.visibleJointCount).toBe(16);
    expect(secondary.warnings).toContain("missing_joints");
    expect(secondary.reasons).toEqual([]);
  });

  it.each([
    "weak-geometry",
    "calibration-changed",
    "scale-bias",
    "exposure-skew",
    "time-uncertain",
    "uncertain-identity",
  ])(
    "does not confuse %s pair reconstruction with selected-source usability",
    (caseId) => {
      const frame = sample(caseId);
      for (const view of frame.views) {
        const state = resolveDisplayedCamera(frame, view.cameraId);
        expect(state.drawable).toBe(true);
        expect(state.status).toBe("usable");
      }
      if (caseId === "uncertain-identity")
        expect(resolveDisplayedCamera(frame, "camera-0").warnings).toContain(
          "identity_uncertain",
        );
      if (caseId === "time-uncertain")
        expect(resolveDisplayedCamera(frame, "camera-0").warnings).toContain(
          "time_uncertain",
        );
    },
  );

  it("rejects the recorded stale pair without using elapsed browser time", () => {
    const state = resolveDisplayedCamera(sample("stale-input"), "camera-1");
    expect(state.reasons).toContain("stale_input");
    expect(state.drawable).toBe(false);
    expect(BigInt(state.sourceAgeNs!)).toBeGreaterThan(
      DISPLAY_SOURCE_MAX_AGE_NS,
    );
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1010);
      const frame = sample();
      expect(resolveDisplayedCamera(frame, "camera-0").drawable).toBe(true);
      vi.advanceTimersByTime(1_000_000_000);
      expect(resolveDisplayedCamera(frame, "camera-0").drawable).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("evaluates each source age independently and includes the uncertainty endpoint", () => {
    const frame = sample();
    const selected = frame.views[1];
    frame.evaluatedAtNs = (
      BigInt(selected.timeNs) -
      BigInt(selected.uncertaintyNs) +
      DISPLAY_SOURCE_MAX_AGE_NS
    ).toString();
    expect(resolveDisplayedCamera(frame, selected.cameraId).drawable).toBe(
      true,
    );
    frame.evaluatedAtNs = (BigInt(frame.evaluatedAtNs) + 1n).toString();
    expect(resolveDisplayedCamera(frame, selected.cameraId).reasons).toContain(
      "stale_input",
    );
    frame.views[0].timeNs = (
      BigInt(frame.evaluatedAtNs) - 1_000_000n
    ).toString();
    expect(resolveDisplayedCamera(frame, "camera-0").drawable).toBe(true);
    expect(resolveDisplayedCamera(frame, "camera-1").drawable).toBe(false);
  });

  it("rejects unsupported clocks, invalid timestamps and future exposure intervals", () => {
    const frame = sample();
    frame.views[1].clockDomain = "device-clock";
    expect(resolveDisplayedCamera(frame, "camera-1").reasons).toContain(
      "clock_mismatch",
    );
    expect(resolveDisplayedCamera(frame, "camera-0").drawable).toBe(true);
    frame.views[1].clockDomain = "mapped-host";
    frame.views[1].timeNs = "NaN";
    expect(resolveDisplayedCamera(frame, "camera-1").reasons).toContain(
      "invalid_timing",
    );
    frame.views[1].timeNs = (
      BigInt(frame.evaluatedAtNs) - BigInt(frame.views[1].uncertaintyNs)
    ).toString();
    expect(resolveDisplayedCamera(frame, "camera-1").drawable).toBe(true);
    frame.views[1].timeNs = (BigInt(frame.views[1].timeNs) + 1n).toString();
    expect(resolveDisplayedCamera(frame, "camera-1").reasons).toContain(
      "future_input",
    );
  });

  it("labels unverified exposure timing without hiding fresh 2D observations", () => {
    const frame = sample();
    frame.views[1].timestampKind = "host-read-completion";
    frame.views[1].timeVerified = false;
    const state = resolveDisplayedCamera(frame, "camera-1");
    expect(state.drawable).toBe(true);
    expect(state.warnings).toContain("unverified_exposure_time");
    expect(frame.reconstruction).toEqual(sample().reconstruction);
  });

  it("clears a source with no visible joints and keeps out-of-image estimates unclamped", () => {
    const frame = sample();
    frame.views[1].joints.forEach((joint) => {
      joint.x = null;
      joint.y = null;
    });
    expect(resolveDisplayedCamera(frame, "camera-1").reasons).toContain(
      "no_visible_joints",
    );
    frame.views[1].joints[0] = { name: "nose", x: -1, y: 50 };
    const state = resolveDisplayedCamera(frame, "camera-1");
    expect(state.drawable).toBe(false);
    expect(state.warnings).toContain("outside_image");
    expect(state.view?.joints[0].x).toBe(-1);
    frame.views[1].joints[1] = { name: "left_eye", x: 50, y: 50 };
    expect(resolveDisplayedCamera(frame, "camera-1").drawable).toBe(true);
    expect(resolveDisplayedCamera(frame, "camera-1").status).toBe("partial");
    frame.views[1].imageSize[0] = 0;
    expect(resolveDisplayedCamera(frame, "camera-1").reasons).toContain(
      "invalid_image_geometry",
    );
  });

  it("bounds stored identities while preserving an unknown but valid chosen ID", () => {
    for (const value of [
      null,
      undefined,
      0,
      {},
      "",
      " camera-0",
      "camera-0 ",
      "x".repeat(257),
      "camera\n0",
    ])
      expect(parseDisplayedCameraPreference(value)).toBeNull();
    expect(parseDisplayedCameraPreference("saved-but-currently-missing")).toBe(
      "saved-but-currently-missing",
    );
    expect(resolveDisplayedCamera(sample(), "x".repeat(257)).view).toBeNull();
  });

  it("preserves source geometry, time, role, joints and reconstruction without mutation", () => {
    const frame = sample();
    const before = structuredClone(frame);
    const view = frame.views[1];
    const state = resolveDisplayedCamera(frame, view.cameraId);
    expect(state.view).toBe(view);
    expect(state.view?.imageSize).toBe(view.imageSize);
    expect(state.view?.joints).toBe(view.joints);
    expect(state.view?.timeNs).toBe(view.timeNs);
    expect(frame).toEqual(before);
    expect(resolveDisplayedCamera(frame, "camera-0").view).toBe(frame.views[0]);
    expect(frame).toEqual(before);
  });
});
