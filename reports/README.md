# Change reports

Deliver a self-contained HTML file for substantive repository changes. Embed CSS and necessary media; the file must be readable offline without external fonts, scripts or stylesheets. External source links may be ordinary optional hyperlinks.

Explain the problem, final change and rationale. Include relevant before/after screenshots, actual checks/results and measurements, rig/configuration details for hardware claims, issue/PR links when available and remaining limitations. Use synthetic examples and exclude credentials/private participant data.

[The foundation report](foundation.html) describes the documentation-only initial change. It has no gameplay screenshots or runtime performance results because neither an application nor a tested installation exists. Its embedded previews document desktop/mobile report rendering only.

Keep unredacted local diagnostic artifacts under ignored `reports/local/` or `.local/`.

[Diagnostic capture lifecycle](diagnostic-capture-lifecycle.html) records epoch-scoped console cleanup, cancelled-start recovery, retryable release failures, synthetic before/after browser evidence and actual software checks.

[Camera gameplay](raw-game-display.html) records raw mirrored views, the separate game display, resilient single-action Start/recovery, portable camera choice and actual review/check evidence.

[Continuous integration](continuous-integration.html) records repository conventions, component/build coverage, actual local and hosted checks, and remaining packaging/hardware limits.

[Dodgeball](dodgeball.html) records the experimental virtual-obstacle game, independent Sol review, actual software checks, real-server desktop/mobile synthetic evidence and remaining physical playtest gates.

[The motion runner report](motion-runner.html) records the single-player runner scaffold update, its documentation checks and report-rendering evidence. No game implementation or physical recognition result is claimed.

[Vision research](vision-research.html) is the standalone research and planning report for location, pose, motion, identity and training. Its editable analysis is [docs/vision-research.md](../docs/vision-research.md); recommendations remain proposed until measured in M1. Its verification record concerns documentation/report delivery, not inference or hardware results.

[Skeleton diagnostics](skeleton-diagnostics.html) records the runnable viewer, model smoke tests and desktop and mobile browser evidence from generated scenes.

[Pull request integration](pr-integration.html) records merge order, documentation conflict resolution, combined software checks and remaining hardware gates.

[RTMPose and smooth preview](preview-performance.html) records the independent display loop, separate camera/pose rates, synthetic 60 Hz rendering evidence, before/after screenshots and remaining M1 gates. [Machine-readable results](preview-performance-results.json) retain the measured distributions.

[Diagnostic console](diagnostic-console.html) records the dense responsive test page, explicit camera setup, timing/pacing corrections, actual checks, synthetic measurements and embedded before/after screenshots.

[Tracking stability](tracking-stability.html) records the prediction-driven identity-switch fix, baseline/fixed synthetic replays, tracker-only timing measurements and verification. Its generated [replay evidence](tracking-stability-results.json) comes from [the reproduction tool](../services/vision/tools/tracking_stability.py). The report distinguishes correct continuity and conservative ambiguity from physical recognition accuracy, and records provider-capacity and enrollment limitations.

[Mole Motion](mole-motion.html) records the experimental game slice, rule/session/UI tests, real-server desktop/mobile synthetic screenshots and the remaining depth/hardware gates.

[Camera selection](camera-selection.html) documents the shared native selector, refresh/recovery behavior, actual checks and remaining hardware limits.

[Pre-game settings](pre-game-settings.html) records the shared video/game setup menu, confirmation and camera-release behavior, synthetic before/after browser evidence and actual checks.
