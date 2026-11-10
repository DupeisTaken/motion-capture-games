import type {
  ContactName,
  GameMotionFrame,
  MotionContact,
} from "../../../packages/motion/src/index";

export type GameMode = "timed" | "challenge" | "survival" | "practice";
export type Interaction = "touch" | "flick" | "push";
export type Difficulty = "easy" | "normal" | "hard";
export type GamePhase =
  "ready" | "countdown" | "playing" | "paused" | "results";
export interface ReachArea {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface GameOptions {
  mode: GameMode;
  interaction: Interaction;
  difficulty: Difficulty;
  reachArea: ReachArea;
}

/** Proposed game tuning; these values have not been calibrated on participants. */
export const TUNING = Object.freeze({
  roundMs: 60_000,
  challengeHits: 15,
  survivalMisses: 3,
  startCountdownMs: 3_000,
  resumeCountdownMs: 2_000,
  staleMs: 350,
  maxStepMs: 400,
  pushNeutralM: 0.04,
  pushHitM: 0.12,
  flick: Object.freeze({
    // Normalized image distances and source milliseconds; participant tuning is open.
    minimumTravel: 0.018,
    minimumSpeedPerSecond: 0.35,
    maximumTravel: 0.12,
    windowMs: 120,
    settleRadius: 0.008,
    settleMs: 180,
    reachPadding: 0.035,
    maximumSamples: 16,
  }),
  hardCandidates: 32,
  easy: Object.freeze({ radius: 0.065, lifetimeMs: 3_600 }),
  normal: Object.freeze({ radius: 0.052, lifetimeMs: 2_500 }),
  hard: Object.freeze({ radius: 0.04, lifetimeMs: 1_700 }),
});

export const DEFAULT_OPTIONS: Readonly<GameOptions> = Object.freeze({
  mode: "timed",
  interaction: "touch",
  difficulty: "normal",
  reachArea: Object.freeze({ x: 0.12, y: 0.16, width: 0.76, height: 0.68 }),
});

export interface MoleTarget {
  id: number;
  x: number;
  y: number;
  radius: number;
  remainingMs: number;
}
export type GameResult =
  "completed" | "challenge-won" | "time-up" | "out-of-lives";
export interface GameState {
  phase: GamePhase;
  reason: string | null;
  options: GameOptions;
  score: number;
  hits: number;
  misses: number;
  combo: number;
  bestCombo: number;
  elapsedMs: number;
  remainingMs: number | null;
  countdownMs: number;
  target: MoleTarget | null;
  result: GameResult | null;
}

export interface GameReadiness {
  ready: boolean;
  reason: string | null;
  requiresNewRound: boolean;
}

const CONTACTS: readonly ContactName[] = [
  "left_hand",
  "right_hand",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_foot",
  "right_foot",
];

function eligible(contact: MotionContact, interaction: Interaction): boolean {
  if (interaction === "flick") return /_(hand|wrist)$/.test(contact.name);
  return interaction === "touch"
    ? !contact.name.endsWith("_hip")
    : !contact.name.endsWith("_foot") && Number.isFinite(contact.towardScreenM);
}

function group(name: ContactName): string {
  return name.replace(/_(hand|wrist)$/, "_upper");
}

function overlaps(contact: MotionContact, target: MoleTarget): boolean {
  return (
    Math.hypot(contact.x - target.x, contact.y - target.y) <= target.radius
  );
}

interface FlickSample {
  x: number;
  y: number;
  atMs: number;
}
interface FlickHistory {
  name: ContactName;
  samples: FlickSample[];
  settledAt: number;
  origin: FlickSample;
  armed: boolean;
}
interface FlickPath {
  from: FlickSample;
  to: FlickSample;
}

function flickOverlaps({ from, to }: FlickPath, target: MoleTarget): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const along = Math.max(
    0,
    Math.min(
      1,
      ((target.x - from.x) * dx + (target.y - from.y) * dy) /
        (dx * dx + dy * dy),
    ),
  );
  return (
    Math.hypot(
      from.x + along * dx - target.x,
      from.y + along * dy - target.y,
    ) <=
    target.radius + TUNING.flick.reachPadding
  );
}

function validOptions(options: GameOptions): boolean {
  const area = options.reachArea;
  const radius = TUNING[options.difficulty]?.radius;
  return (
    ["timed", "challenge", "survival", "practice"].includes(options.mode) &&
    ["touch", "flick", "push"].includes(options.interaction) &&
    ["easy", "normal", "hard"].includes(options.difficulty) &&
    !!area &&
    [area.x, area.y, area.width, area.height].every(Number.isFinite) &&
    area.x >= 0 &&
    area.y >= 0 &&
    area.width > 2 * radius &&
    area.height > 2 * radius &&
    area.x + area.width <= 1 &&
    area.y + area.height <= 1
  );
}

function initialState(options: GameOptions): GameState {
  return {
    phase: "ready",
    reason: null,
    options,
    score: 0,
    hits: 0,
    misses: 0,
    combo: 0,
    bestCombo: 0,
    elapsedMs: 0,
    remainingMs:
      options.mode === "timed" || options.mode === "challenge"
        ? TUNING.roundMs
        : null,
    countdownMs: 0,
    target: null,
    result: null,
  };
}

/** Pure game simulation. Source coordinates remain unmirrored until presentation. */
export class MoleGame {
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
  private previous = new Map<ContactName, MotionContact>();
  private pushArmed = new Set<string>();
  private flickHistory = new Map<string, FlickHistory>();
  private targetId = 0;

  constructor(options: Partial<GameOptions> = {}, seed = 42) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      reachArea: { ...(options.reachArea ?? DEFAULT_OPTIONS.reachArea) },
    };
    if (!validOptions(this.options)) throw new Error("Invalid game options.");
    if (!Number.isSafeInteger(seed))
      throw new Error("Seed must be an integer.");
    this.seed = seed >>> 0;
    this.randomState = this.seed;
    this.value = initialState(this.options);
  }

  get state(): GameState {
    // Consumers cannot mutate simulation or configuration through a UI snapshot.
    return structuredClone(this.value);
  }

  /** Presentation can explain a blocked action without advancing or resuming play. */
  readiness(nowMs: number, frame: GameMotionFrame | null): GameReadiness {
    const clockChanged =
      !Number.isFinite(nowMs) ||
      nowMs < 0 ||
      (this.lastTick !== null && nowMs < this.lastTick);
    const sourceChanged =
      !!frame &&
      ((this.epoch !== null && frame.epoch !== this.epoch) ||
        (this.spaceRevision !== null &&
          frame.spaceRevision !== this.spaceRevision));
    const reason = clockChanged
      ? "The game clock changed. Start a new round."
      : this.inputFailure(nowMs, frame);
    return {
      ready: reason === null,
      reason,
      requiresNewRound: clockChanged || sourceChanged,
    };
  }

  start(nowMs: number): GameState {
    if (this.value.phase !== "ready") return this.state;
    this.assertTime(nowMs);
    this.value.phase = "countdown";
    this.value.countdownMs = TUNING.startCountdownMs;
    this.lastTick = nowMs;
    return this.state;
  }

  restart(nowMs: number): GameState {
    this.assertTime(nowMs);
    this.value = initialState(this.options);
    this.randomState = this.seed;
    this.lastTick = null;
    this.epoch = null;
    this.spaceRevision = null;
    this.lastSequence = -1;
    this.lastSourceTime = -Infinity;
    this.targetId = 0;
    this.clearGestures();
    return this.start(nowMs);
  }

  pause(reason = "Paused by operator"): GameState {
    if (this.value.phase === "playing" || this.value.phase === "countdown") {
      this.value.phase = "paused";
      this.value.reason = reason;
      this.clearGestures();
    }
    return this.state;
  }

  resume(nowMs: number): GameState {
    if (this.value.phase !== "paused") return this.state;
    this.assertTime(nowMs);
    if (this.lastTick !== null && nowMs < this.lastTick)
      return this.pause("The game clock moved backwards. Start a new round.");
    this.value.phase = "countdown";
    this.value.countdownMs = TUNING.resumeCountdownMs;
    this.value.reason = null;
    this.lastTick = nowMs;
    this.clearGestures();
    return this.state;
  }

  /** Practice and any active round can be explicitly ended without a miss. */
  finish(): GameState {
    if (this.value.phase !== "ready" && this.value.phase !== "results")
      this.end("completed");
    return this.state;
  }

  update(nowMs: number, frame: GameMotionFrame | null): GameState {
    if (this.value.phase === "ready" || this.value.phase === "results")
      return this.state;
    if (!Number.isFinite(nowMs) || nowMs < 0)
      return this.pause("Invalid game clock. Start a new round.");
    const previousTick = this.lastTick ?? nowMs;
    if (nowMs < previousTick)
      return this.pause("The game clock moved backwards. Start a new round.");
    if (this.value.phase === "paused") return this.state;

    const invalid = this.inputFailure(nowMs, frame);
    if (invalid) return this.pause(invalid);
    // inputFailure guarantees the full structural and temporal frame contract.
    const input = frame!;
    const delta = nowMs - previousTick;
    if (delta > TUNING.maxStepMs)
      return this.pause("The game was interrupted. Resume when ready.");
    this.lastTick = nowMs;
    const isNew = input.sequence > this.lastSequence;
    if (isNew) {
      this.epoch = input.epoch;
      this.spaceRevision = input.spaceRevision;
      this.lastSequence = input.sequence;
      this.lastSourceTime = input.atMs;
      this.continuousSourceTime = input.atMs;
    }
    const contacts = input.contacts.filter((contact) =>
      eligible(contact, this.options.interaction),
    );
    // Consume gestures even during countdown or an expired target; never defer a hit.
    const flicks =
      isNew && this.options.interaction === "flick"
        ? this.detectFlicks(contacts, input.atMs)
        : [];

    if (this.value.phase === "countdown") {
      this.value.countdownMs = Math.max(0, this.value.countdownMs - delta);
      if (this.value.countdownMs === 0) {
        this.value.phase = "playing";
        if (!this.value.target) this.spawn(contacts);
      }
      // Countdown gives feedback but never scores, including its final sample.
      if (isNew) this.remember(contacts);
      return this.state;
    }

    this.value.elapsedMs += delta;
    if (this.value.remainingMs !== null) {
      this.value.remainingMs = Math.max(
        0,
        TUNING.roundMs - this.value.elapsedMs,
      );
      if (this.value.remainingMs === 0) {
        this.end("time-up");
        return this.state;
      }
    }
    const target = this.value.target!;
    target.remainingMs -= delta;
    if (target.remainingMs <= 0) {
      if (this.options.mode !== "practice") this.value.misses++;
      this.value.combo = 0;
      if (
        this.options.mode === "survival" &&
        this.value.misses >= TUNING.survivalMisses
      ) {
        this.end("out-of-lives");
      } else this.spawn(contacts);
      if (isNew) this.remember(contacts);
      return this.state;
    }
    if (isNew) {
      if (this.hit(contacts, target, flicks)) {
        this.value.hits++;
        this.value.combo++;
        this.value.bestCombo = Math.max(this.value.bestCombo, this.value.combo);
        this.value.score += 100 + 10 * Math.min(this.value.combo - 1, 10);
        if (
          this.options.mode === "challenge" &&
          this.value.hits >= TUNING.challengeHits
        ) {
          this.end("challenge-won");
        } else this.spawn(contacts);
      }
      this.remember(contacts);
    }
    return this.state;
  }

  private assertTime(nowMs: number): void {
    if (!Number.isFinite(nowMs) || nowMs < 0)
      throw new Error("Game time must be finite, non-negative milliseconds.");
  }

  private inputFailure(
    nowMs: number,
    frame: GameMotionFrame | null,
  ): string | null {
    if (!frame) return "Waiting for fresh player input.";
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
      !Array.isArray(frame.contacts) ||
      frame.contacts.length > CONTACTS.length ||
      typeof frame.feetVisible !== "boolean" ||
      typeof frame.depthAvailable !== "boolean"
    )
      return "Invalid player input. Check the source input.";
    if (
      (this.epoch !== null && frame.epoch !== this.epoch) ||
      (this.spaceRevision !== null &&
        frame.spaceRevision !== this.spaceRevision)
    )
      return "Source or calibration changed. Start a new round.";
    if (
      frame.sequence < this.lastSequence ||
      frame.atMs < this.lastSourceTime ||
      (frame.sequence === this.lastSequence &&
        frame.atMs !== this.lastSourceTime) ||
      (frame.sequence > this.lastSequence &&
        this.lastSequence >= 0 &&
        frame.atMs === this.lastSourceTime)
    )
      return "Outdated player input. Wait for fresh input.";
    if (frame.atMs > nowMs)
      return "Player input is ahead of the game clock. Wait for fresh input.";
    if (nowMs - frame.atMs > TUNING.staleMs)
      return "Player input is stale. Wait for fresh tracking.";
    if (
      this.continuousSourceTime !== null &&
      frame.atMs - this.continuousSourceTime > TUNING.staleMs
    )
      return "Player input was interrupted. Wait for fresh input.";
    if (frame.identity !== "confident")
      return "Player identity needs recovery. Rejoin before resuming.";
    if (!frame.feetVisible) return "Step back — keep both feet in view.";
    if (this.options.interaction === "push" && !frame.depthAvailable)
      return "Push needs toward-screen depth. Use touch or synthetic rehearsal.";
    const names = new Set<string>();
    for (const contact of frame.contacts) {
      if (
        !contact ||
        !CONTACTS.includes(contact.name) ||
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
        return "Invalid player contact. Check the source input.";
      names.add(contact.name);
    }
    if (
      !frame.contacts.some((contact) =>
        eligible(contact, this.options.interaction),
      )
    )
      return this.options.interaction === "flick"
        ? "Keep a hand or wrist visible to flick."
        : this.options.interaction === "touch"
          ? "Keep a hand or foot visible."
          : "Keep a depth-enabled hand, wrist or hip visible.";
    return null;
  }

  private random(): number {
    // Mulberry32 is compact, stable across JS hosts and explicitly seedable.
    this.randomState = (this.randomState + 0x6d2b79f5) >>> 0;
    let value = this.randomState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  private spawn(contacts: MotionContact[]): void {
    const { radius, lifetimeMs } = TUNING[this.options.difficulty];
    const area = this.options.reachArea;
    const candidates =
      this.options.difficulty === "hard" ? TUNING.hardCandidates : 1;
    let best: MoleTarget | null = null;
    let bestDistance = -Infinity;
    for (let index = 0; index < candidates; index++) {
      const candidate: MoleTarget = {
        id: this.targetId + 1,
        x: area.x + radius + this.random() * (area.width - radius * 2),
        y: area.y + radius + this.random() * (area.height - radius * 2),
        radius,
        remainingMs: lifetimeMs,
      };
      const distance = Math.min(
        ...contacts.map((contact) =>
          Math.hypot(contact.x - candidate.x, contact.y - candidate.y),
        ),
      );
      if (best === null || distance > bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    this.targetId++;
    this.value.target = best;
  }

  private detectFlicks(contacts: MotionContact[], atMs: number): FlickPath[] {
    const paths: FlickPath[] = [];
    const grouped = new Map<string, MotionContact>();
    for (const contact of contacts) {
      const key = group(contact.name);
      // A provider may supply both aliases; prefer the wrist consistently.
      if (!grouped.has(key) || contact.name.endsWith("_wrist"))
        grouped.set(key, contact);
    }
    for (const key of this.flickHistory.keys())
      if (!grouped.has(key)) this.flickHistory.delete(key);
    const tuning = TUNING.flick;
    for (const [key, contact] of grouped) {
      const sample = { x: contact.x, y: contact.y, atMs };
      let history = this.flickHistory.get(key);
      if (
        !history ||
        history.name !== contact.name ||
        atMs - history.samples.at(-1)!.atMs > tuning.windowMs
      ) {
        history = {
          name: contact.name,
          samples: [],
          settledAt: atMs,
          origin: sample,
          armed: false,
        };
        this.flickHistory.set(key, history);
      }
      if (
        Math.hypot(sample.x - history.origin.x, sample.y - history.origin.y) >
        tuning.settleRadius
      ) {
        history.origin = sample;
        history.settledAt = atMs;
      }
      if (atMs - history.settledAt >= tuning.settleMs) history.armed = true;
      history.samples = history.samples.filter(
        (old) => atMs - old.atMs <= tuning.windowMs,
      );
      if (history.armed) {
        const from = history.samples.find((old) => {
          const distance = Math.hypot(sample.x - old.x, sample.y - old.y);
          return (
            distance >= tuning.minimumTravel &&
            (distance * 1000) / (atMs - old.atMs) >=
              tuning.minimumSpeedPerSecond
          );
        });
        if (from) {
          // A miss or tracking jump also consumes the cycle until the hand settles.
          history.armed = false;
          history.origin = sample;
          history.settledAt = atMs;
          if (
            Math.hypot(sample.x - from.x, sample.y - from.y) <=
            tuning.maximumTravel
          )
            paths.push({ from, to: sample });
        }
      }
      history.samples.push(sample);
      history.samples = history.samples.slice(-tuning.maximumSamples);
    }
    return paths;
  }

  private hit(
    contacts: MotionContact[],
    target: MoleTarget,
    flicks: FlickPath[],
  ): boolean {
    if (this.options.interaction === "flick")
      return flicks.some((path) => flickOverlaps(path, target));
    for (const contact of contacts) {
      const previous = this.previous.get(contact.name);
      const key = group(contact.name);
      if (!previous || !overlaps(contact, target)) continue;
      if (this.options.interaction === "touch") {
        // Aliases of the same limb cannot manufacture another entry transition.
        const wasInside = [...this.previous.values()].some(
          (old) => group(old.name) === key && overlaps(old, target),
        );
        if (!wasInside) return true;
      } else if (
        this.pushArmed.has(key) &&
        previous.towardScreenM! < TUNING.pushHitM &&
        contact.towardScreenM! >= TUNING.pushHitM
      ) {
        this.pushArmed.delete(key);
        return true;
      }
    }
    return false;
  }

  private remember(contacts: MotionContact[]): void {
    const grouped = new Map<string, MotionContact[]>();
    for (const contact of contacts) {
      const key = group(contact.name);
      const values = grouped.get(key) ?? [];
      values.push(contact);
      grouped.set(key, values);
    }
    // Losing a limb breaks its gesture. Reappearing already extended cannot hit.
    for (const key of this.pushArmed)
      if (!grouped.has(key)) this.pushArmed.delete(key);
    if (this.options.interaction === "push") {
      for (const [key, values] of grouped) {
        if (
          values.every(
            (contact) => contact.towardScreenM! <= TUNING.pushNeutralM,
          )
        )
          this.pushArmed.add(key);
        // A forward gesture consumes its cycle even when it misses a target.
        else if (
          values.some((contact) => contact.towardScreenM! >= TUNING.pushHitM)
        )
          this.pushArmed.delete(key);
      }
    }
    this.previous = new Map(
      contacts.map((contact) => [contact.name, { ...contact }]),
    );
  }

  private clearGestures(): void {
    this.previous.clear();
    this.pushArmed.clear();
    this.flickHistory.clear();
    this.continuousSourceTime = null;
  }

  private end(result: GameResult): void {
    this.value.phase = "results";
    this.value.reason = null;
    this.value.countdownMs = 0;
    this.value.target = null;
    this.value.result = result;
    this.clearGestures();
  }
}

export type ReplayCommand =
  | { type: "start" | "resume" | "restart"; atMs: number }
  | { type: "update"; atMs: number; frame: GameMotionFrame | null }
  | { type: "pause"; reason?: string }
  | { type: "finish" };
export interface GameReplay {
  version: 1;
  options: Partial<GameOptions>;
  seed: number;
  commands: ReplayCommand[];
}

/** Replay has no camera/model dependency and uses the exact same simulation API. */
export function replayGame(replay: GameReplay): GameState[] {
  if (replay.version !== 1) throw new Error("Unsupported game replay version.");
  const game = new MoleGame(replay.options, replay.seed);
  return replay.commands.map((command) => {
    switch (command.type) {
      case "start":
        return game.start(command.atMs);
      case "update":
        return game.update(command.atMs, command.frame);
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
