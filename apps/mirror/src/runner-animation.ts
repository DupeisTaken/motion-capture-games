import type { RunnerState } from "../../../games/motion-runner/src/index";

export const RUNNER_RIG = Object.freeze({
  thighM: 0.38,
  shinM: 0.38,
  upperArmM: 0.3,
  forearmM: 0.27,
  hipHalfWidthM: 0.16,
});
export const RUNNER_GAIT = Object.freeze({
  baseCyclesPerSecond: 1.8,
  cyclesPerMeter: 0.04,
  stanceTravelM: 0.76,
  toeOffFraction: 0.11,
});
export type RunnerAnimationState = Pick<
  RunnerState,
  "elapsedMs" | "distance" | "speed" | "avatarX" | "targetLane" | "jumpHeight"
>;
export interface RunnerLegPose {
  phase: number;
  contact: boolean;
  hip: number;
  knee: number;
  ankle: number;
  shoulder: number;
  elbow: number;
  foot: { y: number; z: number; pitch: number };
}
export interface RunnerAnimationPose {
  cycle: number;
  hipY: number;
  spineLean: number;
  spineRoll: number;
  pelvisYaw: number;
  shoulderYaw: number;
  cameraX: number;
  cameraLookX: number;
  cameraFovOffset: number;
  legs: [RunnerLegPose, RunnerLegPose];
}
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
const smooth = (value: number) => value * value * (3 - 2 * value);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap = (value: number) => {
  const phase = ((value % 1) + 1) % 1;
  // Integrated decimal times can land a few ulps before a full cycle. Keep the
  // intended heel strike classified as contact instead of the last swing frame.
  return phase < 1e-10 || phase > 1 - 1e-10 ? 0 : phase;
};

function solveLeg(
  phase: number,
  hipY: number,
  speed: number,
  jumping: number,
): RunnerLegPose {
  const cadence =
    RUNNER_GAIT.baseCyclesPerSecond + RUNNER_GAIT.cyclesPerMeter * speed;
  const contactFraction = (RUNNER_GAIT.stanceTravelM * cadence) / speed;
  const toeOffEnd = contactFraction + RUNNER_GAIT.toeOffFraction;
  let y: number, z: number, pitch: number;
  if (phase < contactFraction) {
    // A planted foot travels backwards relative to the advancing pelvis. The
    // short heel-to-flat transition keeps the ankle and sole above the ground.
    const stance = phase / contactFraction;
    z = -RUNNER_GAIT.stanceTravelM / 2 + (phase * speed) / cadence;
    y = 0.13;
    pitch = 0.12 * (1 - smooth(Math.min(1, stance * 3)));
  } else if (phase < toeOffEnd) {
    const toeOff = smooth(
      (phase - contactFraction) / RUNNER_GAIT.toeOffFraction,
    );
    z = mix(0.38, 0.44, toeOff);
    y = 0.13 + toeOff * 0.12;
    pitch = -0.5 * toeOff;
  } else {
    // The heel folds up behind, then swings through to the next contact.
    const recovery = (phase - toeOffEnd) / (1 - toeOffEnd);
    z = mix(0.44, -0.38, smooth(recovery));
    y = 0.13 + (1 - recovery) * 0.12 + Math.sin(Math.PI * recovery) * 0.33;
    pitch = mix(-0.5, 0.12, smooth(recovery));
  }
  // Heel strike/toe-off rotate a finite shoe, not a point. Keep its lowest sole
  // corner on or above the floor while preserving a flat planted ankle height.
  const soleReach = pitch >= 0 ? 0.155 : 0.195;
  y = Math.max(
    y,
    0.1225 * Math.cos(pitch) + soleReach * Math.abs(Math.sin(pitch)) + 0.004,
  );
  const forward = -z;
  const down = hipY - y;
  const { thighM: thigh, shinM: shin } = RUNNER_RIG;
  const distance = clamp(Math.hypot(forward, down), 0.02, thigh + shin - 0.001);
  const direction = Math.atan2(forward, down);
  const hip =
    direction +
    Math.acos(
      clamp(
        (thigh * thigh + distance * distance - shin * shin) /
          (2 * thigh * distance),
        -1,
        1,
      ),
    );
  const knee = -Math.acos(
    clamp(
      (distance * distance - thigh * thigh - shin * shin) / (2 * thigh * shin),
      -1,
      1,
    ),
  );
  const hipAngle = mix(
    hip,
    0.38 + Math.sin(phase * Math.PI * 2) * 0.12,
    jumping,
  );
  const kneeAngle = mix(knee, -1.05, jumping);
  const footPitch = mix(pitch, -0.05, jumping);
  const ankle = footPitch - hipAngle - kneeAngle;
  return {
    phase,
    contact: jumping === 0 && phase < contactFraction,
    hip: hipAngle,
    knee: kneeAngle,
    ankle,
    shoulder: mix(-Math.cos(phase * Math.PI * 2) * 0.53, 1.5, jumping),
    elbow: mix(1.22 + Math.cos(phase * Math.PI * 2) * 0.15, 0.72, jumping),
    foot: {
      y:
        hipY -
        thigh * Math.cos(hipAngle) -
        shin * Math.cos(hipAngle + kneeAngle),
      z: -thigh * Math.sin(hipAngle) - shin * Math.sin(hipAngle + kneeAngle),
      pitch: footPitch,
    },
  };
}

/** Pure game-clock animation: a paused playing frame retains exactly its pose. */
export function sampleRunnerAnimation(
  state: RunnerAnimationState,
  reducedMotion = false,
): RunnerAnimationPose {
  // Integrate cadence through the already-integrated game time and distance.
  // Dividing distance by a speed-varying stride would pop the phase backwards.
  const cycle =
    Math.max(0, state.elapsedMs) * 0.001 * RUNNER_GAIT.baseCyclesPerSecond +
    Math.max(0, state.distance) * RUNNER_GAIT.cyclesPerMeter;
  const phase = wrap(cycle);
  const moving = state.elapsedMs > 0 || state.distance > 0;
  const speed = clamp((state.speed - 10) / 8, 0, 1);
  const angle = phase * Math.PI * 2;
  const hipY = moving ? 0.75 - Math.cos(angle * 2) * 0.018 : 0.83;
  const jumping = clamp(state.jumpHeight / 0.3, 0, 1);
  const turn = clamp(state.targetLane - state.avatarX, -1, 1);
  const legs: [RunnerLegPose, RunnerLegPose] = [
    solveLeg(phase, hipY, clamp(state.speed, 10, 18), jumping),
    solveLeg(wrap(phase + 0.5), hipY, clamp(state.speed, 10, 18), jumping),
  ];
  if (!moving && jumping === 0) {
    for (const leg of legs) {
      leg.hip = 0.39;
      leg.knee = -0.78;
      leg.ankle = 0.39;
      leg.shoulder = 0;
      leg.elbow = 0.38;
      leg.contact = true;
      leg.foot = { y: hipY - 0.76 * Math.cos(0.39), z: 0, pitch: 0 };
    }
  }
  return {
    cycle,
    hipY,
    spineLean: moving ? 0.12 + speed * 0.05 : 0.035,
    spineRoll: moving ? Math.sin(angle) * 0.018 - turn * 0.09 : 0,
    pelvisYaw: moving ? Math.sin(angle) * 0.065 : 0,
    shoulderYaw: moving ? -Math.sin(angle) * 0.095 : 0,
    cameraX: reducedMotion ? 0 : state.avatarX * 0.3,
    cameraLookX: reducedMotion ? 0 : state.avatarX * 0.5,
    cameraFovOffset: reducedMotion ? 0 : speed * 3,
    legs,
  };
}
