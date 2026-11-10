import {
  bodyShapes,
  TUNING,
  type DodgeGame,
} from "../../../games/dodgeball/src/index";
import {
  BONES,
  containRect,
  isRenderableJoint,
  mapJoint,
  type BodyPoint,
  type Observation,
  type Rect,
} from "../../../packages/motion/src/index";

/** Every source, avatar collider and ball uses one contain-fit and one mirror. */
export function drawDodgeScene(
  canvas: HTMLCanvasElement,
  observation: Observation | null,
  image: ImageBitmap | null,
  body: BodyPoint[],
  obstacle: DodgeGame["state"]["obstacle"],
  mirror = true,
  diagnostics = false,
): Rect {
  const width = Math.max(1, canvas.clientWidth || 960),
    height = Math.max(1, canvas.clientHeight || 600);
  const ratio = Math.min(
    canvas.ownerDocument.defaultView?.devicePixelRatio || 1,
    2,
  );
  if (
    canvas.width !== Math.round(width * ratio) ||
    canvas.height !== Math.round(height * ratio)
  ) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const rect = containRect(observation?.image || { width: 960, height: 600 }, {
    width,
    height,
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) return rect;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = "#102623";
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  if (observation && image) {
    ctx.save();
    ctx.translate(rect.x + (mirror ? rect.width : 0), rect.y);
    if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(image, 0, 0, rect.width, rect.height);
    ctx.restore();
  } else {
    const glow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      10,
      width * 0.5,
      height * 0.5,
      width * 0.65,
    );
    glow.addColorStop(0, "#21413b");
    glow.addColorStop(1, "#102623");
    ctx.fillStyle = glow;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = "#cbe0c50b";
    ctx.lineWidth = 1;
    for (let x = rect.x; x < rect.x + rect.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, rect.y);
      ctx.lineTo(x, rect.y + rect.height);
      ctx.stroke();
    }
    for (let y = rect.y; y < rect.y + rect.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(rect.x, y);
      ctx.lineTo(rect.x + rect.width, y);
      ctx.stroke();
    }
  }
  // Diagnostics are opt-in; ordinary camera play shows the unmasked mirrored feed.
  if (observation && diagnostics) {
    for (const person of observation.people) {
      const label = mapJoint(
        { x: person.box.x + person.box.width / 2, y: person.box.y },
        rect,
        mirror,
      );
      ctx.font = "600 12px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillStyle = person.identity === "confident" ? "#f6e7c7" : "#ffbd9e";
      ctx.fillText(
        person.trackId || "Unassigned",
        label.x,
        Math.max(rect.y + 15, label.y - 8),
      );
      ctx.strokeStyle = "#c9dcc450";
      ctx.lineWidth = 2;
      for (const [a, b] of BONES) {
        const ja = person.joints[a],
          jb = person.joints[b];
        if (!isRenderableJoint(ja) || !isRenderableJoint(jb)) continue;
        const pa = mapJoint(ja, rect, mirror),
          pb = mapJoint(jb, rect, mirror);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }
  }
  // Normalized drawing preserves the engine's elliptical screen-space footprint.
  ctx.save();
  ctx.translate(rect.x + (mirror ? rect.width : 0), rect.y);
  ctx.scale(mirror ? -rect.width : rect.width, rect.height);
  const shapes = bodyShapes(body);
  if (shapes && (!image || diagnostics)) {
    ctx.fillStyle = "#cde5ce35";
    ctx.strokeStyle = "#bde6ce";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = TUNING.limbRadius * 2;
    ctx.beginPath();
    for (let i = 0; i < shapes.torso.length; i++) {
      const p = shapes.torso[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const limb of shapes.limbs) {
      ctx.lineWidth = limb.radius * 2;
      ctx.beginPath();
      ctx.moveTo(limb.a.x, limb.a.y);
      ctx.lineTo(limb.b.x, limb.b.y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(shapes.head.x, shapes.head.y, shapes.head.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.003;
    ctx.beginPath();
    ctx.arc(
      shapes.head.x,
      shapes.head.y,
      shapes.head.radius - 0.0015,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  if (obstacle) {
    const { x, y, radius, phase } = obstacle;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle =
      phase === "warning"
        ? "#efbc7725"
        : phase === "danger"
          ? "#ed8060e8"
          : "#bfe5ca15";
    ctx.fill();
    ctx.lineWidth = phase === "danger" ? 0.006 : 0.0035;
    ctx.strokeStyle =
      phase === "warning"
        ? "#f6c57f"
        : phase === "danger"
          ? "#ffd6ae"
          : "#bfe5ca55";
    if (phase === "warning") ctx.setLineDash([0.012, 0.009]);
    ctx.beginPath();
    ctx.arc(x, y, radius - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (phase === "warning") {
      ctx.beginPath();
      ctx.arc(
        x,
        y,
        radius * 0.84,
        -Math.PI / 2,
        -Math.PI / 2 +
          Math.PI * 2 * (1 - obstacle.remainingMs / obstacle.durationMs),
      );
      ctx.lineWidth = 0.007;
      ctx.strokeStyle = "#f9ce8d";
      ctx.stroke();
    } else if (phase === "danger") {
      // Seams distinguish an active ball from its stationary warning, without flashing.
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = "#9a4435";
      ctx.lineWidth = 0.005;
      ctx.beginPath();
      ctx.moveTo(x - radius, y - radius * 0.45);
      ctx.quadraticCurveTo(x, y + radius * 0.1, x + radius, y - radius * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - radius, y + radius * 0.45);
      ctx.quadraticCurveTo(x, y - radius * 0.1, x + radius, y + radius * 0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - radius);
      ctx.quadraticCurveTo(x - radius * 0.7, y, x, y + radius);
      ctx.stroke();
      ctx.restore();
    }
  }
  if (diagnostics) {
    const bounds = TUNING.bounds;
    ctx.strokeStyle = "#c5dfc74d";
    ctx.lineWidth = 0.0015;
    ctx.setLineDash([0.008, 0.012]);
    ctx.strokeRect(
      bounds.left,
      bounds.top,
      bounds.right - bounds.left,
      bounds.bottom - bounds.top,
    );
    ctx.setLineDash([]);
  }
  ctx.restore();
  ctx.restore();
  if (diagnostics) {
    // Source boundary remains visible even on mobile letterboxing.
    ctx.strokeStyle = "#c5dfc74d";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 8]);
    ctx.strokeRect(
      rect.x + 1,
      rect.y + 1,
      Math.max(0, rect.width - 2),
      Math.max(0, rect.height - 2),
    );
    ctx.setLineDash([]);
  }
  return rect;
}
