import { describe, expect, it, vi } from "vitest";
import {
  generateMaze,
  sampleMaze,
  MAZE_TUNING,
  type Maze,
  type MazeConfig,
  type MazeDifficulty,
} from "../../games/virtual-maze/src/index";

const BASE: MazeConfig = {
  widthM: 8,
  depthM: 8,
  difficulty: "medium",
  seed: "synthetic-maze",
  loops: true,
};

function graphFor(maze: Maze): number[][] {
  const graph: number[][] = Array.from(
    { length: maze.columns * maze.rows },
    () => [],
  );
  for (const { a, b } of maze.passages) {
    graph[a].push(b);
    graph[b].push(a);
  }
  return graph;
}

// Independent follower checks the public passages, rather than trusting evidence.
function followerReaches(maze: Maze, hand: "left" | "right"): boolean {
  const graph = graphFor(maze);
  let cell = maze.startCell;
  let heading = 0;
  const seen = new Set<string>();
  while (!seen.has(`${cell}/${heading}`)) {
    if (cell === maze.goalCell) return true;
    seen.add(`${cell}/${heading}`);
    const order = hand === "left" ? [-1, 0, 1, 2] : [1, 0, -1, 2];
    for (const turn of order) {
      const direction = (heading + turn + 4) % 4;
      const next = cell + [maze.columns, 1, -maze.columns, -1][direction];
      if (graph[cell].includes(next)) {
        cell = next;
        heading = direction;
        break;
      }
    }
  }
  return false;
}

function assertConnected(maze: Maze): void {
  const graph = graphFor(maze);
  const reached = new Set([maze.startCell]);
  const queue = [maze.startCell];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const next of graph[queue[cursor]]) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  expect(reached.size).toBe(maze.columns * maze.rows);
  expect(maze.solution[0]).toEqual(maze.start);
  expect(maze.solution.at(-1)).toEqual(maze.goal);
  for (let index = 1; index < maze.solution.length; index++) {
    const previous = maze.solution[index - 1];
    const next = maze.solution[index];
    const previousCell =
      Math.floor(previous.z / maze.cellDepthM) * maze.columns +
      Math.floor(previous.x / maze.cellWidthM);
    const nextCell =
      Math.floor(next.z / maze.cellDepthM) * maze.columns +
      Math.floor(next.x / maze.cellWidthM);
    expect(graph[previousCell]).toContain(nextCell);
  }
}

describe("virtual maze generation", () => {
  it("is deterministic, seeded and keeps returned configuration independent", () => {
    const config = { ...BASE };
    const first = generateMaze(config);
    expect(generateMaze(config)).toEqual(first);
    expect(generateMaze({ ...config, seed: "another" }).passages).not.toEqual(
      first.passages,
    );
    config.widthM = 6;
    expect(first.config.widthM).toBe(8);
  });

  it("falls back to a connected chamber after the bounded loop candidates fail", () => {
    // This fixed mix produces RNG ~0.75: every optional-edge draw fails, so all
    // 64 candidates are trees. Exercise the real fallback without a runtime hook.
    const mix = vi.spyOn(Math, "imul").mockReturnValue(0x40000000);
    let maze: Maze;
    let mixCalls: number;
    try {
      maze = generateMaze({
        ...BASE,
        widthM: 5,
        depthM: 5,
        difficulty: "easy",
      });
      mixCalls = mix.mock.calls.length;
    } finally {
      // Restore before Vitest assertions or any other code can use Math.imul.
      mix.mockRestore();
    }
    expect(mixCalls).toBeGreaterThan(64 * maze.columns * maze.rows);
    expect(maze.cycleCount).toBe(4);
    const graph = graphFor(maze);
    const x0 = Math.floor((maze.columns - 3) / 2);
    const z0 = Math.floor((maze.rows - 3) / 2);
    for (let z = z0; z < z0 + 3; z++) {
      for (let x = x0; x < x0 + 3; x++) {
        const cell = z * maze.columns + x;
        if (x < x0 + 2) expect(graph[cell]).toContain(cell + 1);
        if (z < z0 + 2) expect(graph[cell]).toContain(cell + maze.columns);
      }
    }
    expect(maze.goalCell).toBe((z0 + 1) * maze.columns + x0 + 1);
    expect(maze.handRule).toMatchObject({
      leftReachesGoal: false,
      rightReachesGoal: false,
    });
    expect(followerReaches(maze, "left")).toBe(false);
    expect(followerReaches(maze, "right")).toBe(false);
    assertConnected(maze);
  });

  it("fits independent dimensions and increases complexity with difficulty", () => {
    const difficulties: MazeDifficulty[] = ["easy", "medium", "hard"];
    const mazes = difficulties.map((difficulty) =>
      generateMaze({ ...BASE, widthM: 5, depthM: 10, difficulty }),
    );
    expect(mazes.map((maze) => maze.columns)).toEqual([5, 6, 7]);
    expect(mazes.map((maze) => maze.rows)).toEqual([7, 10, 12]);
    for (const maze of mazes) {
      expect(maze.cellWidthM * maze.columns).toBeCloseTo(5);
      expect(maze.cellDepthM * maze.rows).toBeCloseTo(10);
      for (const wall of maze.walls) {
        for (const point of [wall.a, wall.b]) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(5 + 1e-10);
          expect(point.z).toBeGreaterThanOrEqual(0);
          expect(point.z).toBeLessThanOrEqual(10 + 1e-10);
        }
      }
    }
  });

  it("renders open passages and closed graph edges as consistent wall geometry", () => {
    const maze = generateMaze(BASE);
    const graph = graphFor(maze);
    for (let z = 0; z < maze.rows; z++) {
      for (let x = 0; x < maze.columns; x++) {
        const cell = z * maze.columns + x;
        if (x < maze.columns - 1) {
          const sample = sampleMaze(
            maze,
            {
              x: (x + 1) * maze.cellWidthM,
              z: (z + 0.5) * maze.cellDepthM,
            },
            0,
          );
          expect(sample.touchingWall).toBe(!graph[cell].includes(cell + 1));
        }
        if (z < maze.rows - 1) {
          const sample = sampleMaze(
            maze,
            {
              x: (x + 0.5) * maze.cellWidthM,
              z: (z + 1) * maze.cellDepthM,
            },
            0,
          );
          expect(sample.touchingWall).toBe(
            !graph[cell].includes(cell + maze.columns),
          );
        }
      }
    }
  });

  for (const difficulty of ["easy", "medium", "hard"] as const) {
    for (const loops of [false, true]) {
      it(`${difficulty}, loops ${loops}: connected and verified over 25 rectangular seeded cases`, () => {
        for (let seed = 0; seed < 25; seed++) {
          const maze = generateMaze({
            ...BASE,
            widthM: 5 + (seed / 24) * 5,
            depthM: 5 + (((seed * 7 + 3) % 25) / 24) * 5,
            difficulty,
            loops,
            seed: `fixture-${seed}`,
          });
          assertConnected(maze);
          expect(maze.startCell).toBe(0);
          expect(graphFor(maze)[0]).toEqual([maze.columns]);
          expect(maze.goalCell % maze.columns).toBeGreaterThan(0);
          expect(maze.goalCell % maze.columns).toBeLessThan(maze.columns - 1);
          expect(Math.floor(maze.goalCell / maze.columns)).toBeGreaterThan(0);
          expect(Math.floor(maze.goalCell / maze.columns)).toBeLessThan(
            maze.rows - 1,
          );
          expect(maze.handRule.initialHeadingRadians).toBe(0);
          expect(maze.handRule.leftReachesGoal).toBe(!loops);
          expect(maze.handRule.rightReachesGoal).toBe(!loops);
          expect(followerReaches(maze, "left")).toBe(!loops);
          expect(followerReaches(maze, "right")).toBe(!loops);
          expect(maze.cycleCount).toBe(
            maze.passages.length - maze.columns * maze.rows + 1,
          );
          if (loops) expect(maze.cycleCount).toBeGreaterThan(0);
          else expect(maze.cycleCount).toBe(0);
          expect(maze.handRule.leftSteps).toBeLessThanOrEqual(
            maze.columns * maze.rows * 4,
          );
          expect(maze.handRule.rightSteps).toBeLessThanOrEqual(
            maze.columns * maze.rows * 4,
          );
        }
      });
    }
  }

  it.each([
    { widthM: 4.99 },
    { widthM: 10.01 },
    { depthM: Number.NaN },
    { depthM: Infinity },
    { difficulty: "impossible" },
    { loops: "yes" },
    { seed: "" },
    { seed: "x".repeat(129) },
    { seed: "bad\nseed" },
    { seed: "bad\u0085seed" },
    { seed: 42 },
  ])("rejects malformed or out-of-range configuration %j", (change) => {
    expect(() => generateMaze({ ...BASE, ...change } as MazeConfig)).toThrow();
  });

  it("accepts the maximum seed length and rejects absent configuration", () => {
    expect(
      generateMaze({ ...BASE, seed: "x".repeat(128) }).config.seed,
    ).toHaveLength(128);
    for (const config of [null, undefined])
      expect(() => generateMaze(config as unknown as MazeConfig)).toThrow(
        /configuration is required/,
      );
  });
});

describe("virtual maze directional cues and contact rules", () => {
  it("detects a wall in the forward fan when the center ray misses it", () => {
    const maze = generateMaze(BASE);
    const narrowWall = {
      a: { x: 1.25, z: 2 },
      b: { x: 1.4, z: 2 },
    };
    const sample = sampleMaze(
      { ...maze, walls: [narrowWall] },
      { x: 1, z: 1 },
      0,
    );
    const expectedDistance = 1 / Math.cos(MAZE_TUNING.cueFanRadians);
    expect(sample.distanceM).toBeCloseTo(expectedDistance);
    expect(sample.intensity).toBeCloseTo(
      1 - expectedDistance / MAZE_TUNING.cueRangeM,
    );
    expect(sample.touchingWall).toBe(false);
  });

  it("is louder toward a nearby wall and quiet when facing a free corridor", () => {
    const maze = generateMaze({ ...BASE, loops: false });
    const position = { x: 0.1, z: maze.start.z };
    const towardWall = sampleMaze(maze, position, -Math.PI / 2);
    const alongCorridor = sampleMaze(maze, position, 0);
    expect(towardWall.distanceM).toBeCloseTo(0.1);
    expect(towardWall.intensity).toBeGreaterThan(alongCorridor.intensity);
    expect(towardWall.touchingWall).toBe(true);
    expect(alongCorridor.touchingWall).toBe(true);
    expect(alongCorridor.nearestWallM).toBeCloseTo(0.1);
    expect(sampleMaze(maze, position, 2 * Math.PI).distanceM).toBeCloseTo(
      alongCorridor.distanceM!,
    );
  });

  it("rejects leaving any outer edge independently of viewing direction", () => {
    const maze = generateMaze(BASE);
    for (const position of [
      { x: -0.01, z: 4 },
      { x: 8.01, z: 4 },
      { x: 4, z: -0.01 },
      { x: 4, z: 8.01 },
    ]) {
      for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        expect(sampleMaze(maze, position, heading)).toMatchObject({
          inside: false,
          touchingWall: true,
          atGoal: false,
          intensity: 1,
        });
      }
    }
    expect(sampleMaze(maze, { x: 0, z: 4 }, 0)).toMatchObject({
      inside: true,
      touchingWall: true,
    });
  });

  it("detects internal wall contact from either side without rotation escape", () => {
    const maze = generateMaze(BASE);
    const wall = maze.walls[4];
    const midpoint = {
      x: (wall.a.x + wall.b.x) / 2,
      z: (wall.a.z + wall.b.z) / 2,
    };
    for (const sign of [-1, 1]) {
      const position = {
        x: midpoint.x + (wall.a.x === wall.b.x ? 0.1 * sign : 0),
        z: midpoint.z + (wall.a.z === wall.b.z ? 0.1 * sign : 0),
      };
      for (const heading of [0, Math.PI / 2, Math.PI])
        expect(sampleMaze(maze, position, heading).touchingWall).toBe(true);
    }
  });

  it("recognizes the goal only within its radius and clear of walls", () => {
    const maze = generateMaze(BASE);
    expect(sampleMaze(maze, maze.start, 0).atGoal).toBe(false);
    expect(sampleMaze(maze, maze.goal, 0)).toMatchObject({
      inside: true,
      touchingWall: false,
      atGoal: true,
    });
    expect(
      sampleMaze(
        maze,
        { x: maze.goal.x + MAZE_TUNING.goalRadiusM + 0.01, z: maze.goal.z },
        0,
      ).atGoal,
    ).toBe(false);
    for (const point of maze.solution) {
      const sample = sampleMaze(maze, point, 0);
      expect(sample.inside).toBe(true);
      expect(sample.touchingWall).toBe(false);
      expect(sample.intensity).toBeGreaterThanOrEqual(0);
      expect(sample.intensity).toBeLessThanOrEqual(1);
    }
  });

  it("handles an unobstructed forward ray and rejects nonfinite input", () => {
    const maze = generateMaze(BASE);
    expect(sampleMaze({ ...maze, walls: [] }, maze.start, 0)).toMatchObject({
      distanceM: null,
      intensity: 0,
      touchingWall: false,
    });
    expect(() => sampleMaze(maze, { x: NaN, z: 1 }, 0)).toThrow(/finite/);
    expect(() => sampleMaze(maze, { x: 1, z: Infinity }, 0)).toThrow(/finite/);
    expect(() => sampleMaze(maze, maze.start, NaN)).toThrow(/finite/);
    expect(() => sampleMaze(maze, null as unknown as Maze["start"], 0)).toThrow(
      /finite/,
    );
  });
});
