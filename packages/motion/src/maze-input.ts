/** In-process input only; this does not extend the canonical observation wire schema. */
export interface MazeVector3 {
  x: number;
  y: number;
  z: number;
}
export interface MazeFloorPoint {
  x: number;
  z: number;
}
export type MazeOrientationSource = "head" | "torso";
export interface MazePoseSample {
  rigTrackId: string;
  slotId: string;
  epoch: string;
  calibrationId: string;
  clockDomain: string;
  sequence: number;
  sourceTimeMs: number;
  timeUncertaintyMs: number;
  coordinateSpace: "calibrated-rig-meters";
  origin: "synthetic" | "physical";
  positionM: MazeVector3 | null;
  headForward: MazeVector3 | null;
  torsoForward: MazeVector3 | null;
  /** Upstream quality for both the published position and selected facing; not a probability. */
  confidence: number;
  identityConfirmed: boolean;
  timingVerified: boolean;
}
export interface MazeInputCursor {
  rigTrackId: string;
  slotId: string;
  epoch: string;
  calibrationId: string;
  clockDomain: string;
  sequence: number;
  sourceTimeMs: number;
}
export interface MazeInputContext {
  rigTrackId: string;
  slotId: string;
  epoch: string;
  calibrationId: string;
  clockDomain: string;
  /** Already mapped into the sample's verified source clock, never arrival time. */
  nowSourceTimeMs: number;
  maxAgeMs: number;
  maxFutureMs: number;
  maxTimeUncertaintyMs: number;
  minimumConfidence: number;
  orientationSource: MazeOrientationSource;
  lastAccepted: MazeInputCursor | null;
}
export type MazeInputReason =
  | "missing-sample"
  | "physical-input-unavailable"
  | "invalid-policy"
  | "invalid-provenance"
  | "rig-track-mismatch"
  | "slot-mismatch"
  | "epoch-mismatch"
  | "calibration-mismatch"
  | "clock-mismatch"
  | "coordinate-space-mismatch"
  | "identity-unconfirmed"
  | "timing-unverified"
  | "invalid-timing"
  | "timing-uncertain"
  | "future-sample"
  | "stale-sample"
  | "history-mismatch"
  | "out-of-order"
  | "low-confidence"
  | "missing-position"
  | "invalid-position"
  | "missing-orientation"
  | "invalid-orientation";
export type MazeInputAssessment =
  | {
      status: "ready";
      positionM: MazeVector3;
      forward: MazeFloorPoint;
      orientationSource: MazeOrientationSource;
      cursor: MazeInputCursor;
    }
  | { status: "rejected"; reason: MazeInputReason };

const contextKeys = [
  "rigTrackId",
  "slotId",
  "epoch",
  "calibrationId",
  "clockDomain",
] as const;
const mismatchReasons = [
  "rig-track-mismatch",
  "slot-mismatch",
  "epoch-mismatch",
  "calibration-mismatch",
  "clock-mismatch",
] as const;
const finite3 = (value: MazeVector3): boolean =>
  Number.isFinite(value.x) &&
  Number.isFinite(value.y) &&
  Number.isFinite(value.z);
const finiteFloor = (value: MazeFloorPoint): boolean =>
  Number.isFinite(value.x) && Number.isFinite(value.z);
const nonnegative = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

/** No model indices, velocity-derived facing, identity guesses or arrival-clock fallback. */
export function assessMazePose(
  sample: MazePoseSample | null,
  context: MazeInputContext,
): MazeInputAssessment {
  const reject = (reason: MazeInputReason): MazeInputAssessment => ({
    status: "rejected",
    reason,
  });
  if (!sample) return reject("missing-sample");
  // Only a future trusted capture/session integration may introduce physical capability.
  // Notes, metric corner entry and client booleans cannot certify that integration.
  if (sample.origin === "physical") return reject("physical-input-unavailable");
  if (sample.origin !== "synthetic") return reject("invalid-provenance");
  if (
    !nonnegative(context.nowSourceTimeMs) ||
    !nonnegative(context.maxAgeMs) ||
    !nonnegative(context.maxFutureMs) ||
    !nonnegative(context.maxTimeUncertaintyMs) ||
    !nonnegative(context.minimumConfidence) ||
    context.minimumConfidence > 1 ||
    !["head", "torso"].includes(context.orientationSource) ||
    contextKeys.some(
      (key) => typeof context[key] !== "string" || !context[key].trim(),
    )
  )
    return reject("invalid-policy");
  for (const [index, key] of contextKeys.entries())
    if (sample[key] !== context[key]) return reject(mismatchReasons[index]);
  if (sample.coordinateSpace !== "calibrated-rig-meters")
    return reject("coordinate-space-mismatch");
  if (sample.identityConfirmed !== true) return reject("identity-unconfirmed");
  if (sample.timingVerified !== true) return reject("timing-unverified");
  if (
    !Number.isSafeInteger(sample.sequence) ||
    sample.sequence < 0 ||
    !nonnegative(sample.sourceTimeMs) ||
    !nonnegative(sample.timeUncertaintyMs)
  )
    return reject("invalid-timing");
  if (sample.timeUncertaintyMs > context.maxTimeUncertaintyMs)
    return reject("timing-uncertain");
  // Check the entire declared exposure interval, including its uncertainty.
  if (
    sample.sourceTimeMs + sample.timeUncertaintyMs >
    context.nowSourceTimeMs + context.maxFutureMs
  )
    return reject("future-sample");
  if (
    context.nowSourceTimeMs - (sample.sourceTimeMs - sample.timeUncertaintyMs) >
    context.maxAgeMs
  )
    return reject("stale-sample");
  if (context.lastAccepted) {
    const previous = context.lastAccepted;
    if (contextKeys.some((key) => previous[key] !== context[key]))
      return reject("history-mismatch");
    if (
      !Number.isSafeInteger(previous.sequence) ||
      previous.sequence < 0 ||
      !nonnegative(previous.sourceTimeMs) ||
      sample.sequence <= previous.sequence ||
      sample.sourceTimeMs <= previous.sourceTimeMs
    )
      return reject("out-of-order");
  }
  if (
    !Number.isFinite(sample.confidence) ||
    sample.confidence < context.minimumConfidence ||
    sample.confidence > 1
  )
    return reject("low-confidence");
  if (!sample.positionM) return reject("missing-position");
  if (!finite3(sample.positionM)) return reject("invalid-position");
  const orientation =
    context.orientationSource === "head"
      ? sample.headForward
      : sample.torsoForward;
  if (!orientation) return reject("missing-orientation");
  const forward = normalizedFloor(orientation);
  if (!forward) return reject("invalid-orientation");
  return {
    status: "ready",
    positionM: { ...sample.positionM },
    forward,
    orientationSource: context.orientationSource,
    cursor: {
      rigTrackId: sample.rigTrackId,
      slotId: sample.slotId,
      epoch: sample.epoch,
      calibrationId: sample.calibrationId,
      clockDomain: sample.clockDomain,
      sequence: sample.sequence,
      sourceTimeMs: sample.sourceTimeMs,
    },
  };
}

function normalizedFloor(vector: MazeVector3): MazeFloorPoint | null {
  if (!finite3(vector)) return null;
  const length = Math.hypot(vector.x, vector.z);
  // Near-vertical facing has no stable floor heading; never invent an azimuth.
  if (!Number.isFinite(length) || length < 1e-6) return null;
  return { x: vector.x / length, z: vector.z / length };
}

export interface MazeCorners {
  nearLeft: MazeFloorPoint;
  nearRight: MazeFloorPoint;
  farRight: MazeFloorPoint;
  farLeft: MazeFloorPoint;
}
export interface MazeRegistration {
  widthM: number;
  depthM: number;
  originRigM: MazeFloorPoint;
  rightRig: MazeFloorPoint;
  farRig: MazeFloorPoint;
  maxResidualM: number;
}
export type MazeRegistrationResult =
  | { ok: true; registration: MazeRegistration }
  | {
      ok: false;
      reason:
        | "invalid-dimensions"
        | "invalid-corners"
        | "corner-order"
        | "dimension-mismatch"
        | "registration-residual";
    };

/** Provisional engineering screens, not a physical accuracy certification. */
export const MAZE_REGISTRATION_LIMITS = Object.freeze({
  minimumDimensionM: 5,
  maximumDimensionM: 10,
  maximumEdgeScaleError: 0.02,
  maximumResidualM: 0.1,
});

/**
 * Fit T_rig_from_maze using four already-metric, explicitly labelled floor points.
 * Maze origin is nearLeft, +X to nearRight and +Z to farLeft. Fit rotation and
 * translation only: scaling, reflection and guessed corner ordering are forbidden.
 * A labelled symmetric rectangle cannot itself prove which physical side is near.
 */
export function registerMazeCorners(
  widthM: number,
  depthM: number,
  corners: MazeCorners,
): MazeRegistrationResult {
  const limits = MAZE_REGISTRATION_LIMITS;
  if (
    ![widthM, depthM].every(
      (dimension) =>
        Number.isFinite(dimension) &&
        dimension >= limits.minimumDimensionM &&
        dimension <= limits.maximumDimensionM,
    )
  )
    return { ok: false, reason: "invalid-dimensions" };
  const measured = [
    corners.nearLeft,
    corners.nearRight,
    corners.farRight,
    corners.farLeft,
  ];
  if (measured.some((point) => !point || !finiteFloor(point)))
    return { ok: false, reason: "invalid-corners" };
  // Every labelled turn must have the same positive orientation; catches bowties
  // and mirrored labels before a least-squares fit can hide one bad corner.
  for (let index = 0; index < 4; index++) {
    const a = measured[index];
    const b = measured[(index + 1) % 4];
    const c = measured[(index + 2) % 4];
    const turn = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (!Number.isFinite(turn) || turn <= 1e-6)
      return { ok: false, reason: "corner-order" };
    const expectedLength = index % 2 === 0 ? widthM : depthM;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (Math.abs(length / expectedLength - 1) > limits.maximumEdgeScaleError)
      return { ok: false, reason: "dimension-mismatch" };
  }
  const canonical = [
    { x: 0, z: 0 },
    { x: widthM, z: 0 },
    { x: widthM, z: depthM },
    { x: 0, z: depthM },
  ];
  const center = measured.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, z: sum.z + point.z / 4 }),
    { x: 0, z: 0 },
  );
  let dot = 0;
  let cross = 0;
  for (const [index, point] of canonical.entries()) {
    const x = point.x - widthM / 2;
    const z = point.z - depthM / 2;
    const rx = measured[index].x - center.x;
    const rz = measured[index].z - center.z;
    dot += x * rx + z * rz;
    cross += x * rz - z * rx;
  }
  const length = Math.hypot(dot, cross);
  if (!Number.isFinite(length) || length < 1e-6)
    return { ok: false, reason: "invalid-corners" };
  const rightRig = { x: dot / length, z: cross / length };
  const farRig = { x: -rightRig.z, z: rightRig.x };
  const originRigM = {
    x: center.x - (rightRig.x * widthM + farRig.x * depthM) / 2,
    z: center.z - (rightRig.z * widthM + farRig.z * depthM) / 2,
  };
  const maxResidualM = Math.max(
    ...canonical.map((point, index) =>
      Math.hypot(
        originRigM.x +
          rightRig.x * point.x +
          farRig.x * point.z -
          measured[index].x,
        originRigM.z +
          rightRig.z * point.x +
          farRig.z * point.z -
          measured[index].z,
      ),
    ),
  );
  if (!Number.isFinite(maxResidualM) || maxResidualM > limits.maximumResidualM)
    return { ok: false, reason: "registration-residual" };
  return {
    ok: true,
    registration: {
      widthM,
      depthM,
      originRigM,
      rightRig,
      farRig,
      maxResidualM,
    },
  };
}

/** T_maze_from_rig = inverse rigid transform; out-of-room points stay outside. */
export function rigPointToMaze(
  registration: MazeRegistration,
  point: MazeFloorPoint,
): MazeFloorPoint {
  if (!finiteFloor(point)) throw new Error("Rig floor point must be finite.");
  const x = point.x - registration.originRigM.x;
  const z = point.z - registration.originRigM.z;
  return {
    x: x * registration.rightRig.x + z * registration.rightRig.z,
    z: x * registration.farRig.x + z * registration.farRig.z,
  };
}

/** Directions receive rotation only; height is discarded after finite validation. */
export function rigForwardToMaze(
  registration: MazeRegistration,
  forward: MazeVector3,
): MazeFloorPoint | null {
  const floor = normalizedFloor(forward);
  if (!floor) return null;
  return {
    x: floor.x * registration.rightRig.x + floor.z * registration.rightRig.z,
    z: floor.x * registration.farRig.x + floor.z * registration.farRig.z,
  };
}
