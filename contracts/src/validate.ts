import Ajv from "ajv";
import schema from "../schemas/observation.schema.json";
import type { Observation } from "../generated/observation";

const validate = new Ajv({
  allErrors: false,
  strict: true,
}).compile<Observation>(schema);

/** Reject bad wire data before it can become renderer or future game input. */
export function parseObservation(value: unknown): Observation {
  if (!validate(value)) {
    const error = validate.errors?.[0];
    throw new Error(
      `Invalid observation: ${error?.instancePath || "/"} ${error?.message || ""}`,
    );
  }
  if (
    value.detectedCount !== value.people.length ||
    value.detectedCount > value.capacity
  ) {
    throw new Error(
      "Invalid observation: detected count does not match bounded detections.",
    );
  }
  if (value.capacityReached !== (value.detectedCount === value.capacity)) {
    throw new Error(
      "Invalid observation: inconsistent detection capacity flag.",
    );
  }
  if (BigInt(value.processedAtNs) < BigInt(value.capturedAtNs)) {
    throw new Error(
      "Invalid observation: processing precedes capture in the source clock.",
    );
  }
  if ((value.source === "demo") !== (value.algorithm === "synthetic")) {
    throw new Error(
      "Invalid observation: synthetic detections must be labeled as demo input.",
    );
  }
  if ((value.source === "demo") !== (value.clock.quality === "synthetic")) {
    throw new Error(
      "Invalid observation: source timestamp quality is mislabeled.",
    );
  }
  const usedTrackIds = new Set<string>();
  for (const person of value.people) {
    if (person.identity === "confident" && person.trackId === null) {
      throw new Error(
        "Invalid observation: confident identity requires a camera track.",
      );
    }
    if (person.trackId !== null) {
      if (usedTrackIds.has(person.trackId)) {
        throw new Error(
          "Invalid observation: camera track is assigned to multiple detections.",
        );
      }
      usedTrackIds.add(person.trackId);
    }
    for (const joint of Object.values(person.joints)) {
      if (
        joint.inFrame &&
        (joint.x === null ||
          joint.y === null ||
          joint.x < 0 ||
          joint.x > 1 ||
          joint.y < 0 ||
          joint.y > 1)
      ) {
        throw new Error(
          "Invalid observation: in-frame joint is outside normalized image bounds.",
        );
      }
    }
  }
  return value;
}
