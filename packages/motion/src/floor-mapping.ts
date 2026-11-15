/** A floor homography is valid only for points on that plane, never hips or heads. */
export interface FloorMapping {
  revision: string;
  geometryKey: string;
  widthM: number;
  depthM: number;
  homography: number[][];
}

export function projectFloorContact(
  mapping: FloorMapping,
  imagePoint: readonly [number, number],
  context: { revision: string; geometryKey: string; onFloor: boolean },
): { x: number; z: number } | null {
  if (
    !context.onFloor ||
    !mapping.revision ||
    context.revision !== mapping.revision ||
    context.geometryKey !== mapping.geometryKey ||
    ![mapping.widthM, mapping.depthM].every(
      (n) => Number.isFinite(n) && n > 0,
    ) ||
    !imagePoint.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ||
    mapping.homography.length !== 3 ||
    mapping.homography.some(
      (row) => row.length !== 3 || !row.every(Number.isFinite),
    )
  )
    return null;
  const [u, v] = imagePoint;
  const h = mapping.homography;
  const scale = h[2][0] * u + h[2][1] * v + h[2][2];
  if (Math.abs(scale) < 1e-9) return null;
  const x = (h[0][0] * u + h[0][1] * v + h[0][2]) / scale;
  const z = (h[1][0] * u + h[1][1] * v + h[1][2]) / scale;
  // Allow only numerical fit residue (10 micrometers); retain raw coordinates.
  // Never clamp a measured outside contact into a valid maze corridor.
  const numericalToleranceM = 1e-5;
  return Number.isFinite(x) &&
    Number.isFinite(z) &&
    x >= -numericalToleranceM &&
    z >= -numericalToleranceM &&
    x <= mapping.widthM + numericalToleranceM &&
    z <= mapping.depthM + numericalToleranceM
    ? { x, z }
    : null;
}
