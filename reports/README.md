# Change reports

Deliver a self-contained HTML file for substantive repository changes. Embed CSS and necessary media; the file must be readable offline without external fonts, scripts or stylesheets. External source links may be ordinary optional hyperlinks.

Explain the problem, final change and rationale. Include relevant before/after screenshots, actual checks/results and measurements, rig/configuration details for hardware claims, issue/PR links when available and remaining limitations. Use synthetic examples and exclude credentials/private participant data.

[The foundation report](foundation.html) describes the documentation-only initial change. It has no gameplay screenshots or runtime performance results because neither an application nor a tested installation exists. Its embedded previews document desktop/mobile report rendering only.

Keep unredacted local diagnostic artifacts under ignored `reports/local/` or `.local/`.

[The XYZ experiment report](xyz-experiment.html) embeds measured synthetic comparisons, source data and a desktop capture. Mobile screenshot verification remains pending. Generate [JSON results](xyz-results.json) with `python3 tools/project.py experiment` and rebuild HTML with `python3 tools/project.py build`. The [prior timing evidence](xyz-prior-timing.json) retains a run with substantial scheduling tails. Physical camera certification remains open.
