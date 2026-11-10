import { describe, expect, it } from "vitest";
import {
  RunnerGame,
  TUNING,
  type RunnerInput,
  type Lane,
  type RunnerOptions,
} from "../../games/motion-runner/src/index";

class Play {
  game: RunnerGame;
  now = 0;
  sequence = 0;
  controls: Partial<RunnerInput> = {};
  constructor(options: Partial<RunnerOptions> = {}, seed = 42) {
    this.game = new RunnerGame(options, seed);
  }
  input(): RunnerInput {
    return {
      atMs: this.now,
      sequence: ++this.sequence,
      epoch: "synthetic",
      spaceRevision: "synthetic-player-1",
      identity: "confident",
      participantCount: 1,
      valid: true,
      lane: 0,
      jump: false,
      duck: false,
      standing: !this.controls.jump && !this.controls.duck,
      ...this.controls,
    };
  }
  tick(ms = 20): ReturnType<RunnerGame["step"]> {
    this.now += ms;
    return this.game.step(this.now, this.input());
  }
  advance(ms: number): void {
    while (ms > 0) {
      const delta = Math.min(ms, 20);
      this.tick(delta);
      ms -= delta;
    }
  }
  start(): void {
    expect(this.game.start(this.now, this.input())).toBe(true);
    this.advance(TUNING.startCountdownMs);
    expect(this.game.state.phase).toBe("playing");
  }
  firstHazard() {
    return this.game.state.obstacles.find(
      (obstacle) => obstacle.kind !== "coin",
    )!;
  }
}

describe("single-player motion runner timeline", () => {
  it("starts a seeded bounded world, holds absolute lanes, returns center and crosses during a jump", () => {
    const play = new Play();
    play.start();
    play.controls.lane = -1;
    play.advance(200);
    expect(play.game.state.avatarX).toBe(-1);
    play.advance(300);
    expect(play.game.state.avatarX).toBe(-1);
    play.controls.lane = 1;
    play.controls.jump = true;
    play.advance(340);
    expect(play.game.state.avatarX).toBe(1);
    expect(play.game.state.jumpHeight).toBeGreaterThan(1);
    play.controls.lane = 0;
    play.controls.jump = false;
    play.advance(200);
    expect(play.game.state.avatarX).toBe(0);
  });
  it("requires one fresh standing participant before admission", () => {
    const play = new Play();
    for (const changes of [
      { participantCount: 2 },
      { participantCount: 0 },
      { identity: "uncertain" as const },
      { valid: false },
      { atMs: -1 },
      { atMs: 1 },
      { jump: true },
      { duck: true },
      { standing: false },
    ]) {
      expect(play.game.start(0, { ...play.input(), ...changes })).toBe(false);
    }
    expect(play.game.state.phase).toBe("ready");
  });
  it("requires explicit standing evidence at admission, countdown and resume while permitting airborne followups during play", () => {
    const play = new Play();
    play.controls.standing = false;
    expect(play.game.start(play.now, play.input())).toBe(false);
    play.controls.standing = true;
    expect(play.game.start(play.now, play.input())).toBe(true);
    play.advance(1000);
    const countdown = play.game.state.countdownMs;
    play.controls = { standing: false, jump: false, duck: false };
    play.tick();
    expect(play.game.state).toMatchObject({
      phase: "paused",
      countdownMs: countdown,
      distance: 0,
    });
    play.now += 20;
    expect(play.game.resume(play.now, play.input())).toBe(false);
    play.controls.standing = true;
    expect(play.game.resume(play.now, play.input())).toBe(true);
    play.advance(TUNING.resumeCountdownMs);
    expect(play.game.state.phase).toBe("playing");
    play.controls.standing = false;
    play.tick();
    expect(play.game.state.phase).toBe("playing");
    expect(play.game.state.distance).toBeGreaterThan(0);
  });
  it("freezes hazards, timers, action position, distance and score together when an alternate person appears", () => {
    const play = new Play();
    play.start();
    play.advance(600);
    const before = play.game.state;
    play.controls.participantCount = 2;
    play.tick();
    expect(play.game.state).toMatchObject({
      phase: "paused",
      elapsedMs: before.elapsedMs,
      distance: before.distance,
      score: before.score,
      avatarX: before.avatarX,
      jumpHeight: before.jumpHeight,
      obstacles: before.obstacles,
    });
    play.advance(2000);
    expect(play.game.state.obstacles).toEqual(before.obstacles);
    expect(play.game.state.reason).toMatch(/Another player/);
    play.controls.participantCount = 1;
    expect(play.game.resume(play.now, play.input())).toBe(true);
    play.advance(TUNING.resumeCountdownMs);
    expect(play.game.state.distance).toBe(before.distance);
    play.tick();
    expect(play.game.state.distance - before.distance).toBeLessThan(0.3);
  });
  it.each([
    { epoch: "replacement" },
    { spaceRevision: "new-player" },
    { identity: "uncertain" as const },
    { identity: "uncertain" as const, participantCount: 2 },
    { identity: "missing" as const },
  ])(
    "never transfers old score through changed identity/provenance %j",
    (changes) => {
      const play = new Play();
      play.start();
      play.advance(300);
      const score = play.game.state.score;
      Object.assign(play.controls, changes);
      play.tick();
      expect(play.game.state).toMatchObject({
        phase: "paused",
        requiresNewRound: true,
        score,
      });
      play.controls = {};
      expect(play.game.resume(play.now, play.input())).toBe(false);
    },
  );
  it("pauses on stale/out-of-order/future/conflicting or missing evidence without fallback center", () => {
    for (const change of [
      { atMs: 0 },
      { atMs: 9000 },
      { sequence: 0 },
      { valid: false },
      { jump: true, duck: true },
      { lane: 3 as Lane },
    ]) {
      const play = new Play();
      play.start();
      play.advance(100);
      const before = play.game.state.distance;
      Object.assign(play.controls, change);
      play.tick();
      expect(play.game.state.phase).toBe("paused");
      expect(play.game.state.distance).toBe(before);
    }
    const play = new Play();
    play.start();
    play.game.step(play.now + 20, null);
    expect(play.game.state.phase).toBe("paused");
  });
  it("accepts cached source samples while fresh, rejects mutated duplicate timestamps and avoids large catch-up steps", () => {
    const play = new Play();
    play.start();
    play.now += 20;
    const input = play.input();
    play.game.step(play.now + 20, input);
    play.game.step(play.now + 40, input);
    expect(play.game.state.phase).toBe("playing");
    play.game.step(play.now + 60, { ...input, atMs: input.atMs + 1 });
    expect(play.game.state.phase).toBe("paused");
    const second = new Play();
    second.start();
    const before = second.game.state.distance;
    second.tick(1000);
    expect(second.game.state).toMatchObject({
      phase: "paused",
      distance: before,
    });
  });
  it("does not auto-repeat a held jump and can rearm after release/landing", () => {
    const play = new Play();
    play.start();
    play.controls.jump = true;
    play.advance(400);
    expect(play.game.state.jumpHeight).toBeGreaterThan(1);
    play.advance(1000);
    expect(play.game.state.jumpHeight).toBe(0);
    play.controls.jump = false;
    play.tick();
    play.controls.jump = true;
    play.advance(200);
    expect(play.game.state.jumpHeight).toBeGreaterThan(0);
  });
  it("holds duck, suppresses duck during flight and releases without another reward", () => {
    const play = new Play();
    play.start();
    play.controls.duck = true;
    play.advance(500);
    expect(play.game.state.duck).toBe(true);
    play.controls.duck = false;
    play.controls.jump = true;
    play.tick();
    play.controls.jump = false;
    play.controls.duck = true;
    play.advance(100);
    expect(play.game.state.duck).toBe(false);
    play.advance(1000);
    expect(play.game.state.duck).toBe(true);
    play.controls.duck = false;
    play.tick();
    expect(play.game.state.duck).toBe(false);
  });
  it("clears a low barrier by jumping, hits it while standing, and collects only lane-matched coins", () => {
    const jumping = new Play();
    jumping.start();
    jumping.controls.lane = jumping.firstHazard().lane;
    while (jumping.firstHazard().z > 5) jumping.tick();
    jumping.controls.jump = true;
    jumping.advance(500);
    expect(jumping.game.state.hits).toBe(0);
    const standing = new Play();
    standing.start();
    standing.controls.lane = standing.firstHazard().lane;
    standing.advance(3600);
    expect(standing.game.state.hits).toBe(1);
    const collecting = new Play();
    collecting.start();
    const firstCoinIds = collecting.game.state.obstacles
      .filter((obstacle) => obstacle.kind === "coin")
      .slice(0, 5)
      .map((obstacle) => obstacle.id);
    collecting.controls.lane = collecting.game.state.obstacles.find(
      (obstacle) => obstacle.kind === "coin",
    )!.lane;
    collecting.advance(4400);
    expect(collecting.game.state.coins).toBe(5);
    expect(
      collecting.game.state.obstacles.every(
        (obstacle) => !firstCoinIds.includes(obstacle.id),
      ),
    ).toBe(true);
    expect(collecting.game.state.score).toBe(
      Math.floor(collecting.game.state.distance) + 125,
    );
  });
  it("always leaves a free lane and at least 1.6s between authored rows at maximum speed", () => {
    const play = new Play({ practice: true });
    play.start();
    for (let iteration = 0; iteration < 1000; iteration++) {
      play.tick(100);
      const hazards = play.game.state.obstacles.filter(
        (obstacle) => obstacle.kind !== "coin" && obstacle.z > 0,
      );
      const rows = new Map<number, number>();
      for (const hazard of hazards)
        rows.set(hazard.z, (rows.get(hazard.z) ?? 0) + 1);
      expect([...rows.values()].every((count) => count <= 2)).toBe(true);
      expect(play.game.state.obstacles.length).toBeLessThan(40);
    }
    expect(TUNING.rowSpacingM / TUNING.maximumSpeed).toBeGreaterThan(1.6);
  });
  it("consumes lane and jump events at their timestamp instead of changing the preceding interval", () => {
    const play = new Play();
    play.start();
    const before = play.game.state;
    play.controls = { lane: 1, jump: true };
    play.tick(200);
    expect(play.game.state.avatarX).toBe(before.avatarX);
    expect(play.game.state.jumpHeight).toBe(0);
    expect(play.game.state.distance).toBeGreaterThan(before.distance);
    play.controls.jump = false;
    play.tick(100);
    expect(play.game.state.avatarX).toBeGreaterThan(0);
    expect(play.game.state.jumpHeight).toBeGreaterThan(0);
  });
  it("hits a train entered from the side after its front has passed, throughout its visible eight-meter length", () => {
    const play = new Play({ practice: true });
    play.start();
    const train = play.game.state.obstacles.find(
      (obstacle) => obstacle.kind === "train",
    );
    expect(train).toBeDefined();
    while (
      play.game.state.obstacles.find((obstacle) => obstacle.id === train!.id)!
        .z > 3
    ) {
      const next = play.game.state.obstacles.find(
        (obstacle) => obstacle.kind !== "coin" && obstacle.z > -4,
      )!;
      play.controls.lane = next.lane === -1 ? 0 : ((next.lane - 1) as Lane);
      play.tick();
    }
    const hits = play.game.state.hits;
    play.controls.lane = train!.lane;
    play.advance(220);
    expect(play.game.state.hits).toBe(hits + 1);
  });
  it("requires a held roll beneath overhead obstacles rather than a jump", () => {
    const cross = (duck: boolean) => {
      const play = new Play({ practice: true });
      play.start();
      const overhead = play.game.state.obstacles.find(
        (obstacle) => obstacle.kind === "overhead",
      );
      expect(overhead).toBeDefined();
      while (
        play.game.state.obstacles.find(
          (obstacle) => obstacle.id === overhead!.id,
        )!.z > 5
      ) {
        const next = play.game.state.obstacles.find(
          (obstacle) => obstacle.kind !== "coin" && obstacle.z > -4,
        )!;
        play.controls.lane = next.lane === -1 ? 0 : -1;
        play.tick();
      }
      const hits = play.game.state.hits;
      play.controls.lane = overhead!.lane;
      play.controls.duck = duck;
      play.advance(600);
      return play.game.state.hits - hits;
    };
    expect(cross(true)).toBe(0);
    expect(cross(false)).toBe(1);
  });
  it("freezes an interrupted countdown and clears transient vertical state on safe recovery without duplicating coins", () => {
    const play = new Play();
    play.game.start(play.now, play.input());
    play.advance(1000);
    const countdown = play.game.state.countdownMs;
    play.controls.participantCount = 2;
    play.advance(500);
    expect(play.game.state.countdownMs).toBe(countdown);
    play.controls.participantCount = 1;
    expect(play.game.resume(play.now, play.input())).toBe(true);
    play.advance(TUNING.resumeCountdownMs);
    play.controls.lane = play.game.state.obstacles.find(
      (obstacle) => obstacle.kind === "coin",
    )!.lane;
    play.advance(3200);
    const coins = play.game.state.coins;
    play.controls.jump = true;
    play.advance(100);
    play.game.pause();
    const distance = play.game.state.distance;
    play.controls.jump = false;
    play.now += 20;
    expect(play.game.resume(play.now, play.input())).toBe(true);
    expect(play.game.state.jumpHeight).toBe(0);
    expect(
      play.game.state.obstacles
        .filter((obstacle) => obstacle.z > -4)
        .every((obstacle) => obstacle.z >= 26 || obstacle.kind === "coin"),
    ).toBe(true);
    play.advance(TUNING.resumeCountdownMs);
    expect(play.game.state.distance).toBe(distance);
    expect(play.game.state.coins).toBe(coins);
  });
  it("reproduces outcomes, protects snapshots and freezes a result", () => {
    const replay = () => {
      const play = new Play({ practice: true, variant: "gold" }, 999);
      play.start();
      for (let i = 0; i < 800; i++) {
        play.controls.lane = ([-1, 0, 1] as const)[Math.floor(i / 23) % 3];
        play.controls.jump = i % 75 === 0;
        play.controls.duck = i % 101 > 70;
        if (play.controls.jump) play.controls.duck = false;
        play.tick();
      }
      return play;
    };
    const first = replay(),
      second = replay();
    expect(first.game.state).toEqual(second.game.state);
    const snapshot = first.game.state;
    snapshot.obstacles[0].z = 999;
    expect(first.game.state.obstacles[0].z).not.toBe(999);
    first.game.end();
    const result = first.game.state;
    first.tick(5000);
    expect(first.game.state).toEqual(result);
    expect(() => new RunnerGame({ variant: "unknown" as "rail" })).toThrow();
  });
});
