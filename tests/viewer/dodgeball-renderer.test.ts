// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { drawDodgeScene } from "../../apps/mirror/src/dodgeball-renderer";
import { syntheticBody } from "../../packages/motion/src/index";
import fixture from "../../contracts/examples/synthetic-observation.json";
import type { Observation } from "../../contracts/generated/observation";

function scene() {
  const canvas = document.createElement("canvas");
  const methods = Object.fromEntries(
    [
      "setTransform",
      "fillRect",
      "save",
      "beginPath",
      "rect",
      "clip",
      "translate",
      "scale",
      "drawImage",
      "restore",
      "fillText",
      "moveTo",
      "lineTo",
      "stroke",
      "closePath",
      "fill",
      "arc",
      "setLineDash",
      "strokeRect",
      "quadraticCurveTo",
    ].map((name) => [name, vi.fn()]),
  );
  vi.spyOn(canvas, "getContext").mockReturnValue(
    methods as unknown as CanvasRenderingContext2D,
  );
  return {
    canvas,
    methods,
    observation: structuredClone(fixture) as Observation,
    image: {} as ImageBitmap,
  };
}

describe("Dodgeball camera composition", () => {
  it("shows raw mirrored camera pixels without a tint, skeleton, labels or collider", () => {
    const { canvas, methods, observation, image } = scene();
    drawDodgeScene(canvas, observation, image, syntheticBody(), null);
    expect(methods.drawImage).toHaveBeenCalledOnce();
    expect(methods.scale).toHaveBeenCalledWith(-1, 1);
    // The single fill clears letterbox pixels before the untouched camera draw.
    expect(methods.fillRect).toHaveBeenCalledTimes(1);
    expect(methods.fillText).not.toHaveBeenCalled();
    expect(methods.stroke).not.toHaveBeenCalled();
    expect(methods.arc).not.toHaveBeenCalled();
    expect(methods.strokeRect).not.toHaveBeenCalled();
  });
  it("keeps the virtual ball visible when tracking graphics are hidden", () => {
    const { canvas, methods, observation, image } = scene();
    drawDodgeScene(canvas, observation, image, syntheticBody(), {
      id: 1,
      x: 0.5,
      y: 0.5,
      radius: 0.08,
      phase: "warning",
      remainingMs: 1000,
      durationMs: 1700,
      hit: false,
      eligibleForDodge: true,
      dangerAtMs: 1700,
      resolved: false,
    });
    expect(methods.arc).toHaveBeenCalled();
    expect(methods.stroke).toHaveBeenCalled();
    expect(methods.fillText).not.toHaveBeenCalled();
    expect(methods.fillRect).toHaveBeenCalledTimes(1);
  });
  it("draws labels, collision shapes and framing guides only when requested", () => {
    const { canvas, methods, observation, image } = scene();
    drawDodgeScene(
      canvas,
      observation,
      image,
      syntheticBody(),
      null,
      true,
      true,
    );
    expect(methods.fillText).toHaveBeenCalled();
    expect(methods.strokeRect).toHaveBeenCalledTimes(2);
    expect(methods.arc).toHaveBeenCalled();
    expect(methods.fillRect).toHaveBeenCalledTimes(1);
  });
});
