export type MazeDifficulty = "easy" | "medium" | "hard";
export interface MazeConfig {
  widthM: number;
  depthM: number;
  difficulty: MazeDifficulty;
  seed: string;
  loops: boolean;
}
export interface MazePoint {
  x: number;
  z: number;
}
export interface MazeWall {
  a: MazePoint;
  b: MazePoint;
}
export interface Maze {
  config: MazeConfig;
  columns: number;
  rows: number;
  cellWidthM: number;
  cellDepthM: number;
  walls: MazeWall[];
  passages: Array<{ a: number; b: number }>;
  startCell: number;
  goalCell: number;
  start: MazePoint;
  goal: MazePoint;
  cycleCount: number;
  solution: MazePoint[];
  handRule: {
    initialHeadingRadians: number;
    leftReachesGoal: boolean;
    rightReachesGoal: boolean;
    leftSteps: number;
    rightSteps: number;
  };
}
/** Rehearsal tuning only: no claim of certified physical body clearance or dB. */
export const MAZE_TUNING = Object.freeze({
  clearanceM: 0.2,
  cueRangeM: 2.4,
  goalRadiusM: 0.28,
  cueFanRadians: Math.PI / 12,
});
export interface MazeSample {
  distanceM: number | null;
  nearestWallM: number;
  intensity: number;
  inside: boolean;
  atGoal: boolean;
  touchingWall: boolean;
}

// Directions follow heading 0 = +z, pi/2 = +x. Anatomy/mirroring belongs upstream.
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;
type Graph = Array<Set<number>>;

function validateConfig(config: MazeConfig): void {
  if (!config || typeof config !== "object")
    throw new TypeError("Maze configuration is required.");
  for (const dimension of ["widthM", "depthM"] as const) {
    if (
      !Number.isFinite(config[dimension]) ||
      config[dimension] < 5 ||
      config[dimension] > 10
    )
      throw new RangeError(
        `${dimension} must be finite and between 5 and 10 m.`,
      );
  }
  if (!["easy", "medium", "hard"].includes(config.difficulty))
    throw new RangeError("Maze difficulty must be easy, medium or hard.");
  if (
    typeof config.seed !== "string" ||
    config.seed.length < 1 ||
    config.seed.length > 128 ||
    Array.from(config.seed).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159);
    })
  )
    throw new RangeError("Maze seed must contain 1–128 printable characters.");
  if (typeof config.loops !== "boolean")
    throw new TypeError("Maze loops must be a boolean.");
}

function randomSource(seed: string): () => number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index++)
    value = Math.imul(value ^ seed.charCodeAt(index), 16777619);
  return () => {
    value += 0x6d2b79f5;
    let bits = Math.imul(value ^ (value >>> 15), value | 1);
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
    return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
  };
}

function neighbors(cell: number, columns: number, rows: number): number[] {
  const x = cell % columns;
  const z = Math.floor(cell / columns);
  return DIRECTIONS.flatMap(([dx, dz]) => {
    const nx = x + dx;
    const nz = z + dz;
    return nx >= 0 && nx < columns && nz >= 0 && nz < rows
      ? [nz * columns + nx]
      : [];
  });
}
function connect(graph: Graph, a: number, b: number): void {
  graph[a].add(b);
  graph[b].add(a);
}

/** Attach each new cell once, preserving the existing topology among roots. */
function growBranches(
  graph: Graph,
  roots: number[],
  columns: number,
  rows: number,
  random: () => number,
): void {
  const visited = new Set(roots);
  for (const root of roots) {
    const stack = [root];
    while (stack.length) {
      const current = stack[stack.length - 1];
      // Keep the starting cell a genuine one-exit corridor for both hand rules.
      const options = neighbors(current, columns, rows).filter(
        (next) =>
          !visited.has(next) &&
          !(current === 0 && next === 1) &&
          !(current === 1 && next === 0),
      );
      if (!options.length) {
        stack.pop();
        continue;
      }
      const next = options[Math.floor(random() * options.length)];
      connect(graph, current, next);
      visited.add(next);
      stack.push(next);
    }
  }
}

function tree(columns: number, rows: number, random: () => number): Graph {
  const graph: Graph = Array.from({ length: columns * rows }, () => new Set());
  growBranches(graph, [0], columns, rows, random);
  return graph;
}

function handWalk(
  graph: Graph,
  columns: number,
  hand: "left" | "right",
): { cells: Set<number>; steps: number } {
  let cell = 0;
  let heading = 0;
  const states = new Set<number>();
  const cells = new Set<number>();
  while (!states.has(cell * 4 + heading)) {
    states.add(cell * 4 + heading);
    cells.add(cell);
    const turns = hand === "left" ? [3, 0, 1, 2] : [1, 0, 3, 2];
    const direction = turns
      .map((turn) => (heading + turn) % 4)
      .find((candidate) => {
        const [dx, dz] = DIRECTIONS[candidate];
        return graph[cell].has(cell + dx + dz * columns);
      });
    if (direction === undefined) break;
    const [dx, dz] = DIRECTIONS[direction];
    cell += dx + dz * columns;
    heading = direction;
  }
  return { cells, steps: states.size };
}

function paths(graph: Graph): number[] {
  const parents = Array<number>(graph.length).fill(-1);
  parents[0] = 0;
  const queue = [0];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const next of graph[queue[cursor]]) {
      if (parents[next] !== -1) continue;
      parents[next] = queue[cursor];
      queue.push(next);
    }
  }
  return parents;
}

function interiorGoal(
  graph: Graph,
  columns: number,
  rows: number,
  requireFailure: boolean,
): number | undefined {
  const left = handWalk(graph, columns, "left");
  const right = handWalk(graph, columns, "right");
  const parent = paths(graph);
  let goal: number | undefined;
  let longest = -1;
  for (let z = 1; z < rows - 1; z++) {
    for (let x = 1; x < columns - 1; x++) {
      const cell = z * columns + x;
      if (
        parent[cell] === -1 ||
        (requireFailure && (left.cells.has(cell) || right.cells.has(cell)))
      )
        continue;
      let length = 0;
      for (let cursor = cell; cursor !== 0; cursor = parent[cursor]) length++;
      if (length > longest) {
        goal = cell;
        longest = length;
      }
    }
  }
  return goal;
}

/**
 * A connected 3x3 chamber has an interior cell off both boundary walks. Growing
 * trees outward from its boundary preserves this property and gives a bounded
 * fallback; arbitrary extra passages alone never establish hand-rule failure.
 */
function chamberFallback(
  columns: number,
  rows: number,
  random: () => number,
): Graph {
  const graph: Graph = Array.from({ length: columns * rows }, () => new Set());
  const x0 = Math.floor((columns - 3) / 2);
  const z0 = Math.floor((rows - 3) / 2);
  const roots: number[] = [];
  for (let z = z0; z < z0 + 3; z++) {
    for (let x = x0; x < x0 + 3; x++) {
      const cell = z * columns + x;
      roots.push(cell);
      if (x > x0) connect(graph, cell, cell - 1);
      if (z > z0) connect(graph, cell, cell - columns);
    }
  }
  growBranches(graph, roots, columns, rows, random);
  return graph;
}

export function generateMaze(config: MazeConfig): Maze {
  validateConfig(config);
  const random = randomSource(config.seed);
  const tuning = {
    easy: { spacing: 1.5, minimum: 5, extra: 0.12 },
    medium: { spacing: 1.1, minimum: 6, extra: 0.18 },
    hard: { spacing: 0.85, minimum: 7, extra: 0.24 },
  }[config.difficulty];
  const columns = Math.max(
    tuning.minimum,
    Math.ceil(config.widthM / tuning.spacing),
  );
  const rows = Math.max(
    tuning.minimum,
    Math.ceil(config.depthM / tuning.spacing),
  );
  let graph: Graph = [];
  let goalCell: number | undefined;
  // Candidate work is bounded, even for adversarial seeds/configuration.
  for (let attempt = 0; attempt < (config.loops ? 64 : 1); attempt++) {
    graph = tree(columns, rows, random);
    if (config.loops) {
      for (let cell = 1; cell < graph.length; cell++) {
        for (const next of neighbors(cell, columns, rows)) {
          if (next > cell && random() < tuning.extra)
            connect(graph, cell, next);
        }
      }
    }
    goalCell = interiorGoal(graph, columns, rows, config.loops);
    if (goalCell !== undefined) break;
  }
  if (goalCell === undefined) {
    graph = chamberFallback(columns, rows, random);
    goalCell = interiorGoal(graph, columns, rows, true);
  }
  if (goalCell === undefined || paths(graph).some((parent) => parent === -1))
    throw new Error("Unable to generate a connected maze with verified goals.");
  const cellWidthM = config.widthM / columns;
  const cellDepthM = config.depthM / rows;
  const center = (cell: number): MazePoint => ({
    x: ((cell % columns) + 0.5) * cellWidthM,
    z: (Math.floor(cell / columns) + 0.5) * cellDepthM,
  });
  const walls: MazeWall[] = [
    { a: { x: 0, z: 0 }, b: { x: config.widthM, z: 0 } },
    {
      a: { x: config.widthM, z: 0 },
      b: { x: config.widthM, z: config.depthM },
    },
    {
      a: { x: config.widthM, z: config.depthM },
      b: { x: 0, z: config.depthM },
    },
    { a: { x: 0, z: config.depthM }, b: { x: 0, z: 0 } },
  ];
  const passages: Maze["passages"] = [];
  for (let z = 0; z < rows; z++) {
    for (let x = 0; x < columns; x++) {
      const cell = z * columns + x;
      for (const next of graph[cell])
        if (next > cell) passages.push({ a: cell, b: next });
      if (x < columns - 1 && !graph[cell].has(cell + 1))
        walls.push({
          a: { x: (x + 1) * cellWidthM, z: z * cellDepthM },
          b: { x: (x + 1) * cellWidthM, z: (z + 1) * cellDepthM },
        });
      if (z < rows - 1 && !graph[cell].has(cell + columns))
        walls.push({
          a: { x: x * cellWidthM, z: (z + 1) * cellDepthM },
          b: { x: (x + 1) * cellWidthM, z: (z + 1) * cellDepthM },
        });
    }
  }
  const parent = paths(graph);
  const solution = [goalCell];
  while (solution[solution.length - 1] !== 0)
    solution.push(parent[solution[solution.length - 1]]);
  const left = handWalk(graph, columns, "left");
  const right = handWalk(graph, columns, "right");
  return {
    config: { ...config },
    columns,
    rows,
    cellWidthM,
    cellDepthM,
    walls,
    passages,
    startCell: 0,
    goalCell,
    start: center(0),
    goal: center(goalCell),
    cycleCount: passages.length - graph.length + 1,
    solution: solution.reverse().map(center),
    handRule: {
      initialHeadingRadians: 0,
      leftReachesGoal: left.cells.has(goalCell),
      rightReachesGoal: right.cells.has(goalCell),
      leftSteps: left.steps,
      rightSteps: right.steps,
    },
  };
}

function segmentDistance(point: MazePoint, wall: MazeWall): number {
  const dx = wall.b.x - wall.a.x;
  const dz = wall.b.z - wall.a.z;
  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((point.x - wall.a.x) * dx + (point.z - wall.a.z) * dz) /
        (dx * dx + dz * dz),
    ),
  );
  return Math.hypot(
    point.x - wall.a.x - ratio * dx,
    point.z - wall.a.z - ratio * dz,
  );
}

function rayDistance(
  position: MazePoint,
  heading: number,
  wall: MazeWall,
): number | null {
  const dx = Math.sin(heading);
  const dz = Math.cos(heading);
  const wx = wall.b.x - wall.a.x;
  const wz = wall.b.z - wall.a.z;
  const determinant = dx * wz - dz * wx;
  if (Math.abs(determinant) < 1e-10) return null;
  const px = wall.a.x - position.x;
  const pz = wall.a.z - position.z;
  const distance = (px * wz - pz * wx) / determinant;
  const fraction = (px * dz - pz * dx) / determinant;
  return distance >= -1e-10 && fraction >= 0 && fraction <= 1
    ? Math.max(0, distance)
    : null;
}

/** Directional sound cue and independent all-around body/bounds warning. */
export function sampleMaze(
  maze: Maze,
  position: MazePoint,
  headingRadians: number,
): MazeSample {
  if (
    !position ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.z) ||
    !Number.isFinite(headingRadians)
  )
    throw new RangeError("Maze position and heading must be finite numbers.");
  const inside =
    position.x >= 0 &&
    position.x <= maze.config.widthM &&
    position.z >= 0 &&
    position.z <= maze.config.depthM;
  let nearestWallM = Infinity;
  let distanceM: number | null = null;
  for (const wall of maze.walls) {
    nearestWallM = Math.min(nearestWallM, segmentDistance(position, wall));
    for (const offset of [
      -MAZE_TUNING.cueFanRadians,
      0,
      MAZE_TUNING.cueFanRadians,
    ]) {
      const distance = rayDistance(position, headingRadians + offset, wall);
      if (distance !== null && (distanceM === null || distance < distanceM))
        distanceM = distance;
    }
  }
  const touchingWall = !inside || nearestWallM <= MAZE_TUNING.clearanceM;
  return {
    distanceM,
    nearestWallM,
    intensity: !inside
      ? 1
      : distanceM === null
        ? 0
        : Math.max(0, 1 - distanceM / MAZE_TUNING.cueRangeM),
    inside,
    touchingWall,
    atGoal:
      inside &&
      !touchingWall &&
      Math.hypot(position.x - maze.goal.x, position.z - maze.goal.z) <=
        MAZE_TUNING.goalRadiusM,
  };
}
