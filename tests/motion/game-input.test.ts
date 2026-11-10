import { describe, expect, it } from "vitest";
import fixture from "../../contracts/examples/synthetic-observation.json";
import {
  observedContacts,
  observationSpaceRevision,
  observationToGameFrame,
  type Joint,
  type Observation,
  type Person,
} from "../../packages/motion/src/index";

const joint = (changes: Partial<Joint> = {}): Joint => ({
  x: 0.2,
  y: 0.7,
  score: 0.9,
  status: "observed",
  inFrame: true,
  ...changes,
});
const person = (): Person => ({
  trackId: "joined-track",
  identity: "confident",
  box: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  joints: {
    left_wrist: joint(),
    right_wrist: joint({ x: 0.8 }),
    left_hip: joint({ y: 0.6 }),
    right_hip: joint({ x: 0.8, y: 0.6 }),
    left_ankle: joint({ y: 0.9 }),
    right_ankle: joint({ x: 0.8, y: 0.9 }),
  },
});
const observation = (): Observation => structuredClone(fixture) as Observation;

describe("canonical game-motion adaptation", () => {
  it("retains anatomical names and unmirrored coordinates with explicit wrist/ankle proxies", () => {
    const contacts = observedContacts(person());
    expect(contacts.map((contact) => contact.name)).toEqual([
      "left_wrist",
      "right_wrist",
      "left_hip",
      "right_hip",
      "left_foot",
      "right_foot",
    ]);
    expect(contacts[0]).toEqual({ name: "left_wrist", x: 0.2, y: 0.7 });
    expect(contacts[1].x).toBe(0.8);
    expect(
      contacts.every((contact) => contact.towardScreenM === undefined),
    ).toBe(true);
  });

  it.each([
    { status: "estimated" as const },
    { status: "missing" as const },
    { inFrame: false },
    { x: null },
    { y: null },
    { x: -0.01 },
    { x: 1.01 },
    { y: -0.01 },
    { y: 1.01 },
    { x: Number.NaN },
    { y: Number.POSITIVE_INFINITY },
    { score: 0.49 },
    { score: Number.NaN },
    { score: 1.01 },
  ])("excludes unsupported contact measurements: %j", (changes) => {
    const value = person();
    value.joints.left_wrist = joint(changes);
    expect(
      observedContacts(value).map((contact) => contact.name),
    ).not.toContain("left_wrist");
  });

  it("accepts exact confidence/image boundaries without edge-clamping outside points", () => {
    const value = person();
    value.joints.left_wrist = joint({ x: 0, y: 1, score: 0.5 });
    expect(observedContacts(value)[0]).toEqual({
      name: "left_wrist",
      x: 0,
      y: 1,
    });
  });

  it("requires both observed feet, and does not infer depth from hips or bounding boxes", () => {
    const value = observation();
    const body = person();
    const frame = observationToGameFrame(value, body, 1234.5);
    expect(frame).toMatchObject({
      version: 1,
      atMs: 1234.5,
      slotId: "player-1",
      identity: "confident",
      feetVisible: true,
      depthAvailable: false,
    });
    body.joints.left_ankle = joint({ status: "estimated" });
    expect(observationToGameFrame(value, body, 1234.5).feetVisible).toBe(false);
    delete body.joints.right_ankle;
    expect(observationToGameFrame(value, body, 1234.5).feetVisible).toBe(false);
  });

  it.each(["tentative", "ambiguous"] as const)(
    "preserves %s identity as unusable for scoring",
    (identity) => {
      const body = person();
      body.identity = identity;
      expect(observationToGameFrame(observation(), body, 0).identity).toBe(
        "uncertain",
      );
    },
  );

  it("uses unambiguous revision values and includes source geometry and model provenance", () => {
    const original = observation();
    const revision = observationSpaceRevision(original);
    for (const update of [
      { cameraId: "other" },
      { transformRevision: "other" },
      { calibrationId: "other" },
      { modelId: "other" },
      { tracker: "iou" as const },
      { algorithm: "mediapipe" as const },
      { image: { ...original.image, width: original.image.width + 1 } },
      { image: { ...original.image, height: original.image.height + 1 } },
    ]) {
      expect(observationSpaceRevision({ ...original, ...update })).not.toBe(
        revision,
      );
    }
    expect(observationSpaceRevision(structuredClone(original))).toBe(revision);
    expect(
      observationSpaceRevision({ ...original, calibrationId: "null" }),
    ).not.toBe(observationSpaceRevision({ ...original, calibrationId: null }));
  });
});
