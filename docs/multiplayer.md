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

Require an explicit participation action supported by clear UI. In the experimental single-player Slap a Mole and Dodgeball flows, **Start round** is that action: it waits for a unique confident participant and usable input, then associates player 1 without a second Join button. Multiple people require a clear selection or stepping out before admission; position/order never chooses ownership. For multiplayer, enable **Multiplayer · experimental 1–3 players** in Camera setup. The operator explicitly selects a visible anonymous track for each slot and presses **Enroll**. Close setup to see the lobby and use **Start enrolled players** (or confirm Start in setup). No slot is selected by horizontal position or detection-array order. Physical usability of this operator-assisted enrollment remains unmeasured. People entering an already-owned round are not automatically enrolled or given its score.

Certified deployment capacity remains bounded by its measured hardware profile. The experimental software preview declares a maximum of three slots independently of hardware certification; it does not certify the current machine. The reusable coordinator also accepts a software capacity of one or two and rejects slots above that limit. Leaving, timing out, rejoining and starting a new session have explicit rules; scores must not transfer just because a new track appears nearby.

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

The experimental single-player session offers [opt-in bounded same-track suspension](../packages/session/README.md#bounded-same-track-recovery). One ephemeral non-biometric association token survives at most 450 ms without fresh confident input; it never enrolls a new ID or republishes old joints. Consumers keep the score pinned to the original slot and suspend its scoring while missing/tentative. Duplicate/explicit ambiguous incumbent identity and changed provenance invalidate immediately, while recovery breaks old trails. This provisional software bound is not multiplayer registration, cross-view re-identification or measured field continuity. Unrelated spectator ambiguity only retires spatially implicated camera tracks; genuinely ambiguous overlap remains conservative.

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

## Experimental Mole and Dodgeball multiplayer

[Issue #59](https://github.com/DupeisTaken/motion-capture-games/issues/59) adds real per-slot gameplay in both camera viewers. Single player remains the default; Rehearsal, Motion Runner and Maze keep their existing single-player behavior. The multiplayer board stays inline; the separate single-player game window is unavailable while multiplayer is selected. One existing camera owner, socket and decoded image feed all enrolled games. The board never opens capture or imports inference.

### Admission and lifecycle

- Slots are fixed `player-1` through `player-3`. Enrollment requires a unique, fresh, confident selected track; an already enrolled track cannot occupy another slot. Other detections are spectators and never receive scoring input.
- Each outer slot owns a dedicated game engine. The adapter deliberately uses the engine's existing local `player-1` input envelope, routing it only to the engine keyed by the outer slot. This preserves the public `SinglePlayerSession` and game APIs without pretending that a single runtime is multiplayer.
- An enrolled slot holds its score and binding through uncertainty. Explicit ambiguity, duplicate identity, incompatible source/epoch/geometry/model/clock changes or expired recovery block that slot until **Leave & clear score**, followed by explicit enrollment. A returned ID cannot silently unlock terminally invalid membership.
- Missing joints pause only that player's engine. Compatible bounded same-ID recovery pauses and clears gesture history before the existing recovery countdown. No old joints or image are replayed into scoring. Source-wide faults suspend all affected games. [The tracking work](https://github.com/DupeisTaken/motion-capture-games/issues/61) owns the opt-in bounded association-memory contract. This change is explicitly stacked on its published core commit `f2f95d7`; the tracking PR must land first. Both the source clock guard and per-slot sessions use the same 450 ms window, and frame-loop expiry runs without waiting for another packet.
- **Pause** and **Resume** act on one slot. Hiding the page pauses all players and requires Resume; there is no catch-up. **End round** preserves that slot’s results while others continue. **New round** resets only that slot after results. Leaving clears only that slot's game and score. A different participant must enroll into a fresh runtime.
- Source changes are unavailable while slots are enrolled. Stop remains available, clears the preview and input immediately, and a new camera epoch requires fresh enrollment. A stopped preview cannot enroll a participant.

### Game policy and fairness

This slice uses **parallel personal games**, not a shared-target race. Each labeled panel shows the same mirrored camera picture plus its own targets/ball. Only the enrolled player's contacts/body can hit those targets or collide with that ball; a spectator or another slot cannot consume them. The camera image is not cropped into horizontal player lanes, so crossing screen positions never exchanges games. Anonymous track labels let the operator confirm membership; they are not persistent or biometric identities.

Players start with the same selected settings and deterministic seed. Each engine has independent countdown, targets/obstacles, active time, misses/lives and score. Tracking pauses freeze only the affected active timeline; other players continue. Thus wall-clock finish times and adaptive target locations can differ. Scores are individual practice/arcade results, not a certified competitive leaderboard or a claim of equal physical reach. Changing setup options applies to subsequent new rounds, not an already running engine. Touch/Flick retain the game's collision rules; camera Push stays unavailable without calibrated depth. Mole arrival phases and game-owned outcome feedback remain visible when the newer target format is supplied.

### Software evidence and remaining gates

Session tests exercise 2/3 slots, duplicate/capacity rejection, reordered crossing observations, spectators, ambiguous/lost input, independent leave/rejoin, outdated packets, clock and epoch/geometry invalidation. Adapter tests exercise actual Mole scoring and Dodgeball bodies with separate engine state. Real-server English desktop/mobile evidence in [the delivery report](../reports/playtest-multiplayer.html) uses synthetic camera packets and pixels only. These checks establish software routing behavior, not the quality of physical tracking.

No participant footage or training data was supplied. Actual three-person movement, self-occlusion, indistinguishable replacements, hardware throughput, camera placement, movement comfort, physical hit/dodge accuracy, external latency and continuity rates remain unmeasured. No 99% continuity or three-player hardware certification is claimed. M1/M2/M4 physical gates remain open.
