import { describe, expect, it } from "vitest";
import fixture from "../../contracts/examples/synthetic-observation.json";
import type { Observation, Person } from "../../packages/motion/src/index";
import {
  MultiplayerSession,
  PLAYER_SLOT_IDS,
} from "../../packages/session/src/multiplayer";

const originNs = 98_765_432_109_876_543n;

function body(trackId: string, x = 0.5): Person {
  return {
    trackId,
    identity: "confident",
    box: { x: x - 0.1, y: 0.1, width: 0.2, height: 0.8 },
    joints: {
      left_wrist: {
        x,
        y: 0.5,
        score: 0.95,
        status: "observed",
        inFrame: true,
      },
    },
  };
}

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
    people: [body("one", 0.2), body("two", 0.5), body("three", 0.8)],
    detectedCount: 3,
    ...changes,
  };
}

function joined(count: 2 | 3 = 3): MultiplayerSession {
  const session = new MultiplayerSession(count);
  for (let index = 0; index < count; index++) {
    expect(
      session.join(
        PLAYER_SLOT_IDS[index],
        observation(),
        ["one", "two", "three"][index],
        1000,
      ),
    ).not.toBeNull();
  }
  return session;
}

describe("explicit multiplayer membership", () => {
  it("does not enroll detected people and exposes every anonymous slot", () => {
    const session = new MultiplayerSession();
    expect(
      session.ingest(observation(), 1000).every((slot) => !slot.frame),
    ).toBe(true);
    expect(session.slots.map((slot) => slot.status)).toEqual([
      "empty",
      "empty",
      "empty",
    ]);
    expect(
      session.spectators(observation()).map((person) => person.trackId),
    ).toEqual(["one", "two", "three"]);
  });

  it.each([2, 3] as const)(
    "routes %i independent game engines through outer slot IDs",
    (count) => {
      const session = joined(count);
      const results = session.ingest(observation(30), 1030);
      expect(results.filter((slot) => slot.frame)).toHaveLength(count);
      for (let index = 0; index < count; index++) {
        expect(results[index].slotId).toBe(PLAYER_SLOT_IDS[index]);
        expect(results[index].frame?.slotId).toBe("player-1");
        expect(results[index].frame?.atMs).toBe(1014);
        expect(results[index].binding?.trackId).toBe(
          ["one", "two", "three"][index],
        );
      }
    },
  );

  it.each([1, 2, 3] as const)(
    "enforces declared software capacity %i",
    (capacity) => {
      const session = new MultiplayerSession(capacity);
      for (let index = 0; index < 3; index++) {
        const result = session.join(
          PLAYER_SLOT_IDS[index],
          observation(),
          ["one", "two", "three"][index],
          1000,
        );
        expect(result !== null).toBe(index < capacity);
      }
    },
  );

  it.each([0, 4, 1.5, Number.NaN])(
    "rejects invalid software capacity %s",
    (capacity) => {
      expect(() => new MultiplayerSession(capacity as 1)).toThrow(RangeError);
    },
  );

  it("rejects duplicate track admission and occupied-slot replacement without losing membership", () => {
    const session = joined(2);
    expect(session.join("player-3", observation(), "one", 1000)).toBeNull();
    expect(session.join("player-1", observation(), "three", 1000)).toBeNull();
    expect(session.join("player-1", observation(), "one", 1000)).toBeNull();
    expect(session.binding("player-1")?.trackId).toBe("one");
    expect(session.status("player-1").status).toBe("ready");
  });

  it("rejects uncertain, absent, untracked and duplicate-ID candidates", () => {
    for (const people of [
      [],
      [{ ...body("one"), identity: "ambiguous" as const }],
      [{ ...body("one"), trackId: null }],
      [body("one"), body("one")],
    ]) {
      const session = new MultiplayerSession();
      expect(
        session.join("player-1", observation(0, { people }), "one", 1000),
      ).toBeNull();
      expect(session.binding("player-1")).toBeNull();
      expect(session.status("player-1").reason).toBeTruthy();
    }
  });

  it("also respects the source's declared observation capacity", () => {
    const session = new MultiplayerSession(3);
    const source = observation(0, { capacity: 1, people: [body("one")] });
    expect(session.join("player-1", source, "one", 1000)).not.toBeNull();
    expect(session.join("player-2", source, "two", 1000)).toBeNull();
    expect(session.status("player-2").reason).toMatch(/capacity/);
  });

  it("keeps explicit associations when arrays reorder and people cross", () => {
    const session = joined();
    const results = session.ingest(
      observation(30, {
        people: [
          body("spectator", 0.7),
          body("three", 0.1),
          body("one", 0.9),
          body("two", 0.5),
        ],
        detectedCount: 4,
      }),
      1030,
    );
    expect(results.map((slot) => slot.frame?.contacts[0].x)).toEqual([
      0.9, 0.5, 0.1,
    ]);
    expect(
      session
        .spectators(
          observation(30, {
            people: [
              body("two"),
              body("spectator"),
              body("one"),
              body("three"),
            ],
          }),
        )
        .map((person) => person.trackId),
    ).toEqual(["spectator"]);
  });

  it.each(["ambiguous"] as const)(
    "freezes only a %s slot and never silently resumes or transfers its owner",
    (identity) => {
      const session = joined();
      const results = session.ingest(
        observation(30, {
          people: [
            body("one"),
            { ...body("two"), identity },
            body("three"),
            body("spectator"),
          ],
        }),
        1030,
      );
      expect(results.map((slot) => slot.status)).toEqual([
        "ready",
        "rejoin-required",
        "ready",
      ]);
      expect(results[1].frame).toBeNull();
      expect(session.binding("player-2")?.trackId).toBe("two");
      expect(session.ingest(observation(60), 1060)[1].frame).toBeNull();
      expect(session.join("player-2", observation(60), "two", 1060)).toBeNull();
      expect(
        session.spectators(observation()).map((person) => person.trackId),
      ).not.toContain("two");
      session.leave("player-2");
      expect(
        session.join("player-2", observation(60), "two", 1060),
      ).toMatchObject({ slotId: "player-2", frame: { slotId: "player-1" } });
      expect(
        session.ingest(observation(90), 1090).every((slot) => slot.frame),
      ).toBe(true);
    },
  );

  it("suspends a tentative same-track slot briefly and marks confirmed recovery", () => {
    const session = joined();
    const result = session.ingest(
      observation(30, {
        people: [
          body("one"),
          { ...body("two"), identity: "tentative" },
          body("three"),
        ],
      }),
      1030,
    );
    expect(result[1]).toMatchObject({
      status: "waiting",
      frame: null,
      binding: { trackId: "two" },
    });
    expect(result[0].frame).not.toBeNull();
    const recovered = session.ingest(observation(60), 1060);
    expect(recovered[1]).toMatchObject({ status: "ready", recovered: true });
    expect(recovered[1].frame).not.toBeNull();
  });

  it("expires only the missing player while a fresh shared source and others continue", () => {
    const session = joined();
    for (let elapsed = 50; elapsed <= 500; elapsed += 50)
      session.ingest(
        observation(elapsed, {
          people: [body("one"), body("three"), body("spectator")],
        }),
        1000 + elapsed,
      );
    session.expire(1500);
    expect(session.status("player-2")).toMatchObject({
      status: "rejoin-required",
      binding: { trackId: "two" },
    });
    expect(session.status("player-1").status).toBe("ready");
    expect(session.status("player-3").status).toBe("ready");
    expect(session.ingest(observation(550), 1550)[1].frame).toBeNull();
  });

  it("allows a 400ms compatible shared transport gap then expires idle input without packets", () => {
    const session = joined();
    session.expire(1400);
    expect(
      session
        .ingest(observation(400), 1400)
        .every((result) => result.frame && result.recovered),
    ).toBe(true);
    session.expire(1851);
    expect(
      session.slots.every((slot) => slot.status === "rejoin-required"),
    ).toBe(true);
  });

  it("preserves membership and never borrows a spectator when a participant disappears", () => {
    const session = joined();
    const result = session.ingest(
      observation(30, {
        people: [body("one"), body("three"), body("spectator")],
      }),
      1030,
    );
    expect(result[1].frame).toBeNull();
    expect(result[1].binding?.trackId).toBe("two");
    expect(result[0].frame).not.toBeNull();
    expect(result[2].frame).not.toBeNull();
  });

  it("makes leave explicit and keeps returned binding copies isolated", () => {
    const session = joined();
    session.binding("player-1")!.trackId = "tampered";
    session.slots[0].binding!.trackId = "tampered";
    expect(session.binding("player-1")?.trackId).toBe("one");
    session.leave("player-1");
    expect(session.status("player-1")).toMatchObject({
      binding: null,
      status: "empty",
      reason: null,
    });
    expect(
      session.spectators(observation()).map((person) => person.trackId),
    ).toEqual(["one"]);
    expect(
      session.join(
        "player-1",
        observation(30, {
          people: [body("replacement"), body("two"), body("three")],
        }),
        "replacement",
        1030,
      )?.frame.spaceRevision,
    ).not.toBe(session.binding("player-2")?.spaceRevision);
  });
});

describe("multiplayer source boundaries", () => {
  it("rejects old and duplicate packets before their identity can invalidate players", () => {
    const session = joined();
    session.ingest(observation(30), 1030);
    const duplicate = session.ingest(observation(30, { people: [] }), 1040);
    expect(duplicate.every((slot) => !slot.frame && slot.binding)).toBe(true);
    expect(duplicate.every((slot) => slot.status === "waiting")).toBe(true);
    session.ingest(observation(10), 1050);
    expect(
      session.ingest(observation(60), 1060).every((slot) => slot.frame),
    ).toBe(true);
  });

  it("does not freshen delayed current-packet admissions or admit an older packet", () => {
    const session = new MultiplayerSession();
    session.join("player-1", observation(), "one", 1000);
    expect(session.join("player-2", observation(), "two", 1400)).toBeNull();
    session.ingest(observation(30), 1030);
    expect(session.join("player-2", observation(), "two", 1040)).toBeNull();
    expect(session.join("player-2", observation(30), "two", 1029)).toBeNull();
    const result = session.join("player-2", observation(30), "two", 1040);
    expect(result?.frame.atMs).toBe(1014);
  });

  it("waits on stale source data without replaying or relabeling it as current", () => {
    const session = joined();
    session.ingest(observation(10), 1300);
    const stale = session.ingest(observation(20), 1400);
    expect(
      stale.every((slot) => !slot.frame && slot.status === "waiting"),
    ).toBe(true);
    expect(
      session
        .ingest(observation(300), 1420)
        .every((slot) => slot.frame?.atMs === 1284),
    ).toBe(true);
  });

  it("keeps a late join on the established source timeline rather than freshening a delayed packet", () => {
    const session = new MultiplayerSession();
    session.join("player-1", observation(), "one", 1000);
    session.ingest(observation(10), 1300);
    const second = session.join("player-2", observation(10), "two", 1300);
    expect(second).toBeNull();
    expect(session.binding("player-2")).toBeNull();
    session.ingest(observation(300), 1310);
    expect(session.status("player-1").status).toBe("ready");
    expect(
      session.join("player-2", observation(300), "two", 1310)?.frame.atMs,
    ).toBe(1284);
  });

  it.each([
    { epoch: "epoch-2" },
    { cameraId: "camera-2" },
    { source: "camera" as const },
    { calibrationId: "new-calibration" },
    { transformRevision: "new-transform" },
    { image: { width: 1280, height: 720 } },
    {
      clock: {
        domain: "host-monotonic" as const,
        quality: "host-read-completion" as const,
        uncertaintyNs: null,
      },
    },
    { capturedAtNs: originNs.toString(), sequence: 100 },
    { processedAtNs: (originNs + 2_000_000n).toString() },
  ])(
    "freezes all memberships on a shared source/geometry/clock discontinuity: %j",
    (change) => {
      const session = joined();
      session.ingest(observation(10), 1010);
      const results = session.ingest(observation(30, change), 1030);
      expect(
        results.every(
          (slot) => slot.status === "rejoin-required" && slot.frame === null,
        ),
      ).toBe(true);
      expect(results.map((slot) => slot.binding?.trackId)).toEqual([
        "one",
        "two",
        "three",
      ]);
      expect(
        session.ingest(observation(60), 1060).every((slot) => !slot.frame),
      ).toBe(true);
      expect(session.join("player-1", observation(60), "one", 1060)).toBeNull();
      session.leave("player-1");
      expect(
        session.join("player-1", observation(60), "one", 1060),
      ).not.toBeNull();
      expect(session.status("player-2").status).toBe("rejoin-required");
    },
  );

  it("invalidates all timing on a clock reset even if every participant disappears simultaneously", () => {
    const session = joined();
    session.ingest(observation(30), 1030);
    const results = session.ingest(
      observation(20, { sequence: 100, people: [] }),
      1040,
    );
    expect(results.every((slot) => slot.status === "rejoin-required")).toBe(
      true,
    );
    expect(results.every((slot) => /clock/.test(slot.reason ?? ""))).toBe(true);
  });
});
