import { describe, expect, it, vi } from "vitest";
import { CameraReleases } from "../../apps/mirror/src/camera-release";

const response = (ok = true, detail = "") =>
  ({
    ok,
    status: ok ? 200 : 409,
    json: async () => ({ detail }),
  }) as Response;

describe("acknowledged camera release", () => {
  it("preserves the browser-global receiver required by native fetch", async () => {
    const request = vi.fn<typeof fetch>(function (this: typeof globalThis) {
      expect(this).toBe(globalThis);
      return Promise.resolve(response());
    });
    const releases = new CameraReleases(request);
    expect(await releases.release("browser-owned")).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("releases only its acknowledged epoch and reports the acknowledgment", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response());
    const releases = new CameraReleases(request);
    expect(await releases.release("owned-epoch")).toBe(true);
    expect(request).toHaveBeenCalledWith(
      "/api/stop",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ epoch: "owned-epoch" }),
        keepalive: true,
      }),
    );
    expect(releases.state).toEqual({
      pendingCount: 0,
      releasing: false,
      message: null,
    });
  });

  it("retains ownership and the backend detail after 409, then permits retry", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(false, "Camera driver is still stopping; ownership retained."),
      )
      .mockResolvedValueOnce(response());
    const releases = new CameraReleases(request);
    expect(await releases.release("held-camera")).toBe(false);
    expect(releases.state).toMatchObject({ pendingCount: 1, releasing: false });
    expect(releases.state.message).toMatch(
      /release unconfirmed.*driver.*ownership retained.*preview is stopped/i,
    );
    expect(await releases.retry()).toBe(true);
    expect(releases.state.pendingCount).toBe(0);
    expect(
      request.mock.calls.map(([, init]) => JSON.parse(String(init?.body))),
    ).toEqual([{ epoch: "held-camera" }, { epoch: "held-camera" }]);
  });

  it("keeps network failures retryable without assuming socket closure released capture", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("Service offline"))
      .mockResolvedValueOnce(response());
    const releases = new CameraReleases(request);
    expect(await releases.release("offline-camera")).toBe(false);
    expect(releases.state.message).toMatch(/unconfirmed.*offline/i);
    expect(await releases.retry()).toBe(true);
  });

  it("deduplicates concurrent requests for the same epoch", async () => {
    let finish!: (response: Response) => void;
    const request = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const releases = new CameraReleases(request);
    const first = releases.release("one-owner");
    const second = releases.release("one-owner");
    await Promise.resolve();
    expect(first).toBe(second);
    expect(request).toHaveBeenCalledTimes(1);
    expect(releases.state.releasing).toBe(true);
    finish(response());
    await first;
    expect(releases.state.releasing).toBe(false);
  });

  it("retains only failed epochs when several late acknowledgments need cleanup", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(false, "Driver busy"))
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response());
    const releases = new CameraReleases(request);
    releases.retain("first-owned");
    releases.retain("second-owned");
    expect(await releases.retry()).toBe(false);
    expect(releases.state.pendingCount).toBe(1);
    expect(await releases.retry()).toBe(true);
    expect(
      request.mock.calls.map(
        ([, init]) => JSON.parse(String(init?.body)).epoch,
      ),
    ).toEqual(["first-owned", "second-owned", "first-owned"]);
  });

  it("does not leave a synchronous transport exception registered forever", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => {
        throw new Error("Transport failed");
      })
      .mockResolvedValueOnce(response());
    const releases = new CameraReleases(request);
    expect(await releases.release("retry-owner")).toBe(false);
    expect(releases.state.releasing).toBe(false);
    expect(await releases.retry()).toBe(true);
  });
});
