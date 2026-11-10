import {
  GAME_INPUT_QUALITY,
  observationSpaceRevision,
  observationToGameFrame,
  type GameMotionFrame,
  type Observation,
} from "../../motion/src/index";

export interface PlayerBinding {
  slotId: "player-1";
  trackId: string;
  epoch: string;
  spaceRevision: string;
}

interface SourceTime {
  captured: bigint;
  processed: bigint;
  processingAgeMs: number;
}

function sourceTime(observation: Observation): SourceTime | null {
  if (
    !/^\d+$/.test(observation.capturedAtNs) ||
    !/^\d+$/.test(observation.processedAtNs)
  )
    return null;
  const captured = BigInt(observation.capturedAtNs);
  const processed = BigInt(observation.processedAtNs);
  const processingAgeMs = Number(processed - captured) / 1e6;
  if (!Number.isFinite(processingAgeMs) || processingAgeMs < 0) return null;
  return { captured, processed, processingAgeMs };
}

/** One explicitly enrolled anonymous slot; detection order never grants control. */
export class SinglePlayerSession {
  private current: PlayerBinding | null = null;
  private sourceRevision = "";
  private failure: string | null = null;
  private anchorSourceNs = 0n;
  private anchorBrowserMs = 0;
  private lastSourceNs = 0n;
  private lastProcessedNs = 0n;
  private lastSequence = -1;
  private lastReceivedMs = 0;
  private lastPublishedAtMs = -Infinity;

  get binding(): PlayerBinding | null {
    return this.current ? { ...this.current } : null;
  }

  get reason(): string | null {
    return this.failure;
  }

  release(): void {
    this.current = null;
    this.sourceRevision = "";
    this.failure = null;
    this.lastSequence = -1;
    this.lastPublishedAtMs = -Infinity;
  }

  private invalidate(reason: string): null {
    this.release();
    this.failure = reason;
    return null;
  }

  join(
    observation: Observation,
    trackId: string,
    receivedAtMs: number,
  ): GameMotionFrame | null {
    if (this.current) {
      if (this.current.trackId !== trackId) {
        this.failure = "Player 1 is already joined. Release the slot first.";
        return null;
      }
      return this.ingest(observation, receivedAtMs);
    }
    if (
      !Number.isFinite(receivedAtMs) ||
      receivedAtMs < 0 ||
      !observation.epoch ||
      !Number.isSafeInteger(observation.sequence) ||
      observation.sequence < 0
    ) {
      this.failure = "The source timing is invalid. Start the source again.";
      return null;
    }
    const matching = observation.people.filter(
      (person) => !!trackId && person.trackId === trackId,
    );
    if (matching.length !== 1 || matching[0].identity !== "confident") {
      this.failure =
        "Choose exactly one confidently tracked participant to join.";
      return null;
    }
    const timing = sourceTime(observation);
    if (!timing || timing.processingAgeMs > GAME_INPUT_QUALITY.maximumAgeMs) {
      this.failure = "The observation is stale or its source clock is invalid.";
      return null;
    }
    this.sourceRevision = observationSpaceRevision(observation);
    this.current = {
      slotId: "player-1",
      trackId,
      epoch: observation.epoch,
      // A different explicit track selection cannot inherit an old round's score.
      spaceRevision: JSON.stringify([this.sourceRevision, trackId]),
    };
    // Use bigint differences so long-running nanosecond clocks retain precision.
    // Initial network transit is unknown: this mapping is a lower bound on age,
    // not exposure synchronization. Never re-anchor delayed packets on arrival.
    this.anchorSourceNs = timing.captured;
    this.anchorBrowserMs = receivedAtMs - timing.processingAgeMs;
    this.lastSourceNs = timing.captured;
    this.lastProcessedNs = timing.processed;
    this.lastSequence = observation.sequence;
    this.lastReceivedMs = receivedAtMs;
    this.lastPublishedAtMs = this.anchorBrowserMs;
    this.failure = null;
    return {
      ...observationToGameFrame(observation, matching[0], this.anchorBrowserMs),
      spaceRevision: this.current.spaceRevision,
    };
  }

  ingest(
    observation: Observation,
    receivedAtMs: number,
  ): GameMotionFrame | null {
    const binding = this.current;
    if (!binding) {
      this.failure ??= "Join a participant before playing.";
      return null;
    }
    if (
      observation.epoch !== binding.epoch ||
      observationSpaceRevision(observation) !== this.sourceRevision
    ) {
      return this.invalidate(
        "The source or camera geometry changed. Explicitly rejoin Player 1.",
      );
    }
    if (
      !Number.isFinite(receivedAtMs) ||
      receivedAtMs < this.lastReceivedMs ||
      !Number.isSafeInteger(observation.sequence) ||
      observation.sequence < 0
    ) {
      return this.invalidate("The source timing changed. Rejoin Player 1.");
    }
    if (observation.sequence <= this.lastSequence) {
      this.failure = "An outdated observation was rejected.";
      return null;
    }
    const timing = sourceTime(observation);
    if (
      !timing ||
      timing.captured <= this.lastSourceNs ||
      timing.processed < this.lastProcessedNs
    ) {
      return this.invalidate("The source clock reset. Rejoin Player 1.");
    }
    const matching = observation.people.filter(
      (person) => person.trackId === binding.trackId,
    );
    if (matching.length !== 1 || matching[0].identity !== "confident") {
      return this.invalidate(
        "Player 1 is missing or uncertain. Separate from others and rejoin.",
      );
    }
    if (
      receivedAtMs - this.lastReceivedMs > GAME_INPUT_QUALITY.maximumAgeMs ||
      Number(timing.captured - this.lastSourceNs) / 1e6 >
        GAME_INPUT_QUALITY.maximumAgeMs
    ) {
      return this.invalidate(
        "Tracking was interrupted. Explicitly rejoin Player 1.",
      );
    }
    const rawAtMs =
      this.anchorBrowserMs +
      Number(timing.captured - this.anchorSourceNs) / 1e6;
    const correctionMs = Math.max(0, rawAtMs - receivedAtMs);
    if (
      !Number.isFinite(rawAtMs) ||
      correctionMs > GAME_INPUT_QUALITY.maximumAnchorCorrectionMs
    ) {
      return this.invalidate("The source clock moved ahead. Rejoin Player 1.");
    }
    // A faster packet can reveal a small overestimate in the initial unknown
    // transit. Only move the anchor earlier, never refresh a late source sample.
    // This proposed 20 ms scheduling allowance does not establish clock sync.
    const atMs = Math.min(rawAtMs, receivedAtMs);
    if (atMs <= this.lastPublishedAtMs) {
      return this.invalidate(
        "The mapped source clock moved back. Rejoin Player 1.",
      );
    }
    this.lastSourceNs = timing.captured;
    this.lastProcessedNs = timing.processed;
    this.lastSequence = observation.sequence;
    this.lastReceivedMs = receivedAtMs;
    if (
      timing.processingAgeMs > GAME_INPUT_QUALITY.maximumAgeMs ||
      receivedAtMs - atMs > GAME_INPUT_QUALITY.maximumAgeMs
    ) {
      this.failure =
        "The source observation is stale. Waiting for fresh input.";
      return null;
    }
    this.anchorBrowserMs -= correctionMs;
    this.lastPublishedAtMs = atMs;
    this.failure = null;
    return {
      ...observationToGameFrame(observation, matching[0], atMs),
      spaceRevision: binding.spaceRevision,
    };
  }
}
