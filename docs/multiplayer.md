# Multiplayer and identity

## Requirement

Support up to three participating players with free movement, crossing and overlap. The first playable slice can begin with one player, but the diagnostic milestone must exercise three people before the design is considered suitable for expansion.

## Three separate identities

| Identity | Owner | Lifetime |
| --- | --- | --- |
| Camera-local track | Vision tracking adapter | One camera stream/tracker epoch |
| Rig person track | Vision association layer | Confident association across views and time |
| Player slot | Session runtime | Explicit participant membership for a session |

A player slot owns score and session settings. A rig track can become uncertain or disappear without deleting that slot. Never map slots by detection-array index or current horizontal position. Never reuse a tracker ID across an epoch without invalidating its old association.

## Joining and leaving

Require an explicit join action supported by clear UI. The exact gesture or operator flow is a playtest decision. Registration should establish a confident initial association and a distinguishable on-screen label. Spectators and people entering the image are not automatically enrolled.

The session has at most three active slots under a profile certified for three. A one-player profile admits one. Leaving, timing out, rejoining and starting a new session have explicit rules; scores must not transfer just because a new track appears nearby.

## Quality states

| State | Scoring policy | Feedback |
| --- | --- | --- |
| Confident identity and required joints | Game may evaluate valid input | Normal player indicator |
| Confident identity, required joint missing/stale | Suppress interactions needing that joint | Show which input needs recovery |
| Ambiguous identity during overlap | Suspend affected slot attribution | Keep slot/score visible and prompt reacquisition |
| Lost track | No input; preserve slot for configured recovery interval | Lost-player cue and rejoin instructions |
| Confirmed recovery | Resume after sufficient evidence; break old trails | Clear recovered state |

A game may continue for unaffected players, or pause globally if its rules require everyone. Make the policy explicit. Do not penalize an uncertain player as if a reliable collision or miss had been observed.

## Crossings and view association

Evaluate temporal motion, pose geometry, visibility, view calibration, source timing and association uncertainty. Optional non-biometric appearance cues can be proposed if necessary, with their limitations documented. Face recognition and persistent personal identity are not part of the initial design.

The second camera provides evidence only when its view and timing are useful. It is not an automatic substitute for hidden primary-view joints. Cross-view joint projection requires justified geometry; rapid-motion triangulation additionally requires sufficiently aligned exposure times.

Full occlusion can make identity unobservable. Preserve uncertainty rather than claiming guaranteed continuity. Recovery can require a clear separation or explicit rejoin. Set the evidence threshold and recovery interval from measured scenarios, not guessed confidence values.

## Required diagnostic scenarios

- Two players exchange left/right positions, including similar clothing.
- Three players cross in the center while hands overlap.
- One player moves behind another, partially and then fully disappearing from the primary view.
- A participant exits and returns while a spectator enters.
- Camera 2 disconnects during a crossing; camera 1 disconnects during active play.
- Tracker restart, repeated local IDs, stale packets, and stream epoch changes.
- Players of different heights reach quickly near image edges.

Record association switches, ambiguity duration, recovery time, lost-joint intervals and whether any action or score reached the wrong slot. Separate confident wrong attribution from a correctly signaled temporary suspension. The acceptance target is no observed wrong-slot scoring in the agreed scenario set; this is not a claim of universal identity recovery.

See [testing](testing.md#multiplayer-and-recovery) for evidence requirements and [installation](installation.md#placement-and-coverage) for camera coverage.
