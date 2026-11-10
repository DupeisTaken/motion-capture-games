import type { Observation } from "./index";
import type { GameMotionFrame } from "./game-input";
import { GAME_INPUT_QUALITY, observationSpaceRevision } from "./game-input";

/** Canonical anatomical names; presentation alone applies the mirror transform. */
export const BODY_NAMES = [
  "nose",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
] as const;
export type BodyName = (typeof BODY_NAMES)[number];
export interface BodyPoint {
  name: BodyName;
  x: number;
  y: number;
}
export interface DodgeMotionFrame extends GameMotionFrame {
  body: BodyPoint[];
}
/** Center limits preserve the entire rehearsal head/limb footprint in the image. */
export const SYNTHETIC_BODY_BOUNDS = Object.freeze({
  left: 0.2,
  right: 0.8,
  top: 0.35,
  bottom: 0.6,
});

/** Never substitute another person or shrink a collider around missing joints. */
export function observationToDodgeFrame(
  observation: Observation,
  frame: GameMotionFrame,
  trackId: string,
): DodgeMotionFrame {
  const matches = observation.people.filter(
    (person) => !!trackId && person.trackId === trackId,
  );
  const person = matches.length === 1 ? matches[0] : null;
  const compatible =
    observation.epoch === frame.epoch &&
    observation.sequence === frame.sequence;
  const body: BodyPoint[] = [];
  if (person && compatible) {
    for (const name of BODY_NAMES) {
      const joint = person.joints[name];
      if (
        joint?.status === "observed" &&
        joint.inFrame &&
        joint.x !== null &&
        joint.y !== null &&
        Number.isFinite(joint.x) &&
        Number.isFinite(joint.y) &&
        joint.x >= 0 &&
        joint.x <= 1 &&
        joint.y >= 0 &&
        joint.y <= 1 &&
        Number.isFinite(joint.score) &&
        joint.score >= GAME_INPUT_QUALITY.minimumScore &&
        joint.score <= 1
      )
        body.push({ name, x: joint.x, y: joint.y });
    }
  }
  return {
    ...structuredClone(frame),
    identity:
      !person || !compatible
        ? "missing"
        : person.identity === "confident" && frame.identity === "confident"
          ? "confident"
          : "uncertain",
    feetVisible:
      frame.feetVisible &&
      body.some((point) => point.name === "left_ankle") &&
      body.some((point) => point.name === "right_ankle"),
    // Include the exact selected track even when a caller supplies a bare revision.
    spaceRevision: JSON.stringify([
      frame.spaceRevision,
      observationSpaceRevision(observation),
      trackId,
    ]),
    body,
  };
}

/** Synthetic rehearsal only: translation preserves the full body at image edges. */
export function syntheticBody(x = 0.5, y = 0.5): BodyPoint[] {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new Error("Synthetic body center must be finite.");
  const bounds = SYNTHETIC_BODY_BOUNDS;
  const centerX = Math.max(bounds.left, Math.min(bounds.right, x));
  const centerY = Math.max(bounds.top, Math.min(bounds.bottom, y));
  const offsets: ReadonlyArray<readonly [BodyName, number, number]> = [
    ["nose", 0, -0.3],
    ["left_shoulder", -0.09, -0.2],
    ["right_shoulder", 0.09, -0.2],
    ["left_elbow", -0.14, -0.08],
    ["right_elbow", 0.14, -0.08],
    ["left_wrist", -0.18, 0.02],
    ["right_wrist", 0.18, 0.02],
    ["left_hip", -0.065, 0.08],
    ["right_hip", 0.065, 0.08],
    ["left_knee", -0.075, 0.22],
    ["right_knee", 0.075, 0.22],
    ["left_ankle", -0.085, 0.38],
    ["right_ankle", 0.085, 0.38],
  ];
  return offsets.map(([name, dx, dy]) => ({
    name,
    // Round-off at an exact edge must not look like an off-image measurement.
    x: Math.max(0, Math.min(1, centerX + dx)),
    y: Math.max(0, Math.min(1, centerY + dy)),
  }));
}
