import { writeFile } from "node:fs/promises";
import { createServer } from "vite";

// Source-only modules are loaded through their existing Vite consumer, with no
// generated package or alternative runtime. All participants here are synthetic.
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { RunnerGame, TUNING } = await server.ssrLoadModule(
    "/../../games/motion-runner/src/index.ts",
  );
  const cases = [];
  for (const variant of ["rail", "gold"]) {
    for (const fastStart of [false, true]) {
      for (const seed of [1, 7, 42, 1234]) {
        for (const hz of [30, 60, 120]) {
          const game = new RunnerGame({ variant, fastStart }, seed);
          let sequence = 0;
          let lane = 0;
          let time = 0;
          const input = () => ({
            atMs: time,
            sequence: ++sequence,
            epoch: "synthetic-benchmark-v1",
            spaceRevision: "anonymous-player-1",
            identity: "confident",
            participantCount: 1,
            lane,
            jump: false,
            duck: false,
            standing: true,
            valid: true,
          });
          game.start(0, input());
          const total = 60_000 + TUNING.startCountdownMs;
          let maximumObstacles = 0;
          for (
            let frame = 1;
            frame <= Math.round((total * hz) / 1000);
            frame++
          ) {
            time = (frame * 1000) / hz;
            const state = game.state;
            const hazards = state.obstacles.filter(
              (o) => o.kind !== "coin" && o.z > -5,
            );
            const nearest = Math.min(...hazards.map((o) => o.z));
            const occupied = new Set(
              hazards
                .filter((o) => Math.abs(o.z - nearest) < 1)
                .map((o) => o.lane),
            );
            // A declared oracle follows the visibly open lane. This tests authored
            // pattern solvability; it is not a human skill or recognition measure.
            if (occupied.has(lane))
              lane = [-1, 0, 1].find((value) => !occupied.has(value));
            if (lane === undefined) throw new Error("Unsolvable runner row.");
            game.step(time, input());
            maximumObstacles = Math.max(
              maximumObstacles,
              state.obstacles.length,
            );
          }
          const state = game.state;
          if (state.phase !== "playing" || state.hits !== 0)
            throw new Error(
              `Safe-lane oracle failed: ${variant}/${fastStart}/${seed}/${hz} (${state.hits} hits).`,
            );
          const beforePause = {
            distance: state.distance,
            score: state.score,
            elapsedMs: state.elapsedMs,
          };
          time += 1000 / hz;
          game.step(time, { ...input(), participantCount: 2 });
          for (let frame = 0; frame < hz * 2; frame++) {
            time += 1000 / hz;
            game.step(time, { ...input(), participantCount: 2 });
          }
          const paused = game.state;
          if (
            paused.distance !== beforePause.distance ||
            paused.score !== beforePause.score ||
            paused.elapsedMs !== beforePause.elapsedMs
          )
            throw new Error("Alternate-player pause advanced outcomes.");
          cases.push({
            variant,
            fastStart,
            seed,
            inputHz: hz,
            activeSeconds: state.elapsedMs / 1000,
            distanceM: state.distance,
            score: state.score,
            coins: state.coins,
            hits: state.hits,
            maximumObstacles,
            alternatePlayerFreeze: true,
          });
        }
      }
    }
  }
  const evidence = {
    version: 2,
    date: "2026-11-11",
    method: "Vite source-module runner simulation, synthetic semantic controls",
    workload:
      "48 cases: 2 worlds × Standard/Fast start × 4 seeds × 30/60/120 Hz; approximately 60 active seconds each, followed by 2 seconds with another player",
    result:
      "All declared safe-lane oracle cases completed with zero hits; alternate-player freeze preserved distance, score and game time exactly.",
    limits:
      "No physical cameras, reference-game timing, browser frame rate, motion accuracy or end-to-end latency measured. Oracle solvability is not participant difficulty testing.",
    cases,
  };
  await writeFile(
    "reports/runner-motion-pace-results.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(
    `${cases.length} runner simulation cases passed; results in reports/runner-motion-pace-results.json`,
  );
} finally {
  await server.close();
}
