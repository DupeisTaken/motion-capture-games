import { describe, expect, it } from "vitest";
import fixture from "../../contracts/examples/synthetic-observation.json";
import type {
  Observation,
  Person,
  JointName,
} from "../../packages/motion/src/index";
import { observationToGameFrame } from "../../packages/motion/src/game-input";
import { syntheticBody } from "../../packages/motion/src/dodgeball-input";
import { RunnerPoseControls } from "../../games/motion-runner/src/index";

function observation(): Observation {
  const value = structuredClone(fixture) as Observation;
  const person: Person = {
    trackId: "joined-player",
    identity: "confident",
    box: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    joints: {},
  };
  for (const point of syntheticBody())
    person.joints[point.name] = {
      x: point.x,
      y: point.y,
      score: 0.9,
      status: "observed",
      inFrame: true,
    };
  value.people = [person];
  return value;
}
class Pose {
  controls = new RunnerPoseControls();
  value = observation();
  now = 0;
  frame() {
    return observationToGameFrame(
      this.value,
      this.value.people.find((person) => person.trackId === "joined-player") ??
        this.value.people[0],
      this.now,
    );
  }
  calibrate() {
    expect(
      this.controls.calibrate(this.value, this.frame(), "joined-player"),
    ).toBe(true);
  }
  sample(ms = 50) {
    this.now += ms;
    this.value.sequence++;
    return this.controls.ingest(this.value, this.frame(), "joined-player");
  }
  translate(x: number, y = 0) {
    this.value = observation();
    this.value.sequence = this.now;
    for (const joint of Object.values(this.value.people[0].joints))
      if (joint && joint.x !== null && joint.y !== null) {
        joint.x += x;
        joint.y += y;
      }
  }
}

describe("runner image thirds and standing head controls", () => {
  function settle(pose: Pose) {
    pose.sample();
    pose.sample();
    return pose.sample();
  }
  it("requires observed torso evidence, accepts cropped legs and keeps calibration snapshots private", () => {
    const pose = new Pose();
    expect(pose.sample().valid).toBe(false);
    delete pose.value.people[0].joints.left_ankle;
    delete pose.value.people[0].joints.right_ankle;
    delete pose.value.people[0].joints.left_knee;
    delete pose.value.people[0].joints.right_knee;
    pose.calibrate();
    const calibration = pose.controls.calibration!;
    calibration.anchors.left_hip!.x = 9;
    expect(pose.controls.calibration!.anchors.left_hip!.x).not.toBe(9);
    expect(settle(pose)).toMatchObject({ valid: true, standing: true });
    pose.value.people[0].joints.left_hip!.status = "estimated";
    pose.value.people[0].joints.right_hip!.inFrame = false;
    expect(pose.sample()).toMatchObject({ valid: false, standing: false });
  });
  it("maps absolute mirrored thirds independently of reference center and body size", () => {
    for (const scale of [0.55, 1, 1.15]) {
      const pose = new Pose();
      for (const joint of Object.values(pose.value.people[0].joints))
        if (joint?.x != null && joint.y != null) {
          joint.x = 0.5 + (joint.x - 0.5) * scale;
          joint.y = 0.5 + (joint.y - 0.5) * scale;
        }
      pose.calibrate();
      for (const [x, lane] of [
        [0.25, 1],
        [0.5, 0],
        [0.75, -1],
        [0.25, 1],
      ] as const) {
        const reference = pose.controls.calibration!;
        for (const [name, point] of Object.entries(reference.anchors))
          pose.value.people[0].joints[name as JointName]!.x =
            point!.x + x - reference.centerX;
        expect(pose.sample()).toMatchObject({ valid: true, lane });
      }
    }
    const offCenter = new Pose();
    offCenter.translate(0.22);
    offCenter.calibrate();
    expect(offCenter.sample().lane).toBe(-1);
  });
  it("holds both boundary deadbands and returns to center with bounded hysteresis", () => {
    const pose = new Pose();
    pose.calibrate();
    for (const [displayX, lane] of [
      [0.32, 0],
      [0.3, -1],
      [0.33, -1],
      [0.345, -1],
      [0.36, 0],
      [0.68, 0],
      [0.7, 1],
      [0.665, 1],
      [0.64, 0],
    ] as const) {
      pose.translate(0.5 - displayX);
      expect(pose.sample().lane).toBe(lane);
    }
  });
  it("confirms one jump per standing-return cycle, using source time rather than sample count", () => {
    const pose = new Pose();
    pose.calibrate();
    settle(pose);
    pose.translate(0, -0.07);
    expect(pose.sample(10).jump).toBe(false);
    expect(pose.sample(20).jump).toBe(false);
    expect(pose.sample(30)).toMatchObject({ jump: true, standing: false });
    for (let i = 0; i < 8; i++)
      expect(pose.sample()).toMatchObject({ jump: false, standing: false });
    pose.translate(0);
    expect(pose.sample().standing).toBe(false);
    pose.sample();
    expect(pose.sample().standing).toBe(true);
    pose.translate(0, -0.07);
    pose.sample();
    expect(pose.sample().jump).toBe(true);
  });
  it("rejects isolated head nods, hip-only movement and squat-rise as jump events", () => {
    for (const names of [["nose"], ["left_hip", "right_hip"]]) {
      const pose = new Pose();
      pose.calibrate();
      settle(pose);
      for (const name of names)
        pose.value.people[0].joints[name as "nose"]!.y! -= 0.1;
      for (let i = 0; i < 4; i++) expect(pose.sample().jump).toBe(false);
    }
    const pose = new Pose();
    pose.calibrate();
    settle(pose);
    for (const name of [
      "nose",
      "left_shoulder",
      "right_shoulder",
      "left_hip",
      "right_hip",
    ] as const)
      pose.value.people[0].joints[name]!.y! += 0.11;
    for (let i = 0; i < 5; i++)
      expect(pose.sample()).toMatchObject({ duck: true, jump: false });
    pose.translate(0);
    expect(pose.sample()).toMatchObject({
      duck: false,
      jump: false,
      standing: false,
    });
    expect(settle(pose).standing).toBe(true);
  });
  it("uses calibrated same-joint fallback during turns without artificial lane or height steps", () => {
    const pose = new Pose();
    pose.calibrate();
    settle(pose);
    for (const name of [
      "nose",
      "left_shoulder",
      "left_knee",
      "right_knee",
      "left_ankle",
      "right_ankle",
    ] as const)
      delete pose.value.people[0].joints[name];
    expect(pose.sample()).toMatchObject({
      valid: true,
      lane: 0,
      jump: false,
      duck: false,
      standing: true,
    });
    expect(pose.controls.feedback!.evidence).toContain("fallback");
    pose.value.people[0].joints.right_shoulder!.y! -= 0.07;
    pose.value.people[0].joints.right_hip!.y! -= 0.07;
    pose.sample();
    expect(pose.sample().jump).toBe(true);
    pose.translate(0, -0.07);
    expect(pose.sample()).toMatchObject({ jump: false, standing: false });
  });
  it("calibrates lateral center from a shoulder pair when one hip is hidden", () => {
    for (const center of [0.36, 0.64]) {
      const pose = new Pose();
      pose.translate(center - 0.5);
      const hip = pose.value.people[0].joints.right_hip;
      delete pose.value.people[0].joints.right_hip;
      pose.calibrate();
      expect(settle(pose)).toMatchObject({ valid: true, lane: 0 });
      pose.value.people[0].joints.right_hip = hip;
      expect(pose.sample()).toMatchObject({ valid: true, lane: 0 });
    }
  });
  it("does not turn yaw with one hidden hip into lateral movement near a third boundary", () => {
    for (const center of [0.36, 0.64]) {
      const pose = new Pose();
      pose.translate(center - 0.5);
      pose.calibrate();
      expect(settle(pose).lane).toBe(0);
      // One hip rotates inward. The complete shoulder pair still measures center.
      delete pose.value.people[0].joints.right_hip;
      pose.value.people[0].joints.left_hip!.x = center;
      expect(pose.sample()).toMatchObject({ valid: true, lane: 0 });
      delete pose.value.people[0].joints.right_shoulder;
      expect(pose.sample()).toMatchObject({ valid: false, jump: false });
    }
  });
  it("cannot rearm midair when face loss switches to a smaller shoulder lift", () => {
    const pose = new Pose();
    delete pose.value.people[0].joints.left_ankle;
    delete pose.value.people[0].joints.right_ankle;
    pose.calibrate();
    settle(pose);
    const reference = structuredClone(pose.value);
    const size = pose.controls.calibration!.bodyHeight;
    pose.value.people[0].joints.nose!.y! -= size * 0.1;
    for (const name of [
      "left_shoulder",
      "right_shoulder",
      "left_hip",
      "right_hip",
    ] as const)
      pose.value.people[0].joints[name]!.y! -= size * 0.04;
    pose.sample();
    expect(pose.sample().jump).toBe(true);
    const nose = pose.value.people[0].joints.nose;
    delete pose.value.people[0].joints.nose;
    for (let i = 0; i < 6; i++)
      expect(pose.sample()).toMatchObject({ standing: false, jump: false });
    pose.value.people[0].joints.nose = nose;
    for (let i = 0; i < 4; i++)
      expect(pose.sample()).toMatchObject({ standing: false, jump: false });
    reference.sequence = pose.value.sequence;
    pose.value = reference;
    expect(settle(pose).standing).toBe(true);
  });
  it("calibrates an explicitly bound track with spectators and never uses detection order", () => {
    const pose = new Pose();
    const spectator = observation().people[0];
    spectator.trackId = "spectator";
    pose.value.people.unshift(spectator);
    pose.calibrate();
    expect(settle(pose)).toMatchObject({
      valid: true,
      participantCount: 2,
      standing: true,
    });
    pose.value.people.reverse();
    expect(pose.sample().valid).toBe(true);
    const owner = pose.value.people.find((p) => p.trackId === "joined-player")!;
    pose.value.people.push(structuredClone(owner));
    expect(pose.sample()).toMatchObject({
      valid: false,
      identity: "uncertain",
    });
    pose.value.people.pop();
    owner.identity = "ambiguous";
    expect(pose.sample()).toMatchObject({
      valid: false,
      identity: "uncertain",
    });
    pose.value.people = [spectator];
    expect(pose.sample()).toMatchObject({ valid: false, identity: "missing" });
  });
  it("breaks pending takeoff on gaps, occlusion, duplicates and restarts, then requires fresh standing", () => {
    for (const failure of [
      "gap",
      "duplicate",
      "occlusion",
      "restart",
    ] as const) {
      const pose = new Pose();
      pose.calibrate();
      settle(pose);
      pose.translate(0, -0.07);
      pose.sample();
      if (failure === "duplicate")
        expect(
          pose.controls.ingest(pose.value, pose.frame(), "joined-player").valid,
        ).toBe(false);
      if (failure === "gap") expect(pose.sample(351).valid).toBe(false);
      if (failure === "occlusion") {
        pose.value.people[0].joints.left_hip!.status = "missing";
        pose.value.people[0].joints.right_hip!.status = "missing";
        expect(pose.sample().valid).toBe(false);
      }
      if (failure === "restart") {
        pose.value.epoch = "restart";
        expect(pose.sample().valid).toBe(false);
        expect(pose.controls.calibrated).toBe(false);
        continue;
      }
      pose.translate(0, -0.07);
      expect(pose.sample().jump).toBe(false);
      expect(pose.sample().jump).toBe(false);
      pose.translate(0);
      settle(pose);
      pose.translate(0, -0.07);
      pose.sample();
      expect(pose.sample().jump).toBe(true);
    }
  });
});
