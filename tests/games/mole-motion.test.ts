import { describe, expect, it } from "vitest";
import type {
  GameMotionFrame,
  MotionContact,
} from "../../packages/motion/src/index";
import {
  DEFAULT_OPTIONS,
  MoleGame,
  TUNING,
  replayGame,
  type GameOptions,
  type GameReplay,
  type GameState,
  type ReplayCommand,
} from "../../games/mole-motion/src/index";

const outside: MotionContact = { name: "left_hand", x: 0.01, y: 0.01 };
const firstMole = (state: GameState) =>
  state.targets.find((target) => target.kind === "mole")!;

function input(atMs: number, sequence: number): GameMotionFrame {
  return {
    version: 1,
    epoch: "synthetic-game-1",
    sequence,
    atMs,
    slotId: "player-1",
    identity: "confident",
    feetVisible: true,
    depthAvailable: true,
    contacts: [{ ...outside, towardScreenM: 0 }],
    spaceRevision: "synthetic-calibration-1",
  };
}

class Play {
  readonly game: MoleGame;
  now = 0;
  sequence = 0;
  contacts: MotionContact[] = [{ ...outside, towardScreenM: 0 }];
  commands: ReplayCommand[] = [];
  constructor(
    readonly options: Partial<GameOptions> = {},
    readonly seed = 42,
    readonly version: GameReplay["version"] = 3,
  ) {
    this.game = new MoleGame(options, seed, version);
  }
  tick(delta = 100, overrides: Partial<GameMotionFrame> = {}): GameState {
    this.now += delta;
    const frame = {
      ...input(this.now, ++this.sequence),
      contacts: this.contacts.map((contact) => ({ ...contact })),
      ...overrides,
    };
    this.commands.push({ type: "update", atMs: this.now, frame });
    return this.game.update(this.now, frame);
  }
  advance(ms: number, overrides: Partial<GameMotionFrame> = {}): GameState {
    let state = this.game.state;
    while (ms > 0) {
      const step = Math.min(ms, 100);
      state = this.tick(step, overrides);
      ms -= step;
    }
    return state;
  }
  start(): GameState {
    this.commands.push({ type: "start", atMs: this.now });
    this.game.start(this.now);
    this.tick(0);
    return this.advance(TUNING.startCountdownMs);
  }
  hit(name: MotionContact["name"] = "left_hand"): GameState {
    this.contacts = [{ ...outside, name, towardScreenM: 0 }];
    this.tick();
    const target = firstMole(this.game.state);
    this.contacts = [{ name, x: target.x, y: target.y, towardScreenM: 0.15 }];
    return this.tick();
  }
}

describe("Slap a Mole lifecycle and scoring", () => {
  it.each([
    [{ feetVisible: false }, /feet/i],
    [{ identity: "uncertain" }, /identity/i],
    [{ contacts: [] }, /hand or foot/i],
    [{ depthAvailable: false }, /depth/i],
  ] as [Partial<GameMotionFrame>, RegExp][])(
    "reports blocked readiness without mutating the paused round (%j)",
    (changes, reason) => {
      const play = new Play({
        interaction: changes.depthAvailable === false ? "push" : "touch",
      });
      play.start();
      play.hit();
      play.game.pause();
      const before = play.game.state;
      const frame = { ...input(play.now + 50, play.sequence + 1), ...changes };
      const readiness = play.game.readiness(play.now + 50, frame);
      expect(readiness.ready).toBe(false);
      expect(readiness.reason).toMatch(reason);
      expect(readiness.requiresNewRound).toBe(false);
      expect(play.game.state).toEqual(before);
    },
  );

  it("exposes stale input and changed score ownership before a resume attempt", () => {
    const play = new Play();
    play.start();
    play.game.pause();
    const sample = input(play.now, play.sequence);
    expect(play.game.readiness(play.now + 351, sample)).toMatchObject({
      ready: false,
      requiresNewRound: false,
    });
    expect(
      play.game.readiness(play.now + 50, {
        ...sample,
        atMs: play.now + 50,
        sequence: play.sequence + 1,
        spaceRevision: "other-player",
      }),
    ).toMatchObject({ ready: false, requiresNewRound: true });
    expect(play.game.state.phase).toBe("paused");
    expect(
      play.game.readiness(play.now + 50, {
        ...sample,
        atMs: play.now + 50,
        sequence: play.sequence + 1,
      }).ready,
    ).toBe(true);
  });

  it("waits for explicit start and countdown before spawning and scoring", () => {
    const play = new Play();
    expect(play.game.update(0, input(0, 1)).phase).toBe("ready");
    expect(play.game.state.targets).toEqual([]);
    play.game.start(0);
    play.advance(2_900);
    expect(play.game.state.phase).toBe("countdown");
    expect(play.game.state.hits).toBe(0);
    expect(play.game.state.targets).toEqual([]);
    play.advance(100);
    expect(play.game.state.phase).toBe("playing");
    expect(play.game.state.targets.map(({ id, kind }) => [id, kind])).toEqual([
      [1, "mole"],
      [2, "mole"],
      [3, "bomb"],
    ]);
    expect(play.game.state.elapsedMs).toBe(0);
  });

  it.each(["left_hand", "right_hand", "left_foot", "right_foot"] as const)(
    "touch accepts a fresh %s entry",
    (name) => {
      const play = new Play();
      play.start();
      const state = play.hit(name);
      expect(state.hits).toBe(1);
      expect(state.score).toBe(100);
      expect(state.targets.at(-1)?.id).toBe(4);
    },
  );

  it("touch rejects hips even when a hip overlaps the mole", () => {
    const play = new Play();
    play.start();
    const target = firstMole(play.game.state);
    play.contacts = [outside, { name: "left_hip", x: target.x, y: target.y }];
    play.tick();
    expect(play.game.state.hits).toBe(0);
  });

  it.each(["left_hand", "right_foot"] as const)(
    "scores %s on region overlap, including when its center is outside the mole",
    (name) => {
      const play = new Play();
      const target = firstMole(play.start());
      const edge = target.radius + TUNING.touchRadius;
      play.contacts = [{ name, x: target.x, y: target.y - edge - 0.001 }];
      expect(play.tick().hits).toBe(0);
      play.contacts[0].y = target.y - edge + 0.001;
      expect(play.tick().hits).toBe(1);
      expect(play.tick().hits).toBe(1);
    },
  );

  it("scores once for simultaneous limb contacts and caps the combo bonus", () => {
    const play = new Play({ mode: "practice" });
    play.start();
    for (let count = 0; count < 14; count++) play.hit();
    expect(play.game.state.hits).toBe(14);
    expect(play.game.state.bestCombo).toBe(14);
    expect(play.game.state.score).toBe(2_250);
    const target = firstMole(play.game.state);
    play.contacts = [
      { name: "left_hand", x: 0, y: 0 },
      { name: "right_foot", x: 0, y: 0 },
    ];
    play.tick();
    play.contacts = play.contacts.map((contact) => ({
      ...contact,
      x: target.x,
      y: target.y,
    }));
    const state = play.tick();
    expect(state.hits).toBe(15);
    expect(state.targets.some((candidate) => candidate.id === target.id)).toBe(
      false,
    );
  });

  it("does not score a held contact underneath the next spawned mole", () => {
    const play = new Play({
      reachArea: { x: 0.4475, y: 0.4475, width: 0.105, height: 0.105 },
    });
    play.start();
    play.hit();
    expect(play.game.state.hits).toBe(1);
    play.advance(500);
    expect(play.game.state.hits).toBe(1);
    play.contacts = [{ ...outside }];
    play.tick();
    play.contacts = [{ name: "left_hand", x: 0.5, y: 0.5 }];
    expect(play.tick().hits).toBe(2);
  });

  it("ignores wrist overlap and requires a fresh entry after a missing palm returns", () => {
    const play = new Play();
    play.start();
    const target = firstMole(play.game.state);
    const wrist: MotionContact = {
      name: "left_wrist",
      x: target.x,
      y: target.y,
    };
    const foot: MotionContact = { ...outside, name: "left_foot" };
    play.contacts = [foot, { ...outside, name: "left_wrist" }];
    play.tick();
    play.contacts = [foot, wrist];
    expect(play.tick().hits).toBe(0);
    expect(play.game.touchRegions(play.contacts)).toEqual([
      { ...foot, radius: TUNING.touchRadius },
    ]);
    play.contacts = [foot, { ...wrist, name: "left_hand" }];
    expect(play.tick().hits).toBe(0);
    play.contacts = [{ name: "left_hand", x: 0, y: 0 }];
    play.tick();
    play.contacts = [{ name: "left_hand", x: target.x, y: target.y }];
    expect(play.tick().hits).toBe(1);
  });

  it("duplicate renderer polls cannot repeat a collision", () => {
    const play = new Play();
    play.start();
    play.hit();
    const command = play.commands.at(-1)!;
    if (command.type !== "update") throw new Error("Missing update");
    const state = play.game.update(play.now + 16, command.frame);
    expect(state.phase).toBe("playing");
    expect(state.hits).toBe(1);
  });

  it("timed play ends at 60 active seconds", () => {
    const play = new Play();
    play.start();
    play.advance(59_900);
    expect(play.game.state.phase).toBe("playing");
    const state = play.advance(100);
    expect(state.phase).toBe("results");
    expect(state.result).toBe("time-up");
    expect(state.remainingMs).toBe(0);
    expect(state.elapsedMs).toBe(60_000);
    expect(state.targets).toEqual([]);
  });

  it("challenge wins at 15 hits and loses when its clock expires", () => {
    const winner = new Play({ mode: "challenge" });
    winner.start();
    for (let count = 0; count < 15; count++) winner.hit();
    expect(winner.game.state.result).toBe("challenge-won");
    expect(winner.game.state.hits).toBe(15);
    expect(winner.game.state.targets).toEqual([]);
    const loser = new Play({ mode: "challenge" });
    loser.start();
    loser.advance(60_000);
    expect(loser.game.state.result).toBe("time-up");
  });

  it("survival ends on the third miss and resets combo on expiration", () => {
    const play = new Play({ mode: "survival" });
    play.start();
    play.hit();
    play.contacts = [{ ...outside }];
    play.advance(TUNING.normal.lifetimeMs - 200);
    expect(play.game.state.misses).toBe(1);
    expect(play.game.state.combo).toBe(0);
    expect(play.game.state.bestCombo).toBe(1);
    play.advance(TUNING.normal.lifetimeMs);
    expect(play.game.state.result).toBe("out-of-lives");
    expect(play.game.state.misses).toBe(3);
    expect(play.game.state.remainingMs).toBeNull();
  });

  it("practice is untimed, has no miss penalties and can explicitly finish", () => {
    const play = new Play({ mode: "practice" });
    play.start();
    play.advance(70_000);
    expect(play.game.state.phase).toBe("playing");
    expect(play.game.state.misses).toBe(0);
    expect(play.game.state.remainingMs).toBeNull();
    expect(play.game.finish().result).toBe("completed");
    expect(play.game.state.targets).toEqual([]);
  });

  it("restart clears results, score, ordering and seed state", () => {
    const play = new Play();
    const original = play.start().targets;
    play.hit();
    play.game.finish();
    play.game.restart(play.now);
    play.advance(TUNING.startCountdownMs);
    expect(play.game.state.targets).toEqual(original);
    expect(play.game.state.score).toBe(0);
    expect(play.game.state.hits).toBe(0);
    expect(play.game.state.result).toBeNull();
  });

  it("returned snapshots cannot alter options or live targets", () => {
    const play = new Play();
    const state = play.start();
    state.targets[0].x = 99;
    state.options.reachArea.x = 99;
    state.score = 999;
    expect(firstMole(play.game.state).x).toBeLessThan(1);
    expect(play.game.state.options.reachArea.x).toBe(
      DEFAULT_OPTIONS.reachArea.x,
    );
    expect(play.game.state.score).toBe(0);
  });
});

describe("concurrent targets and bombs", () => {
  it("replaces an expired bomb without clearing an active mole streak", () => {
    const play = new Play();
    play.start();
    play.hit();
    play.hit();
    const before = play.game.state;
    const bomb = before.targets.find((target) => target.kind === "bomb")!;
    const after = play.advance(bomb.remainingMs);
    expect(after).toMatchObject({ score: 210, combo: 2, misses: 0, hits: 2 });
    expect(after.targets.find((target) => target.kind === "bomb")?.id).not.toBe(
      bomb.id,
    );
  });

  it("stops at the challenge goal when both moles are hit on the final frame", () => {
    const play = new Play({ mode: "challenge" });
    play.start();
    for (let count = 0; count < 14; count++) play.hit();
    const names = ["left_hand", "right_hand"] as const;
    play.contacts = names.map((name) => ({ ...outside, name }));
    const { targets } = play.tick();
    play.contacts = targets
      .filter((target) => target.kind === "mole")
      .map(({ x, y }, index) => ({ name: names[index], x, y }));
    expect(play.tick()).toMatchObject({
      phase: "results",
      result: "challenge-won",
      hits: 15,
      combo: 15,
      targets: [],
    });
  });

  it.each([
    ["easy", 5_000],
    ["normal", 4_000],
    ["hard", 3_000],
  ] as const)("%s targets last %d active ms", (difficulty, lifetimeMs) => {
    const play = new Play({ difficulty });
    const start = play.start();
    expect(start.targets).toHaveLength(3);
    expect(start.targets.map((target) => target.remainingMs)).toEqual([
      lifetimeMs,
      lifetimeMs,
      lifetimeMs,
    ]);
    const beforeExpiry = play.advance(lifetimeMs - 1);
    expect(beforeExpiry.targets.map((target) => target.remainingMs)).toEqual([
      1, 1, 1,
    ]);
    expect(beforeExpiry.misses).toBe(0);
    const afterExpiry = play.advance(1);
    expect(afterExpiry).toMatchObject({
      hits: 0,
      misses: 2,
      score: 0,
      lastStrike: null,
    });
    expect(afterExpiry.targets.map((target) => target.id)).toEqual([4, 5, 6]);
  });

  it.each(["touch", "push"] as const)(
    "a %s bomb strike costs points once and only replaces the bomb",
    (interaction) => {
      const play = new Play({ interaction, mode: "practice" });
      play.start();
      play.hit();
      const before = play.game.state;
      const bomb = before.targets.find((target) => target.kind === "bomb")!;
      play.contacts = [{ ...outside, towardScreenM: 0 }];
      play.tick();
      play.contacts = [
        { name: "left_hand", x: bomb.x, y: bomb.y, towardScreenM: 0.15 },
      ];
      const after = play.tick();
      expect(after).toMatchObject({
        score: 50,
        hits: 1,
        misses: 0,
        combo: 0,
        bestCombo: 1,
        lastStrike: { molePoints: 0, bombPenalty: 50 },
      });
      expect(after.targets.filter((target) => target.kind === "mole")).toEqual(
        before.targets
          .filter((target) => target.kind === "mole")
          .map((target) => ({
            ...target,
            remainingMs: target.remainingMs - 200,
          })),
      );
      expect(
        after.targets.find((target) => target.kind === "bomb")!.id,
      ).not.toBe(bomb.id);
      expect(play.tick().score).toBe(50);
      expect(play.hit().score).toBe(150);
    },
  );

  it("scores two distinct moles and applies a simultaneous bomb after the hit awards", () => {
    const play = new Play({ mode: "practice" });
    const { targets } = play.start();
    play.contacts = [
      { ...outside, name: "left_hand" },
      { ...outside, name: "right_hand" },
      { ...outside, name: "left_foot" },
    ];
    play.tick();
    play.contacts = play.contacts.map((contact, index) => ({
      ...contact,
      x: targets[index].x,
      y: targets[index].y,
    }));
    const state = play.tick();
    expect(state).toMatchObject({
      hits: 2,
      score: 160,
      combo: 0,
      bestCombo: 2,
      misses: 0,
      lastStrike: { molePoints: 210, bombPenalty: 50 },
    });
    expect(state.targets.map((target) => target.id)).toEqual([4, 5, 6]);
  });

  it("does not let hand and wrist aliases strike two targets with one limb", () => {
    const play = new Play({}, 42, 2);
    const { targets } = play.start();
    play.contacts = [{ ...outside, name: "left_wrist" }, outside];
    play.tick();
    play.contacts = play.contacts.map((contact, index) => ({
      ...contact,
      x: targets[index].x,
      y: targets[index].y,
    }));
    const state = play.tick();
    expect(state.hits).toBe(1);
    expect(state.targets.map((target) => target.id)).toEqual([2, 3, 4]);
  });
});

describe("depth-gated push", () => {
  it.each([
    "left_hand",
    "right_hand",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
  ] as const)("push accepts a neutral-and-forward %s cycle", (name) => {
    const play = new Play({ interaction: "push" });
    play.start();
    expect(play.hit(name).hits).toBe(1);
  });

  it("rejects feet and 2D-only observations in push mode", () => {
    const unavailable = new Play({ interaction: "push" });
    unavailable.start();
    const frozen = unavailable.game.state;
    const state = unavailable.tick(100, { depthAvailable: false });
    expect(state.phase).toBe("paused");
    expect(state.reason).toContain("depth");
    expect(state.targets).toEqual(frozen.targets);
    const feet = new Play({ interaction: "push" });
    feet.start();
    feet.contacts = [{ name: "left_foot", x: 0.5, y: 0.5, towardScreenM: 0.2 }];
    expect(feet.tick().phase).toBe("paused");
  });

  it("requires actual forward depth, not mere 2D overlap", () => {
    const play = new Play({ interaction: "push" });
    play.start();
    const target = firstMole(play.game.state);
    play.contacts = [
      { name: "left_wrist", x: target.x, y: target.y, towardScreenM: 0 },
    ];
    expect(play.tick().hits).toBe(0);
    play.contacts[0].towardScreenM = 0.119;
    expect(play.tick().hits).toBe(0);
    play.contacts[0].towardScreenM = 0.12;
    expect(play.tick().hits).toBe(1);
  });

  it("does not repeat an extended push or rearm through a hand/wrist alias", () => {
    const play = new Play({ interaction: "push" });
    play.start();
    play.hit();
    const target = firstMole(play.game.state);
    play.contacts = [
      { name: "left_wrist", x: target.x, y: target.y, towardScreenM: 0.2 },
    ];
    expect(play.tick().hits).toBe(1);
    play.contacts = [
      { name: "left_hand", x: target.x, y: target.y, towardScreenM: 0.2 },
    ];
    expect(play.tick().hits).toBe(1);
    play.contacts[0].towardScreenM = 0.08;
    play.tick();
    play.contacts[0].towardScreenM = 0.2;
    expect(play.tick().hits).toBe(1);
    play.contacts[0].towardScreenM = 0.04;
    play.tick();
    play.contacts[0].towardScreenM = 0.12;
    expect(play.tick().hits).toBe(2);
  });

  it("breaks a push cycle when a limb disappears while another remains visible", () => {
    const play = new Play({ interaction: "push" });
    play.start();
    const target = firstMole(play.game.state);
    const left: MotionContact = {
      name: "left_wrist",
      x: target.x,
      y: target.y,
      towardScreenM: 0,
    };
    const right: MotionContact = {
      name: "right_wrist",
      x: 0,
      y: 0,
      towardScreenM: 0,
    };
    play.contacts = [left, right];
    play.tick();
    play.contacts = [right];
    play.tick();
    play.contacts = [{ ...left, towardScreenM: 0.2 }, right];
    expect(play.tick().hits).toBe(0);
    play.contacts = [left, right];
    play.tick();
    play.contacts = [{ ...left, towardScreenM: 0.2 }, right];
    expect(play.tick().hits).toBe(1);
  });

  it("consumes a forward gesture that missed before moving onto a target", () => {
    const play = new Play({ interaction: "push" });
    play.start();
    const target = firstMole(play.game.state);
    play.contacts = [{ ...outside, towardScreenM: 0.2 }];
    expect(play.tick().hits).toBe(0);
    play.contacts = [
      { name: "left_wrist", x: target.x, y: target.y, towardScreenM: 0.08 },
    ];
    play.tick();
    play.contacts[0].towardScreenM = 0.2;
    expect(play.tick().hits).toBe(0);
    play.contacts[0].towardScreenM = 0.04;
    play.tick();
    play.contacts[0].towardScreenM = 0.12;
    expect(play.tick().hits).toBe(1);
  });
});

describe("framing, quality and temporal safety", () => {
  it.each([
    ["feet missing", { feetVisible: false }, "Step back"],
    ["identity ambiguous", { identity: "uncertain" }, "identity"],
    ["player missing", { identity: "missing" }, "identity"],
    ["all contacts missing", { contacts: [] }, "visible"],
    ["source changed", { epoch: "next-source" }, "new round"],
    ["calibration changed", { spaceRevision: "next-view" }, "new round"],
  ] as const)(
    "%s freezes scoring, target lifetime and round time",
    (_, changes, reason) => {
      const play = new Play();
      play.start();
      play.hit();
      const before = play.game.state;
      const paused = play.tick(100, changes as Partial<GameMotionFrame>);
      expect(paused.phase).toBe("paused");
      expect(paused.reason).toContain(reason);
      expect(paused.score).toBe(before.score);
      expect(paused.elapsedMs).toBe(before.elapsedMs);
      expect(paused.targets).toEqual(before.targets);
      play.advance(10_000);
      expect(play.game.state.elapsedMs).toBe(before.elapsedMs);
      expect(play.game.state.targets).toEqual(before.targets);
    },
  );

  it("explicit recovery counts down without catch-up or a free held hit", () => {
    const play = new Play();
    play.start();
    const targets = play.game.state.targets;
    const target = targets[0];
    play.tick(100, { feetVisible: false });
    play.advance(20_000);
    play.contacts = [{ name: "left_hand", x: target.x, y: target.y }];
    play.game.resume(play.now);
    play.advance(TUNING.resumeCountdownMs);
    expect(play.game.state.phase).toBe("playing");
    expect(play.game.state.targets).toEqual(targets);
    expect(play.game.state.elapsedMs).toBe(0);
    expect(play.tick().hits).toBe(0);
    play.hit();
    expect(play.game.state.hits).toBe(1);
  });

  it("source/space change cannot be accepted just by resuming", () => {
    const play = new Play();
    play.start();
    play.tick(100, { epoch: "new-source" });
    play.game.resume(play.now);
    expect(play.tick(100, { epoch: "new-source" }).phase).toBe("paused");
    play.game.restart(play.now);
    expect(play.tick(100, { epoch: "new-source" }).phase).toBe("countdown");
  });

  it("stale, future and non-monotonic frames cannot score or consume time", () => {
    const changes: Array<(play: Play) => Partial<GameMotionFrame>> = [
      (play) => ({ atMs: play.now - 1_000 }),
      (play) => ({ atMs: play.now + 1_000 }),
      () => ({ sequence: 0 }),
      (play) => ({ atMs: play.now - 100 }),
      (play) => ({ sequence: play.sequence, atMs: play.now + 100 }),
    ];
    for (const change of changes) {
      const play = new Play();
      play.start();
      const before = play.game.state;
      expect(play.tick(100, change(play)).phase).toBe("paused");
      expect(play.game.state.targets).toEqual(before.targets);
      expect(play.game.state.elapsedMs).toBe(before.elapsedMs);
      expect(play.game.state.hits).toBe(0);
    }
  });

  it("a renderer stall pauses instead of spawning catch-up misses", () => {
    const play = new Play({ mode: "survival" });
    play.start();
    const before = play.game.state;
    const after = play.tick(30_000);
    expect(after.phase).toBe("paused");
    expect(after.reason).toContain("interrupted");
    expect(after.misses).toBe(0);
    expect(after.targets).toEqual(before.targets);
    expect(after.elapsedMs).toBe(0);
  });

  it("a fresh sample after a source gap cannot bridge an old gesture", () => {
    const play = new Play({ interaction: "push" });
    play.start();
    const target = firstMole(play.game.state);
    play.contacts = [
      { name: "left_wrist", x: target.x, y: target.y, towardScreenM: 0 },
    ];
    play.tick();
    play.contacts[0].towardScreenM = 0.2;
    const state = play.tick(351);
    expect(state.phase).toBe("paused");
    expect(state.reason).toContain("interrupted");
    expect(state.hits).toBe(0);
    play.game.resume(play.now);
    expect(play.advance(TUNING.resumeCountdownMs).phase).toBe("playing");
    expect(play.tick().hits).toBe(0);
  });

  it("polling an old sample pauses when freshness expires", () => {
    const play = new Play();
    play.start();
    const command = play.commands.at(-1)!;
    if (command.type !== "update") throw new Error("Missing update");
    expect(play.game.update(play.now + 100, command.frame).phase).toBe(
      "playing",
    );
    expect(play.game.update(play.now + 351, command.frame).phase).toBe(
      "paused",
    );
    expect(play.game.state.reason).toContain("stale");
  });

  it.each([
    { version: 2 },
    { slotId: "spectator" },
    { epoch: "" },
    { spaceRevision: "" },
    { sequence: 1.5 },
    { atMs: NaN },
    { contacts: [{ name: "left_wrist", x: NaN, y: 0.5 }] },
    { contacts: [{ name: "left_wrist", x: -0.1, y: 0.5 }] },
    { contacts: [{ name: "left_wrist", x: 0.5, y: 1.1 }] },
    { contacts: [{ name: "nose", x: 0.5, y: 0.5 }] },
    {
      contacts: [
        { name: "left_wrist", x: 0.5, y: 0.5, towardScreenM: Infinity },
      ],
    },
    { contacts: [outside, outside] },
  ])("rejects malformed game-ready input: %j", (changes) => {
    const play = new Play();
    play.start();
    expect(play.tick(100, changes as Partial<GameMotionFrame>).phase).toBe(
      "paused",
    );
    expect(play.game.state.score).toBe(0);
  });

  it("missing input and backward game clocks pause safely", () => {
    const missing = new Play();
    missing.start();
    expect(missing.game.update(missing.now + 100, null).phase).toBe("paused");
    const clock = new Play();
    clock.start();
    expect(
      clock.game.update(clock.now - 1, input(clock.now - 1, 99)).phase,
    ).toBe("paused");
    expect(clock.game.state.elapsedMs).toBe(0);
  });
});

describe("placement, configuration and replay", () => {
  it.each(["easy", "normal", "hard"] as const)(
    "%s keeps all targets inside the reach rectangle and clear of one another",
    (difficulty) => {
      const reachArea = { x: 0.2, y: 0.25, width: 0.6, height: 0.5 };
      const play = new Play({ mode: "practice", difficulty, reachArea });
      play.start();
      for (let count = 0; count < 100; count++) {
        const { targets } = play.game.state;
        expect(targets).toHaveLength(3);
        targets.forEach((target, index) => {
          expect(target.x - target.radius).toBeGreaterThanOrEqual(reachArea.x);
          expect(target.y - target.radius).toBeGreaterThanOrEqual(reachArea.y);
          expect(target.x + target.radius).toBeLessThanOrEqual(
            reachArea.x + reachArea.width,
          );
          expect(target.y + target.radius).toBeLessThanOrEqual(
            reachArea.y + reachArea.height,
          );
          for (const other of targets.slice(index + 1))
            expect(
              Math.hypot(target.x - other.x, target.y - other.y),
            ).toBeGreaterThan(target.radius + other.radius);
        });
        play.hit();
      }
    },
  );

  it("hard consistently favors farther candidates from eligible current contacts", () => {
    let normalDistance = 0;
    let hardDistance = 0;
    for (let seed = 1; seed <= 50; seed++) {
      for (const difficulty of ["normal", "hard"] as const) {
        const play = new Play({ difficulty }, seed);
        play.contacts = [{ name: "left_hand", x: 0.5, y: 0.5 }];
        const target = firstMole(play.start());
        const distance = Math.hypot(target.x - 0.5, target.y - 0.5);
        if (difficulty === "normal") normalDistance += distance;
        else hardDistance += distance;
      }
    }
    expect(hardDistance).toBeGreaterThan(normalDistance * 1.5);
  });

  it("hard ignores contacts excluded by the current interaction", () => {
    for (const interaction of ["touch", "push"] as const) {
      const first = new Play({ difficulty: "hard", interaction });
      const second = new Play({ difficulty: "hard", interaction });
      const hand: MotionContact = {
        name: "left_hand",
        x: 0.2,
        y: 0.2,
        towardScreenM: 0,
      };
      first.contacts = [hand];
      second.contacts = [
        hand,
        {
          name: interaction === "touch" ? "left_hip" : "left_foot",
          x: 0.9,
          y: 0.9,
          towardScreenM: 0,
        },
      ];
      expect(first.start().targets).toEqual(second.start().targets);
    }
  });

  it("hard placement responds to available contact locations", () => {
    const left = new Play({ difficulty: "hard" });
    left.contacts = [{ name: "left_hand", x: 0.1, y: 0.5 }];
    const right = new Play({ difficulty: "hard" });
    right.contacts = [{ name: "left_hand", x: 0.9, y: 0.5 }];
    expect(firstMole(left.start()).x).toBeGreaterThan(0.65);
    expect(firstMole(right.start()).x).toBeLessThan(0.35);
  });

  it.each([
    { mode: "unknown" },
    { interaction: "keyboard" },
    { difficulty: "impossible" },
    { reachArea: { x: 0, y: 0, width: 0, height: 1 } },
    { reachArea: { x: -0.1, y: 0, width: 0.5, height: 0.5 } },
    { reachArea: { x: 0.9, y: 0, width: 0.5, height: 0.5 } },
    { reachArea: { x: 0, y: 0, width: 0.05, height: 0.05 } },
    { reachArea: { x: 0, y: NaN, width: 0.5, height: 0.5 } },
  ])("rejects invalid options: %j", (options) => {
    expect(() => new MoleGame(options as Partial<GameOptions>)).toThrow(
      "Invalid game options",
    );
  });

  it("rejects non-integer seeds and invalid start/restart times", () => {
    expect(() => new MoleGame({}, NaN)).toThrow("integer");
    expect(() => new MoleGame({}, 0.5)).toThrow("integer");
    expect(() => new MoleGame().start(-1)).toThrow("finite");
    expect(() => new MoleGame().restart(Infinity)).toThrow("finite");
  });

  it.each([2, 3] as const)(
    "version %s replay reproduces every seeded target, score and pause outcome",
    (version) => {
      const play = new Play(
        { mode: "challenge", difficulty: "hard" },
        127,
        version,
      );
      play.start();
      for (let count = 0; count < 6; count++) play.hit();
      play.commands.push({ type: "pause", reason: "Synthetic replay pause" });
      play.game.pause("Synthetic replay pause");
      play.advance(1_000);
      play.commands.push({ type: "resume", atMs: play.now });
      play.game.resume(play.now);
      play.advance(TUNING.resumeCountdownMs);
      for (let count = 0; count < 9; count++) play.hit();
      const replay: GameReplay = {
        version,
        options: play.options,
        seed: play.seed,
        commands: play.commands,
      };
      const serialized = JSON.parse(JSON.stringify(replay)) as GameReplay;
      const first = replayGame(replay);
      expect(first.at(-1)).toEqual(play.game.state);
      expect(replayGame(serialized)).toEqual(first);
      expect(first.at(-1)?.result).toBe("challenge-won");
      expect(() =>
        replayGame({ ...replay, version: 5 } as unknown as GameReplay),
      ).toThrow("version");
    },
  );

  it("replays version 1 with its original target shape and shorter lifetime", () => {
    const play = new Play({ mode: "survival" });
    const target = firstMole(play.start());
    play.advance(2_500);
    const states = replayGame({
      version: 1,
      options: play.options,
      seed: play.seed,
      commands: play.commands,
    });
    expect(states.find((state) => state.phase === "playing")?.target).toEqual({
      id: 1,
      x: target.x,
      y: target.y,
      radius: target.radius,
      remainingMs: 2_500,
    });
    expect(states.at(-1)).toMatchObject({
      misses: 1,
      target: { id: 2, remainingMs: 2_500 },
    });
    expect(states.at(-1)).not.toHaveProperty("targets");
  });
});
