// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MazeAudio } from "../../apps/mirror/src/maze-audio";

afterEach(() => vi.unstubAllGlobals());
describe("maze audio amplitude and lifecycle", () => {
  it("creates audio only after activation, clamps normalized gain and immediately silences obsolete output", async () => {
    const parameter = {
      value: 0,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
    };
    const oscillator = {
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const context = {
      state: "suspended",
      currentTime: 7,
      destination: {},
      createGain: () => ({ gain: parameter, connect: vi.fn() }),
      createOscillator: () => oscillator,
      resume: vi.fn(async () => {
        context.state = "running";
      }),
      close: vi.fn(async () => {
        context.state = "closed";
      }),
    };
    const create = vi.fn(function () {
      return context;
    });
    vi.stubGlobal("AudioContext", create);
    const audio = new MazeAudio();
    audio.setLevel(1, 1);
    expect(create).not.toHaveBeenCalled();
    await audio.enable();
    expect(audio.enabled).toBe(true);
    expect(oscillator.start).toHaveBeenCalledOnce();
    audio.setLevel(2, 2);
    expect(parameter.setTargetAtTime).toHaveBeenLastCalledWith(0.12, 7, 0.025);
    audio.setLevel(0.5, 0.5);
    expect(parameter.setTargetAtTime).toHaveBeenLastCalledWith(0.015, 7, 0.025);
    audio.setLevel(NaN, 1);
    expect(parameter.setValueAtTime).toHaveBeenLastCalledWith(0, 7);
    audio.silence();
    expect(parameter.cancelScheduledValues).toHaveBeenLastCalledWith(7);
    audio.dispose();
    audio.dispose();
    expect(oscillator.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(audio.enabled).toBe(false);
    await audio.enable();
    expect(create).toHaveBeenCalledOnce();
  });
  it("handles disposal during pending resume and rejected browser close", async () => {
    let resolveResume!: () => void;
    const gain = {
      value: 0,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
    };
    const oscillator = {
      type: "",
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const context = {
      state: "suspended",
      currentTime: 0,
      destination: {},
      createGain: () => ({ gain, connect: vi.fn() }),
      createOscillator: () => oscillator,
      resume: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveResume = resolve;
          }),
      ),
      close: vi.fn(() => Promise.reject(new Error("browser close rejected"))),
    };
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function () {
        return context;
      }),
    );
    const audio = new MazeAudio();
    const pending = audio.enable();
    audio.dispose();
    audio.dispose();
    resolveResume();
    await pending;
    await Promise.resolve();
    expect(audio.enabled).toBe(false);
    expect(context.close).toHaveBeenCalledOnce();
    expect(oscillator.stop).toHaveBeenCalledOnce();
    expect(gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
  });
});
