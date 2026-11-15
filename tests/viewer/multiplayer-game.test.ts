import { describe, expect, it } from "vitest";
import { MultiplayerGame } from "../../apps/mirror/src/multiplayer-game";
import { MoleGame } from "../../games/mole-motion/src/index";
import {
  BODY_NAMES,
  syntheticBody,
  type Observation,
} from "../../packages/motion/src/index";
import { PLAYER_SLOT_IDS } from "../../packages/session/src/index";
import fixture from "../../contracts/examples/synthetic-observation.json";

function scene(sequence: number, at: number): Observation {
  const base = structuredClone(fixture) as Observation;
  return {
    ...base,
    sequence,
    capturedAtNs: String(BigInt(at) * 1_000_000n),
    processedAtNs: String(BigInt(at) * 1_000_000n),
    people: ["a", "b", "c", "spectator"].map((trackId) => ({
      ...structuredClone(base.people[0]),
      trackId,
      identity: "confident",
      joints: Object.fromEntries(
        syntheticBody().map((point) => [
          point.name,
          {
            x: point.x,
            y: point.y,
            score: 0.99,
            inFrame: true,
            status: "observed",
          },
        ]),
      ),
    })),
  };
}

describe("independent multiplayer game adapters", () => {
  it("routes reordered crossing tracks to three real Mole engines and isolates scores", () => {
    const match = new MultiplayerGame(
      "mole",
      () => ({ mode: "practice", interaction: "touch" }),
      42,
    );
    let at = 0,
      seq = 0;
    let observation = scene(++seq, at);
    match.ingest(observation, at);
    for (const [i, track] of ["a", "b", "c"].entries())
      expect(match.join(PLAYER_SLOT_IDS[i], track, at)).toBe(true);
    expect(match.session.spectators(observation).map((p) => p.trackId)).toEqual(
      ["spectator"],
    );
    match.start();
    function advance(target?: { x: number; y: number }, uncertain = false) {
      at += 50;
      observation = scene(++seq, at);
      observation.people.reverse();
      for (const p of observation.people) {
        p.joints.left_wrist = { ...p.joints.left_wrist!, x: 0.01, y: 0.01 };
        p.joints.right_wrist = { ...p.joints.right_wrist!, x: 0.01, y: 0.01 };
        p.joints.left_index_finger = { ...p.joints.left_wrist! };
        p.joints.left_pinky_finger = { ...p.joints.left_wrist! };
        if (p.trackId === "a" && target) {
          p.joints.left_wrist = { ...p.joints.left_wrist!, ...target };
          p.joints.left_index_finger = { ...p.joints.left_wrist! };
          p.joints.left_pinky_finger = { ...p.joints.left_wrist! };
        }
        if (p.trackId === "b" && uncertain) p.identity = "ambiguous";
      }
      match.ingest(observation, at);
      match.tick(at);
    }
    for (let i = 0; i < 65; i++) advance();
    const first = match.runtimes.get("player-1")!.game as MoleGame;
    expect(first.state.phase).toBe("playing");
    // Wait for the game-owned scoring phase (legacy targets are already active).
    for (
      let i = 0;
      i < 40 &&
      !first.state.targets.some(
        (t) =>
          t.kind === "mole" &&
          (t as typeof t & { phase?: string }).phase !== "warning",
      );
      i++
    )
      advance();
    const target = first.state.targets.find(
      (t) =>
        t.kind === "mole" &&
        (t as typeof t & { phase?: string }).phase !== "warning",
    )!;
    advance({
      x: Math.max(0.01, target.x - target.radius - 0.07),
      y: target.y,
    });
    const before = [...match.runtimes.values()].map((r) => r.game.state.score);
    advance(target);
    expect(first.state.score).toBeGreaterThan(before[0]);
    expect(match.runtimes.get("player-2")!.game.state.score).toBe(before[1]);
    expect(match.runtimes.get("player-3")!.game.state.score).toBe(before[2]);
    const p3Time = match.runtimes.get("player-3")!.game.state.elapsedMs;
    advance(undefined, true);
    expect(match.runtimes.get("player-2")!.game.state.phase).toBe("paused");
    expect(
      match.runtimes.get("player-3")!.game.state.elapsedMs,
    ).toBeGreaterThan(p3Time);
    expect(first.state.score).toBeGreaterThan(0);
    match.finish("player-1");
    expect(first.state.phase).toBe("results");
    expect(first.state.score).toBeGreaterThan(0);
    expect(match.runtimes.get("player-3")!.game.state.phase).toBe("playing");
    match.leave("player-1");
    expect(match.runtimes.has("player-1")).toBe(false);
    expect(match.join("player-1", "spectator", at)).toBe(true);
    expect(match.runtimes.get("player-1")!.game.state.score).toBe(0);
  });

  it("adapts each Dodgeball body, pauses only missing input and rejects geometry reuse", () => {
    const match = new MultiplayerGame(
      "dodgeball",
      () => ({ mode: "practice" }),
      7,
    );
    let at = 0,
      seq = 0;
    match.ingest(scene(++seq, at), at);
    expect(match.join("player-1", "a", at)).toBe(true);
    expect(match.join("player-2", "b", at)).toBe(true);
    match.start();
    for (let i = 0; i < 65; i++) {
      at += 50;
      match.ingest(scene(++seq, at), at);
      match.tick(at);
    }
    const a = match.runtimes.get("player-1")!,
      b = match.runtimes.get("player-2")!;
    expect(a.game.state.phase).toBe("playing");
    expect((b.frame as { body: unknown[] }).body).toHaveLength(
      BODY_NAMES.length,
    );
    at += 50;
    const missing = scene(++seq, at);
    delete missing.people[0].joints.left_ankle;
    const bTime = b.game.state.elapsedMs;
    match.ingest(missing, at);
    match.tick(at);
    expect(a.game.state.phase).toBe("paused");
    expect(b.game.state.elapsedMs).toBeGreaterThan(bTime);
    at += 50;
    const changed = scene(seq + 1, at);
    changed.transformRevision += "-changed";
    match.ingest(changed, at);
    match.tick(at);
    expect(match.session.status("player-1").status).toBe("rejoin-required");
    expect(match.session.status("player-2").status).toBe("rejoin-required");
    expect(b.game.state.phase).toBe("paused");
  });

  it("breaks gesture history when missing and recovered packets arrive between display ticks", () => {
    const match = new MultiplayerGame("mole", () => ({ mode: "practice" }), 42);
    let at = 0,
      seq = 1;
    match.ingest(scene(seq, at), at);
    match.join("player-1", "a", at);
    match.join("player-2", "b", at);
    match.start();
    for (let i = 0; i < 65; i++) {
      at += 50;
      match.ingest(scene(++seq, at), at);
      match.tick(at);
    }
    const a = match.runtimes.get("player-1")!,
      b = match.runtimes.get("player-2")!;
    expect(a.game.state.phase).toBe("playing");
    at += 50;
    const missing = scene(++seq, at);
    missing.people = missing.people.filter((p) => p.trackId !== "a");
    match.ingest(missing, at);
    // No display tick observes the null input. Recovery must still break history.
    at += 50;
    match.ingest(scene(seq + 1, at), at);
    expect(a.game.state.phase).toBe("paused");
    expect(b.game.state.phase).toBe("playing");
    match.tick(at);
    expect(a.game.state.phase).toBe("countdown");
    expect(a.game.state.countdownMs).toBe(2000);
  });

  it("cannot enroll from interrupted preview data or restart an invalidated score", () => {
    const match = new MultiplayerGame("mole", () => ({}));
    match.ingest(scene(1, 0), 0);
    match.join("player-1", "a", 0);
    match.interrupt("Camera stopped", true);
    expect(match.join("player-2", "b", 10)).toBe(false);
    expect(match.session.status("player-1").status).toBe("rejoin-required");
    match.start();
    expect(match.runtimes.get("player-1")!.requested).toBe(false);
  });

  it("does not admit stale preview data or advance hidden games", () => {
    const match = new MultiplayerGame("mole", () => ({}));
    match.ingest(scene(1, 0), 0);
    expect(match.join("player-1", "a", 351)).toBe(false);
    expect(match.join("player-1", "a", 0)).toBe(true);
    match.start();
    match.tick(0);
    match.tick(10, false);
    expect(match.runtimes.get("player-1")!.game.state.phase).toBe("paused");
    expect(match.runtimes.get("player-1")!.manualPause).toBe(true);
  });
});
