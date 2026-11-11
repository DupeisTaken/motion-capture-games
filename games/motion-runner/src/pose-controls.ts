import {
  GAME_INPUT_QUALITY,
  observationSpaceRevision,
  type Observation,
  type GameMotionFrame,
} from "../../../packages/motion/src/index";

export type Lane = -1 | 0 | 1;
/** Consumed semantic controls retain the bound session's source time and revision. */
export interface RunnerInput {
  atMs: number;
  sequence: number;
  epoch: string;
  spaceRevision: string;
  identity: "confident" | "uncertain" | "missing";
  /** All visible detections. Only the bound track supplies controls. */
  participantCount: number;
  lane: Lane;
  jump: boolean;
  duck: boolean;
  /** Confirmed standing posture; jump=false alone also occurs while airborne. */
  standing: boolean;
  valid: boolean;
  reason?: string;
}
/** Proposed normalized image-space tuning. Physical accuracy remains unmeasured. */
export const RUNNER_POSE_TUNING = Object.freeze({
  laneEnterBodyHeights: 0.2,
  laneReleaseBodyHeights: 0.12,
  jumpFeetLiftBodyHeights: 0.055,
  jumpHipLiftBodyHeights: 0.075,
  jumpConfirmMs: 45,
  landingConfirmMs: 100,
  standingConfirmMs: 100,
  standingFeetToleranceBodyHeights: 0.035,
  standingHipToleranceBodyHeights: 0.07,
  standingShoulderToleranceBodyHeights: 0.09,
  duckHipDropBodyHeights: 0.12,
  duckReleaseBodyHeights: 0.075,
  standingKneeAngleDegrees: 150,
  duckKneeAngleDegrees: 150,
  maximumSampleGapMs: 350,
});
export interface RunnerCalibration {
  epoch: string;
  spaceRevision: string;
  trackId: string;
  centerX: number;
  hipY: number;
  feetY: number;
  leftFootY: number;
  rightFootY: number;
  shoulderY: number;
  bodyHeight: number;
  observationRevision: string;
}
interface Point {
  x: number;
  y: number;
}
interface Pose {
  centerX: number;
  hipY: number;
  feetY: number;
  shoulderY: number;
  leftFootY: number;
  rightFootY: number;
  leftKneeAngle: number;
  rightKneeAngle: number;
}
function angle(a: Point, b: Point, c: Point): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const magnitude = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  return magnitude > 0
    ? (Math.acos(
        Math.max(-1, Math.min(1, (ab.x * cb.x + ab.y * cb.y) / magnitude)),
      ) *
        180) /
        Math.PI
    : 0;
}
function pose(
  observation: Observation,
  frame: GameMotionFrame,
  person: Observation["people"][number],
): Pose | null {
  if (
    person.identity !== "confident" ||
    frame.identity !== "confident" ||
    !frame.feetVisible ||
    observation.epoch !== frame.epoch ||
    observation.sequence !== frame.sequence
  )
    return null;
  const names = [
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
  ] as const;
  const points = new Map<(typeof names)[number], Point>();
  for (const name of names) {
    const point = person.joints[name];
    if (
      !point ||
      point.status !== "observed" ||
      !point.inFrame ||
      point.x === null ||
      point.y === null ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.x > 1 ||
      point.y < 0 ||
      point.y > 1 ||
      !Number.isFinite(point.score) ||
      point.score < GAME_INPUT_QUALITY.minimumScore ||
      point.score > 1
    )
      return null;
    points.set(name, { x: point.x, y: point.y });
  }
  const at = (name: (typeof names)[number]) => points.get(name)!;
  return {
    centerX: (at("left_hip").x + at("right_hip").x) / 2,
    hipY: (at("left_hip").y + at("right_hip").y) / 2,
    feetY: (at("left_ankle").y + at("right_ankle").y) / 2,
    shoulderY: (at("left_shoulder").y + at("right_shoulder").y) / 2,
    leftFootY: at("left_ankle").y,
    rightFootY: at("right_ankle").y,
    leftKneeAngle: angle(at("left_hip"), at("left_knee"), at("left_ankle")),
    rightKneeAngle: angle(at("right_hip"), at("right_knee"), at("right_ankle")),
  };
}

/** Runner-specific experimental pose controls; no inference or camera ownership. */
export class RunnerPoseControls {
  private baseline: RunnerCalibration | null = null;
  private lane: Lane = 0;
  private duck = false;
  private airborne = false;
  private jumpArmed = false;
  private takeoffAt: number | null = null;
  private landedAt: number | null = null;
  private standingAt: number | null = null;
  private lastSequence = -1;
  private lastAt = -Infinity;
  get calibrated(): boolean {
    return this.baseline !== null;
  }
  get calibration(): RunnerCalibration | null {
    return this.baseline ? { ...this.baseline } : null;
  }
  reset(): void {
    this.baseline = null;
    this.clearActions();
    this.lastSequence = -1;
    this.lastAt = -Infinity;
  }
  private clearActions(): void {
    this.lane = 0;
    this.duck = false;
    this.airborne = false;
    this.jumpArmed = false;
    this.takeoffAt = null;
    this.landedAt = null;
    this.standingAt = null;
  }
  calibrate(
    observation: Observation,
    frame: GameMotionFrame,
    trackId: string,
  ): boolean {
    const [person] = observation.people;
    if (observation.people.length !== 1 || person.trackId !== trackId)
      return false;
    const current = pose(observation, frame, person);
    if (
      !current ||
      current.leftKneeAngle < RUNNER_POSE_TUNING.standingKneeAngleDegrees ||
      current.rightKneeAngle < RUNNER_POSE_TUNING.standingKneeAngleDegrees
    )
      return false;
    const bodyHeight = current.feetY - current.shoulderY;
    if (
      bodyHeight < 0.25 ||
      current.hipY <= current.shoulderY ||
      current.hipY >= current.feetY ||
      !frame.epoch ||
      !frame.spaceRevision ||
      !Number.isFinite(frame.atMs) ||
      frame.atMs < 0 ||
      !Number.isSafeInteger(frame.sequence) ||
      frame.sequence < 0
    )
      return false;
    this.baseline = {
      epoch: frame.epoch,
      spaceRevision: frame.spaceRevision,
      trackId,
      centerX: current.centerX,
      hipY: current.hipY,
      feetY: current.feetY,
      leftFootY: current.leftFootY,
      rightFootY: current.rightFootY,
      shoulderY: current.shoulderY,
      bodyHeight,
      observationRevision: observationSpaceRevision(observation),
    };
    this.clearActions();
    this.jumpArmed = true;
    this.lastAt = -Infinity;
    this.lastSequence = -1;
    return true;
  }
  ingest(
    observation: Observation,
    frame: GameMotionFrame,
    trackId: string,
  ): RunnerInput {
    const result: RunnerInput = {
      atMs: frame.atMs,
      sequence: frame.sequence,
      epoch: frame.epoch,
      spaceRevision: JSON.stringify([
        frame.spaceRevision,
        observationSpaceRevision(observation),
        trackId,
      ]),
      identity: frame.identity,
      participantCount: observation.people.length,
      lane: this.lane,
      jump: false,
      duck: false,
      standing: false,
      valid: false,
    };
    const fail = (reason: string) => {
      this.clearActions();
      return { ...result, reason };
    };
    const baseline = this.baseline;
    if (!baseline) return fail("Stand centered and calibrate before playing.");
    if (
      baseline.epoch !== frame.epoch ||
      baseline.spaceRevision !== frame.spaceRevision ||
      baseline.trackId !== trackId ||
      baseline.observationRevision !== observationSpaceRevision(observation)
    ) {
      this.reset();
      return fail(
        "Player or camera space changed. Start a new round and calibrate again.",
      );
    }
    // Calibration and gestures belong to the bound track, independent of detection order.
    const matches = observation.people.filter(
      (person) => person.trackId === trackId,
    );
    if (matches.length !== 1 || matches[0].identity !== "confident") {
      result.identity = matches.length ? "uncertain" : "missing";
      return fail(
        "Player identity changed or became uncertain. Start a new round.",
      );
    }
    const current = pose(observation, frame, matches[0]);
    if (!current)
      return fail(
        "Keep both shoulders, hips, knees and feet confidently in view.",
      );
    if (
      !Number.isFinite(frame.atMs) ||
      !Number.isSafeInteger(frame.sequence) ||
      frame.sequence <= this.lastSequence ||
      frame.atMs <= this.lastAt
    )
      return fail("Outdated body observation rejected.");
    if (
      Number.isFinite(this.lastAt) &&
      frame.atMs - this.lastAt > RUNNER_POSE_TUNING.maximumSampleGapMs
    )
      this.clearActions();
    this.lastAt = frame.atMs;
    this.lastSequence = frame.sequence;
    const size = baseline.bodyHeight;
    // A camera faces the participant: decreasing camera x is their screen-right.
    // This explicit control transform is independent of camera-preview mirroring.
    const horizontal = (baseline.centerX - current.centerX) / size;
    const enter = RUNNER_POSE_TUNING.laneEnterBodyHeights;
    const release = RUNNER_POSE_TUNING.laneReleaseBodyHeights;
    if (horizontal < -enter) this.lane = -1;
    else if (horizontal > enter) this.lane = 1;
    else if (Math.abs(horizontal) <= release) this.lane = 0;
    const hipDrop = (current.hipY - baseline.hipY) / size;
    const shoulderDrop = (current.shoulderY - baseline.shoulderY) / size;
    const bent =
      Math.min(current.leftKneeAngle, current.rightKneeAngle) <
      RUNNER_POSE_TUNING.duckKneeAngleDegrees;
    if (
      !this.airborne &&
      hipDrop >= RUNNER_POSE_TUNING.duckHipDropBodyHeights &&
      shoulderDrop >= 0.08 &&
      bent
    )
      this.duck = true;
    else if (hipDrop < RUNNER_POSE_TUNING.duckReleaseBodyHeights)
      this.duck = false;
    const feetLift =
      (baseline.feetY - Math.max(current.leftFootY, current.rightFootY)) / size;
    const hipLift = (baseline.hipY - current.hipY) / size;
    const grounded = feetLift < 0.025 && hipLift < 0.04;
    if (!this.airborne && grounded && !this.duck) this.jumpArmed = true;
    const takingOff =
      feetLift >= RUNNER_POSE_TUNING.jumpFeetLiftBodyHeights &&
      hipLift >= RUNNER_POSE_TUNING.jumpHipLiftBodyHeights &&
      !this.duck;
    let jump = false;
    if (!this.airborne && this.jumpArmed && takingOff) {
      this.takeoffAt ??= frame.atMs;
      if (frame.atMs - this.takeoffAt >= RUNNER_POSE_TUNING.jumpConfirmMs) {
        jump = true;
        this.airborne = true;
        this.jumpArmed = false;
        this.takeoffAt = null;
        this.landedAt = null;
      }
    } else if (!this.airborne) this.takeoffAt = null;
    if (this.airborne && grounded) {
      this.landedAt ??= frame.atMs;
      if (frame.atMs - this.landedAt >= RUNNER_POSE_TUNING.landingConfirmMs) {
        this.airborne = false;
        this.jumpArmed = true;
        this.landedAt = null;
      }
    } else if (this.airborne) this.landedAt = null;
    const standingPose =
      !this.airborne &&
      !this.duck &&
      Math.abs(current.leftFootY - baseline.leftFootY) / size <=
        RUNNER_POSE_TUNING.standingFeetToleranceBodyHeights &&
      Math.abs(current.rightFootY - baseline.rightFootY) / size <=
        RUNNER_POSE_TUNING.standingFeetToleranceBodyHeights &&
      Math.abs(hipDrop) <= RUNNER_POSE_TUNING.standingHipToleranceBodyHeights &&
      Math.abs(shoulderDrop) <=
        RUNNER_POSE_TUNING.standingShoulderToleranceBodyHeights &&
      Math.min(current.leftKneeAngle, current.rightKneeAngle) >=
        RUNNER_POSE_TUNING.standingKneeAngleDegrees;
    if (standingPose) this.standingAt ??= frame.atMs;
    else this.standingAt = null;
    const standing =
      this.standingAt !== null &&
      frame.atMs - this.standingAt >= RUNNER_POSE_TUNING.standingConfirmMs;
    if (current.centerX < 0.12 || current.centerX > 0.88)
      return fail("Return inside the calibrated play area.");
    return {
      ...result,
      lane: this.lane,
      jump,
      duck: this.airborne ? false : this.duck,
      standing,
      valid: true,
    };
  }
}
