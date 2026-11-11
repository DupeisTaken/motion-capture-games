import { describe, expect, it } from "vitest";
import {
  MoleGame,
  TUNING,
  replayGame,
  type ReplayCommand,
} from "../../games/mole-motion/src/index";
import type {
  ContactName,
  GameMotionFrame,
  MotionContact,
} from "../../packages/motion/src/index";

class FlickPlay {
  readonly game = new MoleGame({ interaction: "flick", mode: "practice" }, 42);
  now = 0;
  sequence = 0;
  contacts: MotionContact[] = [{ name: "left_wrist", x: 0.01, y: 0.01 }];
  readonly commands: ReplayCommand[] = [];

  constructor() {
    this.game.start(0);
    this.commands.push({ type: "start", atMs: 0 });
    this.tick(0);
    this.hold(TUNING.startCountdownMs);
  }
  tick(delta = 40, overrides: Partial<GameMotionFrame> = {}) {
    this.now += delta;
    const frame: GameMotionFrame = {
      version: 1,
      epoch: "flick-fixture",
      sequence: ++this.sequence,
      atMs: this.now,
      slotId: "player-1",
      identity: "confident",
      feetVisible: true,
      depthAvailable: false,
      spaceRevision: "flick-space",
      contacts: structuredClone(this.contacts),
      ...overrides,
    };
    this.commands.push({ type: "update", atMs: this.now, frame });
    return this.game.update(this.now, frame);
  }
  hold(ms = 200) {
    while (ms > 0) {
      const delta = Math.min(ms, 40);
      this.tick(delta);
      ms -= delta;
    }
  }
  aim(name: ContactName = "left_wrist", kind: "mole" | "bomb" = "mole") {
    const target = this.game.state.targets.find(
      (target) => target.kind === kind,
    )!;
    this.contacts = [{ name, x: target.x - target.radius - 0.03, y: target.y }];
    this.tick();
    this.hold();
  }
  flap(distance = 0.025, delta = 40) {
    this.contacts[0].x += distance;
    return this.tick(delta);
  }
}

describe("wrist flick whacks", () => {
  it("deducts points for a swept bomb strike without counting a mole hit", () => {
    const play = new FlickPlay();
    play.aim("left_wrist", "bomb");
    expect(play.flap()).toMatchObject({
      score: -50,
      hits: 0,
      misses: 0,
      lastStrike: { molePoints: 0, bombPenalty: 50 },
    });
    expect(play.flap().score).toBe(-50);
  });

  it.each(["left_wrist", "right_wrist", "left_hand", "right_hand"] as const)(
    "accepts a fast %s flap near a mole without touch or depth",
    (name) => {
      const play = new FlickPlay();
      play.aim(name);
      expect(play.game.state.hits).toBe(0);
      const target = play.game.state.targets.find(
        (target) => target.kind === "mole",
      )!;
      expect(
        Math.hypot(
          play.contacts[0].x + 0.025 - target.x,
          play.contacts[0].y - target.y,
        ),
      ).toBeGreaterThan(target.radius);
      expect(play.flap()).toMatchObject({ hits: 1, score: 100 });
    },
  );

  it("accumulates a short flap over several high-rate samples", () => {
    const play = new FlickPlay();
    play.aim();
    play.flap(0.007, 16);
    play.flap(0.007, 16);
    expect(play.game.state.hits).toBe(0);
    expect(play.flap(0.007, 16).hits).toBe(1);
  });

  it("intersects a swept near-mole path even when both endpoints are outside", () => {
    const play = new FlickPlay();
    const target = play.game.state.targets.find(
      (target) => target.kind === "mole",
    )!;
    play.contacts = [
      { name: "left_wrist", x: target.x - 0.05, y: target.y + 0.08 },
    ];
    play.tick();
    play.hold();
    expect(Math.hypot(0.05, 0.08)).toBeGreaterThan(
      target.radius + TUNING.flick.reachPadding,
    );
    expect(play.flap(0.1, 100).hits).toBe(1);
  });

  it.each([
    "stationary",
    "jitter",
    "slow drift",
    "distant flap",
    "tracking jump",
  ])("rejects %s", (scenario) => {
    const play = new FlickPlay();
    play.aim();
    if (scenario === "stationary") play.hold(500);
    if (scenario === "jitter")
      for (let i = 0; i < 20; i++) play.flap(i % 2 ? -0.004 : 0.004);
    if (scenario === "slow drift")
      for (let i = 0; i < 10; i++) play.flap(0.004, 80);
    if (scenario === "distant flap") {
      play.contacts[0].y = 0.01;
      play.tick();
      play.hold();
      play.flap();
    }
    if (scenario === "tracking jump") play.flap(0.25);
    expect(play.game.state.hits).toBe(0);
  });

  it("consumes a miss and requires a settled hand before the next flap", () => {
    const play = new FlickPlay();
    const target = play.game.state.targets.find(
      (target) => target.kind === "mole",
    )!;
    play.contacts = [{ name: "left_wrist", x: target.x - 0.16, y: target.y }];
    play.tick();
    play.hold();
    play.flap(0.025); // The complete path remains outside the nearby-mole radius.
    expect(play.game.state.hits).toBe(0);
    play.flap(0.08);
    expect(play.game.state.hits).toBe(0);
    play.hold();
    expect(play.flap().hits).toBe(1);
    play.hold(500);
    expect(play.game.state.hits).toBe(1);
  });

  it("uses source intervals rather than render/arrival intervals", () => {
    const play = new FlickPlay();
    play.aim();
    const atMs = play.now;
    // The game polls this same source frame many times; none can manufacture speed.
    const sample = play.commands.at(-1)!;
    if (sample.type !== "update") throw new Error("Expected a sample.");
    for (let i = 1; i <= 3; i++) play.game.update(atMs + i, sample.frame);
    expect(play.flap(0.025, 120).hits).toBe(0);
  });

  it("breaks a flick across a source sampling gap", () => {
    const play = new FlickPlay();
    play.aim();
    expect(play.flap(0.04, 160).hits).toBe(0);
    play.hold();
    expect(play.flap().hits).toBe(1);
  });

  it("does not use foot or hip motion to trigger a flick", () => {
    const play = new FlickPlay();
    play.aim();
    const target = play.game.state.targets.find(
      (target) => target.kind === "mole",
    )!;
    play.contacts[0] = { name: "left_wrist", x: 0.01, y: 0.01 };
    play.contacts.push(
      { name: "left_foot", x: target.x - 0.02, y: target.y },
      { name: "left_hip", x: target.x, y: target.y },
    );
    play.tick();
    play.hold();
    play.contacts[1].x += 0.04;
    play.contacts[2].x += 0.04;
    expect(play.tick().hits).toBe(0);
    expect(
      play.game.readiness(play.now, {
        ...(play.commands.at(-1) as Extract<ReplayCommand, { type: "update" }>)
          .frame!,
        contacts: play.contacts.slice(1),
      }).reason,
    ).toMatch(/hand or wrist/);
  });

  it.each(["missing wrist", "alias change"])(
    "does not bridge %s",
    (scenario) => {
      const play = new FlickPlay();
      play.aim();
      const wrist = { ...play.contacts[0] };
      if (scenario === "missing wrist") {
        play.contacts = [{ name: "right_wrist", x: 0.01, y: 0.01 }];
        play.tick();
      }
      play.contacts = [
        {
          ...wrist,
          name: scenario === "alias change" ? "left_hand" : "left_wrist",
          x: wrist.x + 0.025,
        },
      ];
      expect(play.tick().hits).toBe(0);
      play.hold();
      expect(play.flap().hits).toBe(1);
    },
  );

  it.each([
    { feetVisible: false },
    { identity: "uncertain" as const },
    { atMs: 0 },
    { epoch: "replacement" },
    { spaceRevision: "replacement" },
  ])("freezes scoring across invalid input: %j", (overrides) => {
    const play = new FlickPlay();
    play.aim();
    const before = play.game.state;
    play.contacts[0].x += 0.025;
    expect(play.tick(40, overrides)).toMatchObject({
      phase: "paused",
      hits: 0,
      elapsedMs: before.elapsedMs,
      targets: before.targets,
    });
  });

  it("consumes a countdown flap without carrying it into gameplay", () => {
    const play = new FlickPlay();
    play.aim();
    play.game.pause();
    play.game.resume(play.now);
    play.hold(TUNING.resumeCountdownMs - 40);
    play.flap();
    expect(play.game.state.phase).toBe("playing");
    play.tick();
    expect(play.game.state.hits).toBe(0);
  });

  it("replays flick scoring deterministically using version 2 game rules", () => {
    const play = new FlickPlay();
    play.aim();
    play.flap();
    const replay = {
      version: 2 as const,
      options: { interaction: "flick" as const, mode: "practice" as const },
      seed: 42,
      commands: play.commands,
    };
    const states = replayGame(JSON.parse(JSON.stringify(replay)));
    expect(states.at(-1)).toEqual(play.game.state);
    expect(states.at(-1)?.score).toBe(100);
  });
});
