import { describe, expect, it } from "vitest";
import fixture from "../../contracts/examples/synthetic-observation.json";
import type { Observation, Person } from "../../packages/motion/src/index";
import { SinglePlayerSession } from "../../packages/session/src/index";

const originNs = 98_765_432_109_876_543n;
const body = (trackId = "participant"): Person => ({
  trackId,
  identity: "confident",
  box: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  joints: {
    left_wrist: {
      x: 0.2,
      y: 0.5,
      score: 0.95,
      status: "observed",
      inFrame: true,
    },
    left_ankle: {
      x: 0.4,
      y: 0.9,
      score: 0.95,
      status: "observed",
      inFrame: true,
    },
    right_ankle: {
      x: 0.6,
      y: 0.9,
      score: 0.95,
      status: "observed",
      inFrame: true,
    },
  },
});

function observation(
  elapsedMs = 0,
  changes: Partial<Observation> = {},
): Observation {
  const captured = originNs + BigInt(Math.round(elapsedMs * 1e6));
  return {
    ...(structuredClone(fixture) as Observation),
    epoch: "epoch-1",
    sequence: Math.round(elapsedMs) + 1,
    capturedAtNs: captured.toString(),
    processedAtNs: (captured + 16_000_000n).toString(),
    people: [body()],
    detectedCount: 1,
    ...changes,
  };
}

function joined(): SinglePlayerSession {
  const session = new SinglePlayerSession();
  expect(session.join(observation(), "participant", 1000)).not.toBeNull();
  return session;
}

describe("explicit single-player session", () => {
  it("never enrolls a detection until an operator explicitly chooses its track", () => {
    const session = new SinglePlayerSession();
    expect(session.ingest(observation(), 1000)).toBeNull();
    expect(session.binding).toBeNull();
    expect(session.reason).toMatch(/join/i);
    const frame = session.join(observation(), "participant", 1000);
    expect(frame?.slotId).toBe("player-1");
    expect(session.binding).toMatchObject({ trackId: "participant" });
  });

  it("does not choose by array position or left/right order when spectators cross", () => {
    const session = joined();
    const participant = body();
    participant.joints.left_wrist!.x = 0.9;
    const spectator = body("spectator");
    spectator.joints.left_wrist!.x = 0.1;
    const frame = session.ingest(
      observation(30, { people: [spectator, participant], detectedCount: 2 }),
      1030,
    );
    expect(
      frame?.contacts.find((contact) => contact.name === "left_wrist")?.x,
    ).toBe(0.9);
    expect(session.binding?.trackId).toBe("participant");
  });

  it("limits admission to the existing slot and exposes an immutable binding copy", () => {
    const session = joined();
    const copy = session.binding!;
    copy.trackId = "spectator";
    expect(session.binding?.trackId).toBe("participant");
    expect(
      session.join(
        observation(30, { people: [body(), body("spectator")] }),
        "spectator",
        1030,
      ),
    ).toBeNull();
    expect(session.binding?.trackId).toBe("participant");
    session.release();
    expect(session.binding).toBeNull();
    expect(session.reason).toBeNull();
    expect(
      session.join(
        observation(40, { people: [body("spectator")] }),
        "spectator",
        1040,
      ),
    ).not.toBeNull();
  });

  it.each(["ambiguous", "tentative"] as const)(
    "requires explicit rejoin after %s identity even if the same ID returns",
    (identity) => {
      const session = joined();
      expect(
        session.ingest(
          observation(30, { people: [{ ...body(), identity }] }),
          1030,
        ),
      ).toBeNull();
      expect(session.binding).toBeNull();
      expect(session.ingest(observation(60), 1060)).toBeNull();
      expect(session.join(observation(60), "participant", 1060)).not.toBeNull();
    },
  );

  it("does not transfer control to a remaining spectator when the participant leaves", () => {
    const session = joined();
    expect(
      session.ingest(observation(30, { people: [body("spectator")] }), 1030),
    ).toBeNull();
    expect(session.binding).toBeNull();
    expect(session.reason).toMatch(/missing|uncertain/i);
    expect(session.ingest(observation(60), 1060)).toBeNull();
  });

  it("includes explicit track association in game space revisions to prevent old-score transfer", () => {
    const session = new SinglePlayerSession();
    const first = session.join(observation(), "participant", 1000)!;
    session.release();
    const same = session.join(observation(30), "participant", 1030)!;
    expect(same.spaceRevision).toBe(first.spaceRevision);
    session.release();
    const other = session.join(
      observation(60, { people: [body("other-participant")] }),
      "other-participant",
      1060,
    )!;
    expect(other.spaceRevision).not.toBe(first.spaceRevision);
    expect(other.spaceRevision).toBe(session.binding!.spaceRevision);
    expect(
      session.ingest(
        observation(90, { people: [body("other-participant")] }),
        1090,
      )?.spaceRevision,
    ).toBe(other.spaceRevision);
  });

  it("rejects absent, null, tentative and duplicate track IDs during admission", () => {
    for (const people of [
      [],
      [{ ...body(), trackId: null }],
      [{ ...body(), identity: "tentative" as const }],
      [body(), body()],
    ]) {
      const session = new SinglePlayerSession();
      expect(
        session.join(observation(0, { people }), "participant", 1000),
      ).toBeNull();
      expect(session.binding).toBeNull();
    }
    expect(new SinglePlayerSession().join(observation(), "", 1000)).toBeNull();
  });

  it.each([
    { epoch: "epoch-2" },
    { cameraId: "camera-2" },
    { calibrationId: "calibration-2" },
    { transformRevision: "transform-2" },
    { image: { width: 1280, height: fixture.image.height } },
    { image: { width: fixture.image.width, height: 720 } },
    { modelId: "different-model" },
    { tracker: "iou" as const },
  ])(
    "invalidates the enrolled association after provenance changes: %j",
    (change) => {
      const session = joined();
      expect(session.ingest(observation(30, change), 1030)).toBeNull();
      expect(session.binding).toBeNull();
      expect(session.reason).toMatch(/changed|rejoin/i);
    },
  );

  it("keeps a confidently enrolled player while foot visibility is temporarily lost", () => {
    const session = joined();
    const participant = body();
    delete participant.joints.left_ankle;
    const frame = session.ingest(
      observation(30, { people: [participant] }),
      1030,
    );
    expect(frame?.feetVisible).toBe(false);
    expect(frame?.identity).toBe("confident");
    expect(session.binding?.trackId).toBe("participant");
    // The game pauses for framing; the session must not invent camera distance.
    expect(session.reason).toBeNull();
  });
});

describe("game source-clock mapping and stale-input rejection", () => {
  it("subtracts source processing age and preserves sub-ms precision above Number.MAX_SAFE_INTEGER", () => {
    const session = new SinglePlayerSession();
    expect(session.join(observation(), "participant", 1000)?.atMs).toBe(984);
    const frame = session.ingest(observation(30.125, { sequence: 2 }), 1035);
    expect(frame?.atMs).toBeCloseTo(1014.125, 8);
    expect(frame?.atMs).not.toBe(1035);
  });

  it("never freshens a delayed source packet using its recent receipt time", () => {
    const session = joined();
    expect(session.ingest(observation(10), 1300)?.atMs).toBe(994);
    expect(session.ingest(observation(20), 1400)).toBeNull();
    expect(session.reason).toMatch(/stale/i);
    expect(session.binding?.trackId).toBe("participant");
    // Catching up to genuinely current source time can recover the same binding.
    expect(session.ingest(observation(300), 1420)?.atMs).toBe(1284);
  });

  it("corrects a small initial transit overestimate only downward when a faster packet arrives", () => {
    const session = joined();
    // The first frame's transit was longer. This next frame maps 9 ms ahead
    // under the original anchor, revealing that earlier overestimate.
    const faster = session.ingest(observation(30), 1005)!;
    expect(faster.atMs).toBe(1005);
    expect(faster.atMs).toBeLessThanOrEqual(1005);
    expect(session.binding?.trackId).toBe("participant");
    const following = session.ingest(observation(60), 1040)!;
    expect(following.atMs).toBe(1035);
    expect(following.atMs).toBeGreaterThan(faster.atMs);
    // Later delays retain source time; they cannot raise the corrected anchor.
    expect(session.ingest(observation(70), 1300)?.atMs).toBe(1045);
    expect(session.ingest(observation(80), 1410)).toBeNull();
    expect(session.reason).toMatch(/stale/i);
  });

  it("accepts the proposed 20ms correction boundary without publishing future time", () => {
    const session = joined();
    expect(session.ingest(observation(40), 1004)?.atMs).toBe(1004);
    expect(session.binding?.trackId).toBe("participant");
  });

  it("rejects a future mapping beyond the correction allowance", () => {
    const session = joined();
    expect(session.ingest(observation(40.001), 1004)).toBeNull();
    expect(session.binding).toBeNull();
    expect(session.reason).toMatch(/ahead/i);
  });

  it("requires rejoin if a downward anchor correction would repeat or reverse published time", () => {
    const session = joined();
    expect(session.ingest(observation(40), 1004)?.atMs).toBe(1004);
    expect(
      session.ingest(observation(40.1, { sequence: 100 }), 1004),
    ).toBeNull();
    expect(session.binding).toBeNull();
    expect(session.reason).toMatch(/mapped source clock moved back/i);
  });

  it("rejects old or duplicate sequences without rewinding the accepted clock", () => {
    const session = joined();
    expect(session.ingest(observation(30), 1030)).not.toBeNull();
    expect(session.ingest(observation(10), 1040)).toBeNull();
    expect(session.reason).toMatch(/outdated/i);
    expect(session.ingest(observation(30), 1040)).toBeNull();
    expect(session.ingest(observation(60), 1060)?.atMs).toBe(1044);
  });

  it("detects a backwards captured source clock even with a larger sequence", () => {
    const session = joined();
    expect(session.ingest(observation(30), 1030)).not.toBeNull();
    expect(session.ingest(observation(20, { sequence: 100 }), 1040)).toBeNull();
    expect(session.binding).toBeNull();
    expect(session.reason).toMatch(/clock reset/i);
  });

  it("detects a repeated capture timestamp or regressed processing clock", () => {
    for (const next of [
      observation(0, { sequence: 2 }),
      observation(1, { processedAtNs: (originNs + 2_000_000n).toString() }),
    ]) {
      const session = joined();
      expect(session.ingest(next, 1030)).toBeNull();
      expect(session.binding).toBeNull();
    }
  });

  it("requires rejoin across long receipt or source gaps and future source discontinuities", () => {
    for (const [next, receivedAtMs] of [
      [observation(30), 1400],
      [observation(400), 1400],
      [observation(100), 1030],
    ] as const) {
      const session = joined();
      expect(session.ingest(next, receivedAtMs)).toBeNull();
      expect(session.binding).toBeNull();
      expect(session.reason).toMatch(/interrupted|ahead/i);
    }
  });

  it("rejects a backwards browser monotonic time instead of comparing unrelated clocks", () => {
    const session = joined();
    expect(session.ingest(observation(30), 999)).toBeNull();
    expect(session.binding).toBeNull();
  });

  it.each([
    { capturedAtNs: "not-nanoseconds" },
    { capturedAtNs: "-1" },
    { processedAtNs: "1.5" },
    { processedAtNs: (originNs - 1n).toString() },
    { processedAtNs: (originNs + 351_000_000n).toString() },
    { sequence: -1 },
    { sequence: 1.5 },
    { epoch: "" },
  ])("rejects invalid or already stale admission timing: %j", (change) => {
    const session = new SinglePlayerSession();
    expect(
      session.join(observation(0, change), "participant", 1000),
    ).toBeNull();
    expect(session.binding).toBeNull();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects invalid receipt time %s",
    (receivedAtMs) => {
      const session = new SinglePlayerSession();
      expect(
        session.join(observation(), "participant", receivedAtMs),
      ).toBeNull();
    },
  );

  it("preserves processing-age rejection after enrollment", () => {
    const session = joined();
    const next = observation(30, {
      processedAtNs: (originNs + 430_000_000n).toString(),
    });
    expect(session.ingest(next, 1030)).toBeNull();
    expect(session.reason).toMatch(/stale/i);
  });
});
