import {
  BONES,
  containRect,
  isRenderableJoint,
  mapJoint,
  type MotionContact,
  type Observation,
  type Rect,
} from "../../../packages/motion/src/index";
import type { TouchRegion } from "../../../games/mole-motion/src/index";

/** Targets, contacts and source image share this exact contain/mirror transform. */
export function drawMoleScene(
  canvas: HTMLCanvasElement,
  frame: Observation | null,
  image: ImageBitmap | null,
  contacts: MotionContact[],
  mirror = true,
  diagnostics = false,
  rehearsal = !frame,
  touchRegions: readonly TouchRegion[] = [],
): Rect {
  const width = Math.max(1, canvas.clientWidth || 960);
  const height = Math.max(1, canvas.clientHeight || 600);
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
  const rect = containRect(frame?.image || { width: 960, height: 600 }, {
    width,
    height,
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) return rect;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = "#152d2c";
  ctx.fillRect(0, 0, width, height);
  if (frame && image) {
    ctx.save();
    ctx.translate(rect.x + (mirror ? rect.width : 0), rect.y);
    if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(image, 0, 0, rect.width, rect.height);
    ctx.restore();
  } else {
    ctx.strokeStyle = "#b1d9bc0b";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }
  if (rehearsal && diagnostics) {
    // A synthetic body is a control guide, never an inferred camera participant.
    const body = [
      [0.5, 0.2, 0.5, 0.58],
      [0.34, 0.34, 0.66, 0.34],
      [0.34, 0.34, 0.27, 0.53],
      [0.66, 0.34, 0.73, 0.53],
      [0.5, 0.58, 0.39, 0.85],
      [0.5, 0.58, 0.61, 0.85],
    ];
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#a9dbc51a";
    for (const [ax, ay, bx, by] of body) {
      const a = mapJoint({ x: ax, y: ay }, rect, mirror);
      const b = mapJoint({ x: bx, y: by }, rect, mirror);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const head = mapJoint({ x: 0.5, y: 0.14 }, rect, mirror);
    ctx.beginPath();
    ctx.arc(head.x, head.y, rect.height * 0.046, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (diagnostics) {
    ctx.strokeStyle = "#c6e9d544";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.strokeRect(
      rect.x + rect.width * 0.12,
      rect.y + rect.height * 0.16,
      rect.width * 0.76,
      rect.height * 0.68,
    );
    ctx.setLineDash([]);
    if (frame) {
      ctx.strokeStyle = "#c4f4dd99";
      ctx.lineWidth = 2;
      for (const person of frame.people) {
        const label = mapJoint(
          { x: person.box.x + person.box.width / 2, y: person.box.y },
          rect,
          mirror,
        );
        ctx.fillStyle = "#edf6dd";
        ctx.font = "11px Segoe UI";
        ctx.fillText(person.trackId || "Unassigned", label.x, label.y - 8);
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
  }
  // Rehearsal needs an aiming cursor even with camera diagnostics hidden.
  for (const contact of diagnostics || rehearsal ? contacts : []) {
    const point = mapJoint(contact, rect, mirror);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#d2f4ae";
    ctx.fill();
    ctx.strokeStyle = "#102b27";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 15, 0, Math.PI * 2);
    ctx.strokeStyle = "#d2f4ae66";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (const region of touchRegions) {
    const point = mapJoint(region, rect, mirror);
    ctx.beginPath();
    ctx.ellipse(
      point.x,
      point.y,
      region.radius * rect.width,
      region.radius * rect.height,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "#d2f4ae33";
    ctx.fill();
    ctx.strokeStyle = "#102b27d9";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = "#d2f4ae";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  return rect;
}
