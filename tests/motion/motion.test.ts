import { describe, expect, it } from "vitest";
import {
  BONES,
  JOINT_NAMES,
  MAX_METADATA_BYTES,
  MAX_PREVIEW_BYTES,
  ObservationOrder,
  containRect,
  decodeFramePacket,
  isRenderableJoint,
  mapBox,
  mapJoint,
  parseObservation,
  visibleBones,
  type Joint,
} from "../../packages/motion/src/index";
import fixture from "../../contracts/examples/synthetic-observation.json";

const goodJoint = (overrides: Partial<Joint> = {}): Joint => ({
  x: 0.25,
  y: 0.4,
  score: 0.9,
  status: "observed",
  inFrame: true,
  ...overrides,
});
type Geometry = { x: number; y: number; width?: number; height?: number };
function expectGeometryCloseTo(actual: Geometry, expected: Geometry): void {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
  if (expected.width !== undefined)
    expect(actual.width).toBeCloseTo(expected.width, 10);
  if (expected.height !== undefined)
    expect(actual.height).toBeCloseTo(expected.height, 10);
}

const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0xff, 0xd9]);
function packet(
  value: unknown = fixture,
  jpeg: Uint8Array = fakeJpeg,
): Uint8Array {
  const metadata = new TextEncoder().encode(JSON.stringify(value));
  const encoded = new Uint8Array(4 + metadata.length + jpeg.length);
  new DataView(encoded.buffer).setUint32(0, metadata.length, false);
  encoded.set(metadata, 4);
  encoded.set(jpeg, 4 + metadata.length);
  return encoded;
}

describe("model-independent skeleton presentation", () => {
  it("defines the canonical joint set and anatomical bones without model indices", () => {
    expect(JOINT_NAMES).toHaveLength(21);
    expect(JOINT_NAMES).toEqual(
      expect.arrayContaining([
        "left_index_finger",
        "right_index_finger",
        "left_pinky_finger",
        "right_pinky_finger",
      ]),
    );
    expect(BONES).toContainEqual(["left_elbow", "left_wrist"]);
    for (const [from, to] of BONES) {
      expect(JOINT_NAMES).toContain(from);
      expect(JOINT_NAMES).toContain(to);
    }
  });

  it("letterboxes video and joints with the same aspect-preserving rectangle", () => {
    const fit = containRect(
      { width: 1920, height: 1080 },
      { width: 1000, height: 1000 },
    );
    expectGeometryCloseTo(fit, { x: 0, y: 218.75, width: 1000, height: 562.5 });
    expectGeometryCloseTo(mapJoint({ x: 0.25, y: 0.4 }, fit, true), {
      x: 750,
      y: 443.75,
    });
    expectGeometryCloseTo(mapJoint({ x: 0.25, y: 0.4 }, fit, false), {
      x: 250,
      y: 443.75,
    });
  });

  it("maps a portrait viewport without stretching the source", () => {
    const fit = containRect(
      { width: 640, height: 480 },
      { width: 390, height: 844 },
    );
    expect(fit.width).toBeCloseTo(390, 10);
    expect(fit.height).toBeCloseTo(292.5, 10);
    expect(fit.y).toBeCloseTo(275.75, 10);
  });

  it("mirrors presentation, preserves anatomical labels and maps boxes from their opposite edge", () => {
    const person = parseObservation(structuredClone(fixture)).people[0];
    const point = person.joints.left_wrist;
    expect(isRenderableJoint(point)).toBe(true);
    if (!isRenderableJoint(point)) throw new Error("Missing fixture wrist");
    const rect = { x: 20, y: 10, width: 100, height: 200 };
    expectGeometryCloseTo(mapJoint(point, rect), { x: 90, y: 110 });
    expect(person.joints.left_wrist).toBe(point);
    const mirroredNormalizedX = (mapJoint(point, rect).x - rect.x) / rect.width;
    expect(
      mapJoint({ x: mirroredNormalizedX, y: point.y }, rect).x,
    ).toBeCloseTo(50);
    expectGeometryCloseTo(
      mapBox({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, rect),
      { x: 80, y: 50, width: 30, height: 80 },
    );
  });

  it("does not clamp off-image coordinates into a visible image edge", () => {
    const rect = { x: 0, y: 0, width: 100, height: 100 };
    expectGeometryCloseTo(mapJoint({ x: 1.2, y: -0.1 }, rect, false), {
      x: 120,
      y: -10,
    });
    expect(isRenderableJoint(goodJoint({ x: 1.2, inFrame: false }))).toBe(
      false,
    );
  });

  it("does not bridge missing or low-score joints with bones", () => {
    const segments = visibleBones({
      left_shoulder: goodJoint(),
      left_elbow: goodJoint(),
      left_wrist: goodJoint({ score: 0.2 }),
      right_shoulder: goodJoint({
        x: null,
        y: null,
        status: "missing",
        inFrame: false,
      }),
    });
    expect(segments.map(({ from, to }) => [from, to])).toEqual([
      ["left_shoulder", "left_elbow"],
    ]);
  });

  it.each([
    undefined,
    goodJoint({ x: Number.NaN }),
    goodJoint({ inFrame: false }),
    goodJoint({ x: null, y: null, status: "missing", inFrame: false }),
  ])("hides unsupported joint %o", (joint) => {
    expect(isRenderableJoint(joint)).toBe(false);
  });

  it("accepts estimated in-image joints only when they clear the display threshold", () => {
    expect(
      isRenderableJoint(goodJoint({ status: "estimated", score: 0.5 }), 0.5),
    ).toBe(true);
    expect(isRenderableJoint(goodJoint(), Number.NaN)).toBe(false);
  });

  it.each([
    { width: 0, height: 10 },
    { width: 10, height: Number.POSITIVE_INFINITY },
  ])("rejects invalid viewport %o", (viewport) => {
    expect(() => containRect({ width: 100, height: 100 }, viewport)).toThrow(
      "finite positive",
    );
  });
});

describe("source epoch and sequence ordering", () => {
  it("rejects duplicate/out-of-order observations and late source epochs", () => {
    const order = new ObservationOrder();
    order.reset("first");
    expect(order.accept({ epoch: "first", sequence: 10 })).toBe(true);
    expect(order.accept({ epoch: "first", sequence: 10 })).toBe(false);
    expect(order.accept({ epoch: "first", sequence: 9 })).toBe(false);
    expect(order.accept({ epoch: "second", sequence: 100 })).toBe(false);
    order.reset("second");
    expect(order.accept({ epoch: "second", sequence: 0 })).toBe(true);
    expect(order.accept({ epoch: "first", sequence: 11 })).toBe(false);
  });

  it("can adopt the initial epoch and clears history after an intentional reset", () => {
    const order = new ObservationOrder();
    expect(order.accept({ epoch: "initial", sequence: 4 })).toBe(true);
    order.reset();
    expect(order.accept({ epoch: "replacement", sequence: 0 })).toBe(true);
    expect(order.accept({ epoch: "replacement", sequence: -1 })).toBe(false);
    expect(order.accept({ epoch: "replacement", sequence: 1.5 })).toBe(false);
  });
});

describe("bounded source-aligned frame packets", () => {
  it("decodes observation and preview from the same packet without losing nanoseconds", () => {
    const result = decodeFramePacket(packet());
    expect(result.observation.frameId).toBe("synthetic-frame-1");
    expect(result.observation.capturedAtNs).toBe("10000000000000001");
    expect(result.jpeg).toEqual(fakeJpeg);
  });

  it("respects Uint8Array view offsets rather than reading unrelated buffer prefixes", () => {
    const bytes = packet();
    const enclosing = new Uint8Array(bytes.length + 20).fill(200);
    enclosing.set(bytes, 7);
    expect(
      decodeFramePacket(enclosing.subarray(7, 7 + bytes.length)).observation
        .sequence,
    ).toBe(1);
  });

  it.each([
    new Uint8Array(0),
    new Uint8Array(3),
    new Uint8Array([0, 0, 0, 0]),
    new Uint8Array([0, 1, 0, 1]),
  ])("rejects truncated or invalid metadata framing %o", (bytes) => {
    expect(() => decodeFramePacket(bytes)).toThrow("Invalid frame packet");
  });

  it("rejects oversized metadata before parsing", () => {
    const bytes = new Uint8Array(4 + MAX_METADATA_BYTES + 2);
    new DataView(bytes.buffer).setUint32(0, MAX_METADATA_BYTES + 1, false);
    expect(() => decodeFramePacket(bytes)).toThrow("metadata length");
  });

  it("rejects oversized image payloads and wrong image framing", () => {
    expect(() =>
      decodeFramePacket(packet(fixture, new Uint8Array(MAX_PREVIEW_BYTES + 1))),
    ).toThrow("bounded JPEG");
    expect(() =>
      decodeFramePacket(packet(fixture, new Uint8Array([1, 2, 3, 4]))),
    ).toThrow("bounded JPEG");
  });

  it("rejects invalid UTF-8 and JSON metadata", () => {
    const bytes = packet();
    bytes[4] = 0xff;
    expect(() => decodeFramePacket(bytes)).toThrow("UTF-8 JSON");
    const malformed = packet();
    malformed[4] = "!".charCodeAt(0);
    expect(() => decodeFramePacket(malformed)).toThrow("UTF-8 JSON");
  });

  it("validates the canonical contract before returning a packet", () => {
    expect(() =>
      decodeFramePacket(packet({ ...fixture, detectedCount: 5 })),
    ).toThrow("detected count");
  });
});
