import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const isWindows = process.platform === "win32";
const python = resolve(
  root,
  ".venv",
  isWindows ? "Scripts/python.exe" : "bin/python",
);
const env = {
  ...process.env,
  UV_PYTHON_INSTALL_DIR: resolve(root, ".local/python"),
  UV_CACHE_DIR: resolve(root, ".local/uv-cache"),
  UV_PROJECT_ENVIRONMENT: resolve(root, ".venv"),
  // Run the vision service directly from the checkout alongside its schema and model manifest.
  PYTHONPATH: resolve(root, "services/vision"),
  OMP_NUM_THREADS: "2",
  OPENBLAS_NUM_THREADS: "2",
};
function run(command, args, extraEnv = env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: extraEnv,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
function bootstrapPython() {
  for (const candidate of isWindows
    ? [["py", "-3"], ["python"]]
    : [["python3"], ["python"]]) {
    const result = spawnSync(
      candidate[0],
      [...candidate.slice(1), "--version"],
      { stdio: "ignore" },
    );
    if (result.status === 0) return candidate;
  }
  throw new Error(
    "Install Python 3.9 or later to bootstrap the repository-local uv environment.",
  );
}
const command = process.argv[2];
if (command === "setup") {
  const bootstrap = bootstrapPython();
  const target = resolve(root, ".local/bootstrap");
  mkdirSync(target, { recursive: true });
  if (!existsSync(resolve(target, "uv")))
    run(bootstrap[0], [
      ...bootstrap.slice(1),
      "-m",
      "pip",
      "install",
      "--target",
      target,
      "uv==0.13.7",
    ]);
  const bootstrapEnv = { ...env, PYTHONPATH: target };
  run(
    bootstrap[0],
    [
      ...bootstrap.slice(1),
      "-m",
      "uv",
      "sync",
      "--frozen",
      "--python",
      "3.12.16",
    ],
    bootstrapEnv,
  );
  run(python, ["-m", "motion_vision.models"]);
} else if (command === "dev") {
  if (!existsSync(python))
    throw new Error("Run pnpm install and pnpm setup first.");
  const children = [
    spawn(python, ["-m", "motion_vision"], {
      cwd: root,
      env,
      stdio: "inherit",
    }),
    spawn(process.execPath, [resolve(root, "node_modules/vite/bin/vite.js")], {
      cwd: root,
      env,
      stdio: "inherit",
    }),
  ];
  let closing = false;
  function close(code = 0) {
    if (closing) return;
    closing = true;
    for (const child of children) child.kill("SIGTERM");
    process.exitCode = code;
  }
  for (const child of children) {
    child.on("error", (error) => {
      console.error(error.message);
      close(1);
    });
    child.on("exit", (code) => {
      if (!closing) close(code ?? 1);
    });
  }
  process.on("SIGINT", () => close());
  process.on("SIGTERM", () => close());
} else if (command === "python-check") {
  if (!existsSync(python))
    throw new Error("Python environment missing. Run uv sync --locked.");
  for (const args of [
    ["-m", "pyright"],
    ["-m", "ruff", "check", "services/vision"],
    ["-m", "pytest", "-q"],
    ["-m", "ruff", "format", "--check", "services/vision"],
    ["-m", "compileall", "-q", "services/vision/motion_vision"],
  ])
    run(python, args);
} else {
  const args = {
    models: ["-m", "motion_vision.models", ...process.argv.slice(3)],
    vision: ["-m", "motion_vision"],
    "python-test": ["-m", "pytest", "-q"],
    "python-lint": ["-m", "ruff", "check", "services/vision"],
    "python-format": ["-m", "ruff", "format", "services/vision"],
    "python-format-check": [
      "-m",
      "ruff",
      "format",
      "--check",
      "services/vision",
    ],
    "python-types": ["-m", "pyright"],
  }[command];
  if (!args) throw new Error(`Unknown task: ${command}`);
  if (!existsSync(python))
    throw new Error("Python environment missing. Run pnpm setup.");
  run(python, args);
}
