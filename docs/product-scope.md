# Product scope

## Agreed requirements

The product is a set of games with computer vision input and immediate on-screen feedback. Players see a mirrored live camera image with game graphics. The display is a digital mirror, not a physical two-way mirror.

The installation has two USB cameras advertised as 4K at 60 fps. Exact camera models, capture formats, synchronization capabilities, host computer, and room geometry are not selected or verified. Windows and macOS are target platforms; a Windows RTX 3070 rig is a proposed reference, while integrated graphics are a separate validation target.

The first playable slice may support one player. The platform must grow to three simultaneous players who can move freely, cross, and overlap. The product must communicate tracking uncertainty and recover explicitly; complete occlusion does not guarantee recoverable identity.

Gameplay runs locally and works without an Internet connection after installation. Download and package model artifacts before the session; avoid runtime CDN or cloud inference dependencies.

## Initial games

| Sequence | Game | Initial interaction | Main question to validate |
| --- | --- | --- | --- |
| First | Whack-a-mole | Reach a tracked wrist or hand proxy into a visible target | Is interaction aligned, responsive, and attributed to the correct player? |
| Second | Fruit slicing | Sweep a wrist trail through targets | Can fast motion be recognized without phantom or duplicate hits? |
| Third | Dodgeball | Avoid virtual obstacles using body regions | Are body collision shapes and avoidance feedback understandable and fair? |

These are 2D interactions over the primary camera view initially. The first whack interaction does not require a physically measured punch in depth. Dodgeball initially uses virtual obstacles, not tracked physical balls. Add calibrated 3D only when a game rule demonstrates a need and the installation supports it.

## Player experience

- Joining is explicit and assigns an anonymous session slot; a nearby spectator is not automatically a player.
- Teach the interaction through short visual feedback and a practice action before scoring.
- Use shape, text, and position alongside player colors. Do not rely on color or sound alone.
- Show a clear state for a lost hand, uncertain identity, leaving the play area, or a disconnected camera.
- Pause affected scoring when observations cannot support a fair decision. Explain recovery in the interface.
- Configure target reach and difficulty for the participant and installation; avoid targets that encourage contact with the display or another player.
- Maintain a visible play boundary and operator pause/stop control. Free movement remains bounded by the physical installation.

The exact joining gesture, reach calibration, scoring compensation window, and recovery thresholds require playtesting. They are not frozen by this foundation.

## Capacity and flexible installations

Three players is the target maximum for the first platform generation, not a measured claim for every computer. Publish supported player count, camera settings, and game availability for each validated performance profile.

Flexible placement means installation profiles and a repeatable calibration workflow. Moving a camera requires recalibration or verification; saved calibration must not be assumed valid for a different setup.

## Outside the foundation

This commit does not implement capture, rendering, inference, tracking, gameplay, schemas, build tooling, CI, or packaging. It does not select camera purchases, guarantee three-player identity through total occlusion, certify hardware, or establish measured latency.

Online accounts, cloud leaderboards, face recognition, full-body animation retargeting, arbitrary player counts, and room-scale reconstruction are not initial requirements. Introduce them through a scoped proposal if needed.

## Success evidence

A usable diagnostic mirror and measured three-player crossing behavior precede polished game content. See [testing](testing.md) and [the roadmap](roadmap.md) for acceptance gates.
