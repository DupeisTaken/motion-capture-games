import { describe, expect, it } from "vitest";
import {
  canOverlay,
  decodePreviewPacket,
  type Observation,
  type PreviewFrame,
} from "../../packages/motion/src/index";
import fixture from "../../contracts/examples/synthetic-observation.json";
import { FrameRate } from "../../apps/mirror/src/frame-rate";
const pose = fixture as Observation;
const image: PreviewFrame = {
  version: 1,
  epoch: pose.epoch,
  sequence: pose.sequence,
  source: pose.source,
  image: pose.image,
  capturedAtNs: pose.capturedAtNs,
  clockDomain: "host-monotonic",
  clockQuality: "synthetic",
  captureFps: 30,
};
function packet(metadata: unknown): Uint8Array {
  const header = new TextEncoder().encode(JSON.stringify(metadata));
  const result = new Uint8Array(header.length + 8);
  new DataView(result.buffer).setUint32(0, header.length, false);
  result.set(header, 4);
  result.set([255, 216, 255, 217], header.length + 4);
  return result;
}
describe("independent preview safety", () => {
  it("validates bounded metadata and source clock labeling", () => {
    expect(decodePreviewPacket(packet(image)).preview.captureFps).toBe(30);
    expect(() =>
      decodePreviewPacket(packet({ ...image, captureFps: -1 })),
    ).toThrow();
    expect(() =>
      decodePreviewPacket(
        packet({ ...image, clockQuality: "host-read-completion" }),
      ),
    ).toThrow();
    expect(() =>
      decodePreviewPacket(
        packet({ ...image, image: { width: 0, height: 100 } }),
      ),
    ).toThrow();
    expect(() =>
      decodePreviewPacket(packet({ ...image, people: [] })),
    ).toThrow();
  });
  it("only holds overlays within the source-time tolerance and never across epochs or geometry", () => {
    expect(canOverlay(image, pose)).toBe(true);
    expect(
      canOverlay(
        {
          ...image,
          capturedAtNs: String(BigInt(pose.capturedAtNs) + 150_000_000n),
        },
        pose,
      ),
    ).toBe(true);
    expect(
      canOverlay(
        {
          ...image,
          capturedAtNs: String(BigInt(pose.capturedAtNs) + 150_000_001n),
        },
        pose,
      ),
    ).toBe(false);
    expect(
      canOverlay(
        { ...image, capturedAtNs: String(BigInt(pose.capturedAtNs) - 1n) },
        pose,
      ),
    ).toBe(false);
    expect(canOverlay({ ...image, epoch: "new" }, pose)).toBe(false);
    expect(canOverlay({ ...image, image: { width: 1, height: 1 } }, pose)).toBe(
      false,
    );
    expect(canOverlay(image, null)).toBe(false);
  });
});
describe("measured frame rate", () => {
  it("requires two actual events, resets, and does not count a silent source as live", () => {
    const rate = new FrameRate();
    expect(rate.value(0)).toBeNull();
    rate.record(0);
    expect(rate.value(0)).toBeNull();
    for (let i = 1; i <= 120; i++) rate.record((i * 1000) / 60);
    expect(rate.value(2000)).toBeCloseTo(60, 6);
    expect(rate.value(4000)).toBeNull();
    rate.record(5000);
    expect(rate.value(5000)).toBeNull();
    rate.record(5100);
    expect(rate.value(5100)).toBe(10);
    rate.reset();
    expect(rate.value(5100)).toBeNull();
  });
});
