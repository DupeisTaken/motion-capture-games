# Change reports

Deliver a self-contained HTML file for substantive repository changes. Embed CSS and necessary media; the file must be readable offline without external fonts, scripts or stylesheets. External source links may be ordinary optional hyperlinks.

Explain the problem, final change and rationale. Include relevant before/after screenshots, actual checks/results and measurements, rig/configuration details for hardware claims, issue/PR links when available and remaining limitations. Use synthetic examples and exclude credentials/private participant data.

[The foundation report](foundation.html) describes the documentation-only initial change. It has no gameplay screenshots or runtime performance results because neither an application nor a tested installation exists. Its embedded previews document desktop/mobile report rendering only.

Keep unredacted local diagnostic artifacts under ignored `reports/local/` or `.local/`.

[The motion runner report](motion-runner.html) records the single-player runner scaffold update, its documentation checks and report-rendering evidence. No game implementation or physical recognition result is claimed.

[Vision research](vision-research.html) is the standalone research and planning report for location, pose, motion, identity and training. Its editable analysis is [docs/vision-research.md](../docs/vision-research.md); recommendations remain proposed until measured in M1. Its verification record concerns documentation/report delivery, not inference or hardware results.

[Skeleton diagnostics](skeleton-diagnostics.html) records the runnable viewer, model smoke tests and desktop and mobile browser evidence from generated scenes.

[Pull request integration](pr-integration.html) records merge order, documentation conflict resolution, combined software checks and remaining hardware gates.

[RTMPose and smooth preview](preview-performance.html) records the independent display loop, separate camera/pose rates, synthetic 60 Hz rendering evidence, before/after screenshots and remaining M1 gates. [Machine-readable results](preview-performance-results.json) retain the measured distributions.
