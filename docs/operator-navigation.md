# Game and operator navigation

Every top-level page has the same **All games** return link, current location and **Switch view** button. Open Switch view for all four games, the tracking console and two-camera workspace. The directory remains available at `/` (and `/index.html`); its static cards and tool links also work without JavaScript.

The location distinguishes **Game & controls**, **Operator tool** and **Game directory**. Operator navigation stays in the owner document, outside game stages. Separate participant windows contain only their existing game presentation and return controls. Moving the stage never moves navigation or starts another camera.

The tracking console contains single-camera setup. Two-camera workspace opens the existing rig workspace for role planning and synthetic XYZ rehearsal. There is no live calibration route in this baseline; the navigation does not imply that physical two-camera calibration or XYZ is available.

## Keyboard and mobile

Tab to **Switch view**, then Enter or Space to expand it. Tab follows ordinary links through Games and Operator tools. Escape closes the list and returns focus to Switch view. The button reports its expanded state, the destination marks `aria-current="page"`, and links/buttons have visible focus and at least 44-pixel target height. Mobile wraps the same destinations into a single column; none are removed. English is the only supported language.

## Switching safely

Changing pages ends the current round and resets unsaved in-memory settings. It does not transfer a score, source or camera to the destination. Capture still needs an explicit Start camera action there.

An operator with active capture must use the existing **Stop camera** (or tracking-console **Stop**) before switching. An unconfirmed release keeps the current page and its **Retry camera stop** controls available. A cancelled Start remains pending through its late acknowledgement and any scoped release. Unknown startup ownership requires restarting the local vision service, then reloading the page; this affects all tabs sharing the service. Navigation never sends an unscoped stop or guesses ownership from global service status.

The browser identification preview in the console must also be released. Return or close a separate participant window before switching. A focused status message explains a blocked departure; it does not dismiss the source's existing retry UI. Current-location links do not reload the page. Modified clicks and links explicitly targeting a new tab retain ordinary browser behavior because they leave this owner page open. Another tab still shares the vision service and must follow its existing ownership rules.

These guards cover application links, including legacy brand and directory links. Browser Back, address-bar navigation, closing the tab and OS shutdown still use existing best-effort `pagehide` cleanup; the shared component cannot guarantee unload delivery or physical driver release. No physical release or participant trial is claimed.

## Integration boundary

`app-navigation.ts` owns the destination list, disclosure, status feedback and CSS. Entrypoints mount it after their viewer; game modules, session and vision are unchanged. Viewer mounts expose a read-only `navigationBlocker(): string | null`, which reports source or participant-window state. `NavigationStartup` retains the asynchronous Start barrier independently of local Stop state.

Additional app-local owners can participate without importing the navigation module. Before a same-tab application departure, navigation dispatches a bubbling, cancelable `CustomEvent` named `motion-studio:navigation-check` on `#app` (or `body` when absent). Its detail is `{ reason: string | null }`. An owner listener on that root calls `preventDefault()` while starting, active, releasing, release-unconfirmed or ownership-unknown, and supplies actionable `event.detail.reason`. Otherwise it leaves the event untouched. Remove the listener on disposal. Keep pending state until late acknowledgement and release complete; do not clear ownership just because preview pixels stopped.

This is the additive integration contract with the independent maze floor-calibration repair ([issue #60](https://github.com/DupeisTaken/motion-capture-games/issues/60)). That repair must install its controller's veto and test its actual capture states. This PR tests an injected calibration-style owner and dispatch but does not claim to exercise the unmerged calibration controller. Both PRs can be reviewed against the campaign baseline; physical calibration remains its own gate.

## Verification

Focused tests cover route completeness/current location, disclosure/focus, default versus modified navigation, recovery, unknown/pending Start barriers and actual Mole/Dodgeball/Runner late-start wiring. `node scripts/verify-operator-navigation.mjs` starts a task-owned Vite server on port 5197 and an installed headless browser; synthetic HTTP boundaries never open a camera. It captures all seven pages at desktop/mobile English sizes and checks keyboard navigation, scoped release failure/retry and an app-local veto. `--baseline` serves baseline TypeScript from commit `2cea8d7` for before screenshots; `--report-only` inspects the generated report at desktop/mobile/320-pixel widths. Browser/server cleanup is task-owned.

Run these commands through the campaign's serialized wrapper when sharing the playtest machine. Screenshots/results are ignored under `reports/local/operator-navigation/`; the delivery report embeds selected evidence for offline use. Run `pnpm check` and `pnpm build` before review. See [issue #63](https://github.com/DupeisTaken/motion-capture-games/issues/63) and [the self-contained report](../reports/playtest-operator-navigation.html) for actual results and limitations.
