// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { drawMoleScene } from "../../apps/mirror/src/mole-renderer";
import type { Observation } from "../../contracts/generated/observation";
import fixture from "../../contracts/examples/synthetic-observation.json";

function scene() {
  const canvas = document.createElement("canvas");
  const context = {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  };
  vi.spyOn(canvas, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return { canvas, context };
}

describe("Mole camera composition", () => {
  it("draws the raw mirrored image without tint, skeletons, labels or contact markers by default", () => {
    const { canvas, context } = scene();
    const image = {} as ImageBitmap;
    const observation = structuredClone(fixture) as Observation;
    drawMoleScene(canvas, observation, image, [
      { name: "left_wrist", x: 0.4, y: 0.5 },
    ]);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
    // The only fill is the letterbox background, before drawing the camera.
    expect(context.fillRect).toHaveBeenCalledOnce();
    expect(context.fillRect.mock.invocationCallOrder[0]).toBeLessThan(
      context.drawImage.mock.invocationCallOrder[0],
    );
    expect(context.strokeRect).not.toHaveBeenCalled();
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.arc).not.toHaveBeenCalled();
  });

  it("keeps tracking opt-in while preserving the camera mirror transform", () => {
    const { canvas, context } = scene();
    drawMoleScene(
      canvas,
      structuredClone(fixture) as Observation,
      {} as ImageBitmap,
      [{ name: "left_wrist", x: 0.4, y: 0.5 }],
      true,
      true,
      false,
    );
    expect(context.strokeRect).toHaveBeenCalledOnce();
    expect(context.fillText).toHaveBeenCalled();
    expect(context.arc).toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalledOnce();
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
  });

  it("retains a rehearsal cursor without drawing a synthetic body by default", () => {
    const { canvas, context } = scene();
    drawMoleScene(canvas, null, null, [{ name: "left_wrist", x: 0.4, y: 0.5 }]);
    expect(context.arc).toHaveBeenCalledTimes(2);
    expect(context.strokeRect).not.toHaveBeenCalled();
  });
});
