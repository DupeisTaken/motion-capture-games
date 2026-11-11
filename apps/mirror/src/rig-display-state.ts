import experiment from "../../../configs/xyz-experiment.json";
import type { RigFrame, RigView } from "./rig-state";

export const DISPLAY_SOURCE_MAX_AGE_NS = BigInt(experiment.gates.max_age_ns);
const MAX_TIME_UNCERTAINTY_NS = BigInt(
  experiment.gates.max_time_uncertainty_ns,
);
const MAX_NS = 9223372036854775807n;

export type RigDisplayReason =
  | "camera_unavailable"
  | "primary_unavailable"
  | "invalid_image_geometry"
  | "invalid_timing"
  | "clock_mismatch"
  | "future_input"
  | "stale_input"
  | "no_visible_joints";
export type RigDisplayWarning =
  | "missing_joints"
  | "outside_image"
  | "unverified_exposure_time"
  | "time_uncertain"
  | "identity_uncertain";
export type RigDisplayedCameraState = {
  selectedCameraId: string | null;
  view: RigView | null;
  status: "usable" | "partial" | "unavailable";
  drawable: boolean;
  visibleJointCount: number;
  totalJointCount: number;
  sourceAgeNs: string | null;
  reasons: RigDisplayReason[];
  warnings: RigDisplayWarning[];
};

/** Storage contains a synthetic camera identity, never a role or a physical plan. */
export function parseDisplayedCameraPreference(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    !/\p{Cc}/u.test(value)
    ? value
    : null;
}

function nanoseconds(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,18})$/.test(value))
    return null;
  const result = BigInt(value);
  return result <= MAX_NS ? result : null;
}

function absent(
  selectedCameraId: string | null,
  reason: "camera_unavailable" | "primary_unavailable",
): RigDisplayedCameraState {
  return {
    selectedCameraId,
    view: null,
    status: "unavailable",
    drawable: false,
    visibleJointCount: 0,
    totalJointCount: 0,
    sourceAgeNs: null,
    reasons: [reason],
    warnings: [],
  };
}

/** Select one source's recorded 2D observations without changing role or XYZ state.
 *
 * The caller persists the returned initial identity. Passing that identity on later
 * samples prevents an unavailable choice from silently falling back to another view.
 */
export function resolveDisplayedCamera(
  frame: RigFrame,
  preferredCameraId: string | null,
): RigDisplayedCameraState {
  let selectedCameraId = preferredCameraId;
  if (selectedCameraId === null) {
    const primary = frame.views.filter((view) => view.role === "primary");
    if (primary.length !== 1) return absent(null, "primary_unavailable");
    selectedCameraId = primary[0].cameraId;
  }
  if (parseDisplayedCameraPreference(selectedCameraId) === null)
    return absent(null, "camera_unavailable");
  const matching = frame.views.filter(
    (view) => view.cameraId === selectedCameraId,
  );
  if (matching.length !== 1)
    return absent(selectedCameraId, "camera_unavailable");
  const view = matching[0];
  const reasons: RigDisplayReason[] = [];
  const warnings: RigDisplayWarning[] = [];
  const [width, height] = view.imageSize;
  const geometryValid = [width, height].every(
    (size) => Number.isSafeInteger(size) && size > 0 && size <= 16384,
  );
  if (!geometryValid) reasons.push("invalid_image_geometry");
  let visible = 0;
  let missing = 0;
  let outside = 0;
  for (const joint of view.joints) {
    if (
      joint.x === null ||
      joint.y === null ||
      !Number.isFinite(joint.x) ||
      !Number.isFinite(joint.y)
    )
      missing++;
    else if (
      geometryValid &&
      joint.x >= 0 &&
      joint.x < width &&
      joint.y >= 0 &&
      joint.y < height
    )
      visible++;
    else if (geometryValid) outside++;
  }
  if (missing) warnings.push("missing_joints");
  if (outside) warnings.push("outside_image");
  if (geometryValid && visible === 0) reasons.push("no_visible_joints");

  const time = nanoseconds(view.timeNs);
  const uncertainty = nanoseconds(view.uncertaintyNs);
  const evaluated = nanoseconds(frame.evaluatedAtNs);
  let sourceAgeNs: string | null = null;
  // This fixture generator evaluates in mapped-host time. Browser wall time must
  // never expire an otherwise usable historical recording during playback.
  if (view.clockDomain !== "mapped-host") reasons.push("clock_mismatch");
  else if (time === null || uncertainty === null || evaluated === null)
    reasons.push("invalid_timing");
  else {
    const age = evaluated - (time - uncertainty);
    sourceAgeNs = age.toString();
    if (time + uncertainty > evaluated) reasons.push("future_input");
    if (age > DISPLAY_SOURCE_MAX_AGE_NS) reasons.push("stale_input");
  }
  if (!view.timeVerified || view.timestampKind === "host-read-completion")
    warnings.push("unverified_exposure_time");
  if (uncertainty !== null && uncertainty > MAX_TIME_UNCERTAINTY_NS)
    warnings.push("time_uncertain");
  if (!view.identityConfirmed || view.rigTrackId === null)
    warnings.push("identity_uncertain");

  const drawable = reasons.length === 0;
  return {
    selectedCameraId,
    view,
    status: !drawable
      ? "unavailable"
      : visible < view.joints.length
        ? "partial"
        : "usable",
    drawable,
    visibleJointCount: visible,
    totalJointCount: view.joints.length,
    sourceAgeNs,
    reasons,
    warnings,
  };
}
