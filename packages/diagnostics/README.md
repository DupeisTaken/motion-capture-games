# Diagnostics

Future reusable views for camera health, negotiated formats, provider/model identity, queue drops, useful pose intervals, clock quality, video/pose skew and resource use.

Consume reported measurements without taking camera ownership or changing score state. Label unmeasured values and approximate timestamps explicitly. Avoid expensive diagnostic updates in the hot render loop.

Start with the minimum diagnostic view needed by [M1](../../docs/roadmap.md#m1-diagnostic-mirror-and-hardware-experiment); extract a package when reuse justifies it. This directory currently records ownership only.
