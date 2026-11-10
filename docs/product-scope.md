# Product scope

## Agreed requirements

The product is a set of games with computer vision input and immediate on-screen feedback. Camera-overlay games show a mirrored live camera image with game graphics. The motion runner shows a rendered game world, with camera feedback available for setup and practice. The digital mirror is a display mode, not a physical two-way mirror or a requirement to place every game over video.

The installation has two USB cameras advertised as 4K at 60 fps. Exact camera models, capture formats, synchronization capabilities, host computer, and room geometry are not selected or verified. Windows, macOS and Linux are target platforms; a Windows RTX 3070 rig is a proposed reference, while integrated graphics are a separate validation target.

The operator retains both camera diagnostics and chooses one camera for gameplay presentation. This choice is independent of primary/reference and secondary/supporting reconstruction roles, calibration, anatomical joint names and player identity. A missing or stale selected view must show an unavailable state without substituting another camera. The [operator rehearsal](two-camera-workspace.md) composes a genuine Slap a Mole game with a selected recorded synthetic background and explicit pointer/keyboard input. The short recording's bodies and XYZ do not drive scores. Simultaneous live capture, calibrated body-input mapping across views and physical game alignment still need separate evidence.

Camera games present untinted mirrored video with game graphics. Tracking skeletons, bounds and body collision diagrams are optional operator diagnostics, hidden in the separate player window. The local browser application can move its existing game stage to a dedicated window without acquiring another camera. Desktop packaging remains M5. In the experimental single-player games, Start also requests admission and can wait for input; a separate player-selection/join sequence is optional rather than required. Identity uncertainty still suspends scoring and cannot transfer an existing score to another track.

The first playable slice may support one player. The platform must grow to three simultaneous players who can move freely, cross, and overlap in supported games. Individual games may impose a lower limit: the motion runner is one person only, even on a three-player performance profile. The product must communicate tracking uncertainty and recover explicitly; complete occlusion does not guarantee recoverable identity.

Gameplay runs locally and works without an Internet connection after installation. Download and package model artifacts before the session; avoid runtime CDN or cloud inference dependencies.

## Initial games

| Sequence | Game | Initial interaction | Main question to validate |
| --- | --- | --- | --- |
| First | Slap a Mole (whack-a-mole) | Push a hip/hand/wrist toward a target when depth is available; alternatively touch with hand/foot proxies | Is interaction aligned, responsive, and attributed to the correct player? |
| Second | Fruit slicing | Sweep a wrist trail through targets | Can fast motion be recognized without phantom or duplicate hits? |
| Third | Dodgeball | Avoid virtual obstacles using body regions | Are body collision shapes and avoidance feedback understandable and fair? |
| Additional | Motion runner (single player) | Move left, center or right to select lanes; jump; squat to duck | Can lane and vertical actions control an on-screen runner reliably and recover fairly from tracking loss? |

Slap a Mole touch, fruit slicing and dodgeball use 2D interactions over the primary camera view initially. Slap a Mole also requires push mode using hips, hands or wrists. This needs toward-screen depth evidence; existing 2D camera adapters do not provide it, so the experimental slice supports synthetic push rehearsal and camera touch only. The [Slap a Mole brief](games/mole-motion.md) owns its four play modes and explicit capability gate. Dodgeball initially uses virtual obstacles, not tracked physical balls. The runner uses a scrolling game world with three lanes; perspective graphics do not imply calibrated 3D body tracking. Add calibrated 3D only when a game rule demonstrates a need and the installation supports it.

The [motion runner brief](games/motion-runner.md) records the one-player requirement and controls. Temple Run / Subway Surfers are gameplay references for this original game module; controlling or embedding those commercial games is outside this scaffold. The existing first three games retain their sequence. Runner implementation is a separate milestone, not a change to the diagnostic-first gate.

## Player experience

- Joining is explicit and assigns an anonymous session slot; a nearby spectator is not automatically a player.
- Teach the interaction through short visual feedback and a practice action before scoring.
- Use shape, text, and position alongside player colors. Do not rely on color or sound alone.
- Show a clear state for a lost hand, uncertain identity, leaving the play area, or a disconnected camera.
- Pause affected scoring when observations cannot support a fair decision. Explain recovery in the interface.
- Configure target reach and difficulty for the participant and installation; avoid targets that encourage contact with the display or another player.
- Maintain a visible play boundary and operator pause/stop control. Free movement remains bounded by the physical installation.
- For the runner, teach all three lane positions, jumping and squatting in practice; keep the physical travel within the calibrated play area. Pause the runner world and scoring when required input is unusable, so obstacles cannot advance into a tracking-related penalty.

The exact joining gesture, reach calibration, runner recognition thresholds, scoring compensation window, and recovery thresholds require playtesting. They are not frozen by this foundation.

## Capacity and flexible installations

Three players is the target maximum for the first platform generation, not a measured claim for every computer. Publish supported player count, camera settings, and game availability for each validated performance profile.

Flexible placement means installation profiles and a repeatable calibration workflow. Moving a camera requires recalibration or verification; saved calibration must not be assumed valid for a different setup.

## Outside the foundation

This commit does not implement capture, rendering, inference, tracking, gameplay, schemas, build tooling, CI, or packaging. It does not select camera purchases, guarantee three-player identity through total occlusion, certify hardware, or establish measured latency.

Online accounts, cloud leaderboards, face recognition, full-body animation retargeting, arbitrary player counts, and room-scale reconstruction are not initial requirements. Introduce them through a scoped proposal if needed.

## Success evidence

A usable diagnostic mirror and measured three-player crossing behavior precede polished game content. See [testing](testing.md) and [the roadmap](roadmap.md) for acceptance gates.
