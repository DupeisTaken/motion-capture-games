# Contributing

## Start with the owning document

Use [the architecture](docs/architecture.md) for boundaries, [the roadmap](docs/roadmap.md) for milestone scope, and [the testing plan](docs/testing.md) for acceptance evidence. Make small, reviewable changes. A game feature should not quietly change camera ownership or observation semantics.

## Tooling direction

The provisional implementation stack is TypeScript for the mirror and games, and Python for vision. Use a pnpm workspace and uv-managed Python environment when implementation starts. Pin runtime and package-manager versions at that point after checking model/runtime compatibility; commit lockfiles.

Planned checks include strict TypeScript type checking, ESLint and Prettier, Python type checking and Ruff, Vitest for TypeScript behavior, and pytest for vision behavior. Browser integration tests accompany the first runnable interface. These tools are not installed or configured in this foundation.

Introduce one documented set of root commands for setup, development, formatting, linting, type checks, tests, and builds with the first runnable slice. Make the commands work on supported Windows and macOS environments; avoid requiring a POSIX shell on Windows. Use `.venv/` and repository-local dependencies. Docker is optional and must not become a prerequisite for USB camera access.

## Naming and boundaries

- Use descriptive kebab-case for workspace directories and documentation files, Python snake_case for Python modules, and the chosen language's ordinary identifier conventions.
- Prefer domain names such as `observation`, `player-slot`, and `calibration` over generic `utils`, `common`, or `helpers` packages.
- Export explicit public component interfaces; avoid cross-package imports into private source files.
- TypeScript games consume canonical motion inputs and session state. Python owns capture and inference. Shared wire semantics belong to [contracts](contracts/README.md).
- Validate configuration and cross-process input at boundaries. Treat configuration errors as actionable startup failures.
- Keep thresholds and tuning in versioned configuration, with units and rationale. Do not scatter unexplained values through code.

## Contracts and replay

Keep one canonical wire schema when the protocol is implemented. Generate or validate language bindings from it. CI should reject schema/client drift once generation exists. Document compatibility and migration effects when changing messages; do not hand-maintain parallel Python and TypeScript definitions.

Include meaningful examples and fixtures for missing joints, stale frames, identity uncertainty, and clock resets. Preserve replay compatibility or document the version boundary explicitly. See [coordinates and timing](docs/coordinates-and-timing.md).

## Git and review

- Use short-lived `codex/<topic>` branches for subsequent development unless the user specifies otherwise. An initial repository foundation may seed `main`.
- Use clear commits, for example `docs: establish motion platform foundation` or `feat(motion): add confidence-aware wrist segments`.
- Keep generated artifacts separate from their source where applicable. Do not commit installed dependencies, raw recordings, weights, credentials, or local device configuration.
- Reuse or create an issue for substantive work once a remote is configured. Use [the work template](.github/ISSUE_TEMPLATE/work.md) and [defect template](.github/ISSUE_TEMPLATE/defect.md).
- Describe the concrete problem and resulting behavior in the PR. Include actual validation, limitations, and issue links using [the PR template](.github/pull_request_template.md).
- A model, transport, or hardware-profile change needs its own measurements. Update or supersede the relevant decision record when evidence changes a decision.

## Definition of done

The change stays within its ownership boundary, updates the owning documentation, has meaningful verification for its behavior, and states any remaining limitations. UI changes include real-server screenshot evidence at relevant sizes and languages. Hardware claims identify the tested rig, configuration, workload, and measurement method.

Substantive changes include a standalone HTML report in `reports/`. Use synthetic examples and embed report media so the HTML remains usable offline. Put local recordings and unredacted measurement data under ignored local storage. A documentation-only change must not claim runtime or hardware tests passed.

## Foundation checks

No automated CI workflow or runtime test suite exists yet. For documentation changes, check Git whitespace, local links and anchors, and any machine-readable examples. For an HTML report, check document structure and external dependencies and visually inspect desktop/mobile rendering from a local HTTP server. Record the exact checks actually performed in that report.
