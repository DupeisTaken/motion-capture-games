import { describe, expect, it } from "vitest";
import {
  MoleGame,
  TUNING,
  replayGame,
  type GameOptions,
  type GameReplay,
  type GameTarget,
  type ReplayCommand,
} from "../../games/mole-motion/src/index";
import type {
  GameMotionFrame,
  MotionContact,
} from "../../packages/motion/src/index";

class SweepPlay {
  readonly game: MoleGame;
  now = 0;
  sequence = 0;
  contacts: MotionContact[] = [
    { name: "left_hand", x: 0.01, y: 0.01, towardScreenM: 0 },
  ];
  commands: ReplayCommand[] = [];
  constructor(
    readonly options: Partial<GameOptions> = {},
    readonly version: GameReplay["version"] = 4,
  ) {
    this.game = new MoleGame({ mode: "practice", ...options }, 42, version);
  }
  tick(delta = 40, overrides: Partial<GameMotionFrame> = {}) {
    this.now += delta;
    const frame: GameMotionFrame = {
      version: 1,
      epoch: "sweep-source",
      sequence: ++this.sequence,
      atMs: this.now,
      slotId: "player-1",
      identity: "confident",
      feetVisible: true,
      depthAvailable: true,
      spaceRevision: "sweep-space",
      contacts: structuredClone(this.contacts),
      ...overrides,
    };
    this.commands.push({ type: "update", atMs: this.now, frame });
    return this.game.update(this.now, frame);
  }
  hold(ms: number) {
    while (ms > 0) {
      const step = Math.min(ms, 100);
      this.tick(step);
      ms -= step;
    }
    return this.game.state;
  }
  start() {
    this.game.start(this.now);
    this.commands.push({ type: "start", atMs: this.now });
    this.tick(0);
    return this.hold(TUNING.startCountdownMs);
  }
  activate() {
    this.start();
    return this.hold(TUNING.targetWarningMs);
  }
  target(kind: GameTarget["kind"] = "mole") {
    return this.game.state.targets.find((target) => target.kind === kind)!;
  }
  point(
    target: GameTarget,
    dx: number,
    dy = 0,
    name: MotionContact["name"] = "left_hand",
  ) {
    this.contacts = [{ name, x: target.x + dx, y: target.y + dy }];
  }
}

describe("version 4 target warning and feedback", () => {
  it.each(["easy", "normal", "hard"] as const)(
    "warns for 450ms before the full %s lifetime",
    (difficulty) => {
      const play = new SweepPlay({ difficulty, mode: "timed" });
      const first = play.start();
      expect(first.targets).toHaveLength(3);
      expect(
        first.targets.every(
          (target) => target.phase === "warning" && target.warningMs === 450,
        ),
      ).toBe(true);
      play.hold(449);
      expect(play.target()).toMatchObject({
        phase: "warning",
        warningMs: 1,
        remainingMs: TUNING[difficulty].lifetimeMs,
      });
      const active = play.hold(1);
      expect(
        active.targets.every(
          (target) =>
            target.phase === "active" &&
            target.remainingMs === TUNING[difficulty].lifetimeMs,
        ),
      ).toBe(true);
      const originalIds = active.targets.map((target) => target.id);
      play.hold(TUNING[difficulty].lifetimeMs - 1);
      expect(
        play.game.state.targets.map((target) => target.remainingMs),
      ).toEqual([1, 1, 1]);
      const expired = play.tick(1);
      expect(expired.misses).toBe(2);
      expect(
        expired.targets.every((target) => target.phase === "warning"),
      ).toBe(true);
      expect(
        expired.targetFeedback?.map((feedback) => feedback.targetId),
      ).toEqual(originalIds);
      expect(
        expired.targetFeedback?.every(
          (feedback) => feedback.outcome === "expired" && feedback.points === 0,
        ),
      ).toBe(true);
    },
  );

  it("does not score a warning or a stationary palm when that warning becomes active", () => {
    const options = {
      reachArea: { x: 0.4475, y: 0.4475, width: 0.105, height: 0.105 },
    };
    const preview = new SweepPlay(options);
    preview.start();
    const target = preview.target();
    const play = new SweepPlay(options);
    play.point(target, 0);
    play.start();
    expect(play.hold(TUNING.targetWarningMs + 100).hits).toBe(0);
    play.point(target, -0.1);
    play.tick();
    play.point(target, 0);
    const hit = play.tick();
    expect(hit.hits).toBe(1);
    expect(hit.targetFeedback).toMatchObject([
      {
        targetId: target.id,
        kind: "mole",
        outcome: "hit",
        points: 100,
        remainingMs: 650,
      },
    ]);
    expect(play.hold(TUNING.targetWarningMs + 100).hits).toBe(1);
    expect(play.hold(100).targetFeedback).toEqual([]);
  });

  it("emits bomb-specific feedback and charges a held strike only once", () => {
    const play = new SweepPlay();
    play.activate();
    const bomb = play.target("bomb");
    play.point(bomb, -0.09);
    play.tick();
    play.point(bomb, 0.09);
    expect(play.tick()).toMatchObject({
      score: -50,
      hits: 0,
      combo: 0,
      targetFeedback: [
        { targetId: bomb.id, kind: "bomb", outcome: "hit", points: -50 },
      ],
    });
    expect(play.hold(200).score).toBe(-50);
    expect(
      play.game.state.targets.some((target) => target.id === bomb.id),
    ).toBe(false);
  });

  it("freezes warning and feedback time on pause", () => {
    const play = new SweepPlay();
    play.start();
    play.hold(200);
    const before = play.game.state;
    play.game.pause();
    play.hold(500);
    expect(play.game.state.targets).toEqual(before.targets);
    expect(play.game.state.elapsedMs).toBe(before.elapsedMs);
  });

  it.each(["touch", "flick", "push"] as const)(
    "consumes a %s attempt during warning without carrying it into play",
    (interaction) => {
      const play = new SweepPlay({ interaction });
      play.start();
      const target = play.target();
      play.point(target, -0.09);
      play.contacts[0].towardScreenM = 0;
      play.tick();
      play.hold(200);
      play.point(target, 0);
      play.contacts[0].towardScreenM = 0.15;
      expect(play.tick().hits).toBe(0);
      expect(play.hold(210).hits).toBe(0);
      play.point(target, -0.09);
      play.contacts[0].towardScreenM = 0;
      play.tick();
      play.hold(200);
      play.point(target, 0);
      play.contacts[0].towardScreenM = 0.15;
      expect(play.tick().hits).toBe(1);
    },
  );
});

describe("bounded palm and foot source sweeps", () => {
  it.each(["left_hand", "right_hand", "left_foot", "right_foot"] as const)(
    "catches a sparse %s pass-through with both centers outside",
    (name) => {
      const play = new SweepPlay();
      play.activate();
      const target = play.target();
      play.point(target, -0.09, 0, name);
      play.tick();
      play.point(target, 0.09, 0, name);
      expect(play.tick(120).hits).toBe(1);
      expect(
        play.game.state.targets.some((candidate) => candidate.id === target.id),
      ).toBe(false);
    },
  );

  it.each([
    [-0.000001, 1],
    [0.000001, 0],
  ])("resolves a near tangent with offset %d", (offset, hits) => {
    const play = new SweepPlay();
    play.activate();
    const target = play.target();
    const y = target.radius + TUNING.touchRadius + offset;
    play.point(target, -0.06, y);
    play.tick();
    play.point(target, 0.06, y);
    expect(play.tick().hits).toBe(hits);
  });

  it.each([
    [121, 0.18],
    [300, 0.18],
    [100, 0.301],
  ])(
    "rejects a %dms gap / %d image-unit jump and does not hit when held afterward",
    (gap, travel) => {
      const play = new SweepPlay();
      play.activate();
      const target = play.target();
      play.point(target, -travel);
      play.tick();
      play.point(target, 0);
      expect(play.tick(gap)).toMatchObject({ phase: "playing", hits: 0 });
      expect(play.tick().hits).toBe(0);
    },
  );

  it("allows slow deliberate entry without a minimum speed threshold", () => {
    const play = new SweepPlay();
    play.activate();
    const target = play.target();
    const radius = target.radius + TUNING.touchRadius;
    play.point(target, -radius - 0.0001);
    play.tick();
    play.point(target, -radius + 0.0001);
    expect(play.tick(100).hits).toBe(1);
  });

  it("does not bridge a missing palm or score its return inside a target", () => {
    const play = new SweepPlay();
    play.activate();
    const target = play.target();
    play.point(target, -0.09);
    play.tick();
    play.contacts = [{ name: "right_foot", x: 0.01, y: 0.01 }];
    play.tick();
    play.point(target, 0);
    expect(play.tick().hits).toBe(0);
    play.point(target, -0.09);
    play.tick();
    play.point(target, 0);
    expect(play.tick().hits).toBe(1);
  });

  it.each([
    { feetVisible: false },
    { identity: "uncertain" as const },
    { epoch: "other-source" },
    { spaceRevision: "other-space" },
    { atMs: 0 },
    { contacts: [{ name: "left_hand" as const, x: NaN, y: 0.5 }] },
  ])(
    "rejects discontinuous input without advancing target time: %j",
    (override) => {
      const play = new SweepPlay();
      play.activate();
      const target = play.target();
      play.point(target, -0.09);
      play.tick();
      const before = play.game.state;
      play.point(target, 0.09);
      expect(play.tick(40, override)).toMatchObject({
        phase: "paused",
        hits: 0,
        elapsedMs: before.elapsedMs,
        targets: before.targets,
      });
    },
  );

  it("clears the old sweep across pause and recovery countdown", () => {
    const play = new SweepPlay();
    play.activate();
    const target = play.target();
    play.point(target, -0.09);
    play.tick();
    play.game.pause();
    play.game.resume(play.now);
    play.point(target, 0);
    play.hold(TUNING.resumeCountdownMs);
    expect(play.tick().hits).toBe(0);
  });

  it("uses source gap instead of short arrival intervals", () => {
    const play = new SweepPlay();
    play.activate();
    const target = play.target();
    play.point(target, -0.09);
    expect(play.tick(200, { atMs: play.now + 1 }).phase).toBe("playing");
    play.point(target, 0.09);
    expect(play.tick(40)).toMatchObject({ phase: "playing", hits: 0 });
  });

  it("clips a delayed path to activation, rejecting an intersection that happened during warning", () => {
    const play = new SweepPlay();
    play.start();
    const target = play.target();
    play.hold(370);
    play.point(target, -0.09);
    play.tick(20);
    play.point(target, 0.09);
    // Source path 3390 -> 3460 crosses before activation at browser time 3450.
    // Its clipped start is already overlapping, so this is not a new entry.
    expect(play.tick(100, { atMs: 3460 }).hits).toBe(0);
  });

  it("allows the portion of a straddling source path that enters after activation", () => {
    const play = new SweepPlay();
    play.start();
    const target = play.target();
    play.hold(430);
    play.point(target, -0.14);
    play.tick(10);
    play.point(target, 0.09);
    expect(play.tick(80).hits).toBe(1);
  });

  it("does not backdate activation to an old frame repeatedly polled by the renderer", () => {
    const play = new SweepPlay();
    play.start();
    play.hold(350);
    const target = play.target();
    play.point(target, -0.09);
    play.tick(10);
    const last = play.commands.at(-1)!;
    if (last.type !== "update") throw new Error("Expected input.");
    play.now += 100;
    play.game.update(play.now, last.frame);
    expect(play.target().phase).toBe("active");
    play.point(target, 0.09);
    // Both endpoints predate activation even though arrival is during play.
    expect(play.tick(10, { atMs: 3420 }).hits).toBe(0);
  });

  it("rejects stale source evidence instead of sweeping it into a target", () => {
    const play = new SweepPlay();
    play.activate();
    const target = play.target();
    play.point(target, -0.09);
    play.tick();
    const before = play.game.state;
    play.point(target, 0.09);
    expect(play.tick(352, { atMs: play.now + 1 })).toMatchObject({
      phase: "paused",
      reason: "Player input is stale. Wait for fresh tracking.",
      hits: 0,
      targets: before.targets,
    });
  });
});

describe("new replay boundary", () => {
  it("defaults new games to version 4 while legacy replay state stays unchanged", () => {
    const fresh = new MoleGame();
    expect(fresh.state.targetFeedback).toEqual([]);
    for (const version of [1, 2, 3] as const) {
      const play = new SweepPlay({}, version);
      play.start();
      expect(play.target()).not.toHaveProperty("phase");
      expect(play.target()).not.toHaveProperty("warningMs");
      expect(play.game.state).not.toHaveProperty("targetFeedback");
    }
  });

  it("replays version 4 warning, sparse hit, feedback and replacement deterministically", () => {
    const play = new SweepPlay();
    play.activate();
    const target = play.target();
    play.point(target, -0.09);
    play.tick();
    play.point(target, 0.09);
    play.tick(120);
    const replay = {
      version: 4 as const,
      options: { mode: "practice" as const },
      seed: 42,
      commands: play.commands,
    };
    const states = replayGame(JSON.parse(JSON.stringify(replay)));
    expect(states.at(-1)).toEqual(play.game.state);
    expect(states.at(-1)).toMatchObject({ hits: 1, score: 100 });
  });
});
