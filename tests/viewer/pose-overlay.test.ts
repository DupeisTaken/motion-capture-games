import { describe, expect, it } from "vitest";
import { overlayPeople } from "../../apps/mirror/src/pose-overlay";
import type {
  Observation,
  Person,
} from "../../contracts/generated/observation";
import fixture from "../../contracts/examples/synthetic-observation.json";

function person(trackId: string, x: number): Person {
  return {
    trackId,
    identity: "confident",
    box: { x: x - 0.1, y: 0.2, width: 0.2, height: 0.6 },
    joints: {
      left_wrist: { x, y: 0.5, status: "observed", score: 0.9, inFrame: true },
    },
  };
}

function observation(people: Person[]): Observation {
  return { ...(fixture as Observation), people };
}

describe("diagnostic pose transitions", () => {
  it("smooths small movements by track across three reordered detections", () => {
    const previous = observation([
      person("a", 0.2),
      person("b", 0.5),
      person("c", 0.8),
    ]);
    const current = observation([
      person("c", 0.82),
      person("a", 0.22),
      person("b", 0.52),
    ]);
    const people = overlayPeople(previous, current, 16, 0.5);
    for (const [index, x] of [0.81, 0.21, 0.51].entries()) {
      expect(people[index].joints.left_wrist?.x).toBeCloseTo(x);
    }
    expect(current.people[0].joints.left_wrist?.x).toBe(0.82);
    expect(overlayPeople(previous, current, 32, 0.5)).toBe(current.people);
  });

  it("does not carry missing joints, large movements or uncertain identities forward", () => {
    const previous = observation([person("a", 0.2), person("b", 0.5)]);
    previous.people[1].joints.right_wrist = {
      x: 0.5,
      y: 0.5,
      status: "observed",
      score: 0.9,
      inFrame: true,
    };
    const current = observation([
      { ...person("a", 0.22), identity: "ambiguous" },
      person("b", 0.75),
      person("c", 0.8),
    ]);
    expect(overlayPeople(previous, current, 16, 0.5)).toEqual(current.people);
    current.people[1].joints = {};
    expect(overlayPeople(previous, current, 16, 0.5)).toEqual(current.people);
  });
});
