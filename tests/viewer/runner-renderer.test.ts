// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createRunnerRenderer } from "../../apps/mirror/src/runner-renderer";
import { RunnerGame, TUNING } from "../../games/motion-runner/src/index";

const gpu = vi.hoisted(() => ({
  render: vi.fn(),
  dispose: vi.fn(),
  setSize: vi.fn(),
}));
vi.mock("three", async (original) => {
  const actual = await original<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      setPixelRatio() {}
      setSize = gpu.setSize;
      render = gpu.render;
      dispose = gpu.dispose;
    },
  };
});

let view: ReturnType<typeof createRunnerRenderer>;
let canvas: HTMLCanvasElement;
let disposedByTest = false;
let contextDescriptor: PropertyDescriptor | undefined;
function state() {
  return {
    ...new RunnerGame().state,
    phase: "playing" as const,
    elapsedMs: 1500,
  };
}
function scene(): THREE.Scene {
  const value = gpu.render.mock.lastCall?.[0] as THREE.Scene;
  value.updateMatrixWorld(true);
  return value;
}
function named(name: string): THREE.Object3D {
  const value = scene().getObjectByName(name);
  expect(value, `Expected scene object ${name}`).toBeDefined();
  return value!;
}
/** Use rendered vertices rather than an inflated rotated local bounding box. */
function visibleBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  root.traverse((item) => {
    if (!(item instanceof THREE.Mesh)) return;
    const positions = item.geometry.getAttribute("position");
    const point = new THREE.Vector3();
    for (let index = 0; index < positions.count; index++)
      bounds.expandByPoint(
        point
          .fromBufferAttribute(positions, index)
          .applyMatrix4(item.matrixWorld),
      );
  });
  return bounds;
}

beforeEach(() => {
  vi.clearAllMocks();
  disposedByTest = false;
  contextDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    "getContext",
  );
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => ({
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
    })),
  });
  canvas = document.createElement("canvas");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    width: 960,
    height: 600,
  } as DOMRect);
  view = createRunnerRenderer(canvas);
});
afterEach(() => {
  if (!disposedByTest) view.dispose();
  if (contextDescriptor)
    Object.defineProperty(
      HTMLCanvasElement.prototype,
      "getContext",
      contextDescriptor,
    );
  vi.restoreAllMocks();
});

describe("runner rendered geometry and lifecycle", () => {
  it("places the train's visible front at the runtime collision boundary", () => {
    view.render({
      ...state(),
      obstacles: [{ id: 900, lane: 0, kind: "train", z: 4 }],
    });
    const train = visibleBounds(named("obstacle-train"));
    // The avatar's forward footprint is approximately 0.4m. A hit should occur
    // at visible contact, not several meters before a short train model arrives.
    expect(train.max.z).toBeGreaterThanOrEqual(-0.5);
    expect(train.max.z).toBeLessThanOrEqual(0.1);
    expect(train.max.z - train.min.z).toBeGreaterThan(7);
  });

  it("keeps every frame of the tucked roll below the overhead opening", () => {
    for (let elapsedMs = 0; elapsedMs <= 1000; elapsedMs += 25) {
      view.render({
        ...state(),
        elapsedMs,
        duck: true,
        obstacles: [{ id: 901, lane: 0, kind: "overhead", z: 0 }],
      });
      const roll = named("rolling-runner");
      const bounds = visibleBounds(roll);
      expect(roll.visible).toBe(true);
      expect(named("standing-runner").visible).toBe(false);
      expect(bounds.min.y).toBeGreaterThanOrEqual(-0.02);
      expect(bounds.max.y).toBeLessThan(1.15);
    }
  });

  it("matches the low hurdle silhouette to the documented jump clearance", () => {
    view.render({
      ...state(),
      obstacles: [{ id: 902, lane: 0, kind: "barrier", z: 0 }],
    });
    const hurdle = visibleBounds(named("obstacle-barrier"));
    expect(hurdle.max.y).toBeLessThanOrEqual(TUNING.barrierClearanceM + 0.001);
  });

  it("freezes scenery, avatar pose and coin rotation on the paused timeline", () => {
    const paused = {
      ...state(),
      phase: "paused" as const,
      distance: 43,
      duck: true,
      obstacles: [{ id: 903, lane: 1 as const, kind: "coin" as const, z: 12 }],
    };
    view.render(paused);
    const before: number[][] = [];
    scene().traverse((item) => before.push(item.matrixWorld.toArray()));
    view.render(paused);
    const after: number[][] = [];
    scene().traverse((item) => after.push(item.matrixWorld.toArray()));
    expect(after).toEqual(before);
  });

  it("reclaims per-instance GPU resources when worlds change and on disposal", () => {
    view.render(state(), "rail");
    const originalTies: THREE.InstancedMesh[] = [];
    scene().traverse((item) => {
      if (item instanceof THREE.InstancedMesh) originalTies.push(item);
    });
    const disposed = originalTies.map((ties) => vi.spyOn(ties, "dispose"));
    view.render(state(), "gold");
    for (const call of disposed) expect(call).toHaveBeenCalledOnce();
    const objectCount = () => {
      let count = 0;
      scene().traverse(() => {
        count++;
      });
      return count;
    };
    const goldCount = objectCount();
    for (let index = 0; index < 8; index++)
      view.render(state(), index % 2 ? "gold" : "rail");
    expect(objectCount()).toBe(goldCount);
    const currentTies: THREE.InstancedMesh[] = [];
    scene().traverse((item) => {
      if (item instanceof THREE.InstancedMesh) currentTies.push(item);
    });
    const finalDisposed = currentTies.map((ties) => vi.spyOn(ties, "dispose"));
    view.dispose();
    disposedByTest = true;
    for (const call of finalDisposed) expect(call).toHaveBeenCalledOnce();
    expect(gpu.dispose).toHaveBeenCalledOnce();
  });
});
