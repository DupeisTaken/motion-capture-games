# Continuous integration conventions

CI is part of the repository's definition of done. [The workflow](../.github/workflows/checks.yml) runs on every pull request, pushes to `main`, merge-group checks and manual dispatch. All changes, including documentation-only changes, run the full gate while the repository is small. No path filter may leave the required check pending or skip a shared-contract consumer.

## Required checks

| Lane | What it checks | Local equivalent |
| --- | --- | --- |
| Repository conventions | Whitespace across the full PR/push diff; tracked Markdown local inline/reference link targets and heading anchors; static HTML report metadata and embedded rendering assets | `pnpm check:repo` |
| TypeScript, on Ubuntu/Windows/macOS | Canonical schema/generated binding drift, strict types, ESLint, Vitest contracts/motion/session/game replay/viewer/tooling tests, Prettier | `pnpm check:typescript` |
| Build, in each TypeScript job | Independent workspace build scripts in dependency order, then all configured Vite entries; emitted HTML must reference existing local JS/CSS assets | `pnpm build` |
| Python vision, on Ubuntu/Windows/macOS | Locked environment install, Pyright, Ruff lint/format, pytest synthetic vision/API/tracking tests and rig rehearsal data drift, Python byte compilation | `uv sync --locked`, then `pnpm check:python` |
| `software-checks` | Every repository, TypeScript and Python job must succeed; failure, cancellation or skipping fails the gate | `pnpm check` and `pnpm build` cover its local checks |

The Python jobs call `node scripts/tasks.mjs python-check`, the same implementation as `pnpm check:python`, without installing frontend dependencies. Tests use synthetic input and mocked camera/model failures. Hosted OS results verify software compatibility on those runner images; they do not certify USB cameras, GPU providers, model accuracy, physical latency or the installation's player capacity. Browser DOM tests do not replace the real-server screenshots required for UI changes.

`software-checks` retains the old job name for compatibility. Maintainers should require that check in the `main` branch rules. Workflow configuration alone does not enable branch protection; its actual state is recorded in the delivery report. The merge-group trigger supports a future merge queue without asserting one is enabled.

## Component and package builds

The root manifest currently owns dependencies. Directory boundaries are not independently installable packages by themselves.

| Component | Current form | Required validation/build |
| --- | --- | --- |
| `apps/mirror` | One Vite application with diagnostic, two-camera operator workspace and game HTML entries | Strict types, viewer/state/selector tests, production build of all five entries (diagnostic, rig, Slap a Mole, Dodgeball and Runner); artifact reference verification |
| `contracts` | Canonical schema, generated TypeScript and validators | `contracts:check`, validation fixtures, both language consumers and the mirror build |
| `packages/motion`, `packages/session`, implemented `games/*` | Source-only TypeScript modules bundled into the app | Types, lint, behavior/replay tests and consuming application build; no invented npm archives |
| `packages/diagnostics`, unimplemented games | Ownership/documentation scaffold | Repository documentation checks until runtime code is introduced |
| `services/vision` | Checkout-based Python project (`tool.uv.package = false`), including camera-free `motion_vision.xyz` | Locked sync, types/lint/format, synthetic tests and byte compilation; no wheel is currently produced. XYZ benchmarks are opt-in serial measurements, separate from CI correctness tests. |
| Model artifacts and native/offline installers | Separate model/hardware and M5 distribution gates | Provenance/offline/hardware evidence for the chosen package; excluded from ordinary CI downloads |

`pnpm build:packages` runs declared workspace `build` scripts recursively in dependency order. `pnpm build:mirror` builds the consuming application afterward, preserving nested HTML entry paths and rejecting asset references outside the uploaded artifact. Root TypeScript coverage includes `packages/*/src` and `games/*/src`. Workspace discovery includes `apps/*`, `packages/*`, `games/*` and `contracts`; currently none has a separate manifest/build, so the package phase has no independent output. Frontend artifacts named `mirror-<runner OS>` are kept for seven days. They need the local vision service for camera input and are development artifacts, not an offline installer. CI does not publish packages or deploy.

When introducing an independent package:

1. State why it needs a distributable boundary and name its consumers in the owning document. Keep source-only modules source-only unless an independent consumer or deployment requires packaging.
2. Add a manifest under a registered workspace path, explicit public exports and a `build` script when it emits a distributable. Declare workspace dependencies so recursive builds follow dependency order. Add any new path to workspace discovery.
3. Extend the CI lane to test the actual output: for a JS library, import its built public entry and include types/assets; for a Python wheel/sdist, build both and install the wheel into a clean environment outside the checkout, checking bundled schemas/manifests; for a native installer, launch offline on each supported OS/profile. A successful source test is insufficient evidence for a new package.
4. Add the output to the artifact upload and document its contents, runtime prerequisites and retention. Retain all configured app entry points in `vite.config.ts`; add meaningful behavior tests, lint/type/format coverage, and browser evidence for any new UI.
5. Update this table, the owning README and the PR validation/report. Keep deployment or registry publishing in a separately authorized release flow.

Python packaging is deferred because the current service resolves schemas and model manifests relative to the checkout. A wheel needs a resource-location design and clean-install/offline tests; byte compilation does not establish that. Native packaging remains [M5](roadmap.md#m5-deployment-and-additional-hardware-profiles).

## Reproducibility and maintenance

Use the pinned Node/Python versions in `.node-version` and `.python-version`, pnpm from `package.json`, and uv from the workflow/setup task. Installs use `pnpm install --frozen-lockfile` and `uv sync --locked`; the latter also rejects a stale Python lockfile. Update the manifests and lockfiles together. CI pins third-party actions to verified commit SHAs with release comments; update both when upgrading. Package caches are keyed by lockfiles; environments and model files are not uploaded as artifacts.

CI uses `uv python install` to provision the exact `.python-version` runtime on every OS, following [uv's GitHub Actions guidance](https://docs.astral.sh/uv/guides/integration/github/#setting-up-python). Security-only CPython releases may have Linux builds but no Windows/macOS installer in `actions/setup-python`; do not silently downgrade the pin or remove those OS checks. Runtime downloads and shims stay under `.local/`.

Keep the workflow read-only (`contents: read`), with finite job timeouts and cancellation of superseded runs. Fork PR checks must work without secrets. Do not use `pull_request_target` to run contributor code. Keep test workers and numerical thread pools bounded. Parallel jobs use separate hosted machines; local heavy checks and browser verification remain sequential.

The documentation checker handles local inline links, reference definitions, ATX headings (including duplicate headings), and explicit HTML IDs. It checks committed/tracked files; stage new docs before a local run. It does not check remote link availability, implement a complete Markdown parser, or replace visual/accessibility review. Reports use static HTML with quoted asset attributes, embedded CSS/media and ordinary optional source hyperlinks.

## Contributor workflow

Run `pnpm install --frozen-lockfile` and install the Python environment with pinned uv (`uv sync --locked`). Existing `pnpm setup` also creates the environment but additionally downloads models; it is unnecessary for camera-free CI. Run `pnpm check` and `pnpm build` before requesting review. Run the relevant component checks during development, then the full gate for final integration. For UI work, also record real local-server desktop/mobile screenshots in each supported language (currently English).

Inspect failing job logs and fix the cause; do not weaken assertions or remove an OS from the matrix to turn the gate green. Record exact results and unrun hardware/browser checks in the PR and self-contained report. Require the latest PR commit's `software-checks` result before merging. See [the CI delivery report](../reports/continuous-integration.html) and [issue #20](https://github.com/DupeisTaken/motion-capture-games/issues/20).
