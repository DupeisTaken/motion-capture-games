import {
  JOINT_NAMES,
  type JointName,
} from "../../../packages/motion/src/index";

export type RigPoint = { x: number; y: number; z: number };
export type RigImageJoint = {
  name: JointName;
  x: number | null;
  y: number | null;
};
export type RigWorldJoint = {
  name: JointName;
  x: number | null;
  y: number | null;
  z: number | null;
  reason: string;
};
export type RigView = {
  role: "primary" | "secondary";
  cameraId: string;
  cameraTrackId: string;
  rigTrackId: string | null;
  frameId: string;
  timeNs: string;
  uncertaintyNs: string;
  timestampKind:
    "synthetic-exposure" | "device-exposure" | "host-read-completion";
  timeVerified: boolean;
  identityConfirmed: boolean;
  calibrationId: string;
  transformRevision: string;
  clockDomain: string;
  epoch: string;
  imageSize: [number, number];
  positionM: RigPoint;
  referencePositionM: RigPoint;
  joints: RigImageJoint[];
};
export type RigFrame = {
  sequence: number;
  timeNs: string;
  evaluatedAtNs: string;
  views: [RigView, RigView];
  calibration: {
    expectedId: string;
    baselineM: number;
    referenceBaselineM: number;
  };
  timing: { skewNs: string; combinedUncertaintyNs: string };
  reconstruction: {
    method: "midpoint";
    rigTrackId: string | null;
    joints: RigWorldJoint[];
    root: RigPoint | null;
  };
  reference: { joints: (RigPoint & { name: JointName })[]; root: RigPoint };
};
export type RigCase = {
  id: string;
  title: string;
  description: string;
  risk: string;
  frames: RigFrame[];
};
export type RigDataset = {
  version: 1;
  origin: "synthetic-rehearsal";
  recorded: true;
  coordinateSpace: "calibrated-rig-meters";
  cases: RigCase[];
};
export type RigSetupPlan = {
  primaryCameraId: string;
  secondaryCameraId: string;
  placementNotes: string;
  calibrationNotes: string;
  synchronizationNotes: string;
};
export type RigReadiness = {
  state: "sample-available" | "partial" | "unavailable";
  sampleAvailable: boolean;
  rootAvailable: boolean;
  availableJointCount: number;
  totalJointCount: number;
  rejections: Record<string, number>;
  physicallyValidated: false;
  mazeReady: false;
  blockers: string[];
};

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid rig rehearsal: ${message}`);
}
const REASONS = new Set([
  "observed",
  "missing",
  "outside_image",
  "degenerate",
  "behind_camera",
  "weak_geometry",
  "ray_gap",
  "reprojection",
  "estimated_error",
  "outside_volume",
  "calibration_mismatch",
  "image_geometry_mismatch",
  "transform_mismatch",
  "epoch_mismatch",
  "clock_mismatch",
  "distorted_input",
  "identity_uncertain",
  "unverified_exposure_time",
  "time_uncertain",
  "pair_skew",
  "future_input",
  "stale_input",
]);
function object(
  value: unknown,
  keys: string[],
  path: string,
): Record<string, unknown> {
  requireValue(
    value && typeof value === "object" && !Array.isArray(value),
    path,
  );
  const record = value as Record<string, unknown>;
  requireValue(
    Object.keys(record).length === keys.length &&
      keys.every((key) => Object.hasOwn(record, key)),
    `${path} fields`,
  );
  return record;
}
function text(
  value: unknown,
  path: string,
  maximum = 500,
): asserts value is string {
  requireValue(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= maximum,
    path,
  );
}
function finite(value: unknown, path: string): asserts value is number {
  requireValue(typeof value === "number" && Number.isFinite(value), path);
}
function integer(
  value: unknown,
  maximum: number,
  path: string,
): asserts value is number {
  finite(value, path);
  requireValue(
    Number.isSafeInteger(value) && value >= 0 && value <= maximum,
    path,
  );
}
function nanoseconds(value: unknown, path: string): bigint {
  requireValue(
    typeof value === "string" && /^(0|[1-9]\d{0,18})$/.test(value),
    path,
  );
  const result = BigInt(value);
  requireValue(result <= 9223372036854775807n, path);
  return result;
}
function coordinates(
  value: Record<string, unknown>,
  axes: string[],
  missing: boolean,
  path: string,
): void {
  if (missing && axes.every((axis) => value[axis] === null)) return;
  for (const axis of axes) finite(value[axis], `${path}.${axis}`);
}
function point(value: unknown, path: string): asserts value is RigPoint {
  coordinates(
    object(value, ["x", "y", "z"], path),
    ["x", "y", "z"],
    false,
    path,
  );
}
function joints(
  value: unknown,
  world: boolean,
  reference: boolean,
  path: string,
): void {
  requireValue(
    Array.isArray(value) &&
      value.length > 0 &&
      value.length <= JOINT_NAMES.length,
    path,
  );
  const names = new Set<string>();
  const axes = world ? ["x", "y", "z"] : ["x", "y"];
  for (const item of value) {
    const joint = object(
      item,
      ["name", ...axes, ...(world && !reference ? ["reason"] : [])],
      path,
    );
    requireValue(
      typeof joint.name === "string" &&
        JOINT_NAMES.includes(joint.name as JointName) &&
        !names.has(joint.name),
      `${path} anatomical names`,
    );
    names.add(joint.name);
    coordinates(joint, axes, !reference, path);
    if (world && !reference) {
      text(joint.reason, `${path}.reason`, 64);
      requireValue(REASONS.has(joint.reason), `${path} rejection reason`);
      requireValue(
        (joint.reason === "observed") === (joint.x !== null),
        `${path} reason/position consistency`,
      );
    }
  }
}
function checkRoot(
  jointData: RigWorldJoint[],
  root: RigPoint | null,
  path: string,
): void {
  const left = jointData.find((joint) => joint.name === "left_hip");
  const right = jointData.find((joint) => joint.name === "right_hip");
  const both = left?.reason === "observed" && right?.reason === "observed";
  requireValue(both === (root !== null), `${path} requires two observed hips`);
  if (root && left && right) {
    for (const axis of ["x", "y", "z"] as const) {
      requireValue(
        left[axis] !== null &&
          right[axis] !== null &&
          Math.abs(root[axis] - (left[axis] + right[axis]) / 2) <= 0.0000011,
        `${path} hip midpoint`,
      );
    }
  }
}
function checkFrame(input: unknown): void {
  const frame = object(
    input,
    [
      "sequence",
      "timeNs",
      "evaluatedAtNs",
      "views",
      "calibration",
      "timing",
      "reconstruction",
      "reference",
    ],
    "frame",
  );
  integer(frame.sequence, 10000, "sequence");
  nanoseconds(frame.timeNs, "frame time");
  requireValue(
    nanoseconds(frame.evaluatedAtNs, "recorded evaluation time") >=
      BigInt(frame.timeNs as string),
    "recorded evaluation ordering",
  );
  requireValue(
    Array.isArray(frame.views) && frame.views.length === 2,
    "two views",
  );
  const roles = ["primary", "secondary"];
  for (const [index, value] of frame.views.entries()) {
    const view = object(
      value,
      [
        "role",
        "cameraId",
        "cameraTrackId",
        "rigTrackId",
        "frameId",
        "timeNs",
        "uncertaintyNs",
        "timestampKind",
        "timeVerified",
        "identityConfirmed",
        "calibrationId",
        "transformRevision",
        "clockDomain",
        "epoch",
        "imageSize",
        "positionM",
        "referencePositionM",
        "joints",
      ],
      "view",
    );
    requireValue(view.role === roles[index], "stable camera roles");
    for (const key of [
      "cameraId",
      "cameraTrackId",
      "frameId",
      "calibrationId",
      "transformRevision",
      "clockDomain",
      "epoch",
    ])
      text(view[key], key, 256);
    if (view.rigTrackId !== null) text(view.rigTrackId, "rigTrackId", 256);
    nanoseconds(view.timeNs, "view time");
    nanoseconds(view.uncertaintyNs, "view uncertainty");
    requireValue(
      [
        "synthetic-exposure",
        "device-exposure",
        "host-read-completion",
      ].includes(view.timestampKind as string),
      "timestamp provenance",
    );
    requireValue(
      typeof view.timeVerified === "boolean" &&
        typeof view.identityConfirmed === "boolean",
      "verification flags",
    );
    requireValue(
      Array.isArray(view.imageSize) && view.imageSize.length === 2,
      "image size",
    );
    for (const size of view.imageSize) {
      integer(size, 16384, "image size");
      requireValue(size > 0, "positive image size");
    }
    point(view.positionM, "calibrated camera position");
    point(view.referencePositionM, "reference camera position");
    joints(view.joints, false, false, "image joints");
  }
  const typedViews = frame.views as [RigView, RigView];
  requireValue(
    typedViews[0].cameraId !== typedViews[1].cameraId,
    "distinct camera identities",
  );
  requireValue(
    frame.timeNs === typedViews[0].timeNs,
    "recorded reference time",
  );
  const calibration = object(
    frame.calibration,
    ["expectedId", "baselineM", "referenceBaselineM"],
    "calibration",
  );
  text(calibration.expectedId, "expected calibration");
  for (const key of ["baselineM", "referenceBaselineM"]) {
    finite(calibration[key], key);
    requireValue(calibration[key] > 0, key);
  }
  const timing = object(
    frame.timing,
    ["skewNs", "combinedUncertaintyNs"],
    "timing",
  );
  const difference =
    BigInt(typedViews[0].timeNs) - BigInt(typedViews[1].timeNs);
  requireValue(
    nanoseconds(timing.skewNs, "skew") ===
      (difference < 0n ? -difference : difference),
    "reported skew",
  );
  requireValue(
    nanoseconds(timing.combinedUncertaintyNs, "uncertainty") ===
      BigInt(typedViews[0].uncertaintyNs) + BigInt(typedViews[1].uncertaintyNs),
    "reported uncertainty",
  );
  const reconstruction = object(
    frame.reconstruction,
    ["method", "rigTrackId", "joints", "root"],
    "reconstruction",
  );
  requireValue(reconstruction.method === "midpoint", "recorded solver method");
  if (reconstruction.rigTrackId !== null)
    text(reconstruction.rigTrackId, "reconstructed rig ID");
  joints(reconstruction.joints, true, false, "reconstructed joints");
  if (
    (reconstruction.joints as RigWorldJoint[]).some(
      (joint) => joint.reason === "observed",
    )
  ) {
    requireValue(
      typedViews.every(
        (view) =>
          view.identityConfirmed &&
          view.timeVerified &&
          view.timestampKind !== "host-read-completion" &&
          view.calibrationId === calibration.expectedId &&
          view.rigTrackId === reconstruction.rigTrackId,
      ) &&
        reconstruction.rigTrackId !== null &&
        typedViews[0].clockDomain === typedViews[1].clockDomain &&
        typedViews[0].epoch === typedViews[1].epoch,
      "accepted source provenance",
    );
  }
  if (reconstruction.root !== null) point(reconstruction.root, "root");
  checkRoot(
    reconstruction.joints as RigWorldJoint[],
    reconstruction.root as RigPoint | null,
    "root",
  );
  const reference = object(
    frame.reference,
    ["joints", "root"],
    "independent synthetic reference",
  );
  joints(reference.joints, true, true, "reference joints");
  point(reference.root, "reference root");
}

/** Validate recorded diagnostics; never interpret them as live or physical evidence. */
export function loadRigDataset(input: unknown): RigDataset {
  const data = object(
    input,
    ["version", "origin", "recorded", "coordinateSpace", "cases"],
    "dataset",
  );
  requireValue(
    data.version === 1 &&
      data.origin === "synthetic-rehearsal" &&
      data.recorded === true &&
      data.coordinateSpace === "calibrated-rig-meters",
    "synthetic origin/version/coordinates",
  );
  requireValue(
    Array.isArray(data.cases) &&
      data.cases.length > 0 &&
      data.cases.length <= 16,
    "bounded cases",
  );
  const ids = new Set<string>();
  for (const item of data.cases) {
    const scenario = object(
      item,
      ["id", "title", "description", "risk", "frames"],
      "scenario",
    );
    for (const key of ["id", "title", "description", "risk"])
      text(scenario[key], key);
    requireValue(
      typeof scenario.id === "string" && !ids.has(scenario.id),
      "unique scenario IDs",
    );
    ids.add(scenario.id);
    requireValue(
      Array.isArray(scenario.frames) &&
        scenario.frames.length > 0 &&
        scenario.frames.length <= 60,
      "bounded recorded frames",
    );
    let previous = -1;
    let previousTime = -1n;
    for (const frame of scenario.frames) {
      checkFrame(frame);
      const typed = frame as RigFrame;
      requireValue(
        typed.sequence > previous && BigInt(typed.timeNs) > previousTime,
        "recorded sequence ordering",
      );
      previous = typed.sequence;
      previousTime = BigInt(typed.timeNs);
    }
  }
  return input as RigDataset;
}

export function selectRigFrame(
  data: RigDataset,
  caseId: string,
  frameIndex: number,
): { scenario: RigCase; frame: RigFrame } {
  const scenario = data.cases.find((item) => item.id === caseId);
  requireValue(
    scenario &&
      Number.isInteger(frameIndex) &&
      frameIndex >= 0 &&
      frameIndex < scenario.frames.length,
    "scenario/frame selection",
  );
  return { scenario, frame: scenario.frames[frameIndex] };
}

/** Sample availability is a software result. It cannot enable physical gameplay. */
export function assessRigFrame(frame: RigFrame): RigReadiness {
  const available = frame.reconstruction.joints.filter(
    (joint) =>
      joint.reason === "observed" &&
      [joint.x, joint.y, joint.z].every(
        (value) => typeof value === "number" && Number.isFinite(value),
      ),
  ).length;
  const root = frame.reconstruction.root;
  const rootAvailable =
    root !== null && [root.x, root.y, root.z].every(Number.isFinite);
  const rejections: Record<string, number> = {};
  for (const joint of frame.reconstruction.joints)
    if (joint.reason !== "observed")
      rejections[joint.reason] = (rejections[joint.reason] ?? 0) + 1;
  return {
    state:
      available === 0
        ? "unavailable"
        : rootAvailable && available === frame.reconstruction.joints.length
          ? "sample-available"
          : "partial",
    sampleAvailable: available > 0,
    rootAvailable,
    availableJointCount: available,
    totalJointCount: frame.reconstruction.joints.length,
    rejections,
    physicallyValidated: false,
    mazeReady: false,
    blockers: [
      "Physical calibration, exposure timing and identity have not been validated.",
      ...(rootAvailable
        ? []
        : ["Two accepted hips are required for root XYZ."]),
    ],
  };
}

/** Planning notes are user input, with no authority over solver or physical gates. */
export function validateRigPlan(plan: RigSetupPlan): {
  valid: boolean;
  errors: string[];
  physicallyValidated: false;
  mazeReady: false;
} {
  const errors: string[] = [];
  const primary =
    typeof plan.primaryCameraId === "string" ? plan.primaryCameraId.trim() : "";
  const secondary =
    typeof plan.secondaryCameraId === "string"
      ? plan.secondaryCameraId.trim()
      : "";
  if (!primary || !secondary)
    errors.push("Choose a device for each camera role.");
  if (primary && primary === secondary)
    errors.push("Primary and secondary roles require different devices.");
  if (primary.length > 256 || secondary.length > 256)
    errors.push("Camera references are too long.");
  for (const note of [
    plan.placementNotes,
    plan.calibrationNotes,
    plan.synchronizationNotes,
  ])
    if (typeof note !== "string" || note.length > 1000)
      errors.push("Planning notes must contain at most 1,000 characters.");
  return {
    valid: errors.length === 0,
    errors,
    physicallyValidated: false,
    mazeReady: false,
  };
}
