import {
  GAME_INPUT_QUALITY,
  observationSpaceRevision,
  type Observation,
  type GameMotionFrame,
  type JointName,
} from "../../../packages/motion/src/index";

export type Lane = -1 | 0 | 1;
/** Semantic controls retain source time and the bound session revision. */
export interface RunnerInput {
  atMs: number;
  sequence: number;
  epoch: string;
  spaceRevision: string;
  identity: "confident" | "uncertain" | "missing";
  participantCount: number;
  lane: Lane;
  jump: boolean;
  duck: boolean;
  standing: boolean;
  valid: boolean;
  reason?: string;
}
/** Proposed image-space thresholds, pending supervised physical trials. */
export const RUNNER_POSE_TUNING = Object.freeze({
  version: 3,
  laneBoundaryMarginWidths: 0.1,
  jumpHeadLiftBodyHeights: 0.075,
  jumpTorsoLiftBodyHeights: 0.035,
  jumpConfirmMs: 45,
  landingConfirmMs: 100,
  standingConfirmMs: 100,
  standingToleranceBodyHeights: 0.065,
  // Rearm cannot overlap the torso evidence that supports an active jump,
  // including when the face becomes hidden and shoulders supply head height.
  standingTorsoToleranceBodyHeights: 0.025,
  standingFeetToleranceBodyHeights: 0.06,
  duckHeadDropBodyHeights: 0.16,
  duckTorsoDropBodyHeights: 0.08,
  duckReleaseBodyHeights: 0.09,
  maximumSampleGapMs: 350,
});
interface Point {
  x: number;
  y: number;
}
type Anchors = Partial<Record<JointName, Point>>;
interface RunnerLaneBands {
  centerX: number;
  width: number;
}
export interface RunnerCalibration {
  epoch: string;
  spaceRevision: string;
  trackId: string;
  centerX: number;
  lanes: RunnerLaneBands;
  headY: number;
  bodyHeight: number;
  observationRevision: string;
  anchors: Anchors;
}
export interface RunnerPoseFeedback {
  displayX: number;
  headY: number;
  jumpY: number;
  duckY: number;
  standingY: number;
  evidence: "head + torso" | "shoulder fallback + torso";
  airborne: boolean;
}
const heads: JointName[] = [
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
];
const shoulders: JointName[] = ["left_shoulder", "right_shoulder"];
const hips: JointName[] = ["left_hip", "right_hip"];
const ankles: JointName[] = ["left_ankle", "right_ankle"];
function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    (sorted[Math.floor((sorted.length - 1) / 2)] +
      sorted[Math.floor(sorted.length / 2)]) /
    2
  );
}
function anchors(person: Observation["people"][number]): Anchors {
  const result: Anchors = {};
  for (const name of [...heads, ...shoulders, ...hips, ...ankles]) {
    const point = person.joints[name];
    if (
      point?.status === "observed" &&
      point.inFrame &&
      point.x !== null &&
      point.y !== null &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= 0 &&
      point.x <= 1 &&
      point.y >= 0 &&
      point.y <= 1 &&
      Number.isFinite(point.score) &&
      point.score >= GAME_INPUT_QUALITY.minimumScore &&
      point.score <= 1
    )
      result[name] = { x: point.x, y: point.y };
  }
  return result;
}
function positions(
  points: Anchors,
  names: JointName[],
  axis: "x" | "y",
): number[] {
  return names.flatMap((name) => (points[name] ? [points[name]![axis]] : []));
}
function deltas(
  points: Anchors,
  baseline: Anchors,
  names: JointName[],
  axis: "x" | "y",
): number[] {
  return names.flatMap((name) =>
    points[name] && baseline[name]
      ? [points[name]![axis] - baseline[name]![axis]]
      : [],
  );
}
/** Controls and preview share this mirror, independent of anatomical names. */
export function runnerDisplayX(cameraX: number): number {
  return 1 - cameraX;
}

/** Runner-only interpretation; no camera, inference or guessed identity association. */
export class RunnerPoseControls {
  private baseline: RunnerCalibration | null = null;
  private latestFeedback: RunnerPoseFeedback | null = null;
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
    return this.baseline ? structuredClone(this.baseline) : null;
  }
  get feedback(): RunnerPoseFeedback | null {
    return this.latestFeedback ? { ...this.latestFeedback } : null;
  }
  get laneBands(): RunnerLaneBands | null {
    return this.baseline ? { ...this.baseline.lanes } : null;
  }
  /** Break gesture continuity while retaining the explicit standing reference. */
  suspend(): void {
    this.clearActions();
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
    this.takeoffAt = this.landedAt = this.standingAt = null;
    this.latestFeedback = null;
  }
  private person(
    observation: Observation,
    frame: GameMotionFrame,
    trackId: string,
  ) {
    const matching = observation.people.filter(
      (person) => person.trackId === trackId,
    );
    return matching.length === 1 &&
      matching[0].identity === "confident" &&
      frame.identity === "confident" &&
      observation.epoch === frame.epoch &&
      observation.sequence === frame.sequence
      ? matching[0]
      : null;
  }
  calibrate(
    observation: Observation,
    frame: GameMotionFrame,
    trackId: string,
  ): boolean {
    const person = this.person(observation, frame, trackId);
    if (
      !person ||
      !frame.epoch ||
      !frame.spaceRevision ||
      !Number.isFinite(frame.atMs) ||
      frame.atMs < 0 ||
      !Number.isSafeInteger(frame.sequence) ||
      frame.sequence < 0
    )
      return false;
    const points = anchors(person);
    const shoulderY = positions(points, shoulders, "y"),
      hipY = positions(points, hips, "y");
    if (!shoulderY.length || !hipY.length) return false;
    const torso = average(hipY) - average(shoulderY);
    if (torso < 0.045) return false;
    const footY = positions(points, ankles, "y");
    const height = footY.length
      ? average(footY) - average(shoulderY)
      : torso * 2.6;
    if (height < 0.16 || height > 1) return false;
    const head = positions(points, heads, "y");
    const hipX = positions(points, hips, "x");
    const shoulderX = positions(points, shoulders, "x");
    const centerX =
      hipX.length === 2
        ? average(hipX)
        : shoulderX.length === 2
          ? average(shoulderX)
          : null;
    if (centerX === null) return false;
    const [left, right] = shoulderX.length === 2 ? shoulderX : hipX;
    const laneWidth = Math.abs(left - right);
    if (laneWidth === 0) return false;
    this.baseline = {
      epoch: frame.epoch,
      spaceRevision: frame.spaceRevision,
      trackId,
      centerX,
      lanes: { centerX: runnerDisplayX(centerX), width: laneWidth },
      headY: head.length ? median(head) : average(shoulderY) - height * 0.17,
      bodyHeight: height,
      observationRevision: observationSpaceRevision(observation),
      anchors: points,
    };
    this.clearActions();
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
    const fail = (reason: string): RunnerInput => {
      this.clearActions();
      return { ...result, reason };
    };
    const baseline = this.baseline;
    if (!baseline)
      return fail("Set a comfortable standing reference before playing.");
    if (
      baseline.epoch !== frame.epoch ||
      baseline.spaceRevision !== frame.spaceRevision ||
      baseline.trackId !== trackId ||
      baseline.observationRevision !== observationSpaceRevision(observation)
    ) {
      this.reset();
      return fail(
        "Player or camera space changed. Start a new run and set standing again.",
      );
    }
    const person = this.person(observation, frame, trackId);
    if (!person) {
      result.identity = observation.people.some(
        (person) => person.trackId === trackId,
      )
        ? "uncertain"
        : "missing";
      return fail(
        "Joined player missing or uncertain. Separate from others; scoring is paused.",
      );
    }
    if (
      !Number.isFinite(frame.atMs) ||
      frame.atMs < 0 ||
      !Number.isSafeInteger(frame.sequence) ||
      frame.sequence <= this.lastSequence ||
      frame.atMs <= this.lastAt
    )
      return fail("Outdated body observation rejected.");
    const gap = frame.atMs - this.lastAt;
    this.lastAt = frame.atMs;
    this.lastSequence = frame.sequence;
    if (Number.isFinite(gap) && gap > RUNNER_POSE_TUNING.maximumSampleGapMs)
      return fail(
        "Tracking gap. Stand comfortably to rearm controls; scoring is paused.",
      );
    const points = anchors(person);
    const shoulderDelta = deltas(points, baseline.anchors, shoulders, "y");
    const hipDelta = deltas(points, baseline.anchors, hips, "y");
    const hipX = positions(points, hips, "x");
    const shoulderX = positions(points, shoulders, "x");
    const referenceShoulderX = positions(baseline.anchors, shoulders, "x");
    if (!shoulderDelta.length || !hipDelta.length)
      return fail(
        "Torso occluded. Keep one shoulder and one hip confidently visible.",
      );
    // A single rotating hip is not a measured torso center. Prefer a current
    // pair; pause if both pairs disappear rather than turn yaw into a lane.
    const centerX =
      hipX.length === 2
        ? average(hipX)
        : shoulderX.length === 2 && referenceShoulderX.length === 2
          ? baseline.centerX + average(shoulderX) - average(referenceShoulderX)
          : null;
    if (centerX === null)
      return fail(
        "Lane position occluded. Face the camera so both shoulders or both hips are visible.",
      );
    // Compare vertical joints to their own reference before combining, so a
    // fallback does not inherit another joint's absolute image height.
    const headDelta = deltas(points, baseline.anchors, heads, "y");
    const headDrop =
      median(headDelta.length ? headDelta : shoulderDelta) /
      baseline.bodyHeight;
    const shoulderDrop = median(shoulderDelta) / baseline.bodyHeight;
    const hipDrop = median(hipDelta) / baseline.bodyHeight;
    const torsoDrop = Math.min(shoulderDrop, hipDrop);
    const displayX = runnerDisplayX(centerX);
    const lateral = (displayX - baseline.lanes.centerX) / baseline.lanes.width;
    const margin = RUNNER_POSE_TUNING.laneBoundaryMarginWidths;
    if (lateral < -0.5 - margin) this.lane = -1;
    else if (lateral > 0.5 + margin) this.lane = 1;
    else if (
      (this.lane === -1 && lateral >= -0.5 + margin) ||
      (this.lane === 1 && lateral <= 0.5 - margin)
    )
      this.lane = 0;
    if (
      !this.airborne &&
      headDrop >= RUNNER_POSE_TUNING.duckHeadDropBodyHeights &&
      torsoDrop >= RUNNER_POSE_TUNING.duckTorsoDropBodyHeights
    ) {
      this.duck = true;
      this.jumpArmed = false;
    } else if (headDrop < RUNNER_POSE_TUNING.duckReleaseBodyHeights)
      this.duck = false;
    const feetDelta = deltas(points, baseline.anchors, ankles, "y");
    // Judge each torso segment as a group so one noisy landmark does not
    // keep resetting the standing timer while the player is still.
    const standingPose =
      !this.duck &&
      Math.abs(headDrop) <= RUNNER_POSE_TUNING.standingToleranceBodyHeights &&
      Math.abs(shoulderDrop) <=
        RUNNER_POSE_TUNING.standingTorsoToleranceBodyHeights &&
      Math.abs(hipDrop) <=
        RUNNER_POSE_TUNING.standingTorsoToleranceBodyHeights &&
      feetDelta.every(
        (delta) =>
          Math.abs(delta) / baseline.bodyHeight <=
          RUNNER_POSE_TUNING.standingFeetToleranceBodyHeights,
      );
    if (standingPose) this.standingAt ??= frame.atMs;
    else this.standingAt = null;
    const settled =
      this.standingAt !== null &&
      frame.atMs - this.standingAt >= RUNNER_POSE_TUNING.standingConfirmMs;
    if (this.airborne && standingPose) {
      this.landedAt ??= frame.atMs;
      if (frame.atMs - this.landedAt >= RUNNER_POSE_TUNING.landingConfirmMs) {
        this.airborne = false;
        this.landedAt = null;
      }
    } else this.landedAt = null;
    if (settled && !this.airborne) this.jumpArmed = true;
    const takingOff =
      !this.duck &&
      -headDrop >= RUNNER_POSE_TUNING.jumpHeadLiftBodyHeights &&
      -shoulderDrop >= RUNNER_POSE_TUNING.jumpTorsoLiftBodyHeights &&
      -hipDrop >= RUNNER_POSE_TUNING.jumpTorsoLiftBodyHeights;
    let jump = false;
    if (!this.airborne && this.jumpArmed && takingOff) {
      this.takeoffAt ??= frame.atMs;
      if (frame.atMs - this.takeoffAt >= RUNNER_POSE_TUNING.jumpConfirmMs) {
        jump = true;
        this.airborne = true;
        this.jumpArmed = false;
        this.takeoffAt = null;
      }
    } else this.takeoffAt = null;
    this.latestFeedback = {
      displayX,
      headY: baseline.headY + headDrop * baseline.bodyHeight,
      standingY: baseline.headY,
      jumpY:
        baseline.headY -
        RUNNER_POSE_TUNING.jumpHeadLiftBodyHeights * baseline.bodyHeight,
      duckY:
        baseline.headY +
        RUNNER_POSE_TUNING.duckHeadDropBodyHeights * baseline.bodyHeight,
      evidence: headDelta.length ? "head + torso" : "shoulder fallback + torso",
      airborne: this.airborne,
    };
    return {
      ...result,
      lane: this.lane,
      jump,
      duck: !this.airborne && this.duck,
      standing: settled && !this.airborne,
      valid: true,
    };
  }
}
