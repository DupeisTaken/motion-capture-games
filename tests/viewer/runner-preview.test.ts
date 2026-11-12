// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunnerPreview } from "../../apps/mirror/src/runner-preview";
afterEach(() => vi.unstubAllGlobals());
describe("runner optional shared-stream preview", () => {
  function setup() {
    const drawImage = vi.fn(),
      clearRect = vi.fn();
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue({
      drawImage,
      clearRect,
    } as never);
    const preview = new RunnerPreview(canvas);
    return { preview, drawImage, clearRect };
  }
  it("bounds decode work and closes late bitmaps after clear, stop or disposal", async () => {
    for (const action of ["clear", "dispose"] as const) {
      const { preview, drawImage } = setup();
      let resolve!: (value: ImageBitmap) => void;
      const decode = vi.fn(
        () =>
          new Promise<ImageBitmap>((done) => {
            resolve = done;
          }),
      );
      vi.stubGlobal("createImageBitmap", decode);
      preview.push(new Uint8Array([1]), 10, () => 20);
      preview.push(new Uint8Array([2]), 11, () => 20);
      expect(decode).toHaveBeenCalledTimes(1);
      preview[action]();
      const close = vi.fn();
      resolve({ width: 640, height: 480, close } as unknown as ImageBitmap);
      await new Promise((done) => setTimeout(done, 0));
      expect(close).toHaveBeenCalledOnce();
      expect(drawImage).not.toHaveBeenCalled();
      expect(preview.atMs).toBe(-Infinity);
    }
  });
  it("drops delayed images and recovers after optional decode failure", async () => {
    const { preview, drawImage } = setup();
    const close = vi.fn();
    const bitmap = { width: 640, height: 480, close } as unknown as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("bad JPEG"))
        .mockResolvedValue(bitmap),
    );
    preview.push(new Uint8Array([1]), 0, () => 500);
    await new Promise((done) => setTimeout(done, 0));
    preview.push(new Uint8Array([1]), 0, () => 500);
    await new Promise((done) => setTimeout(done, 0));
    expect(drawImage).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    preview.push(new Uint8Array([1]), 500, () => 510);
    await new Promise((done) => setTimeout(done, 0));
    expect(drawImage).toHaveBeenCalledOnce();
    expect(preview.atMs).toBe(500);
  });
});
