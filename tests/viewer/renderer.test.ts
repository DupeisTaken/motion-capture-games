// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { drawFrame } from "../../apps/mirror/src/renderer";
import fixture from "../../contracts/examples/synthetic-observation.json";
import type { Observation } from "../../contracts/generated/observation";
function surface() {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientWidth", { value: 640 });
  Object.defineProperty(canvas, "clientHeight", { value: 480 });
  const context = {
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 60 })),
    fillText: vi.fn(),
  };
  vi.spyOn(canvas, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return { canvas, context };
}
const options = {
  mirror: true,
  showImage: true,
  showBoxes: true,
  confidence: 0.5,
};
describe("batched skeleton drawing", () => {
  it("bounds expensive strokes by people rather than by the number of bones", () => {
    const { canvas, context } = surface();
    const frame = {
      ...structuredClone(fixture),
      people: Array.from({ length: 3 }, () =>
        structuredClone(fixture.people[0]),
      ),
    } as Observation;
    drawFrame(canvas, {} as ImageBitmap, frame, options);
    expect(context.stroke).toHaveBeenCalledTimes(9); // two bone passes and one joint outline per body
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(context.fillText).toHaveBeenCalledTimes(3);
  });
  it("applies presentation mirroring while retaining the same anatomical observations", () => {
    const { canvas, context } = surface();
    const frame = structuredClone(fixture) as Observation;
    const original = structuredClone(frame);
    drawFrame(canvas, {} as ImageBitmap, frame, options);
    const mirrored = context.moveTo.mock.calls[0];
    context.moveTo.mockClear();
    drawFrame(canvas, {} as ImageBitmap, frame, { ...options, mirror: false });
    const unmirrored = context.moveTo.mock.calls[0];
    expect(mirrored[0] + unmirrored[0]).toBeCloseTo(640);
    expect(mirrored[1]).toBe(unmirrored[1]);
    expect(frame).toEqual(original);
  });
});
