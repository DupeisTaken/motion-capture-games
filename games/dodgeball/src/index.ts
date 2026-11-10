import {
  BODY_NAMES,
  type BodyName,
  type BodyPoint,
  type DodgeMotionFrame,
} from "../../../packages/motion/src/index";

export type Difficulty = "easy" | "normal" | "hard";
export type GameMode = "timed" | "survival" | "practice";
export interface GameOptions {
  mode: GameMode;
  difficulty: Difficulty;
}
/** Proposed image-space tuning, not measured participant reach or physical timing. */
export const TUNING = Object.freeze({
  roundMs: 60_000,
  startCountdownMs: 3_000,
  resumeCountdownMs: 2_000,
  staleMs: 350,
  maxStepMs: 400,
  maxDangerGapMs: 150,
  dangerMs: 300,
  clearingMs: 500,
  survivalHits: 3,
  hitPenalty: 50,
  headRadius: 0.045,
  limbRadius: 0.018,
  bounds: Object.freeze({ left: 0.08, right: 0.92, top: 0.1, bottom: 0.92 }),
  easy: Object.freeze({ radius: 0.065, warningMs: 2_000 }),
  normal: Object.freeze({ radius: 0.08, warningMs: 1_700 }),
  hard: Object.freeze({ radius: 0.095, warningMs: 1_400 }),
});
export const DEFAULT_OPTIONS: Readonly<GameOptions> = Object.freeze({
  mode: "timed",
  difficulty: "normal",
});
export interface DodgeObstacle {
  id: number;
  x: number;
  y: number;
  radius: number;
  phase: "warning" | "danger" | "clearing";
  remainingMs: number;
  durationMs: number;
  hit: boolean;
  eligibleForDodge: boolean;
  /** Active round time; danger is the half-open interval [start, start + dangerMs). */
  dangerAtMs: number;
  resolved: boolean;
}
export interface GameState {
  phase: "ready" | "countdown" | "playing" | "paused" | "results";
  reason: string | null;
  options: GameOptions;
  score: number;
  dodges: number;
  hits: number;
  combo: number;
  bestCombo: number;
  elapsedMs: number;
  remainingMs: number | null;
  countdownMs: number;
  obstacle: DodgeObstacle | null;
  result: "completed" | "time-up" | "out-of-lives" | null;
}
interface Point {
  x: number;
  y: number;
}
export interface BodyShapes {
  head: Point & { radius: number };
  torso: BodyPoint[];
  limbs: { a: BodyPoint; b: BodyPoint; radius: number }[];
}
const LIMBS: ReadonlyArray<readonly [BodyName, BodyName]> = [
  ["nose", "left_shoulder"],
  ["nose", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
];

/** Shared with the renderer so visible body boundaries match collision geometry. */
export function bodyShapes(body: BodyPoint[]): BodyShapes | null {
  if (!Array.isArray(body) || body.length !== BODY_NAMES.length) return null;
  const joints = new Map<BodyName, BodyPoint>();
  for (const point of body) {
    if (
      !point ||
      !BODY_NAMES.includes(point.name) ||
      joints.has(point.name) ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.x > 1 ||
      point.y < 0 ||
      point.y > 1
    )
      return null;
    joints.set(point.name, { ...point });
  }
  const at = (name: BodyName) => joints.get(name)!;
  const torso = [
    at("left_shoulder"),
    at("right_shoulder"),
    at("right_hip"),
    at("left_hip"),
  ];
  return {
    head: { ...at("nose"), radius: TUNING.headRadius },
    torso,
    limbs: [
      ...LIMBS.map(([a, b]) => ({
        a: at(a),
        b: at(b),
        radius: TUNING.limbRadius,
      })),
      ...torso.map((a, index) => ({
        a,
        b: torso[(index + 1) % torso.length],
        radius: TUNING.limbRadius,
      })),
    ],
  };
}
function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
          ),
        );
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function insidePolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function bodyCollides(
  body: BodyPoint[],
  ball: Point & { radius: number },
): boolean {
  const shapes = bodyShapes(body);
  if (!shapes) return false;
  return (
    Math.hypot(ball.x - shapes.head.x, ball.y - shapes.head.y) <=
      ball.radius + shapes.head.radius + 1e-12 ||
    insidePolygon(ball, shapes.torso) ||
    shapes.limbs.some(
      ({ a, b, radius }) =>
        segmentDistance(ball, a, b) <= ball.radius + radius + 1e-12,
    )
  );
}
function initial(options: GameOptions): GameState {
  return {
    phase: "ready",
    reason: null,
    options,
    score: 0,
    dodges: 0,
    hits: 0,
    combo: 0,
    bestCombo: 0,
    elapsedMs: 0,
    remainingMs: options.mode === "timed" ? TUNING.roundMs : null,
    countdownMs: 0,
    obstacle: null,
    result: null,
  };
}

/** Pure deterministic game. No camera, inference, score attribution or clock ownership leaks. */
export class DodgeGame {
  private readonly options: GameOptions;
  private readonly seed: number;
  private randomState: number;
  private value: GameState;
  private lastTick: number | null = null;
  private epoch: string | null = null;
  private spaceRevision: string | null = null;
  private lastSequence = -1;
  private lastSourceTime = -Infinity;
  private continuousSourceTime: number | null = null;
  private lastFingerprint = "";
  private obstacleId = 0;

  constructor(options: Partial<GameOptions> = {}, seed = 42) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    if (
      !["timed", "survival", "practice"].includes(this.options.mode) ||
      !["easy", "normal", "hard"].includes(this.options.difficulty)
    )
      throw new Error("Invalid game options.");
    if (!Number.isSafeInteger(seed))
      throw new Error("Seed must be an integer.");
    this.seed = seed >>> 0;
    this.randomState = this.seed;
    this.value = initial(this.options);
  }
  get state(): GameState {
    return structuredClone(this.value);
  }
  start(nowMs: number): GameState {
    if (this.value.phase !== "ready") return this.state;
    this.assertTime(nowMs);
    this.value.phase = "countdown";
    this.value.countdownMs = TUNING.startCountdownMs;
    this.lastTick = nowMs;
    return this.state;
  }
  restart(nowMs?: number): GameState {
    if (nowMs !== undefined) this.assertTime(nowMs);
    this.value = initial(this.options);
    this.randomState = this.seed;
    this.lastTick = null;
    this.epoch = null;
    this.spaceRevision = null;
    this.lastSequence = -1;
    this.lastSourceTime = -Infinity;
    this.continuousSourceTime = null;
    this.lastFingerprint = "";
    this.obstacleId = 0;
    return nowMs === undefined ? this.state : this.start(nowMs);
  }
  pause(reason = "Paused by operator."): GameState {
    if (this.value.phase === "countdown" || this.value.phase === "playing") {
      this.value.phase = "paused";
      this.value.reason = reason;
      this.continuousSourceTime = null;
      // An unobserved portion of a ball's flight cannot earn an entire-window dodge.
      if (this.value.obstacle) this.value.obstacle.eligibleForDodge = false;
    }
    return this.state;
  }
  resume(nowMs: number): GameState {
    if (this.value.phase !== "paused") return this.state;
    this.assertTime(nowMs);
    if (this.lastTick !== null && nowMs < this.lastTick) return this.state;
    this.value.phase = "countdown";
    this.value.reason = null;
    this.value.countdownMs = TUNING.resumeCountdownMs;
    this.lastTick = nowMs;
    return this.state;
  }
  finish(): GameState {
    if (this.value.phase !== "ready" && this.value.phase !== "results")
      this.end("completed");
    return this.state;
  }
  step(nowMs: number, frame: DodgeMotionFrame | null): GameState {
    if (["ready", "results", "paused"].includes(this.value.phase))
      return this.state;
    if (!Number.isFinite(nowMs) || nowMs < 0)
      return this.pause("Invalid game clock. Start a new round.");
    const delta = nowMs - (this.lastTick ?? nowMs);
    if (delta < 0)
      return this.pause("The game clock moved backwards. Start a new round.");
    const failure = this.inputFailure(nowMs, frame);
    if (failure) return this.pause(failure);
    if (delta > TUNING.maxStepMs)
      return this.pause("The game was interrupted. Resume when ready.");
    const input = frame!;
    const isNew = input.sequence > this.lastSequence;
    const ball = this.value.obstacle;
    const touchesDanger =
      this.value.phase === "playing" &&
      !!ball &&
      (ball.phase === "danger" ||
        (ball.phase === "clearing" && !ball.resolved) ||
        (ball.phase === "warning" && delta >= ball.remainingMs));
    if (
      touchesDanger &&
      (delta > TUNING.maxDangerGapMs ||
        nowMs - input.atMs > TUNING.maxDangerGapMs ||
        (this.continuousSourceTime !== null &&
          input.atMs - this.continuousSourceTime > TUNING.maxDangerGapMs))
    )
      return this.pause(
        "Danger needs more frequent body updates. Resume when tracking is fresh.",
      );
    this.lastTick = nowMs;
    this.epoch = input.epoch;
    this.spaceRevision = input.spaceRevision;
    this.lastSequence = input.sequence;
    this.lastSourceTime = input.atMs;
    this.continuousSourceTime = input.atMs;
    this.lastFingerprint = JSON.stringify(input);
    if (this.value.phase === "countdown") {
      this.value.countdownMs = Math.max(0, this.value.countdownMs - delta);
      if (this.value.countdownMs === 0) {
        this.value.phase = "playing";
        if (!this.value.obstacle) this.spawn(input.body);
      }
      return this.state;
    }
    const activeDelta =
      this.value.remainingMs === null
        ? delta
        : Math.min(delta, this.value.remainingMs);
    // Preserve the full source timeline even when this render step crosses the
    // timed endpoint; capping elapsed time must not pull a later pose backwards.
    const sampleTime = this.value.elapsedMs + delta - (nowMs - input.atMs);
    const sampleInRound =
      sampleTime >= 0 &&
      (this.options.mode !== "timed" || sampleTime < TUNING.roundMs);
    this.value.elapsedMs += activeDelta;
    if (this.value.remainingMs !== null) this.value.remainingMs -= activeDelta;
    // Evaluate a raw observation at its source-mapped active time, never apply a
    // late body retrospectively to the preceding danger portion of a render step.
    const obstacle = this.value.obstacle;
    if (
      isNew &&
      sampleInRound &&
      obstacle &&
      !obstacle.hit &&
      sampleTime >= obstacle.dangerAtMs &&
      sampleTime < obstacle.dangerAtMs + TUNING.dangerMs &&
      bodyCollides(input.body, obstacle)
    )
      this.registerHit(obstacle);
    if (this.value.phase === "results") return this.state;
    if (
      isNew &&
      sampleInRound &&
      obstacle &&
      !obstacle.resolved &&
      sampleTime >= obstacle.dangerAtMs + TUNING.dangerMs
    )
      this.resolveDodge(obstacle);
    this.advanceObstacle(activeDelta, input.body);
    if (this.value.remainingMs === 0) this.end("time-up");
    return this.state;
  }
  private assertTime(nowMs: number): void {
    if (!Number.isFinite(nowMs) || nowMs < 0)
      throw new Error("Game time must be finite, non-negative milliseconds.");
  }
  private inputFailure(
    nowMs: number,
    frame: DodgeMotionFrame | null,
  ): string | null {
    if (!frame) return "Waiting for fresh player input. Resume when ready.";
    if (
      frame.version !== 1 ||
      frame.slotId !== "player-1" ||
      typeof frame.epoch !== "string" ||
      !frame.epoch ||
      typeof frame.spaceRevision !== "string" ||
      !frame.spaceRevision ||
      !Number.isSafeInteger(frame.sequence) ||
      frame.sequence < 0 ||
      !Number.isFinite(frame.atMs) ||
      frame.atMs < 0 ||
      typeof frame.feetVisible !== "boolean" ||
      typeof frame.depthAvailable !== "boolean" ||
      !Array.isArray(frame.contacts) ||
      frame.contacts.length > 8
    )
      return "Invalid player input. Resume with fresh input.";
    if (
      (this.epoch !== null && frame.epoch !== this.epoch) ||
      (this.spaceRevision !== null &&
        frame.spaceRevision !== this.spaceRevision)
    )
      return "Source, player or calibration changed. Start a new round.";
    if (
      frame.sequence < this.lastSequence ||
      frame.atMs < this.lastSourceTime ||
      (frame.sequence === this.lastSequence &&
        frame.atMs !== this.lastSourceTime) ||
      (frame.sequence > this.lastSequence &&
        this.lastSequence >= 0 &&
        frame.atMs === this.lastSourceTime) ||
      (frame.sequence === this.lastSequence &&
        JSON.stringify(frame) !== this.lastFingerprint)
    )
      return "Outdated or changed player input. Resume with fresh input.";
    if (frame.atMs > nowMs)
      return "Player input is ahead of the game clock. Resume with fresh input.";
    if (nowMs - frame.atMs > TUNING.staleMs)
      return "Player input is stale. Resume when tracking is fresh.";
    if (
      this.continuousSourceTime !== null &&
      frame.atMs - this.continuousSourceTime > TUNING.staleMs
    )
      return "Player input was interrupted. Resume with fresh input.";
    if (frame.identity !== "confident")
      return "Player identity needs recovery. Rejoin before resuming.";
    if (
      !frame.feetVisible ||
      !Array.isArray(frame.body) ||
      !["left_ankle", "right_ankle"].every((name) =>
        frame.body.some(
          (point) =>
            point?.name === name &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            point.x >= 0 &&
            point.x <= 1 &&
            point.y >= 0 &&
            point.y <= 1,
        ),
      )
    )
      return "Step back — keep both feet in view.";
    if (!bodyShapes(frame.body))
      return "Keep your whole body visible. Resume with all body joints tracked.";
    const names = new Set<string>();
    for (const contact of frame.contacts) {
      if (
        !contact ||
        ![
          "left_hand",
          "right_hand",
          "left_wrist",
          "right_wrist",
          "left_hip",
          "right_hip",
          "left_foot",
          "right_foot",
        ].includes(contact.name) ||
        names.has(contact.name) ||
        !Number.isFinite(contact.x) ||
        !Number.isFinite(contact.y) ||
        contact.x < 0 ||
        contact.x > 1 ||
        contact.y < 0 ||
        contact.y > 1 ||
        (contact.towardScreenM !== undefined &&
          !Number.isFinite(contact.towardScreenM))
      )
        return "Invalid player contact. Resume with fresh input.";
      names.add(contact.name);
    }
    return null;
  }
  private random(): number {
    this.randomState = (this.randomState + 0x6d2b79f5) >>> 0;
    let value = this.randomState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }
  private spawn(body: BodyPoint[], atElapsedMs = this.value.elapsedMs): void {
    const { radius, warningMs } = TUNING[this.options.difficulty];
    const torso = bodyShapes(body)!.torso;
    const center = torso.reduce(
      (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
      { x: 0, y: 0 },
    );
    const clamp = (value: number, low: number, high: number) =>
      Math.max(low, Math.min(high, value));
    const bounds = TUNING.bounds;
    this.value.obstacle = {
      id: ++this.obstacleId,
      x: clamp(
        center.x + (this.random() - 0.5) * 0.2,
        bounds.left + radius,
        bounds.right - radius,
      ),
      y: clamp(
        center.y + (this.random() - 0.5) * 0.14,
        bounds.top + radius,
        bounds.bottom - radius,
      ),
      radius,
      phase: "warning",
      remainingMs: warningMs,
      durationMs: warningMs,
      hit: false,
      eligibleForDodge: true,
      dangerAtMs: atElapsedMs + warningMs,
      resolved: false,
    };
  }
  private registerHit(ball: DodgeObstacle): void {
    ball.hit = true;
    this.value.hits++;
    if (this.options.mode !== "practice") {
      this.value.combo = 0;
      this.value.score = Math.max(0, this.value.score - TUNING.hitPenalty);
    }
    if (
      this.options.mode === "survival" &&
      this.value.hits >= TUNING.survivalHits
    )
      this.end("out-of-lives");
  }
  private resolveDodge(ball: DodgeObstacle): void {
    ball.resolved = true;
    if (!ball.hit && ball.eligibleForDodge) {
      this.value.dodges++;
      this.value.combo++;
      this.value.bestCombo = Math.max(this.value.bestCombo, this.value.combo);
      this.value.score += 100 + 10 * Math.min(this.value.combo - 1, 10);
    }
  }
  private advanceObstacle(delta: number, body: BodyPoint[]): void {
    let remaining = delta;
    // At most two boundaries fit in maxStepMs; never spawn a backlog after a stall.
    while (this.value.obstacle && this.value.phase === "playing") {
      const ball = this.value.obstacle;
      const slice = Math.min(remaining, ball.remainingMs);
      ball.remainingMs -= slice;
      remaining -= slice;
      if (ball.remainingMs > 0) break;
      if (ball.phase === "warning") {
        ball.phase = "danger";
        ball.remainingMs = ball.durationMs = TUNING.dangerMs;
      } else if (ball.phase === "danger") {
        ball.phase = "clearing";
        ball.remainingMs = ball.durationMs = TUNING.clearingMs;
      } else this.spawn(body, this.value.elapsedMs - remaining);
      if (remaining === 0) break;
    }
  }
  private end(result: GameState["result"]): void {
    this.value.phase = "results";
    this.value.reason = null;
    this.value.countdownMs = 0;
    this.value.obstacle = null;
    this.value.result = result;
  }
}
export type ReplayCommand =
  | { type: "start" | "resume"; atMs: number }
  | { type: "restart"; atMs?: number }
  | { type: "step"; atMs: number; frame: DodgeMotionFrame | null }
  | { type: "pause"; reason?: string }
  | { type: "finish" };
export interface GameReplay {
  version: 1;
  options: Partial<GameOptions>;
  seed: number;
  commands: ReplayCommand[];
}
export function replayGame(replay: GameReplay): GameState[] {
  if (replay.version !== 1) throw new Error("Unsupported game replay version.");
  const game = new DodgeGame(replay.options, replay.seed);
  return replay.commands.map((command) => {
    switch (command.type) {
      case "start":
        return game.start(command.atMs);
      case "step":
        return game.step(command.atMs, command.frame);
      case "pause":
        return game.pause(command.reason);
      case "resume":
        return game.resume(command.atMs);
      case "restart":
        return game.restart(command.atMs);
      case "finish":
        return game.finish();
    }
  });
}
