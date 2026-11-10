import { describe, expect, it } from "vitest";
import fixture from "../../contracts/examples/synthetic-observation.json";
import type {
  Joint,
  Observation,
  Person,
} from "../../packages/motion/src/index";
import { observationToGameFrame } from "../../packages/motion/src/game-input";
import {
  BODY_NAMES,
  observationToDodgeFrame,
  syntheticBody,
} from "../../packages/motion/src/dodgeball-input";

function observation(): Observation {
  const value = structuredClone(fixture) as Observation;
  const person: Person = {
    trackId: "joined-track",
    identity: "confident",
    box: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    joints: {},
  };
  for (const point of syntheticBody())
    person.joints[point.name] = {
      x: point.x,
      y: point.y,
      score: 0.9,
      status: "observed",
      inFrame: true,
    };
  value.people = [person];
  return value;
}
function adapt(value: Observation, trackId = "joined-track") {
  return observationToDodgeFrame(
    value,
    observationToGameFrame(value, value.people[0], 123),
    trackId,
  );
}

describe("Dodgeball body adaptation", () => {
  it("preserves all 13 anatomical unmirrored joints and session timing", () => {
    const value = observation();
    const frame = adapt(value);
    expect(frame.body).toEqual(syntheticBody());
    expect(frame.body.map(({ name }) => name)).toEqual(BODY_NAMES);
    expect(frame).toMatchObject({
      atMs: 123,
      epoch: value.epoch,
      sequence: value.sequence,
      feetVisible: true,
      identity: "confident",
    });
    frame.contacts[0].x = 99;
    frame.body[0].x = 99;
    expect(adapt(value).body).toEqual(syntheticBody());
  });
  it.each([
    { status: "estimated" },
    { status: "missing" },
    { inFrame: false },
    { x: null },
    { y: null },
    { x: NaN },
    { y: Infinity },
    { x: -0.01 },
    { y: 1.01 },
    { score: 0.49 },
    { score: NaN },
    { score: 1.01 },
  ])(
    "excludes unsupported joint measurements %j instead of estimating them",
    (changes) => {
      const value = observation();
      Object.assign(value.people[0].joints.left_elbow!, changes);
      expect(adapt(value).body).toHaveLength(12);
      expect(adapt(value).body.some(({ name }) => name === "left_elbow")).toBe(
        false,
      );
    },
  );
  it("accepts exact confidence and image edges; missing ankle overrides feetVisible", () => {
    const value = observation();
    Object.assign(value.people[0].joints.nose!, { x: 0, y: 1, score: 0.5 });
    expect(adapt(value).body[0]).toEqual({ name: "nose", x: 0, y: 1 });
    value.people[0].joints.left_ankle!.status = "estimated";
    expect(adapt(value).feetVisible).toBe(false);
    delete value.people[0].joints.right_ankle;
    expect(adapt(value).body).toHaveLength(11);
  });
  it("never substitutes array order, another track, duplicate identity or another source frame", () => {
    const value = observation();
    const person = value.people[0];
    const frame = observationToGameFrame(value, person, 123);
    expect(observationToDodgeFrame(value, frame, "other")).toMatchObject({
      body: [],
      identity: "missing",
      feetVisible: false,
    });
    value.people.push(structuredClone(person));
    expect(observationToDodgeFrame(value, frame, person.trackId!).body).toEqual(
      [],
    );
    value.people.pop();
    expect(
      observationToDodgeFrame(
        { ...value, sequence: value.sequence + 1 },
        frame,
        person.trackId!,
      ).body,
    ).toEqual([]);
    expect(
      observationToDodgeFrame(
        { ...value, epoch: "changed" },
        frame,
        person.trackId!,
      ).body,
    ).toEqual([]);
  });
  it("preserves uncertain identity and includes exact selected track in revision", () => {
    const value = observation();
    const original = adapt(value).spaceRevision;
    value.people[0].identity = "ambiguous";
    expect(adapt(value).identity).toBe("uncertain");
    value.people[0].trackId = "another-track";
    expect(adapt(value, "another-track").spaceRevision).not.toBe(original);
  });
  it("preserves actual observation geometry even if a caller reuses a session revision", () => {
    const value = observation();
    const frame = observationToGameFrame(value, value.people[0], 123);
    const before = observationToDodgeFrame(value, frame, "joined-track");
    value.transformRevision = "new-transform";
    expect(
      observationToDodgeFrame(value, frame, "joined-track").spaceRevision,
    ).not.toBe(before.spaceRevision);
  });
  it("does not accept a frame whose session already lost either foot", () => {
    const value = observation();
    const frame = observationToGameFrame(value, value.people[0], 123);
    expect(
      observationToDodgeFrame(
        value,
        { ...frame, feetVisible: false },
        "joined-track",
      ).feetVisible,
    ).toBe(false);
  });
  it("keeps the synthetic body rigid and fully in image at extreme centers", () => {
    for (const x of [-100, 0, 0.5, 1, 100])
      for (const y of [-100, 0, 0.5, 1, 100]) {
        const body = syntheticBody(x, y);
        expect(body).toHaveLength(13);
        expect(
          body.every(
            (point) =>
              point.x >= 0.018 &&
              point.x <= 0.982 &&
              point.y >= 0.018 &&
              point.y <= 0.982,
          ),
        ).toBe(true);
        const nose = body.find(({ name }) => name === "nose")!;
        expect(nose.x).toBeGreaterThanOrEqual(0.045);
        expect(nose.x).toBeLessThanOrEqual(0.955);
        expect(nose.y).toBeGreaterThanOrEqual(0.045);
        expect(nose.y).toBeLessThanOrEqual(0.955);
        const left = body.find(({ name }) => name === "left_shoulder")!;
        const right = body.find(({ name }) => name === "right_shoulder")!;
        expect(right.x - left.x).toBeCloseTo(0.18);
      }
    expect(() => syntheticBody(NaN)).toThrow("finite");
    expect(() => syntheticBody(0.5, Infinity)).toThrow("finite");
  });
  it("does not import diagnostic estimated-joint rendering as scoring confidence", () => {
    const value = observation();
    const joint = value.people[0].joints.nose as Joint;
    joint.status = "estimated";
    expect(adapt(value).body.some(({ name }) => name === "nose")).toBe(false);
  });
});
