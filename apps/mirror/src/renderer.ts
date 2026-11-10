import type { Observation } from "../../../contracts/generated/observation";
import {
  containRect,
  isRenderableJoint,
  mapBox,
  mapJoint,
  visibleBones,
} from "../../../packages/motion/src/index";

export interface RenderOptions {
  mirror: boolean;
  showImage: boolean;
  showBoxes: boolean;
  confidence: number;
}
const COLORS = [
  "#72e0ed",
  "#f4c875",
  "#c7a5ff",
  "#ff9cab",
  "#a1dbba",
  "#a8c9ff",
];
function context(canvas: HTMLCanvasElement) {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (
    canvas.width !== Math.round(width * ratio) ||
    canvas.height !== Math.round(height * ratio)
  ) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true })!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}
export function drawStandby(canvas: HTMLCanvasElement) {
  const { ctx, width, height } = context(canvas);
  ctx.fillStyle = "#172132";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#ffffff08";
  ctx.lineWidth = 1;
  const spacing = 48;
  for (let x = 0; x <= width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#71809855";
  const x = width / 2,
    y = height / 2;
  ctx.beginPath();
  ctx.moveTo(x - 15, y);
  ctx.lineTo(x + 15, y);
  ctx.moveTo(x, y - 15);
  ctx.lineTo(x, y + 15);
  ctx.stroke();
}
export function drawFrame(
  canvas: HTMLCanvasElement,
  image: ImageBitmap,
  frame: Pick<Observation, "image" | "people">,
  options: RenderOptions,
) {
  const { ctx, width, height } = context(canvas);
  const rect = containRect(frame.image, { width, height });
  ctx.fillStyle = "#172132";
  ctx.fillRect(0, 0, width, height);
  if (options.showImage) {
    ctx.save();
    if (options.mirror) {
      ctx.translate(rect.x + rect.width, rect.y);
      ctx.scale(-1, 1);
    } else ctx.translate(rect.x, rect.y);
    ctx.drawImage(image, 0, 0, rect.width, rect.height);
    ctx.restore();
    ctx.fillStyle = "#0c162224";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  for (const [index, person] of frame.people.entries()) {
    // Color is a display cue; only the vision track is an association claim.
    const hash = [...(person.trackId || String(index))].reduce(
      (sum, character) => sum + character.charCodeAt(0),
      0,
    );
    const color =
      person.identity === "ambiguous"
        ? "#f4c875"
        : COLORS[hash % COLORS.length];
    const box = mapBox(person.box, rect, options.mirror);
    if (options.showBoxes) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      ctx.setLineDash(person.identity === "confident" ? [] : [6, 5]);
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.restore();
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Batch same-style segments: one outline/color stroke per body, not per bone.
    ctx.beginPath();
    for (const bone of visibleBones(person.joints, options.confidence)) {
      const a = mapJoint(bone.a, rect, options.mirror);
      const b = mapJoint(bone.b, rect, options.mirror);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = "#142035";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.beginPath();
    for (const joint of Object.values(person.joints)) {
      if (!isRenderableJoint(joint, options.confidence)) continue;
      const point = mapJoint(joint, rect, options.mirror);
      ctx.moveTo(point.x + 4, point.y);
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    }
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = "#172132";
    ctx.stroke();
    const label = person.trackId
      ? `Track ${person.trackId}`
      : "Identity uncertain";
    const compact = width < 480;
    const labelHeight = compact ? 20 : 25;
    ctx.font = `600 ${compact ? 10 : 12}px system-ui, sans-serif`;
    const labelWidth = ctx.measureText(label).width + 16;
    const labelX = Math.min(
      Math.max(box.x, rect.x + 4),
      rect.x + rect.width - labelWidth - 4,
    );
    const labelBottom = Math.max(rect.y + labelHeight, box.y - 3);
    ctx.fillStyle = "#162134e8";
    ctx.fillRect(labelX, labelBottom - labelHeight, labelWidth, labelHeight);
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(label, labelX + 8, labelBottom - labelHeight / 2);
  }
}
