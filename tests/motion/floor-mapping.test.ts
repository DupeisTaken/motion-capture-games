import { describe, expect, it } from "vitest";
import {
  projectFloorContact,
  type FloorMapping,
} from "../../packages/motion/src/floor-mapping";

const mapping: FloorMapping = {
  revision: "r1",
  geometryKey: "camera-crop-focus-1",
  widthM: 8,
  depthM: 6,
  homography: [
    [10, 0, -1],
    [0, -10, 9],
    [0, 0, 1],
  ],
};
const context = {
  revision: "r1",
  geometryKey: mapping.geometryKey,
  onFloor: true,
};
describe("floor contact projection", () => {
  it("retains tiny numerical corner residuals while rejecting meaningful outside contacts", () => {
    const fitted = {
      ...mapping,
      homography: [
        [10, 0, -1.0000001],
        [0, -10, 9.0000001],
        [0, 0, 1],
      ],
    };
    const corner = projectFloorContact(fitted, [0.1, 0.9], context);
    expect(corner).not.toBeNull();
    expect(corner!.x).toBeLessThan(0);
    expect(Math.abs(corner!.x)).toBeLessThan(1e-5);
    expect(projectFloorContact(fitted, [0.0999, 0.9], context)).toBeNull();
  });
  it("maps a floor contact without pretending it is a body root or heading", () => {
    expect(projectFloorContact(mapping, [0.5, 0.6], context)).toEqual({
      x: 4,
      z: 3,
    });
    expect(
      projectFloorContact(mapping, [0.5, 0.6], { ...context, onFloor: false }),
    ).toBeNull();
  });
  it("rejects changed calibration and changed geometry", () => {
    expect(
      projectFloorContact(mapping, [0.5, 0.6], { ...context, revision: "r2" }),
    ).toBeNull();
    expect(
      projectFloorContact(mapping, [0.5, 0.6], {
        ...context,
        geometryKey: "new-zoom",
      }),
    ).toBeNull();
  });
  it.each([
    [0, 0],
    [1, 1],
    [NaN, 0.5],
    [-0.1, 0.5],
    [0.5, Infinity],
  ])("never clamps invalid or outside contact %j", (u, v) => {
    expect(projectFloorContact(mapping, [u, v], context)).toBeNull();
  });
  it("rejects a horizon and corrupt matrix", () => {
    expect(
      projectFloorContact(
        {
          ...mapping,
          homography: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 0],
          ],
        },
        [0.5, 0.5],
        context,
      ),
    ).toBeNull();
    expect(
      projectFloorContact(
        {
          ...mapping,
          homography: [
            [1, 0, 0],
            [0, NaN, 0],
            [0, 0, 1],
          ],
        },
        [0.5, 0.5],
        context,
      ),
    ).toBeNull();
  });
});
