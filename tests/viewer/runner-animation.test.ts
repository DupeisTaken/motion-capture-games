// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  RUNNER_RIG,
  RUNNER_GAIT,
  sampleRunnerAnimation,
} from "../../apps/mirror/src/runner-animation";
import {
  createRunnerRenderer,
  type RunnerSkin,
} from "../../apps/mirror/src/runner-renderer";
import { RunnerGame } from "../../games/motion-runner/src/index";

const gpu = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn() }));
vi.mock("three", async (original) => {
  const actual = await original<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      setPixelRatio() {}
      setSize() {}
      render = gpu.render;
      dispose = gpu.dispose;
    },
  };
});

function state(phase = 0, speed = 10) {
  return {
    ...new RunnerGame().state,
    phase: "playing" as const,
    elapsedMs: (phase + 1) / 0.0018,
    speed,
  };
}
function scene() {
  const scene = gpu.render.mock.lastCall![0] as THREE.Scene;
  scene.updateMatrixWorld(true);
  return scene;
}
function bounds(object: THREE.Object3D) {
  object.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const vertices = child.geometry.getAttribute("position");
    for (let index = 0; index < vertices.count; index++)
      bounds.expandByPoint(
        new THREE.Vector3()
          .fromBufferAttribute(vertices, index)
          .applyMatrix4(child.matrixWorld),
      );
  });
  return bounds;
}

describe("game-clock runner articulation", () => {
  it("classifies exact constant-speed stride boundaries as the same heel strike", () => {
    for (const speed of [10, 14, 18]) {
      const cadence =
        RUNNER_GAIT.baseCyclesPerSecond + RUNNER_GAIT.cyclesPerMeter * speed;
      const at = (cycles: number) =>
        sampleRunnerAnimation({
          ...state(),
          elapsedMs: (cycles / cadence) * 1000,
          distance: (speed * cycles) / cadence,
          speed,
        });
      const first = at(1),
        next = at(2);
      expect(first.legs[0].phase).toBe(0);
      expect(next.legs[0].phase).toBe(0);
      expect(first.legs[0].contact).toBe(true);
      expect(next.legs[0].contact).toBe(true);
      expect(next.legs).toEqual(first.legs);
      expect(next.hipY).toBeCloseTo(first.hipY, 12);
      expect(next.spineRoll).toBeCloseTo(first.spineRoll, 12);
      expect(next.pelvisYaw).toBeCloseTo(first.pelvisYaw, 12);
      expect(next.shoulderYaw).toBeCloseTo(first.shoulderYaw, 12);
    }
  });
  it("plants alternating feet, pushes off and folds the knee for recovery", () => {
    const contact = sampleRunnerAnimation(state(0.1));
    expect(contact.legs[0].contact).toBe(true);
    expect(contact.legs[1].contact).toBe(false);
    expect(contact.legs[0].foot.y).toBeCloseTo(0.13, 8);
    expect(contact.legs[1].foot.y).toBeGreaterThan(0.4);
    const later = sampleRunnerAnimation(state(0.2));
    expect(later.legs[0].foot.z).toBeGreaterThan(contact.legs[0].foot.z);
    const toeOff = sampleRunnerAnimation(state(0.3));
    expect(toeOff.legs[0].foot.pitch).toBeLessThan(-0.2);
    expect(toeOff.legs[0].foot.y).toBeGreaterThan(0.19);
    const otherContact = sampleRunnerAnimation(state(0.6));
    expect(otherContact.legs[1].contact).toBe(true);
    expect(otherContact.legs[0].contact).toBe(false);
    expect(contact.legs[1].knee).toBeLessThan(contact.legs[0].knee);
  });
  it("swings bent arms opposite each other and counter-rotates pelvis and shoulders", () => {
    for (let phase = 0; phase < 1; phase += 0.025) {
      const gait = sampleRunnerAnimation(state(phase));
      expect(gait.legs[0].shoulder).toBeCloseTo(-gait.legs[1].shoulder, 8);
      expect(gait.legs.every((leg) => leg.elbow > 1 && leg.elbow < 1.5)).toBe(
        true,
      );
      expect(gait.pelvisYaw * gait.shoulderYaw).toBeLessThanOrEqual(1e-12);
    }
  });
  it("keeps the continuous gait phase independent of changing stride amplitude", () => {
    const a = sampleRunnerAnimation({
      ...state(),
      elapsedMs: 2000,
      distance: 20,
      speed: 10,
    });
    const b = sampleRunnerAnimation({
      ...state(),
      elapsedMs: 2000,
      distance: 20,
      speed: 18,
    });
    expect(a.cycle).toBe(b.cycle);
    expect(a.spineLean).toBeLessThan(b.spineLean);
    expect(
      sampleRunnerAnimation({
        ...state(),
        elapsedMs: 2016,
        distance: 20.288,
        speed: 18,
      }).cycle,
    ).toBeGreaterThan(b.cycle);
  });
  it("preserves valid two-bone geometry at every phase and declared speed", () => {
    for (const speed of [10, 14, 18])
      for (let phase = 0; phase < 1; phase += 0.01) {
        const gait = sampleRunnerAnimation(state(phase, speed));
        for (const leg of gait.legs) {
          const y =
            gait.hipY -
            RUNNER_RIG.thighM * Math.cos(leg.hip) -
            RUNNER_RIG.shinM * Math.cos(leg.hip + leg.knee);
          const z =
            -RUNNER_RIG.thighM * Math.sin(leg.hip) -
            RUNNER_RIG.shinM * Math.sin(leg.hip + leg.knee);
          expect(y).toBeCloseTo(leg.foot.y, 10);
          expect(z).toBeCloseTo(leg.foot.z, 10);
          expect(leg.hip + leg.knee + leg.ankle).toBeCloseTo(
            leg.foot.pitch,
            10,
          );
          expect(y).toBeGreaterThanOrEqual(0.129);
          expect(leg.knee).toBeLessThan(0);
          expect(leg.knee).toBeGreaterThan(-Math.PI);
        }
      }
  });
  it("matches planted-foot travel to the scrolling track at normal, fast and capped speed", () => {
    for (const speed of [10, 14, 18]) {
      const cadence =
        RUNNER_GAIT.baseCyclesPerSecond + RUNNER_GAIT.cyclesPerMeter * speed;
      const fraction = (RUNNER_GAIT.stanceTravelM * cadence) / speed;
      const time = (4 + fraction * 0.6) / cadence;
      const delta = 0.0001;
      const first = sampleRunnerAnimation({
        ...state(),
        elapsedMs: time * 1000,
        distance: speed * time,
        speed,
      });
      const second = sampleRunnerAnimation({
        ...state(),
        elapsedMs: (time + delta) * 1000,
        distance: speed * (time + delta),
        speed,
      });
      expect(first.legs[0].contact).toBe(true);
      expect(second.legs[0].contact).toBe(true);
      expect(
        (second.legs[0].foot.z - first.legs[0].foot.z) / delta,
      ).toBeCloseTo(speed, 7);
    }
    // The bounded 0.035m/s² game acceleration produces only a tiny analytical
    // approximation error; the threshold is velocity error, not a frame count.
    for (const initialSpeed of [10, 14]) {
      let time = 2;
      let found = false;
      const base = state();
      const at = (seconds: number) => ({
        ...base,
        elapsedMs: seconds * 1000,
        distance: initialSpeed * seconds + 0.5 * 0.035 * seconds * seconds,
        speed: initialSpeed + 0.035 * seconds,
      });
      for (let attempt = 0; attempt < 1000; attempt++) {
        const first = sampleRunnerAnimation(at(time));
        const fraction =
          (RUNNER_GAIT.stanceTravelM * (1.8 + 0.04 * at(time).speed)) /
          at(time).speed;
        if (
          first.legs[0].phase > fraction * 0.5 &&
          first.legs[0].phase < fraction * 0.7
        ) {
          found = true;
          break;
        }
        time += 0.001;
      }
      expect(found).toBe(true);
      const delta = 0.0001,
        first = sampleRunnerAnimation(at(time)),
        second = sampleRunnerAnimation(at(time + delta));
      const trackDelta = at(time + delta).distance - at(time).distance;
      expect(
        Math.abs(
          (second.legs[0].foot.z - first.legs[0].foot.z - trackDelta) / delta,
        ),
      ).toBeLessThan(0.05);
    }
  });
  it("freezes playing-to-paused pose and removes optional camera motion for reduced motion", () => {
    const playing = {
      ...state(0.29, 18),
      distance: 42,
      avatarX: 0.4,
      targetLane: 1 as const,
    };
    const paused = { ...playing, phase: "paused" as const };
    expect(sampleRunnerAnimation(paused)).toEqual(
      sampleRunnerAnimation(playing),
    );
    const calm = sampleRunnerAnimation(playing, true);
    expect(calm.legs).toEqual(sampleRunnerAnimation(playing).legs);
    expect(calm.cameraX).toBe(0);
    expect(calm.cameraLookX).toBe(0);
    expect(calm.cameraFovOffset).toBe(0);
  });
  it("tucks both legs and raises bent arms through a jump", () => {
    const jump = sampleRunnerAnimation({ ...state(0.2), jumpHeight: 1 });
    for (const leg of jump.legs) {
      expect(leg.contact).toBe(false);
      expect(leg.knee).toBe(-1.05);
      expect(leg.shoulder).toBe(1.5);
    }
  });
});

let view: ReturnType<typeof createRunnerRenderer>;
let contextDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  contextDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    "getContext",
  );
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => ({ fillRect() {}, strokeRect() {}, fillText() {} }),
  });
  const canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    width: 960,
    height: 600,
  } as DOMRect);
  view = createRunnerRenderer(canvas);
});
afterEach(() => {
  view.dispose();
  if (contextDescriptor)
    Object.defineProperty(
      HTMLCanvasElement.prototype,
      "getContext",
      contextDescriptor,
    );
  vi.restoreAllMocks();
});

describe("rendered runner gait envelopes", () => {
  it("keeps shoe vertices above the track and all skins inside the lane envelope throughout a stride", () => {
    for (const skin of ["nova", "moss", "ember"] as RunnerSkin[])
      for (const speed of [10, 14, 18])
        for (let phase = 0; phase < 1; phase += 1 / 24) {
          view.render(state(phase, speed), "rail", skin);
          const world = scene();
          for (const name of ["left-ankle", "right-ankle"]) {
            const shoe = bounds(world.getObjectByName(name)!);
            expect(
              shoe.min.y,
              `${skin}/${speed}/${phase}/${name}`,
            ).toBeGreaterThanOrEqual(-0.015);
          }
          const avatar = bounds(world.getObjectByName("standing-runner")!);
          expect(avatar.min.x).toBeGreaterThan(-0.7);
          expect(avatar.max.x).toBeLessThan(0.7);
          expect(avatar.max.y).toBeLessThan(2.45);
        }
  });
  it("preserves actual joint, camera and scenery matrices on the first paused frame", () => {
    const playing = {
      ...state(0.37, 14),
      distance: 37,
      avatarX: 0.4,
      targetLane: 1 as const,
    };
    view.render(playing);
    const before: number[][] = [];
    scene().traverse((object) => before.push(object.matrixWorld.toArray()));
    const camera = gpu.render.mock.lastCall![1] as THREE.PerspectiveCamera;
    camera.updateMatrixWorld(true);
    const projection = camera.projectionMatrix.toArray();
    const cameraTransform = camera.matrixWorld.toArray();
    view.render({ ...playing, phase: "paused" });
    camera.updateMatrixWorld(true);
    const after: number[][] = [];
    scene().traverse((object) => after.push(object.matrixWorld.toArray()));
    expect(after).toEqual(before);
    expect(camera.projectionMatrix.toArray()).toEqual(projection);
    expect(camera.matrixWorld.toArray()).toEqual(cameraTransform);
  });
  it("keeps the rendered planted ankle on the track even while the decorative pelvis counterturns", () => {
    for (const speed of [10, 14, 18]) {
      const cadence = 1.8 + 0.04 * speed;
      const fraction = (0.76 * cadence) / speed;
      const time = (3 + fraction * 0.6) / cadence;
      const delta = 0.0001;
      const input = {
        ...state(),
        elapsedMs: time * 1000,
        distance: speed * time,
        speed,
      };
      view.render(input);
      const ankle = scene().getObjectByName("left-ankle")!;
      const before = ankle.getWorldPosition(new THREE.Vector3());
      view.render({
        ...input,
        elapsedMs: (time + delta) * 1000,
        distance: speed * (time + delta),
      });
      const after = scene()
        .getObjectByName("left-ankle")!
        .getWorldPosition(new THREE.Vector3());
      expect((after.z - before.z) / delta).toBeCloseTo(speed, 7);
      expect(after.y).toBeCloseTo(before.y, 7);
      expect(bounds(ankle).min.y).toBeGreaterThanOrEqual(0);
    }
  });
  it("reaches the same articulated pose after different renderer histories", () => {
    const target = {
      ...state(0.63, 18),
      distance: 35,
      avatarX: -0.3,
      targetLane: -1 as const,
    };
    const snapshot = () => {
      const matrices: number[][] = [];
      scene()
        .getObjectByName("avatar")!
        .traverse((item) => matrices.push(item.matrixWorld.toArray()));
      return matrices;
    };
    view.render(target);
    const direct = snapshot();
    for (let index = 1; index <= 120; index++)
      view.render({
        ...target,
        elapsedMs: (target.elapsedMs * index) / 120,
        distance: (target.distance * index) / 120,
      });
    expect(snapshot()).toEqual(direct);
  });
});
