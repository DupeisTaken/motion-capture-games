import {
  GAME_INPUT_QUALITY,
  observationSpaceRevision,
  type GameMotionFrame,
  type Observation,
  type Person,
} from "../../motion/src/index";
import { SinglePlayerSession } from "./index";

export const PLAYER_SLOT_IDS = ["player-1", "player-2", "player-3"] as const;
export type PlayerSlotId = (typeof PLAYER_SLOT_IDS)[number];
export type PlayerSlotStatus =
  "empty" | "ready" | "waiting" | "rejoin-required";

export interface MultiplayerBinding {
  slotId: PlayerSlotId;
  trackId: string;
  epoch: string;
  spaceRevision: string;
}

export interface PlayerSlotState {
  slotId: PlayerSlotId;
  binding: MultiplayerBinding | null;
  status: PlayerSlotStatus;
  reason: string | null;
}

/** Route this frame only to the game instance owned by the outer slotId. */
export interface SlotGameMotionFrame {
  slotId: PlayerSlotId;
  frame: GameMotionFrame;
}

export interface PlayerSlotResult extends PlayerSlotState {
  frame: GameMotionFrame | null;
  recovered: boolean;
}

interface SlotEntry extends PlayerSlotState {
  engine: SinglePlayerSession;
}

function sourceRevision(observation: Observation): string {
  return JSON.stringify([
    observation.source,
    observation.clock.domain,
    observation.clock.quality,
    observationSpaceRevision(observation),
  ]);
}

function packetKey(observation: Observation): string {
  return JSON.stringify([
    observation.epoch,
    sourceRevision(observation),
    observation.sequence,
    observation.capturedAtNs,
    observation.processedAtNs,
  ]);
}

/** Explicit anonymous membership; software capacity is not hardware certification. */
export class MultiplayerSession {
  readonly capacity: 1 | 2 | 3;
  private readonly entries: SlotEntry[];
  private readonly clockGuard = new SinglePlayerSession({
    recoveryWindowMs: 450,
  });
  private revision = "";
  private latestSequence = -1;
  private latestPacket = "";
  private latestReceivedAtMs = 0;
  private latestClockFrame: GameMotionFrame | null = null;

  constructor(capacity: 1 | 2 | 3 = 3) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 3) {
      throw new RangeError("Software player capacity must be 1, 2 or 3.");
    }
    this.capacity = capacity;
    this.entries = PLAYER_SLOT_IDS.map((slotId) => ({
      slotId,
      binding: null,
      status: "empty",
      reason: null,
      engine: new SinglePlayerSession({ recoveryWindowMs: 450 }),
    }));
  }

  get slots(): PlayerSlotState[] {
    return this.entries.map((entry) => this.status(entry.slotId));
  }

  binding(slotId: PlayerSlotId): MultiplayerBinding | null {
    const binding = this.entry(slotId).binding;
    return binding ? { ...binding } : null;
  }

  status(slotId: PlayerSlotId): PlayerSlotState {
    const entry = this.entry(slotId);
    return {
      slotId,
      binding: this.binding(slotId),
      status: entry.status,
      reason:
        entry.reason?.replaceAll(
          "Player 1",
          `Player ${PLAYER_SLOT_IDS.indexOf(slotId) + 1}`,
        ) ?? null,
    };
  }

  private entry(slotId: PlayerSlotId): SlotEntry {
    const entry = this.entries.find((candidate) => candidate.slotId === slotId);
    if (!entry) throw new RangeError("Unknown player slot.");
    return entry;
  }

  private results(
    frames: ReadonlyMap<PlayerSlotId, GameMotionFrame> = new Map(),
  ): PlayerSlotResult[] {
    return this.entries.map((entry) => ({
      ...this.status(entry.slotId),
      frame: frames.get(entry.slotId) ?? null,
      recovered: entry.engine.recovered || this.clockGuard.recovered,
    }));
  }

  // Reuse the single-player clock policy without coupling it to any person's
  // identity. This internal sentinel never becomes membership or game input.
  private clockObservation(observation: Observation): Observation {
    return {
      ...observation,
      people: [
        {
          trackId: "multiplayer-source-clock",
          identity: "confident",
          box: { x: 0, y: 0, width: 1, height: 1 },
          joints: {},
        },
      ],
    };
  }

  private freezeAll(reason: string): void {
    for (const entry of this.entries) {
      if (!entry.binding) continue;
      entry.engine.release();
      entry.status = "rejoin-required";
      entry.reason = reason;
    }
    this.clockGuard.release();
  }

  /** Explicit source teardown invalidates membership without deleting its score owner. */
  invalidate(reason: string): void {
    this.freezeAll(reason);
  }

  join(
    slotId: PlayerSlotId,
    observation: Observation,
    trackId: string,
    receivedAtMs: number,
  ): SlotGameMotionFrame | null {
    const entry = this.entry(slotId);
    if (entry.binding) return null;
    if (PLAYER_SLOT_IDS.indexOf(slotId) >= this.capacity) {
      entry.reason = "This slot exceeds the declared software player capacity.";
      return null;
    }
    if (
      this.entries.filter((candidate) => candidate.binding).length >=
      Math.min(this.capacity, observation.capacity)
    ) {
      entry.reason =
        "The current source and declared software capacity do not admit another player.";
      return null;
    }
    if (
      this.entries.some((candidate) => candidate.binding?.trackId === trackId)
    ) {
      entry.reason = "That track already belongs to another player slot.";
      return null;
    }

    // Admit additional participants from the current packet, or first advance
    // every incumbent on a newer packet. Joining cannot rewind the shared clock.
    if (this.clockGuard.binding) {
      if (
        observation.epoch !== this.clockGuard.binding.epoch ||
        sourceRevision(observation) !== this.revision ||
        observation.sequence < this.latestSequence ||
        (observation.sequence === this.latestSequence &&
          packetKey(observation) !== this.latestPacket)
      ) {
        entry.reason =
          "Join using a current observation from the active source.";
        return null;
      }
      if (observation.sequence > this.latestSequence) {
        this.ingest(observation, receivedAtMs);
        if (!this.clockGuard.binding) {
          entry.reason = "The source changed. Leave affected slots and rejoin.";
          return null;
        }
      }
      if (
        !this.latestClockFrame ||
        !Number.isFinite(receivedAtMs) ||
        receivedAtMs < this.latestReceivedAtMs ||
        receivedAtMs - this.latestClockFrame.atMs >
          GAME_INPUT_QUALITY.maximumAgeMs
      ) {
        entry.reason =
          "The current observation is stale or its receipt clock is invalid.";
        return null;
      }
    }

    const frame = entry.engine.join(
      observation,
      trackId,
      this.clockGuard.binding ? this.latestReceivedAtMs : receivedAtMs,
    );
    if (!frame) {
      entry.reason = entry.engine.reason;
      return null;
    }
    if (
      this.clockGuard.binding &&
      this.latestClockFrame &&
      frame.atMs - this.latestClockFrame.atMs >
        GAME_INPUT_QUALITY.maximumAnchorCorrectionMs
    ) {
      entry.engine.release();
      entry.reason =
        "Wait for current source evidence before enrolling a new player.";
      return null;
    }
    if (!this.clockGuard.binding) {
      const clockFrame = this.clockGuard.join(
        this.clockObservation(observation),
        "multiplayer-source-clock",
        receivedAtMs,
      );
      if (!clockFrame) {
        entry.engine.release();
        entry.reason = this.clockGuard.reason;
        return null;
      }
      this.revision = sourceRevision(observation);
      this.latestSequence = observation.sequence;
      this.latestPacket = packetKey(observation);
      this.latestReceivedAtMs = receivedAtMs;
      this.latestClockFrame = clockFrame;
    }
    const binding = entry.engine.binding!;
    entry.binding = { ...binding, slotId };
    entry.status = "ready";
    entry.reason = null;
    // All games use the established source mapping. A participant joining a
    // delayed packet must not make that packet younger through a fresh anchor.
    return { slotId, frame: { ...frame, atMs: this.latestClockFrame!.atMs } };
  }

  leave(slotId: PlayerSlotId): void {
    const entry = this.entry(slotId);
    entry.engine.release();
    entry.binding = null;
    entry.status = "empty";
    entry.reason = null;
    if (!this.entries.some((candidate) => candidate.binding)) {
      this.clockGuard.release();
      this.revision = "";
      this.latestSequence = -1;
      this.latestPacket = "";
      this.latestClockFrame = null;
    }
  }

  ingest(observation: Observation, receivedAtMs: number): PlayerSlotResult[] {
    if (!this.clockGuard.binding) return this.results();
    if (sourceRevision(observation) !== this.revision) {
      this.freezeAll(
        "The source, camera geometry or clock changed. Leave and rejoin.",
      );
      return this.results();
    }
    const clockFrame = this.clockGuard.ingest(
      this.clockObservation(observation),
      receivedAtMs,
    );
    if (!this.clockGuard.binding) {
      this.freezeAll(
        this.clockGuard.reason ?? "The source changed. Leave and rejoin.",
      );
      return this.results();
    }
    if (observation.sequence > this.latestSequence) {
      this.latestSequence = observation.sequence;
      this.latestPacket = packetKey(observation);
      this.latestReceivedAtMs = receivedAtMs;
      this.latestClockFrame = clockFrame;
    }
    const frames = new Map<PlayerSlotId, GameMotionFrame>();
    for (const entry of this.entries) {
      if (!entry.binding || entry.status === "rejoin-required") continue;
      const frame = entry.engine.ingest(observation, receivedAtMs);
      if (!entry.engine.binding) {
        // Preserve outer membership and the owning game's score. No returned
        // identity, even the same track ID, can silently unlock this slot.
        entry.status = "rejoin-required";
        entry.reason = entry.engine.reason;
      } else if (frame && clockFrame) {
        entry.status = "ready";
        entry.reason = null;
        frames.set(entry.slotId, { ...frame, atMs: clockFrame.atMs });
      } else {
        entry.status = "waiting";
        entry.reason = entry.engine.reason ?? this.clockGuard.reason;
      }
    }
    return this.results(frames);
  }

  /** Expiry is checked even if no further camera packet arrives. */
  expire(nowMs: number): void {
    if (this.clockGuard.expire(nowMs)) {
      this.freezeAll("Source recovery expired. Leave and rejoin.");
      return;
    }
    for (const entry of this.entries) {
      if (entry.binding && entry.engine.expire(nowMs)) {
        entry.status = "rejoin-required";
        entry.reason = entry.engine.reason;
      }
    }
  }

  spectators(observation: Observation): Person[] {
    const occupiedTracks = new Set(
      this.entries.flatMap((entry) =>
        entry.binding?.epoch === observation.epoch
          ? [entry.binding.trackId]
          : [],
      ),
    );
    return observation.people.filter(
      (person) =>
        person.trackId === null || !occupiedTracks.has(person.trackId),
    );
  }
}
