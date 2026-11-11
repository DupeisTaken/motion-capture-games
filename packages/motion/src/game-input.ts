import type { Joint, Observation, Person, RenderableJoint } from "./index";

export type ContactName =
  | "left_hand"
  | "right_hand"
  | "left_wrist"
  | "right_wrist"
  | "left_hip"
  | "right_hip"
  | "left_foot"
  | "right_foot";

export interface MotionContact {
  name: ContactName;
  /** Upright, unmirrored normalized camera-image coordinates. */
  x: number;
  y: number;
  /** Optional calibrated displacement in meters, positive toward the screen. */
  towardScreenM?: number;
}

export interface GameMotionFrame {
  version: 1;
  epoch: string;
  sequence: number;
  /** Source time mapped onto the browser's monotonic timeline. */
  atMs: number;
  slotId: "player-1";
  identity: "confident" | "uncertain" | "missing";
  feetVisible: boolean;
  depthAvailable: boolean;
  contacts: MotionContact[];
  spaceRevision: string;
}

export const GAME_INPUT_QUALITY = {
  minimumScore: 0.5,
  maximumAgeMs: 350,
  // Proposed scheduling allowance, not a measured clock-synchronization bound.
  maximumAnchorCorrectionMs: 20,
} as const;

const CONTACT_JOINTS = [
  ["left_wrist", "left_wrist"],
  ["right_wrist", "right_wrist"],
  ["left_hip", "left_hip"],
  ["right_hip", "right_hip"],
  ["left_ankle", "left_foot"],
  ["right_ankle", "right_foot"],
] as const;

function observed(joint: Joint | undefined): joint is RenderableJoint {
  return (
    joint?.status === "observed" &&
    joint.inFrame &&
    joint.x !== null &&
    joint.y !== null &&
    joint.x >= 0 &&
    joint.x <= 1 &&
    joint.y >= 0 &&
    joint.y <= 1 &&
    joint.score >= GAME_INPUT_QUALITY.minimumScore &&
    joint.score <= 1
  );
}

/** Palm centers require same-side finger evidence from the same observation. */
export function observedContacts(person: Person): MotionContact[] {
  const contacts: MotionContact[] = [];
  for (const [jointName, contactName] of CONTACT_JOINTS) {
    const joint = person.joints[jointName];
    if (observed(joint)) {
      contacts.push({ name: contactName, x: joint.x, y: joint.y });
    }
  }
  for (const side of ["left", "right"] as const) {
    const wrist = person.joints[`${side}_wrist`];
    const index = person.joints[`${side}_index_finger`];
    const pinky = person.joints[`${side}_pinky_finger`];
    if (observed(wrist) && observed(index) && observed(pinky)) {
      // Halfway from the wrist to the midpoint across the two finger landmarks.
      contacts.push({
        name: `${side}_hand`,
        x: (2 * wrist.x + index.x + pinky.x) / 4,
        y: (2 * wrist.y + index.y + pinky.y) / 4,
      });
    }
  }
  return contacts;
}

/** Geometry and provenance changes invalidate association and gesture history. */
export function observationSpaceRevision(observation: Observation): string {
  return JSON.stringify([
    observation.cameraId,
    observation.coordinateSpace,
    observation.transformRevision,
    observation.calibrationId,
    observation.image.width,
    observation.image.height,
    observation.modelId,
    observation.algorithm,
    observation.tracker,
  ]);
}

export function observationToGameFrame(
  observation: Observation,
  person: Person,
  atMs: number,
): GameMotionFrame {
  const contacts = observedContacts(person);
  return {
    version: 1,
    epoch: observation.epoch,
    sequence: observation.sequence,
    atMs,
    slotId: "player-1",
    identity: person.identity === "confident" ? "confident" : "uncertain",
    feetVisible:
      contacts.some((contact) => contact.name === "left_foot") &&
      contacts.some((contact) => contact.name === "right_foot"),
    // Neither current 2D provider establishes calibrated toward-screen depth.
    depthAvailable: false,
    contacts,
    spaceRevision: observationSpaceRevision(observation),
  };
}
