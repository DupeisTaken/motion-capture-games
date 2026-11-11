import type { Lane, RunnerInput } from "./pose-controls";
export type { Lane, RunnerInput } from "./pose-controls";
export { RunnerPoseControls, RUNNER_POSE_TUNING } from "./pose-controls";

export interface RunnerOptions {
  variant: "rail" | "gold";
  practice: boolean;
  fastStart: boolean;
}
export type ObstacleKind = "barrier" | "overhead" | "train" | "coin";
export interface RunnerObstacle {
  id: number;
  lane: Lane;
  kind: ObstacleKind;
  z: number;
}
export interface RunnerState {
  phase: "ready" | "countdown" | "playing" | "paused" | "results";
  reason: string | null;
  requiresNewRound: boolean;
  countdownMs: number;
  elapsedMs: number;
  distance: number;
  speed: number;
  score: number;
  coins: number;
  hits: number;
  lives: number;
  lane: Lane;
  targetLane: Lane;
  avatarX: number;
  jumpHeight: number;
  duck: boolean;
  obstacles: RunnerObstacle[];
  options: RunnerOptions;
  result: "completed" | "out-of-lives" | null;
}
export interface RunnerReadiness {
  ready: boolean;
  reason: string | null;
  requiresNewRound: boolean;
}
/** Synthetic software tuning in meters/ms; not a measured motion profile. */
export const TUNING = Object.freeze({
  startCountdownMs: 3_000,
  resumeCountdownMs: 2_000,
  staleMs: 350,
  maximumStepMs: 250,
  substepMs: 1000 / 120,
  startSpeed: 10,
  fastStartSpeed: 14,
  maximumSpeed: 18,
  speedGainPerSecond: 0.035,
  rowSpacingM: 30,
  firstRowM: 34,
  horizonM: 130,
  laneUnitsPerSecond: 6.25,
  jumpDurationMs: 950,
  jumpHeightM: 1.8,
  barrierClearanceM: 0.8,
  resumeClearanceM: 26,
  hitGraceMs: 1_300,
});
interface InternalObstacle extends RunnerObstacle {
  resolved: boolean;
  collected?: boolean;
}
const lanes: Lane[] = [-1, 0, 1];
function validLane(value: number): value is Lane {
  return value === -1 || value === 0 || value === 1;
}

/** One game timeline owns hazards, movement and scoring. Pauses never catch up. */
export class RunnerGame {
  private value: RunnerState;
  private obstacles: InternalObstacle[] = [];
  private randomState: number;
  private nextId = 1;
  private nextRow = TUNING.firstRowM;
  private row = 0;
  private lastWall: number | null = null;
  private owner: string | null = null;
  private lastInputSequence = -1;
  private lastInputAt = -Infinity;
  private jumpElapsed = -1;
  private jumpHeld = false;
  private heldDuck = false;
  private graceMs = 0;
  constructor(options: Partial<RunnerOptions> = {}, seed = 42) {
    if (
      options.variant !== undefined &&
      options.variant !== "rail" &&
      options.variant !== "gold"
    )
      throw new Error("Unknown runner variant.");
    if (options.practice !== undefined && typeof options.practice !== "boolean")
      throw new Error("Practice must be boolean.");
    if (
      options.fastStart !== undefined &&
      typeof options.fastStart !== "boolean"
    )
      throw new Error("Fast start must be boolean.");
    if (!Number.isSafeInteger(seed))
      throw new Error("Runner seed must be a safe integer.");
    this.randomState = seed >>> 0;
    this.value = {
      phase: "ready",
      reason: null,
      requiresNewRound: false,
      countdownMs: 0,
      elapsedMs: 0,
      distance: 0,
      speed: options.fastStart ? TUNING.fastStartSpeed : TUNING.startSpeed,
      score: 0,
      coins: 0,
      hits: 0,
      lives: 3,
      lane: 0,
      targetLane: 0,
      avatarX: 0,
      jumpHeight: 0,
      duck: false,
      obstacles: [],
      options: {
        variant: options.variant ?? "rail",
        practice: options.practice ?? false,
        fastStart: options.fastStart ?? false,
      },
      result: null,
    };
    this.fillWorld();
  }
  get state(): RunnerState {
    return structuredClone({
      ...this.value,
      obstacles: this.obstacles.map(({ id, lane, kind, z }) => ({
        id,
        lane,
        kind,
        z,
      })),
    });
  }
  private random(): number {
    this.randomState =
      (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  private key(input: RunnerInput): string {
    return JSON.stringify([input.epoch, input.spaceRevision]);
  }
  readiness(now: number, input: RunnerInput | null): RunnerReadiness {
    const failure = (
      reason: string,
      requiresNewRound = this.value.requiresNewRound,
    ): RunnerReadiness => ({ ready: false, reason, requiresNewRound });
    if (this.value.requiresNewRound)
      return failure(
        "Player identity or camera space changed. Start a new round.",
        true,
      );
    if (!Number.isFinite(now) || now < 0)
      return failure("Game clock is invalid.");
    if (!input) return failure("Waiting for one confidently tracked player.");
    if (this.owner && this.key(input) !== this.owner)
      return failure(
        "Player identity or camera space changed. Start a new round.",
        true,
      );
    if (input.identity !== "confident")
      return failure(
        "Player identity is uncertain. Start a new round.",
        this.owner !== null,
      );
    // A second person must not mask simultaneous loss of the score owner's identity.
    if (input.participantCount !== 1)
      return failure(
        input.participantCount > 1
          ? "Another player detected. Only one person may be in view."
          : "Player missing. Return to the play area.",
      );
    if (input.valid !== true)
      return failure(input.reason || "Keep the required body joints in view.");
    if (
      typeof input.epoch !== "string" ||
      !input.epoch ||
      typeof input.spaceRevision !== "string" ||
      !input.spaceRevision ||
      !Number.isFinite(input.atMs) ||
      input.atMs < 0 ||
      input.atMs > now ||
      now - input.atMs > TUNING.staleMs ||
      !Number.isSafeInteger(input.sequence) ||
      input.sequence < 0 ||
      !validLane(input.lane) ||
      typeof input.jump !== "boolean" ||
      typeof input.duck !== "boolean" ||
      typeof input.standing !== "boolean"
    )
      return failure("Waiting for fresh, valid control input.");
    if (
      input.sequence < this.lastInputSequence ||
      input.atMs < this.lastInputAt ||
      (input.sequence > this.lastInputSequence &&
        input.atMs <= this.lastInputAt) ||
      (input.sequence === this.lastInputSequence &&
        input.atMs !== this.lastInputAt)
    )
      return failure("Outdated control input rejected.");
    if (input.jump && input.duck)
      return failure("Conflicting jump and duck evidence. Stand comfortably.");
    return { ready: true, reason: null, requiresNewRound: false };
  }
  start(now: number, input: RunnerInput): boolean {
    if (
      this.value.phase !== "ready" ||
      !this.readiness(now, input).ready ||
      !input.standing ||
      input.jump ||
      input.duck
    )
      return false;
    this.owner = this.key(input);
    this.lastInputSequence = input.sequence;
    this.lastInputAt = input.atMs;
    this.value.phase = "countdown";
    this.value.countdownMs = TUNING.startCountdownMs;
    this.lastWall = now;
    return true;
  }
  pause(reason = "Play paused. Choose Resume when ready."): void {
    if (this.value.phase !== "playing" && this.value.phase !== "countdown")
      return;
    this.value.phase = "paused";
    this.value.reason = reason;
  }
  resume(now: number, input: RunnerInput): boolean {
    if (
      this.value.phase !== "paused" ||
      !this.readiness(now, input).ready ||
      !input.standing ||
      input.jump ||
      input.duck
    )
      return false;
    this.value.phase = "countdown";
    this.value.reason = null;
    this.value.countdownMs = TUNING.resumeCountdownMs;
    this.value.lane = input.lane;
    this.value.targetLane = input.lane;
    this.value.avatarX = input.lane;
    this.value.jumpHeight = 0;
    this.value.duck = false;
    this.jumpElapsed = -1;
    this.jumpHeld = false;
    this.heldDuck = false;
    this.graceMs = TUNING.hitGraceMs;
    // Move the entire pending world together, retaining its authored spacing.
    const nearest = Math.min(
      ...this.obstacles
        .filter((obstacle) => !obstacle.resolved && obstacle.z >= -4)
        .map((obstacle) => obstacle.z),
    );
    if (nearest < TUNING.resumeClearanceM) {
      const shift = TUNING.resumeClearanceM - nearest;
      for (const obstacle of this.obstacles)
        if (!obstacle.resolved) obstacle.z += shift;
      this.nextRow += shift;
    }
    this.lastInputSequence = input.sequence;
    this.lastInputAt = input.atMs;
    this.lastWall = now;
    return true;
  }
  end(): void {
    this.value.phase = "results";
    this.value.result = "completed";
    this.value.reason = null;
  }
  step(now: number, input: RunnerInput | null): RunnerState {
    if (this.value.phase === "results" || this.value.phase === "ready")
      return this.state;
    const readiness = this.readiness(now, input);
    if (readiness.requiresNewRound) this.value.requiresNewRound = true;
    if (!readiness.ready || !input) {
      this.pause(readiness.reason || "Waiting for usable input.");
      this.value.reason = readiness.reason;
      this.lastWall = Number.isFinite(now) ? now : null;
      return this.state;
    }
    const previousWall = this.lastWall ?? now;
    const elapsed = now - previousWall;
    this.lastWall = now;
    if (elapsed < 0 || elapsed > TUNING.maximumStepMs) {
      this.pause("Display timing was interrupted. Resume when ready.");
      return this.state;
    }
    if (this.value.phase === "paused") return this.state;
    const fresh = input.sequence > this.lastInputSequence;
    if (fresh) {
      this.lastInputSequence = input.sequence;
      this.lastInputAt = input.atMs;
    }
    if (this.value.phase === "countdown") {
      if (!input.standing || input.jump || input.duck) {
        this.pause("Stand comfortably before the countdown continues.");
        return this.state;
      }
      this.value.lane = input.lane;
      this.value.targetLane = input.lane;
      this.value.avatarX = input.lane;
      this.value.countdownMs = Math.max(0, this.value.countdownMs - elapsed);
      // Fractional display intervals must not add an extra frame at zero.
      if (this.value.countdownMs < 1e-6) this.value.countdownMs = 0;
      if (this.value.countdownMs === 0) this.value.phase = "playing";
      return this.state;
    }
    // Consume a newly timestamped control at its source-mapped instant, never
    // retroactively using a last-moment jump to erase an earlier collision.
    const beforeInputMs = fresh
      ? Math.max(0, Math.min(elapsed, input.atMs - previousWall))
      : 0;
    this.advanceInterval(beforeInputMs, this.heldDuck);
    if (this.value.phase !== "playing") return this.state;
    this.value.targetLane = input.lane;
    if (fresh && !input.jump) this.jumpHeld = false;
    if (
      fresh &&
      input.jump &&
      !this.jumpHeld &&
      !input.duck &&
      this.jumpElapsed < 0
    ) {
      this.jumpElapsed = 0;
      this.jumpHeld = true;
    }
    this.heldDuck = input.duck;
    this.value.duck = this.jumpElapsed < 0 && input.duck;
    this.advanceInterval(elapsed - beforeInputMs, this.heldDuck);
    return this.state;
  }
  private advanceInterval(ms: number, duck: boolean): void {
    let remaining = ms;
    // Finite small substeps prevent a fast frame from skipping a collision plane.
    while (remaining > 1e-8 && this.value.phase === "playing") {
      const delta = Math.min(TUNING.substepMs, remaining);
      this.advance(delta, duck);
      remaining -= delta;
    }
  }
  private advance(ms: number, duck: boolean): void {
    const seconds = ms / 1000;
    this.value.elapsedMs += ms;
    this.value.speed = Math.min(
      TUNING.maximumSpeed,
      (this.value.options.fastStart
        ? TUNING.fastStartSpeed
        : TUNING.startSpeed) +
        (this.value.elapsedMs / 1000) * TUNING.speedGainPerSecond,
    );
    const travel = this.value.speed * seconds;
    this.value.distance += travel;
    this.nextRow -= travel;
    this.graceMs = Math.max(0, this.graceMs - ms);
    const dx = this.value.targetLane - this.value.avatarX;
    this.value.avatarX +=
      Math.sign(dx) *
      Math.min(Math.abs(dx), TUNING.laneUnitsPerSecond * seconds);
    this.value.lane = Math.max(
      -1,
      Math.min(1, Math.round(this.value.avatarX)),
    ) as Lane;
    if (this.jumpElapsed >= 0) {
      this.jumpElapsed += ms;
      const progress = Math.min(1, this.jumpElapsed / TUNING.jumpDurationMs);
      this.value.jumpHeight =
        4 * TUNING.jumpHeightM * progress * (1 - progress);
      if (progress >= 1) {
        this.jumpElapsed = -1;
        this.value.jumpHeight = 0;
      }
    }
    this.value.duck = this.jumpElapsed < 0 && duck;
    for (const obstacle of this.obstacles) {
      const previous = obstacle.z;
      obstacle.z -= travel;
      const plane =
        obstacle.kind === "train" ? 4 : obstacle.kind === "coin" ? 0.9 : 0.65;
      if (obstacle.resolved || obstacle.z > plane) continue;
      if (obstacle.kind === "train") {
        if (obstacle.z < -4) {
          obstacle.resolved = true;
          continue;
        }
      } else {
        if (previous < plane) continue;
        obstacle.resolved = true;
      }
      if (Math.abs(this.value.avatarX - obstacle.lane) >= 0.58) continue;
      if (obstacle.kind === "coin") {
        this.value.coins++;
        obstacle.collected = true;
        continue;
      }
      const clear =
        obstacle.kind === "barrier"
          ? this.value.jumpHeight >= TUNING.barrierClearanceM
          : obstacle.kind === "overhead"
            ? this.value.duck
            : false;
      if (!clear && this.graceMs <= 0) {
        obstacle.resolved = true;
        this.value.hits++;
        this.value.lives = Math.max(0, 3 - this.value.hits);
        this.graceMs = TUNING.hitGraceMs;
        if (this.value.lives === 0 && !this.value.options.practice) {
          this.value.phase = "results";
          this.value.result = "out-of-lives";
        }
      }
    }
    this.obstacles = this.obstacles.filter(
      (obstacle) => !obstacle.collected && obstacle.z > -12,
    );
    this.fillWorld();
    this.value.score = Math.floor(this.value.distance) + this.value.coins * 25;
  }
  private fillWorld(): void {
    while (this.nextRow <= TUNING.horizonM) {
      const hazardLane = lanes[Math.floor(this.random() * lanes.length)];
      const safeLanes = lanes.filter((lane) => lane !== hazardLane);
      const safeLane = safeLanes[Math.floor(this.random() * safeLanes.length)];
      const kind: ObstacleKind =
        this.row === 0
          ? "barrier"
          : (["barrier", "overhead", "train"] as const)[
              Math.floor(this.random() * 3)
            ];
      this.obstacles.push({
        id: this.nextId++,
        lane: hazardLane,
        kind,
        z: this.nextRow,
        resolved: false,
      });
      if (this.row > 3 && this.random() < 0.35) {
        const other = lanes.find(
          (lane) => lane !== hazardLane && lane !== safeLane,
        )!;
        this.obstacles.push({
          id: this.nextId++,
          lane: other,
          kind: "train",
          z: this.nextRow,
          resolved: false,
        });
      }
      for (let index = 0; index < 5; index++)
        this.obstacles.push({
          id: this.nextId++,
          lane: safeLane,
          kind: "coin",
          z: this.nextRow - 5 + index * 2,
          resolved: false,
        });
      this.nextRow += TUNING.rowSpacingM;
      this.row++;
    }
  }
}
