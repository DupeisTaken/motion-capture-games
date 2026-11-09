/* Generated from contracts/schemas/observation.schema.json. Do not edit. */

/**
 * This interface was referenced by `Observation`'s JSON-Schema
 * via the `definition` "Nanoseconds".
 */
export type Nanoseconds = string;
/**
 * A model estimate is not a calibrated probability or metric spatial measurement. Missing coordinates are null; off-image estimates retain coordinates with inFrame false.
 *
 * This interface was referenced by `Observation`'s JSON-Schema
 * via the `definition` "Joint".
 */
export type Joint = {
  x: number | null;
  y: number | null;
  score: number;
  status: 'observed' | 'estimated' | 'missing';
  inFrame: boolean;
};

/**
 * Diagnostic camera observations. Coordinates are upright, unmirrored, normalized image coordinates. Nanoseconds are decimal strings to preserve integer precision in JavaScript. Counts are visible detections, never enrolled player slots.
 */
export interface Observation {
  version: 1;
  epoch: string;
  sequence: number;
  frameId: string;
  source: 'camera' | 'demo';
  cameraId: string;
  image: {
    width: number;
    height: number;
  };
  capturedAtNs: Nanoseconds;
  processedAtNs: Nanoseconds;
  clock: {
    domain: 'host-monotonic';
    quality: 'host-read-completion' | 'synthetic';
    uncertaintyNs: Nanoseconds | null;
  };
  algorithm: 'mediapipe' | 'rtmpose' | 'synthetic';
  tracker: 'iou' | 'pose';
  coordinateSpace: 'normalized-camera';
  transformRevision: string;
  calibrationId: string | null;
  modelId: string;
  /**
   * @maxItems 12
   */
  people: Person[];
  detectedCount: number;
  capacity: number;
  /**
   * The detector returned its configured maximum. More people may be present; this is not proof of the total room population.
   */
  capacityReached: boolean;
  metrics: {
    inferenceMs: number;
    captureDrops: number;
    processingMs: number;
  };
}
/**
 * This interface was referenced by `Observation`'s JSON-Schema
 * via the `definition` "Person".
 */
export interface Person {
  trackId: string | null;
  identity: 'tentative' | 'confident' | 'ambiguous';
  box: Box;
  joints: Joints;
}
/**
 * Normalized full-image person box. Do not clamp off-image estimates to the image edge.
 *
 * This interface was referenced by `Observation`'s JSON-Schema
 * via the `definition` "Box".
 */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
/**
 * This interface was referenced by `Observation`'s JSON-Schema
 * via the `definition` "Joints".
 */
export interface Joints {
  nose?: Joint;
  left_eye?: Joint;
  right_eye?: Joint;
  left_ear?: Joint;
  right_ear?: Joint;
  left_shoulder?: Joint;
  right_shoulder?: Joint;
  left_elbow?: Joint;
  right_elbow?: Joint;
  left_wrist?: Joint;
  right_wrist?: Joint;
  left_hip?: Joint;
  right_hip?: Joint;
  left_knee?: Joint;
  right_knee?: Joint;
  left_ankle?: Joint;
  right_ankle?: Joint;
}
