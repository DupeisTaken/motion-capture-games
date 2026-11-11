import {
  MoleGame,
  type GameOptions as MoleOptions,
} from "../../../games/mole-motion/src/index";
import {
  DodgeGame,
  type GameOptions as DodgeOptions,
} from "../../../games/dodgeball/src/index";
import {
  MultiplayerSession,
  type PlayerSlotId,
} from "../../../packages/session/src/multiplayer";
import {
  observationToDodgeFrame,
  type GameMotionFrame,
  type DodgeMotionFrame,
  type Observation,
} from "../../../packages/motion/src/index";

export type MultiplayerKind = "mole" | "dodgeball";
export interface SlotRuntime {
  slotId: PlayerSlotId;
  game: MoleGame | DodgeGame;
  frame: GameMotionFrame | DodgeMotionFrame | null;
  requested: boolean;
  manualPause: boolean;
}

/** Each outer slot has its own legacy player-1 engine; engines never share inputs. */
export class MultiplayerGame {
  readonly session = new MultiplayerSession(3);
  readonly runtimes = new Map<PlayerSlotId, SlotRuntime>();
  private observation: Observation | null = null;
  private receivedAtMs = -Infinity;
  constructor(
    readonly kind: MultiplayerKind,
    private readonly options: () =>
      Partial<MoleOptions> | Partial<DodgeOptions>,
    private readonly seed = 1,
  ) {}

  private createGame() {
    return this.kind === "mole"
      ? new MoleGame(this.options(), this.seed)
      : new DodgeGame(this.options() as Partial<DodgeOptions>, this.seed);
  }

  join(slotId: PlayerSlotId, trackId: string, now: number): boolean {
    if (
      !this.observation ||
      now < this.receivedAtMs ||
      now - this.receivedAtMs > 350
    )
      return false;
    const joined = this.session.join(
      slotId,
      this.observation,
      trackId,
      this.receivedAtMs,
    );
    if (!joined) return false;
    this.runtimes.set(slotId, {
      slotId,
      game: this.createGame(),
      frame: this.adapt(joined.frame, trackId),
      requested: false,
      manualPause: false,
    });
    return true;
  }

  private adapt(frame: GameMotionFrame | null, trackId: string) {
    return frame && this.kind === "dodgeball" && this.observation
      ? observationToDodgeFrame(this.observation, frame, trackId)
      : frame;
  }

  ingest(observation: Observation, receivedAtMs: number) {
    this.observation = observation;
    this.receivedAtMs = receivedAtMs;
    for (const result of this.session.ingest(observation, receivedAtMs)) {
      const runtime = this.runtimes.get(result.slotId);
      if (runtime)
        runtime.frame = this.adapt(result.frame, result.binding?.trackId ?? "");
    }
  }

  leave(slotId: PlayerSlotId) {
    this.session.leave(slotId);
    this.runtimes.delete(slotId);
  }

  start(slotId?: PlayerSlotId) {
    for (const runtime of this.runtimes.values()) {
      if (slotId && runtime.slotId !== slotId) continue;
      if (this.session.status(runtime.slotId).status === "rejoin-required")
        continue;
      if (
        runtime.game.state.phase === "ready" ||
        runtime.game.state.phase === "results"
      ) {
        runtime.game = this.createGame();
        runtime.requested = true;
        runtime.manualPause = false;
      }
    }
  }

  pause(slotId: PlayerSlotId) {
    const runtime = this.runtimes.get(slotId);
    if (!runtime) return;
    runtime.manualPause = true;
    runtime.game.pause("Paused by player. Choose Resume when ready.");
  }

  resume(slotId: PlayerSlotId) {
    const runtime = this.runtimes.get(slotId);
    if (runtime) runtime.manualPause = false;
  }

  interrupt(message: string, requireRejoin = false) {
    if (requireRejoin) this.session.invalidate(message);
    this.observation = null;
    this.receivedAtMs = -Infinity;
    for (const runtime of this.runtimes.values()) {
      runtime.frame = null;
      runtime.game.pause(message);
    }
  }

  tick(now: number, visible = true) {
    for (const runtime of this.runtimes.values()) {
      const { game } = runtime;
      if (!visible) {
        runtime.manualPause = true;
        game.pause("Game hidden. Choose Resume when ready.");
      }
      const state = this.session.status(runtime.slotId);
      const input = state.status === "ready" ? runtime.frame : null;
      if (game instanceof MoleGame) game.update(now, input);
      else game.step(now, input as DodgeMotionFrame | null);
      const ready =
        game instanceof MoleGame
          ? game.readiness(now, input).ready
          : game.readiness(now, input as DodgeMotionFrame | null).ready;
      if (visible && ready && !runtime.manualPause) {
        if (runtime.requested && game.state.phase === "ready") {
          runtime.requested = false;
          game.start(now);
        } else if (game.state.phase === "paused") game.resume(now);
      }
    }
  }
}
