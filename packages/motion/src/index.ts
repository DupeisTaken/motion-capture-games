import type { Observation } from "../../../contracts/generated/observation";
import schema from "../../../contracts/schemas/observation.schema.json";
import { parseObservation } from "../../../contracts/src/validate";

export type { Observation } from "../../../contracts/generated/observation";
export { parseObservation } from "../../../contracts/src/validate";
export {
  GAME_INPUT_QUALITY,
  observedContacts,
  observationSpaceRevision,
  observationToGameFrame,
} from "./game-input";
export type { ContactName, GameMotionFrame, MotionContact } from "./game-input";
export type Person = Observation["people"][number];
export type Joints = Person["joints"];
export type JointName = keyof Joints;
export type Joint = NonNullable<Joints[JointName]>;
export type RenderableJoint = Joint & { x: number; y: number };
export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Rect = Point & Size;
export type BoneSegment = {
  from: JointName;
  to: JointName;
  a: RenderableJoint;
  b: RenderableJoint;
};

// Names come from the canonical schema; no model-specific indices cross this boundary.
export const JOINT_NAMES = Object.keys(
  schema.definitions.Joints.properties,
) as JointName[];
export const BONES = [
  ["nose", "left_eye"],
  ["nose", "right_eye"],
  ["left_eye", "left_ear"],
  ["right_eye", "right_ear"],
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
] as const satisfies ReadonlyArray<readonly [JointName, JointName]>;

function assertSize(size: Size): void {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error(
      "Image and viewport dimensions must be finite positive numbers.",
    );
  }
}

/** Exact contain-fit rectangle. Use this same rectangle when drawing the source image. */
export function containRect(image: Size, viewport: Size): Rect {
  assertSize(image);
  assertSize(viewport);
  const scale = Math.min(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    x: (viewport.width - width) / 2,
    y: (viewport.height - height) / 2,
    width,
    height,
  };
}

/** Presentation mirroring moves coordinates, never anatomical joint names. No edge clamping. */
export function mapJoint(joint: Point, rect: Rect, mirror = true): Point {
  return {
    x: rect.x + (mirror ? 1 - joint.x : joint.x) * rect.width,
    y: rect.y + joint.y * rect.height,
  };
}

export function mapBox(box: Rect, rect: Rect, mirror = true): Rect {
  return {
    x: rect.x + (mirror ? 1 - box.x - box.width : box.x) * rect.width,
    y: rect.y + box.y * rect.height,
    width: box.width * rect.width,
    height: box.height * rect.height,
  };
}

/** Only supported in-image observations can form a diagnostic bone. */
export function isRenderableJoint(
  joint: Joint | undefined,
  threshold = 0.5,
): joint is RenderableJoint {
  return (
    !!joint &&
    Number.isFinite(threshold) &&
    threshold >= 0 &&
    threshold <= 1 &&
    joint.status !== "missing" &&
    joint.inFrame &&
    joint.x !== null &&
    joint.y !== null &&
    Number.isFinite(joint.x) &&
    Number.isFinite(joint.y) &&
    joint.x >= 0 &&
    joint.x <= 1 &&
    joint.y >= 0 &&
    joint.y <= 1 &&
    joint.score >= threshold
  );
}

export function visibleBones(joints: Joints, threshold = 0.5): BoneSegment[] {
  const segments: BoneSegment[] = [];
  for (const [from, to] of BONES) {
    const a = joints[from];
    const b = joints[to];
    if (isRenderableJoint(a, threshold) && isRenderableJoint(b, threshold)) {
      segments.push({ from, to, a, b });
    }
  }
  return segments;
}

export const MAX_METADATA_BYTES = 64 * 1024;
export const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
export type FramePacket = { observation: Observation; jpeg: Uint8Array };

/** Decode one bounded source-aligned packet: big-endian header length, JSON, then JPEG. */
export function decodeFramePacket(
  input: ArrayBuffer | Uint8Array,
): FramePacket {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (
    bytes.byteLength < 4 ||
    bytes.byteLength > 4 + MAX_METADATA_BYTES + MAX_PREVIEW_BYTES
  ) {
    throw new Error("Invalid frame packet: truncated or oversized message.");
  }
  const headerLength = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    4,
  ).getUint32(0, false);
  if (
    headerLength < 2 ||
    headerLength > MAX_METADATA_BYTES ||
    4 + headerLength > bytes.byteLength
  ) {
    throw new Error("Invalid frame packet: metadata length is out of bounds.");
  }
  const jpeg = bytes.subarray(4 + headerLength);
  if (
    jpeg.byteLength < 4 ||
    jpeg.byteLength > MAX_PREVIEW_BYTES ||
    jpeg[0] !== 0xff ||
    jpeg[1] !== 0xd8 ||
    jpeg[jpeg.byteLength - 2] !== 0xff ||
    jpeg[jpeg.byteLength - 1] !== 0xd9
  ) {
    throw new Error("Invalid frame packet: preview is not a bounded JPEG.");
  }
  let metadata: unknown;
  try {
    metadata = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(4, 4 + headerLength),
      ),
    );
  } catch {
    throw new Error("Invalid frame packet: metadata is not valid UTF-8 JSON.");
  }
  return { observation: parseObservation(metadata), jpeg };
}

/** A new source must be explicitly reset, so a late packet cannot revive an old epoch. */
export class ObservationOrder {
  private epoch: string | null = null;
  private sequence = -1;

  reset(epoch: string | null = null): void {
    this.epoch = epoch;
    this.sequence = -1;
  }

  accept(observation: Pick<Observation, "epoch" | "sequence">): boolean {
    if (
      !Number.isSafeInteger(observation.sequence) ||
      observation.sequence < 0 ||
      !observation.epoch
    )
      return false;
    if (this.epoch === null) this.epoch = observation.epoch;
    if (
      observation.epoch !== this.epoch ||
      observation.sequence <= this.sequence
    )
      return false;
    this.sequence = observation.sequence;
    return true;
  }
}
