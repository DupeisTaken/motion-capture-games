import { describe, expect, it } from "vitest";
import fixture from "../../contracts/examples/synthetic-observation.json";
import type { Observation, Person } from "../../packages/motion/src/index";
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
    return observationToGameFrame(this.value, this.value.people[0], this.now);
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

describe("experimental runner body controls", () => {
  it("requires one fully observed standing body and protects calibration snapshots", () => {
    const pose = new Pose();
    expect(pose.sample().valid).toBe(false);
    pose.calibrate();
    expect(pose.controls.calibrated).toBe(true);
    const calibration = pose.controls.calibration!;
    calibration.centerX = 9;
    expect(pose.controls.calibration!.centerX).toBe(0.5);
    const ankle = pose.value.people[0].joints.left_ankle!;
    ankle.status = "estimated";
    expect(pose.sample().valid).toBe(false);
    expect(
      pose.controls.calibrate(pose.value, pose.frame(), "joined-player"),
    ).toBe(false);
  });
  it("maps participant-left to display-left, holds hysteresis, returns center and never uses array order", () => {
    const pose = new Pose();
    pose.calibrate();
    pose.translate(0.14);
    expect(pose.sample().lane).toBe(-1);
    pose.translate(0.09);
    expect(pose.sample().lane).toBe(-1);
    pose.translate(0.02);
    expect(pose.sample().lane).toBe(0);
    pose.translate(-0.14);
    expect(pose.sample().lane).toBe(1);
    pose.translate(0.14);
    expect(pose.sample().lane).toBe(-1);
  });
  it("requires both feet and hips rising, confirms takeoff, rejects repeated airborne jumps and rearms after stable landing", () => {
    const pose = new Pose();
    pose.calibrate();
    pose.translate(0, -0.08);
    expect(pose.sample().jump).toBe(false);
    expect(pose.sample().jump).toBe(true);
    for (let i = 0; i < 10; i++) expect(pose.sample().jump).toBe(false);
    pose.translate(0, 0);
    pose.sample();
    pose.sample();
    pose.sample();
    pose.translate(0, -0.08);
    pose.sample();
    expect(pose.sample().jump).toBe(true);
    const other = new Pose();
    other.calibrate();
    other.value.people[0].joints.nose!.y! -= 0.1;
    expect(other.sample().jump).toBe(false);
    expect(other.sample().jump).toBe(false);
    other.value.people[0].joints.left_hip!.y! -= 0.1;
    other.value.people[0].joints.right_hip!.y! -= 0.1;
    expect(other.sample().jump).toBe(false);
    expect(other.sample().jump).toBe(false);
  });
  it("distinguishes confirmed standing from airborne followup frames whose jump event is already false", () => {
    const pose = new Pose();
    pose.calibrate();
    expect(pose.sample().standing).toBe(false);
    expect(pose.sample().standing).toBe(false);
    expect(pose.sample().standing).toBe(true);
    pose.translate(0, -0.08);
    expect(pose.sample()).toMatchObject({ jump: false, standing: false });
    expect(pose.sample()).toMatchObject({ jump: true, standing: false });
    expect(pose.sample()).toMatchObject({
      valid: true,
      jump: false,
      duck: false,
      standing: false,
    });
    pose.translate(0);
    for (let index = 0; index < 4; index++)
      expect(pose.sample().standing).toBe(false);
    expect(pose.sample().standing).toBe(true);
  });
  it("refuses standing credit for a raised single foot or bent knees without replacing it with a jump", () => {
    for (const part of ["foot", "knee"] as const) {
      const pose = new Pose();
      pose.calibrate();
      pose.sample();
      pose.sample();
      expect(pose.sample().standing).toBe(true);
      if (part === "foot") pose.value.people[0].joints.left_ankle!.y! -= 0.04;
      else pose.value.people[0].joints.left_knee!.x! -= 0.12;
      for (let index = 0; index < 4; index++)
        expect(pose.sample()).toMatchObject({ standing: false, jump: false });
    }
  });
  it("recognizes held bent-knee duck and releases on standing without detecting a jump", () => {
    const pose = new Pose();
    pose.calibrate();
    for (const name of [
      "left_shoulder",
      "right_shoulder",
      "left_hip",
      "right_hip",
    ] as const)
      pose.value.people[0].joints[name]!.y! += 0.11;
    pose.value.people[0].joints.left_knee!.x! -= 0.1;
    pose.value.people[0].joints.right_knee!.x! += 0.1;
    for (let index = 0; index < 8; index++)
      expect(pose.sample()).toMatchObject({
        valid: true,
        duck: true,
        jump: false,
      });
    pose.translate(0);
    expect(pose.sample()).toMatchObject({ duck: false, jump: false });
  });
  it("pauses on extra players without transferring calibration, and rejects replacements, uncertainty and geometry changes", () => {
    const pose = new Pose();
    pose.calibrate();
    pose.value.people.push({
      ...structuredClone(pose.value.people[0]),
      trackId: "spectator",
    });
    expect(pose.sample()).toMatchObject({ valid: false, participantCount: 2 });
    pose.value.people.pop();
    expect(pose.sample().valid).toBe(true);
    pose.value.people[0].identity = "ambiguous";
    expect(pose.sample()).toMatchObject({
      valid: false,
      identity: "uncertain",
    });
    pose.value.people[0].identity = "confident";
    pose.value.people[0].trackId = "replacement";
    expect(pose.sample()).toMatchObject({ valid: false, identity: "missing" });
    const another = new Pose();
    another.calibrate();
    another.value.transformRevision = "new-transform";
    expect(another.sample().valid).toBe(false);
    expect(another.controls.calibrated).toBe(false);
  });
  it("rejects repeated/out-of-order source samples and does not turn a post-gap airborne pose into an instant jump", () => {
    const pose = new Pose();
    pose.calibrate();
    pose.sample();
    const same = pose.controls.ingest(
      pose.value,
      pose.frame(),
      "joined-player",
    );
    expect(same).toMatchObject({ valid: false, jump: false });
    pose.translate(0, -0.08);
    expect(pose.sample(500).jump).toBe(false);
  });
});
