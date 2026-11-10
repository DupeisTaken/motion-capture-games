# Repository instructions

## Scope and ownership

- Read [README.md](README.md) and the owning design document before changing a component.
- The foundation is documentation-only. Implement runtime behavior when the task calls for it, following the milestone gates in [docs/roadmap.md](docs/roadmap.md).
- Clarify meaningful ambiguity; decide routine details independently. Explain tradeoffs before materially changing the agreed approach.
- The lead agent owns strategy, coordination, integration, and final review. With an Astra lead, delegate substantial work by default; otherwise use subagents when authorized. Prefer the latest Astra for orchestration and latest Sol for delegated work, at an effort appropriate to the task, subject to session instructions and tool availability.
- Give delegated work clear context, ownership boundaries, acceptance criteria, and resource limits. Avoid overlapping edits and verify results before accepting them.

## Architecture rules

- Games must not open cameras, import inference libraries, or depend on model-specific landmark indices.
- Keep scoring and game collisions in game modules. Vision publishes observations, not hit or score decisions.
- Keep anatomical left/right stable. Apply mirroring through an explicit presentation transform.
- Separate camera tracks, rig tracks, and session player slots. Never identify players by left-to-right order.
- Treat missing, stale, and uncertain observations explicitly. Suspend affected scoring during ambiguous identity; never transfer a score through a guessed association.
- Use bounded frame queues and reject outdated work. Never increase buffering without measuring its effect on latency.
- Preserve source timing and clock-domain information. Host read completion time is not verified exposure time.
- Keep accepted requirements separate from proposed technology and unmeasured targets. Consult [docs/decisions/README.md](docs/decisions/README.md).

## Implementation and verification

- Fix root causes across relevant scenarios. Explain non-obvious implementation ideas with concise comments and update the owning documentation.
- Add meaningful tests for new behavior. Run the required checks for the change; investigate failures and try alternatives before stopping.
- Follow [CI conventions](docs/continuous-integration.md): run `pnpm check` and `pnpm build`, keep the component/build table current, and require the latest PR commit's `software-checks` gate. New distributable packages need explicit builds and clean consumer/install checks; source-only modules are checked through their consumers.
- State exactly which checks ran. Never describe planned CI, hardware tests, or performance goals as passing results.
- Verify UI changes using real local-server screenshots at relevant desktop and mobile sizes and supported language variants. The foundation report is English only; no other language is currently supported.
- Use synthetic data in committed fixtures and reports. Keep credentials, participant footage, and private participant data out of the repository.

## Machine and environment safety

- Keep the machine responsive. Parallelize independent investigation, but serialize heavy builds, tests, inference benchmarks, and browser verification.
- Stop only task-owned processes and remove only confirmed disposable caches. Never terminate Codex, ChatGPT, unrelated browsers, or unrelated workloads.
- Prefer repository-local environments and configuration over global changes. Inspect ownership and consequences before destructive commands.
- Avoid adding heavy toolchains or dependencies for documentation-only work.

## Delivery

- For substantive repository work, reuse or file GitHub issues and submit a focused, verified, ready-for-review PR linking them when a remote exists and access permits it.
- If hosting is not configured, complete authorized local work, keep issue-ready scope in [docs/roadmap.md](docs/roadmap.md), and report the missing remote honestly. Do not invent a destination or links.
- Follow [CONTRIBUTING.md](CONTRIBUTING.md) for branch, commit, contract, and review conventions.
- Deliver a self-contained HTML report for substantive changes: what changed and why, relevant before/after screenshots, actual checks and measurements, issue/PR links when available, and remaining limitations.
