import { describe, expect, it } from "vitest";
import {
  DodgeGame,
  TUNING,
  bodyShapes,
  bodyCollides,
  replayGame,
  type GameOptions,
  type GameState,
  type ReplayCommand,
  type GameReplay,
} from "../../games/dodgeball/src/index";
import {
  syntheticBody,
  type DodgeMotionFrame,
} from "../../packages/motion/src/dodgeball-input";

function input(atMs: number, sequence: number): DodgeMotionFrame {
  return {
    version: 1,
    epoch: "synthetic-round-1",
    sequence,
    atMs,
    slotId: "player-1",
    identity: "confident",
    feetVisible: true,
    depthAvailable: false,
    contacts: [],
    spaceRevision: "synthetic-track-1",
    body: syntheticBody(),
  };
}
class Play {
  readonly game: DodgeGame;
  now = 0;
  sequence = 0;
  body = syntheticBody();
  commands: ReplayCommand[] = [];
  constructor(
    readonly options: Partial<GameOptions> = {},
    readonly seed = 42,
  ) {
    this.game = new DodgeGame(options, seed);
  }
  tick(delta = 50, changes: Partial<DodgeMotionFrame> = {}): GameState {
    this.now += delta;
    const frame = {
      ...input(this.now, ++this.sequence),
      body: structuredClone(this.body),
      ...changes,
    };
    this.commands.push({ type: "step", atMs: this.now, frame });
    return this.game.step(this.now, frame);
  }
  advance(ms: number): GameState {
    let state = this.game.state;
    while (ms > 0) {
      const delta = Math.min(50, ms);
      state = this.tick(delta);
      ms -= delta;
    }
    return state;
  }
  start(): GameState {
    this.commands.push({ type: "start", atMs: this.now });
    this.game.start(this.now);
    this.tick(0);
    return this.advance(TUNING.startCountdownMs);
  }
  avoid(): void {
    const ball = this.game.state.obstacle!;
    this.body = syntheticBody(ball.x < 0.5 ? 0.82 : 0.18);
  }
  contact(): void {
    const ball = this.game.state.obstacle!;
    // Put the center of the broad torso directly over the ball.
    this.body = syntheticBody(ball.x, ball.y + 0.06);
  }
  resolve(dodge: boolean): GameState {
    if (dodge) this.avoid();
    else this.contact();
    const ball = this.game.state.obstacle!;
    this.advance(ball.remainingMs + TUNING.dangerMs);
    return this.game.state;
  }
  next(): void {
    this.advance(TUNING.clearingMs);
  }
}

describe("Dodgeball lifecycle and scoring", () => {
  it("requires explicit start and observes the entire warning before danger", () => {
    const play = new Play();
    expect(play.game.step(0, input(0, 1)).phase).toBe("ready");
    play.game.start(0);
    expect(play.advance(2_999).obstacle).toBeNull();
    const state = play.tick(1);
    expect(state.phase).toBe("playing");
    expect(state.obstacle).toMatchObject({
      phase: "warning",
      remainingMs: TUNING.normal.warningMs,
    });
    play.contact();
    play.advance(TUNING.normal.warningMs - 1);
    expect(play.game.state.hits).toBe(0);
    expect(play.tick(1).hits).toBe(1);
  });
  it("awards a dodge only after the whole danger window and caps combo bonuses", () => {
    const play = new Play({ mode: "practice" });
    play.start();
    for (let n = 1; n <= 13; n++) {
      play.avoid();
      play.advance(play.game.state.obstacle!.remainingMs + TUNING.dangerMs - 1);
      expect(play.game.state.dodges).toBe(n - 1);
      expect(play.tick(1).dodges).toBe(n);
      expect(play.game.state.obstacle?.phase).toBe("clearing");
      play.next();
    }
    expect(play.game.state.bestCombo).toBe(13);
    expect(play.game.state.score).toBe(2050);
  });
  it("registers only one contact per ball and penalties reset combo without a negative score", () => {
    const play = new Play();
    play.start();
    play.resolve(true);
    expect(play.game.state.score).toBe(100);
    play.next();
    const hit = play.resolve(false);
    expect(hit).toMatchObject({
      score: 50,
      hits: 1,
      combo: 0,
      bestCombo: 1,
      dodges: 1,
    });
    play.advance(400);
    expect(play.game.state.hits).toBe(1);
    play.advance(100);
    play.resolve(false);
    expect(play.game.state.score).toBe(0);
  });
  it("timed rounds end at 60 active seconds, while survival ends on contact three", () => {
    const timed = new Play();
    timed.start();
    timed.advance(60_000);
    expect(timed.game.state).toMatchObject({
      elapsedMs: 60_000,
      remainingMs: 0,
      result: "time-up",
      obstacle: null,
    });
    const survival = new Play({ mode: "survival" });
    survival.start();
    for (let n = 0; n < 3; n++) {
      survival.resolve(false);
      if (n < 2) survival.next();
    }
    expect(survival.game.state).toMatchObject({
      hits: 3,
      result: "out-of-lives",
      obstacle: null,
      remainingMs: null,
    });
  });
  it.each(["easy", "normal", "hard"] as const)(
    "%s finishes an overshooting timed step with fresh or delayed source input",
    (difficulty) => {
      for (const delayed of [false, true]) {
        const play = new Play({ difficulty });
        play.start();
        play.advance(TUNING.roundMs - 50);
        const before = play.game.state;
        play.contact();
        // A fresh source pose is 50ms after the round; the delayed pose was
        // observed 1ms before its end. Shipped cycles put both outside danger.
        const changes = delayed ? { atMs: play.now + 49 } : {};
        const result = play.tick(100, changes);
        expect(result).toMatchObject({
          phase: "results",
          result: "time-up",
          elapsedMs: TUNING.roundMs,
          remainingMs: 0,
          obstacle: null,
          score: before.score,
          hits: before.hits,
          dodges: before.dodges,
        });
        expect(play.tick(50)).toEqual(result);
      }
    },
  );
  it("practice records feedback contacts without score/combo penalties and can be ended", () => {
    const play = new Play({ mode: "practice" });
    play.start();
    play.resolve(true);
    play.next();
    play.resolve(false);
    expect(play.game.state).toMatchObject({
      hits: 1,
      score: 100,
      combo: 1,
      remainingMs: null,
    });
    play.advance(65_000);
    expect(play.game.state.phase).toBe("playing");
    expect(play.game.finish()).toMatchObject({
      phase: "results",
      result: "completed",
      obstacle: null,
    });
  });
  it("snapshots and restart cannot mutate live state or lose seeded reproducibility", () => {
    const play = new Play();
    const first = play.start();
    const saved = structuredClone(first.obstacle);
    first.obstacle!.x = 99;
    first.options.mode = "practice";
    first.score = 999;
    expect(play.game.state.obstacle).toEqual(saved);
    expect(play.game.state.options.mode).toBe("timed");
    play.game.finish();
    expect(play.game.restart().phase).toBe("ready");
    play.start();
    expect(play.game.state.obstacle).toEqual(saved);
  });
});

describe("authoritative body collision geometry", () => {
  it("covers head, torso interior, upper/lower arms and upper/lower legs", () => {
    const body = syntheticBody();
    for (const [x, y] of [
      [0.5, 0.2],
      [0.5, 0.42],
      [0.385, 0.36],
      [0.34, 0.47],
      [0.43, 0.65],
      [0.42, 0.8],
    ])
      expect(
        bodyCollides(body, { x, y, radius: 0.001 }),
        `body point ${x},${y}`,
      ).toBe(true);
    expect(bodyCollides(body, { x: 0.05, y: 0.5, radius: 0.08 })).toBe(false);
    const shapes = bodyShapes(body)!;
    expect(shapes.head.radius).toBe(TUNING.headRadius);
    expect(shapes.torso).toHaveLength(4);
    expect(
      shapes.limbs.every(({ radius }) => radius === TUNING.limbRadius),
    ).toBe(true);
  });
  it("includes tangent boundaries and supports zero-length limb capsules safely", () => {
    const body = syntheticBody();
    const nose = body[0];
    expect(
      bodyCollides(body, { x: nose.x, y: nose.y - 0.05, radius: 0.005 }),
    ).toBe(true);
    const collapsed = body.map((point) => ({ ...point, x: 0.5, y: 0.5 }));
    expect(bodyCollides(collapsed, { x: 0.5, y: 0.5, radius: 0.01 })).toBe(
      true,
    );
  });
  it("never exposes a reduced collider for missing, duplicate or malformed body points", () => {
    const body = syntheticBody();
    expect(bodyShapes(body.slice(1))).toBeNull();
    expect(bodyShapes([...body.slice(1), body[1]])).toBeNull();
    expect(
      bodyShapes(body.map((point, n) => (n ? point : { ...point, x: NaN }))),
    ).toBeNull();
  });
});

describe("fair pause and source continuity", () => {
  it("uses source sample times at exact danger boundaries without retrospective hits", () => {
    const late = new Play();
    late.start();
    late.avoid();
    late.advance(TUNING.normal.warningMs + TUNING.dangerMs - 50);
    late.contact();
    late.tick(100);
    expect(late.game.state).toMatchObject({ hits: 0, dodges: 1 });
    const first = new Play();
    first.start();
    first.avoid();
    first.advance(TUNING.normal.warningMs - 1);
    first.contact();
    first.tick(1);
    expect(first.game.state.hits).toBe(1);
    const last = new Play();
    last.start();
    last.avoid();
    last.advance(TUNING.normal.warningMs + TUNING.dangerMs - 2);
    last.contact();
    last.tick(1);
    expect(last.game.state.hits).toBe(1);
    const end = new Play();
    end.start();
    end.avoid();
    end.advance(TUNING.normal.warningMs + TUNING.dangerMs - 1);
    end.contact();
    end.tick(1);
    expect(end.game.state).toMatchObject({ hits: 0, dodges: 1 });
  });
  it("waits for a post-danger source sample before awarding and includes delayed final contacts", () => {
    for (const contact of [false, true]) {
      const play = new Play();
      play.start();
      play.avoid();
      play.advance(TUNING.normal.warningMs + TUNING.dangerMs - 100);
      if (contact) play.contact();
      const delayedAtMs = play.now + 50;
      play.tick(100, { atMs: delayedAtMs });
      expect(play.game.state.obstacle?.phase).toBe("clearing");
      expect(play.game.state.dodges).toBe(0);
      expect(play.game.state.hits).toBe(contact ? 1 : 0);
      play.avoid();
      play.tick(50);
      expect(play.game.state.hits).toBe(contact ? 1 : 0);
      expect(play.game.state.dodges).toBe(contact ? 0 : 1);
      expect(play.game.state.score).toBe(contact ? 0 : 100);
    }
  });
  it("keeps the strict source-coverage gate until a post-danger sample resolves the ball", () => {
    const play = new Play();
    play.start();
    play.avoid();
    play.advance(TUNING.normal.warningMs + TUNING.dangerMs - 100);
    const cached = play.commands.at(-1)!;
    if (cached.type !== "step") throw new Error("Missing frame");
    play.now += 100;
    play.game.step(play.now, cached.frame);
    expect(play.game.state.obstacle).toMatchObject({
      phase: "clearing",
      resolved: false,
    });
    expect(play.tick(300, { atMs: play.now + 200 }).phase).toBe("paused");
    expect(play.game.state.dodges).toBe(0);
  });
  it.each([
    ["feet", { feetVisible: false }, "Step back — keep both feet in view."],
    ["identity", { identity: "uncertain" }, "identity"],
    ["missing identity", { identity: "missing" }, "identity"],
    [
      "body",
      { body: syntheticBody().filter(({ name }) => name !== "left_elbow") },
      "whole body",
    ],
    [
      "false feet claim",
      { body: syntheticBody().filter(({ name }) => name !== "left_ankle") },
      "Step back",
    ],
    ["source", { epoch: "new" }, "new round"],
    ["track or calibration", { spaceRevision: "new" }, "new round"],
  ])(
    "%s freezes the round and ball without transferring scores",
    (_, changes, reason) => {
      const play = new Play();
      play.start();
      const before = play.game.state;
      const after = play.tick(50, changes as Partial<DodgeMotionFrame>);
      expect(after.phase).toBe("paused");
      expect(after.reason).toContain(reason as string);
      expect(after.elapsedMs).toBe(before.elapsedMs);
      expect(after.score).toBe(before.score);
      expect(after.obstacle).toEqual({
        ...before.obstacle,
        eligibleForDodge: false,
      });
      play.advance(10_000);
      expect(play.game.state.elapsedMs).toBe(before.elapsedMs);
    },
  );
  it("requires explicit countdown recovery, preserves warning and voids an interrupted dodge", () => {
    const play = new Play();
    play.start();
    play.avoid();
    play.advance(300);
    const before = play.game.state.obstacle!;
    play.tick(50, { feetVisible: false });
    play.advance(20_000);
    play.game.resume(play.now);
    play.advance(TUNING.resumeCountdownMs - 1);
    expect(play.game.state.phase).toBe("countdown");
    play.tick(1);
    expect(play.game.state.obstacle).toEqual({
      ...before,
      eligibleForDodge: false,
    });
    play.advance(before.remainingMs + TUNING.dangerMs);
    expect(play.game.state.dodges).toBe(0);
    play.next();
    play.resolve(true);
    expect(play.game.state.dodges).toBe(1);
  });
  it("source/track changes require a new round even after explicit resume", () => {
    const play = new Play();
    play.start();
    play.tick(50, { epoch: "new" });
    play.game.resume(play.now);
    expect(play.tick(50, { epoch: "new" }).phase).toBe("paused");
    play.game.restart(play.now);
    expect(play.tick(50, { epoch: "new" }).phase).toBe("countdown");
  });
  it("does not rejuvenate cached source age, skip danger during a stall or catch up time", () => {
    const cached = new Play();
    cached.start();
    const last = cached.commands.at(-1)!;
    if (last.type !== "step") throw new Error("Missing frame");
    expect(cached.game.step(cached.now + 100, last.frame).phase).toBe(
      "playing",
    );
    expect(cached.game.step(cached.now + 351, last.frame).reason).toContain(
      "stale",
    );
    const stall = new Play();
    stall.start();
    const before = stall.game.state;
    expect(stall.tick(30_000).phase).toBe("paused");
    expect(stall.game.state.elapsedMs).toBe(before.elapsedMs);
    const danger = new Play();
    danger.start();
    danger.avoid();
    danger.advance(TUNING.normal.warningMs - 100);
    const frozen = danger.game.state;
    expect(danger.tick(350).phase).toBe("paused");
    expect(danger.game.state.dodges).toBe(0);
    expect(danger.game.state.elapsedMs).toBe(frozen.elapsedMs);
  });
  it("rejects stale, future, reset and changed samples and backwards game clocks", () => {
    const cases: Array<(play: Play) => Partial<DodgeMotionFrame>> = [
      (play) => ({ atMs: play.now - 1_000 }),
      (play) => ({ atMs: play.now + 1_000 }),
      () => ({ sequence: 0 }),
      (play) => ({ atMs: play.now - 100 }),
      (play) => ({ sequence: play.sequence, atMs: play.now + 50 }),
    ];
    for (const changes of cases) {
      const play = new Play();
      play.start();
      expect(play.tick(50, changes(play)).phase).toBe("paused");
      expect(play.game.state.elapsedMs).toBe(0);
    }
    const play = new Play();
    play.start();
    expect(play.game.step(play.now - 1, input(play.now - 1, 99)).phase).toBe(
      "paused",
    );
    play.game.restart(play.now);
    play.advance(TUNING.startCountdownMs);
    expect(play.game.step(play.now + 1, null).phase).toBe("paused");
  });
  it.each([
    { version: 2 },
    { slotId: "spectator" },
    { epoch: "" },
    { spaceRevision: "" },
    { sequence: 1.5 },
    { atMs: NaN },
    { feetVisible: "true" },
    {
      body: syntheticBody().map((point, n) =>
        n ? point : { ...point, x: Infinity },
      ),
    },
    {
      body: syntheticBody().map((point, n) =>
        n ? point : { ...point, y: -0.1 },
      ),
    },
    { body: [...syntheticBody().slice(1), syntheticBody()[1]] },
    { contacts: [{ name: "nose", x: 0.5, y: 0.5 }] },
    { contacts: [{ name: "left_wrist", x: NaN, y: 0.5 }] },
  ])("rejects malformed input %j", (changes) => {
    const play = new Play();
    play.start();
    expect(play.tick(50, changes as Partial<DodgeMotionFrame>).phase).toBe(
      "paused",
    );
    expect(play.game.state.score).toBe(0);
  });
});

describe("placement, configuration and deterministic replay", () => {
  it.each(["easy", "normal", "hard"] as const)(
    "%s keeps stationary full footprints within safe bounds",
    (difficulty) => {
      const play = new Play({ mode: "practice", difficulty });
      play.start();
      for (let n = 0; n < 30; n++) {
        const ball = play.game.state.obstacle!;
        expect(ball.x - ball.radius).toBeGreaterThanOrEqual(
          TUNING.bounds.left - 1e-10,
        );
        expect(ball.x + ball.radius).toBeLessThanOrEqual(
          TUNING.bounds.right + 1e-10,
        );
        expect(ball.y - ball.radius).toBeGreaterThanOrEqual(
          TUNING.bounds.top - 1e-10,
        );
        expect(ball.y + ball.radius).toBeLessThanOrEqual(
          TUNING.bounds.bottom + 1e-10,
        );
        play.avoid();
        play.advance(ball.remainingMs);
        expect(play.game.state.obstacle).toMatchObject({
          x: ball.x,
          y: ball.y,
          radius: ball.radius,
          phase: "danger",
        });
        play.advance(TUNING.dangerMs);
        expect(play.game.state.hits).toBe(0);
        play.next();
      }
    },
  );
  it("rejects invalid options, noninteger seeds and invalid command times", () => {
    for (const options of [{ mode: "challenge" }, { difficulty: "impossible" }])
      expect(() => new DodgeGame(options as Partial<GameOptions>)).toThrow(
        "options",
      );
    for (const seed of [NaN, Infinity, 0.5])
      expect(() => new DodgeGame({}, seed)).toThrow("integer");
    expect(() => new DodgeGame().start(-1)).toThrow("finite");
    expect(() => new DodgeGame().restart(Infinity)).toThrow("finite");
    const play = new Play();
    play.start();
    expect(play.game.step(NaN, input(0, 0)).phase).toBe("paused");
    expect(() => play.game.resume(Infinity)).toThrow("finite");
  });
  it("replays serialized version 1 commands through the exact same state machine", () => {
    const play = new Play({ mode: "survival", difficulty: "hard" }, 127);
    play.start();
    play.resolve(true);
    play.next();
    play.commands.push({ type: "pause", reason: "Replay pause" });
    play.game.pause("Replay pause");
    play.advance(1_000);
    play.commands.push({ type: "resume", atMs: play.now });
    play.game.resume(play.now);
    play.advance(TUNING.resumeCountdownMs);
    play.resolve(false);
    play.commands.push({ type: "finish" });
    play.game.finish();
    const replay: GameReplay = {
      version: 1,
      options: play.options,
      seed: play.seed,
      commands: play.commands,
    };
    const states = replayGame(replay);
    expect(states.at(-1)).toEqual(play.game.state);
    expect(
      replayGame(JSON.parse(JSON.stringify(replay)) as GameReplay),
    ).toEqual(states);
    expect(() =>
      replayGame({ ...replay, version: 2 } as unknown as GameReplay),
    ).toThrow("version");
  });
});
