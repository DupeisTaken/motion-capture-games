/** Browser amplitude is normalized feedback, never a measured sound-pressure level. */
export class MazeAudio {
  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private disposed = false;

  get enabled(): boolean {
    return this.context?.state === "running" && !this.disposed;
  }

  async enable(): Promise<void> {
    if (this.disposed) return;
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = 240;
      oscillator.connect(gain);
      oscillator.start();
      this.gain = gain;
      this.oscillator = oscillator;
    }
    const context = this.context;
    try {
      await context.resume();
    } catch (error) {
      // Closing during a pending resume is normal teardown, not an activation error.
      if (!this.disposed) throw error;
    }
  }

  setLevel(intensity: number, volume: number): void {
    if (!this.context || !this.gain || !this.enabled) return;
    if (![intensity, volume].every(Number.isFinite)) return this.silence();
    const level = Math.max(0, Math.min(1, intensity));
    const master = Math.max(0, Math.min(1, volume));
    const time = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(time);
    // A short ramp avoids clicks without retaining a queue of obsolete cues.
    this.gain.gain.setTargetAtTime(0.12 * master * level * level, time, 0.025);
  }

  silence(): void {
    if (!this.context || !this.gain) return;
    const time = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(time);
    this.gain.gain.setValueAtTime(0, time);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.silence();
    this.oscillator?.stop();
    const context = this.context;
    this.oscillator = null;
    this.gain = null;
    this.context = null;
    // The source has stopped and gain is zero even if the browser rejects close.
    if (context && context.state !== "closed")
      void context.close().catch(() => {});
  }
}
