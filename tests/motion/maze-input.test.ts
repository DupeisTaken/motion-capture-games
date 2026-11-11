import { describe, expect, it } from "vitest";
import {
  assessMazePose,
  registerMazeCorners,
  rigForwardToMaze,
  rigPointToMaze,
  type MazeCorners,
  type MazeFloorPoint,
  type MazeInputContext,
  type MazePoseSample,
} from "../../packages/motion/src/maze-input";

function sample(changes: Partial<MazePoseSample> = {}): MazePoseSample {
  return {
    rigTrackId: "rig-person-7",
    slotId: "player-one",
    epoch: "synthetic-epoch-1",
    calibrationId: "synthetic-rig-1",
    clockDomain: "synthetic-source",
    sequence: 4,
    sourceTimeMs: 990,
    timeUncertaintyMs: 1,
    coordinateSpace: "calibrated-rig-meters",
    origin: "synthetic",
    positionM: { x: 2, y: 1, z: 3 },
    headForward: { x: 3, y: -2, z: 4 },
    torsoForward: { x: -2, y: 0.1, z: 0 },
    confidence: 0.9,
    identityConfirmed: true,
    timingVerified: true,
    ...changes,
  };
}
function context(changes: Partial<MazeInputContext> = {}): MazeInputContext {
  return {
    rigTrackId: "rig-person-7",
    slotId: "player-one",
    epoch: "synthetic-epoch-1",
    calibrationId: "synthetic-rig-1",
    clockDomain: "synthetic-source",
    nowSourceTimeMs: 1000,
    maxAgeMs: 100,
    maxFutureMs: 0,
    maxTimeUncertaintyMs: 5,
    minimumConfidence: 0.7,
    orientationSource: "head",
    lastAccepted: null,
    ...changes,
  };
}

describe("maze input boundary", () => {
  it("keeps metric XYZ, uses the explicit head/torso toggle, and clones accepted data", () => {
    const value = sample();
    const head = assessMazePose(value, context());
    expect(head).toMatchObject({
      status: "ready",
      positionM: { x: 2, y: 1, z: 3 },
      forward: { x: 0.6, z: 0.8 },
      orientationSource: "head",
    });
    expect(
      assessMazePose(value, context({ orientationSource: "torso" })),
    ).toMatchObject({
      status: "ready",
      forward: { x: -1, z: 0 },
      orientationSource: "torso",
    });
    if (head.status !== "ready") throw new Error("Expected accepted fixture");
    head.positionM.x = 100;
    expect(value.positionM?.x).toBe(2);
    expect(head.cursor).toMatchObject({
      rigTrackId: value.rigTrackId,
      slotId: value.slotId,
      sequence: 4,
      sourceTimeMs: 990,
    });
  });
  it("never falls back to torso, root position or movement when head is unavailable", () => {
    expect(assessMazePose(sample({ headForward: null }), context())).toEqual({
      status: "rejected",
      reason: "missing-orientation",
    });
    expect(
      assessMazePose(
        sample({ torsoForward: null }),
        context({ orientationSource: "torso" }),
      ),
    ).toEqual({ status: "rejected", reason: "missing-orientation" });
    expect(
      assessMazePose(
        sample({ headForward: null }),
        context({ orientationSource: "torso" }),
      ),
    ).toMatchObject({ status: "ready" });
  });
  it.each([
    [{ rigTrackId: "other" }, "rig-track-mismatch"],
    [{ slotId: "other" }, "slot-mismatch"],
    [{ epoch: "other" }, "epoch-mismatch"],
    [{ calibrationId: "other" }, "calibration-mismatch"],
    [{ clockDomain: "other" }, "clock-mismatch"],
    [{ identityConfirmed: false }, "identity-unconfirmed"],
    [{ timingVerified: false }, "timing-unverified"],
    [{ sequence: -1 }, "invalid-timing"],
    [{ sequence: 1.5 }, "invalid-timing"],
    [{ sequence: Number.MAX_SAFE_INTEGER + 1 }, "invalid-timing"],
    [{ sourceTimeMs: NaN }, "invalid-timing"],
    [{ sourceTimeMs: -1 }, "invalid-timing"],
    [{ timeUncertaintyMs: Infinity }, "invalid-timing"],
    [{ timeUncertaintyMs: -1 }, "invalid-timing"],
    [{ timeUncertaintyMs: 5.01 }, "timing-uncertain"],
    [{ sourceTimeMs: 899 }, "stale-sample"],
    [{ sourceTimeMs: 1000 }, "future-sample"],
    [{ sourceTimeMs: 1001 }, "future-sample"],
    [{ confidence: 0.699 }, "low-confidence"],
    [{ confidence: NaN }, "low-confidence"],
    [{ confidence: 1.01 }, "low-confidence"],
    [{ positionM: null }, "missing-position"],
    [{ positionM: { x: 1, y: Infinity, z: 2 } }, "invalid-position"],
    [{ headForward: { x: 0, y: 1, z: 0 } }, "invalid-orientation"],
    [{ headForward: { x: NaN, y: 0, z: 1 } }, "invalid-orientation"],
    [{ headForward: { x: 0, y: Infinity, z: 1 } }, "invalid-orientation"],
  ] as const)("rejects sample quality failure %j", (changes, reason) => {
    expect(assessMazePose(sample(changes), context())).toEqual({
      status: "rejected",
      reason,
    });
  });
  it("rejects missing, mislabeled provenance and non-metric coordinate spaces", () => {
    expect(assessMazePose(null, context())).toEqual({
      status: "rejected",
      reason: "missing-sample",
    });
    const value = sample();
    Object.assign(value, { coordinateSpace: "normalized-camera" });
    expect(assessMazePose(value, context())).toEqual({
      status: "rejected",
      reason: "coordinate-space-mismatch",
    });
    Object.assign(value, { origin: "operator-approved" });
    expect(assessMazePose(value, context())).toEqual({
      status: "rejected",
      reason: "invalid-provenance",
    });
  });
  it("blocks physical input even with perfect declared evidence and injected UI approval flags", () => {
    const value = sample({ origin: "physical" });
    Object.assign(value, {
      physicalEvidenceVerified: true,
      operatorApproved: true,
    });
    const policy = context();
    Object.assign(policy, {
      physicalEvidenceVerified: true,
      capability: "physical",
    });
    expect(assessMazePose(value, policy)).toEqual({
      status: "rejected",
      reason: "physical-input-unavailable",
    });
  });
  it("uses complete uncertainty intervals at exact freshness boundaries", () => {
    expect(
      assessMazePose(sample({ sourceTimeMs: 901 }), context()).status,
    ).toBe("ready");
    expect(
      assessMazePose(sample({ sourceTimeMs: 900.999 }), context()),
    ).toEqual({ status: "rejected", reason: "stale-sample" });
    expect(
      assessMazePose(sample({ sourceTimeMs: 999 }), context()).status,
    ).toBe("ready");
    expect(
      assessMazePose(sample({ sourceTimeMs: 999.001 }), context()),
    ).toEqual({ status: "rejected", reason: "future-sample" });
    expect(assessMazePose(sample({ confidence: 0.7 }), context()).status).toBe(
      "ready",
    );
  });
  it("requires both sequence and source time to advance and explicitly reset incompatible history", () => {
    const first = assessMazePose(sample(), context());
    if (first.status !== "ready") throw new Error("Expected accepted fixture");
    const policy = context({ lastAccepted: first.cursor });
    for (const changes of [
      { sequence: 4, sourceTimeMs: 995 },
      { sequence: 3, sourceTimeMs: 995 },
      { sequence: 5, sourceTimeMs: 990 },
      { sequence: 5, sourceTimeMs: 989 },
    ])
      expect(assessMazePose(sample(changes), policy)).toEqual({
        status: "rejected",
        reason: "out-of-order",
      });
    expect(
      assessMazePose(sample({ sequence: 5, sourceTimeMs: 995 }), policy).status,
    ).toBe("ready");
    const changed = sample({ epoch: "new-epoch" });
    expect(assessMazePose(changed, { ...policy, epoch: "new-epoch" })).toEqual({
      status: "rejected",
      reason: "history-mismatch",
    });
    expect(
      assessMazePose(changed, context({ epoch: "new-epoch" })).status,
    ).toBe("ready");
  });
  it.each([
    { nowSourceTimeMs: NaN },
    { nowSourceTimeMs: -1 },
    { maxAgeMs: Infinity },
    { maxFutureMs: -1 },
    { maxTimeUncertaintyMs: -1 },
    { minimumConfidence: -1 },
    { minimumConfidence: 1.1 },
    { rigTrackId: "" },
    { slotId: " " },
  ])("rejects invalid policy %j", (changes) => {
    expect(assessMazePose(sample(), context(changes))).toEqual({
      status: "rejected",
      reason: "invalid-policy",
    });
  });
});

function room(width = 6, depth = 8, angle = 0, tx = 0, tz = 0): MazeCorners {
  const transform = (x: number, z: number): MazeFloorPoint => ({
    x: tx + Math.cos(angle) * x - Math.sin(angle) * z,
    z: tz + Math.sin(angle) * x + Math.cos(angle) * z,
  });
  return {
    nearLeft: transform(0, 0),
    nearRight: transform(width, 0),
    farRight: transform(width, depth),
    farLeft: transform(0, depth),
  };
}

describe("manual metric maze registration", () => {
  it.each([0, 0.7, -1.9, Math.PI])(
    "fits a translated room rotated %s radians without mirroring",
    (angle) => {
      const corners = room(6, 8, angle, -4, 13);
      const result = registerMazeCorners(6, 8, corners);
      if (!result.ok) throw new Error(result.reason);
      const registration = result.registration;
      expect(registration.maxResidualM).toBeLessThan(1e-12);
      const expected = [
        { x: 0, z: 0 },
        { x: 6, z: 0 },
        { x: 6, z: 8 },
        { x: 0, z: 8 },
      ];
      Object.values(corners).forEach((point, index) => {
        const mapped = rigPointToMaze(registration, point);
        expect(mapped.x).toBeCloseTo(expected[index].x);
        expect(mapped.z).toBeCloseTo(expected[index].z);
      });
      const forward = rigForwardToMaze(registration, {
        x: -3 * Math.sin(angle),
        y: 2,
        z: 3 * Math.cos(angle),
      });
      expect(forward?.x).toBeCloseTo(0);
      expect(forward?.z).toBeCloseTo(1);
      expect(
        registration.rightRig.x * registration.farRig.z -
          registration.rightRig.z * registration.farRig.x,
      ).toBeCloseTo(1);
    },
  );
  it.each([
    [5, 5],
    [5, 10],
    [10, 5],
    [10, 10],
  ])("accepts independent width/depth limits %s × %s", (width, depth) => {
    expect(registerMazeCorners(width, depth, room(width, depth)).ok).toBe(true);
  });
  it.each([
    [4.99, 8],
    [6, 10.01],
    [NaN, 8],
    [6, Infinity],
  ])("rejects dimensions outside 5..10m: %s × %s", (width, depth) => {
    expect(registerMazeCorners(width, depth, room())).toEqual({
      ok: false,
      reason: "invalid-dimensions",
    });
  });
  it("rejects normalized image clicks, wrong metric scale, swapped and reflected labels", () => {
    expect(registerMazeCorners(6, 8, room(0.6, 0.8))).toMatchObject({
      ok: false,
    });
    expect(registerMazeCorners(6, 8, room(6.6, 8.8))).toMatchObject({
      ok: false,
    });
    expect(registerMazeCorners(8, 6, room(6, 8))).toMatchObject({ ok: false });
    const corners = room();
    [corners.nearRight, corners.farRight] = [
      corners.farRight,
      corners.nearRight,
    ];
    expect(registerMazeCorners(6, 8, corners)).toMatchObject({ ok: false });
    const reflected = room();
    for (const point of Object.values(reflected)) point.x *= -1;
    expect(registerMazeCorners(6, 8, reflected)).toEqual({
      ok: false,
      reason: "corner-order",
    });
  });
  it("rejects degenerate, non-finite and sheared rooms even when side lengths match", () => {
    const missing = room();
    missing.nearRight = missing.nearLeft;
    expect(registerMazeCorners(6, 8, missing).ok).toBe(false);
    const nonfinite = room();
    nonfinite.farLeft.x = NaN;
    expect(registerMazeCorners(6, 8, nonfinite)).toEqual({
      ok: false,
      reason: "invalid-corners",
    });
    const sheared = room();
    sheared.farLeft = { x: 0.5, z: Math.sqrt(64 - 0.25) };
    sheared.farRight = { x: 6.5, z: Math.sqrt(64 - 0.25) };
    expect(registerMazeCorners(6, 8, sheared)).toEqual({
      ok: false,
      reason: "registration-residual",
    });
  });
  it("fits small corner noise without scale adjustment and retains points outside the room", () => {
    const corners = room();
    corners.nearLeft.x += 0.01;
    corners.farRight.z += 0.02;
    const result = registerMazeCorners(6, 8, corners);
    if (!result.ok) throw new Error(result.reason);
    expect(result.registration.maxResidualM).toBeLessThan(0.03);
    expect(
      Math.hypot(
        result.registration.rightRig.x,
        result.registration.rightRig.z,
      ),
    ).toBeCloseTo(1);
    const exact = registerMazeCorners(6, 8, room());
    if (!exact.ok) throw new Error(exact.reason);
    expect(rigPointToMaze(exact.registration, { x: -1, z: 9 })).toEqual({
      x: -1,
      z: 9,
    });
    expect(() => rigPointToMaze(exact.registration, { x: NaN, z: 1 })).toThrow(
      "finite",
    );
    expect(
      rigForwardToMaze(exact.registration, { x: 0, y: 1, z: 0 }),
    ).toBeNull();
    expect(
      rigForwardToMaze(exact.registration, { x: 1, y: Infinity, z: 0 }),
    ).toBeNull();
  });
});
