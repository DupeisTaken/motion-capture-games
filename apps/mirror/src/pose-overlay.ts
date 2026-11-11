import type { Observation } from "../../../contracts/generated/observation";
import {
  isRenderableJoint,
  JOINT_NAMES,
} from "../../../packages/motion/src/index";

const TRANSITION_MS = 32;
const MAX_JOINT_TRAVEL_IN_BODY_HEIGHTS = 0.08;

/** Ease small steps between measured poses on the diagnostic canvas only. */
export function overlayPeople(
  previous: Observation,
  current: Observation,
  elapsedMs: number,
  confidence: number,
): Observation["people"] {
  if (elapsedMs < 0 || elapsedMs >= TRANSITION_MS) return current.people;
  const blend = elapsedMs / TRANSITION_MS;
  const aspect = current.image.width / current.image.height;
  return current.people.map((person) => {
    if (person.identity !== "confident" || person.trackId === null)
      return person;
    const before = previous.people.find(
      (candidate) =>
        candidate.trackId === person.trackId &&
        candidate.identity === "confident",
    );
    if (!before) return person;

    const limit =
      Math.min(person.box.height, before.box.height) *
      MAX_JOINT_TRAVEL_IN_BODY_HEIGHTS;
    const joints = { ...person.joints };
    for (const name of JOINT_NAMES) {
      const from = before.joints[name];
      const to = person.joints[name];
      if (
        from?.status !== "observed" ||
        to?.status !== "observed" ||
        !isRenderableJoint(from, confidence) ||
        !isRenderableJoint(to, confidence)
      )
        continue;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      if (Math.hypot(dx * aspect, dy) <= limit) {
        joints[name] = {
          ...to,
          x: from.x + blend * dx,
          y: from.y + blend * dy,
        };
      }
    }
    return { ...person, joints };
  });
}
