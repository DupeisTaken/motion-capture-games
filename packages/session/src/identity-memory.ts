/** One ephemeral association token, never a biometric or a replay of old joints. */
export class EphemeralIdentityMemory {
  private scope: string | null = null;
  private sourceNs = 0n;
  private receivedMs = 0;

  constructor(readonly windowMs: number) {
    // Match the tracker retention ceiling; this is provisional, not field tuning.
    if (!Number.isFinite(windowMs) || windowMs < 0 || windowMs > 450)
      throw new RangeError("Identity recovery must be between 0 and 450 ms.");
  }

  remember(scope: string, sourceNs: bigint, receivedMs: number): void {
    if (
      !scope ||
      sourceNs < 0n ||
      !Number.isFinite(receivedMs) ||
      receivedMs < 0
    )
      throw new RangeError(
        "Identity memory requires a valid scope and clocks.",
      );
    this.scope = scope;
    this.sourceNs = sourceNs;
    this.receivedMs = receivedMs;
  }

  allows(scope: string, sourceNs: bigint, receivedMs: number): boolean {
    return (
      this.scope === scope &&
      sourceNs >= this.sourceNs &&
      Number.isFinite(receivedMs) &&
      receivedMs >= this.receivedMs &&
      receivedMs - this.receivedMs <= this.windowMs &&
      Number(sourceNs - this.sourceNs) / 1e6 <= this.windowMs
    );
  }

  expired(receivedMs: number): boolean {
    return (
      this.scope !== null &&
      (!Number.isFinite(receivedMs) ||
        receivedMs < this.receivedMs ||
        receivedMs - this.receivedMs > this.windowMs)
    );
  }

  clear(): void {
    this.scope = null;
    this.sourceNs = 0n;
    this.receivedMs = 0;
  }
}
