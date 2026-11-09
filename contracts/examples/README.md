# Contract examples

[synthetic-observation.json](synthetic-observation.json) demonstrates a named-joint detection with an explicit missing ankle, an off-image wrist estimate and nanoseconds beyond JavaScript's exact integer range. It contains synthetic geometry, not participant data or a camera measurement. Its confident camera-track label does not enroll a game player.

[Contract tests](../../tests/contracts/observation.test.ts) validate it against the canonical boundary and cover malformed values, count/capacity mismatch, duplicate track assignment and false in-frame claims. [Motion tests](../../tests/motion/motion.test.ts) exercise source resets, ordering, matching preview/metadata packets, confidence gates and mirror/aspect-ratio transforms.

Keep real recordings, credentials and private participant/device identifiers out of committed examples. Add synthetic compatibility and failure fixtures when the protocol expands.
