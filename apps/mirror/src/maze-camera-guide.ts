import "./maze-camera-guide.css";

/** Operator planning guidance only; no controls here can certify live input. */
export function mazeCameraGuideMarkup(): string {
  return `<details class="maze-camera-guide">
    <summary id="maze-camera-guide-title">Two-camera setup & accuracy guide</summary>
    <figure>
      <svg viewBox="0 0 360 270" role="img" aria-labelledby="maze-camera-diagram-title maze-camera-diagram-description">
        <title id="maze-camera-diagram-title">Illustrative two-camera floor plan</title>
        <desc id="maze-camera-diagram-description">Two separated cameras outside the near edge look obliquely across the same rectangular play area. Their rays meet at one player. Four floor corners have stable near-left, near-right, far-left and far-right labels. The baseline is the distance between cameras. This top view does not show lens field of view or vertical coverage to scale.</desc>
        <path d="M35 225 80 42 280 42 280 176Z" fill="#dbe8ff" stroke="#849fc5" stroke-width="1.2"/>
        <path d="M325 225 280 42 80 42 80 176Z" fill="#d8efea" fill-opacity=".72" stroke="#719a93" stroke-width="1.2"/>
        <rect x="80" y="42" width="200" height="134" fill="#fff" fill-opacity=".85" stroke="#465b76" stroke-width="2"/>
        <g fill="#24344b" font-size="13" font-family="system-ui,sans-serif">
          <text x="80" y="29">Far left</text><text x="280" y="29" text-anchor="end">Far right</text>
          <text x="80" y="196">Near left</text><text x="280" y="196" text-anchor="end">Near right</text>
          <text x="180" y="68" text-anchor="middle">Shared play area</text><text x="180" y="88" text-anchor="middle">Each side: 5–10 m</text>
        </g>
        <path d="M35 225 180 121 325 225" fill="none" stroke="#466783" stroke-width="1.5" stroke-dasharray="5 4"/>
        <circle cx="180" cy="121" r="8" fill="#216f62" stroke="#fff" stroke-width="2"/>
        <text x="180" y="151" text-anchor="middle" fill="#24344b" font-size="13" font-family="system-ui,sans-serif">Player</text>
        <g fill="#235ac4" stroke="#fff" stroke-width="1.5"><rect x="25" y="214" width="21" height="15" rx="3"/><path d="m46 217 8-5v18l-8-5Z"/></g>
        <g fill="#216f62" stroke="#fff" stroke-width="1.5"><rect x="314" y="214" width="21" height="15" rx="3"/><path d="m314 217-8-5v18l8-5Z"/></g>
        <g fill="#24344b" font-size="13" font-family="system-ui,sans-serif"><text x="35" y="247" text-anchor="middle">Camera A</text><text x="325" y="247" text-anchor="middle">Camera B</text></g>
        <path d="M73 240H287M73 236v8m214-8v8" fill="none" stroke="#465b76" stroke-width="1.3"/>
        <text x="180" y="259" text-anchor="middle" fill="#24344b" font-size="12" font-family="system-ui,sans-serif">Baseline · illustrative, not to scale</text>
      </svg>
      <figcaption>Planning only: separated, overlapping oblique views from above. Check floor-to-head coverage separately; these are not certified mounting angles.</figcaption>
    </figure>
    <ol class="maze-camera-steps">
      <li><strong>Mark the rectangle.</strong> Measure width and depth independently. Label all four cone floor-contact points; colors can be the same.</li>
      <li><strong>Check both views.</strong> Start with separated viewpoints outside the boundary, aimed across the whole rectangle. Check feet, hips and head at near/far corners and during turns.</li>
      <li><strong>Lock and calibrate.</strong> Fix mounts, resolution, crop and focus. Calibrate each lens and the pair with a measured board at varied positions, depths and heights.</li>
      <li><strong>Verify on the actual rig.</strong> Check exposure pairing, identity, held-out distances/heights, movement and head/torso turns before physical input is enabled.</li>
    </ol>
    <details class="maze-camera-details"><summary>Placement tradeoffs & accuracy checks</summary>
      <p>A tiny baseline or nearly parallel rays makes depth fragile. More separation can improve geometry but lose shared coverage or hide joints behind the body. Compare alternatives across the entire volume; no single angle or baseline guarantees accuracy.</p>
      <p>Check both cameras at the intended participant heights, including overhead reach and head-only/torso-only turns. A good hip position does not prove facing direction; test front/back ambiguity and occlusion separately. Head direction is not eye gaze.</p>
      <p>Use known-size board correspondences in both views for intrinsics, distortion and metric extrinsics. Hold out independent reference points. A floor homography maps floor contacts, not elevated hips or heads. Moving a camera or changing focus/image geometry requires revalidation.</p>
      <p>Before live gameplay: measure source exposure skew/uncertainty, confirmed same-person association, XYZ and angular errors, accepted coverage, useful update rate and external motion-to-buzzer latency. Record rejections as well as accepted errors. Planning notes and corner labels cannot pass these gates.</p>
      <p><a href="./rig.html" target="_blank" rel="noopener noreferrer">Open two-camera planning ↗</a> — assigns roles without starting capture.</p>
      <p class="maze-camera-sources">Geometry references: <a href="https://docs.opencv.org/4.x/dc/dbb/tutorial_py_calibration.html" target="_blank" rel="noopener noreferrer">OpenCV calibration ↗</a> · <a href="https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html" target="_blank" rel="noopener noreferrer">Stereo calibration & triangulation ↗</a>. Placement is a starting hypothesis to verify on this rig.</p>
    </details>
  </details>`;
}
