import { BONES } from "../../../packages/motion/src/index";
import type { RigFrame, RigPoint, RigView } from "./rig-state";

const NS = "http://www.w3.org/2000/svg";
function shape(
  parent: SVGElement,
  name: string,
  attributes: Record<string, string | number>,
  text?: string,
) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes))
    element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
}
function surface(
  target: HTMLElement,
  width: number,
  height: number,
  label: string,
) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  target.replaceChildren(svg);
  return svg;
}

/** Canonical image pixels stay unmirrored. Missing joints never acquire display coordinates. */
export function renderRigView(target: HTMLElement, view: RigView) {
  const [width, height] = view.imageSize;
  const svg = surface(
    target,
    width,
    height,
    "Synthetic unmirrored camera-joint diagram",
  );
  shape(svg, "rect", { width, height, fill: "#172132" });
  for (let x = 0; x <= width; x += width / 8)
    shape(svg, "line", {
      x1: x,
      y1: 0,
      x2: x,
      y2: height,
      stroke: "#ffffff09",
    });
  for (let y = 0; y <= height; y += height / 5)
    shape(svg, "line", { x1: 0, y1: y, x2: width, y2: y, stroke: "#ffffff09" });
  const joints = new Map(view.joints.map((joint) => [joint.name, joint]));
  const visible = (name: RigView["joints"][number]["name"]) => {
    const joint = joints.get(name);
    return joint &&
      joint.x !== null &&
      joint.y !== null &&
      Number.isFinite(joint.x) &&
      Number.isFinite(joint.y) &&
      joint.x >= 0 &&
      joint.x < width &&
      joint.y >= 0 &&
      joint.y < height
      ? { x: joint.x, y: joint.y }
      : null;
  };
  for (const [a, b] of BONES) {
    const from = visible(a),
      to = visible(b);
    if (from && to)
      shape(svg, "line", {
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        stroke: "#72e0ed",
        "stroke-width": width / 260,
        "stroke-linecap": "round",
      });
  }
  for (const joint of view.joints) {
    const point = visible(joint.name);
    if (point)
      shape(svg, "circle", {
        cx: point.x,
        cy: point.y,
        r: width / 175,
        fill: joint.name.includes("hip") ? "#f4c875" : "#b8f3f7",
        stroke: "#172132",
        "stroke-width": width / 650,
      });
  }
}

/** A top view and height ruler explain metric coordinates without inventing a 3D scene. */
export function renderRigSpace(target: HTMLElement, frame: RigFrame) {
  const svg = surface(
    target,
    620,
    350,
    "Synthetic rig: XZ top view and Y height ruler",
  );
  shape(svg, "rect", { width: 620, height: 350, fill: "#f8fafd" });
  const map = (point: RigPoint) => ({
    x: 40 + ((point.x + 3) / 6) * 420,
    y: 300 - (point.z / 6) * 260,
  });
  shape(svg, "rect", {
    x: 40,
    y: 40,
    width: 420,
    height: 260,
    fill: "#edf4fc",
    stroke: "#b7cbe5",
  });
  for (let x = -3; x <= 3; x++) {
    const p = map({ x, y: 0, z: 0 });
    shape(svg, "line", {
      x1: p.x,
      y1: 40,
      x2: p.x,
      y2: 300,
      stroke: "#dce5f0",
    });
    shape(
      svg,
      "text",
      {
        x: p.x,
        y: 318,
        fill: "#52647a",
        "font-size": 11,
        "text-anchor": "middle",
      },
      String(x),
    );
  }
  for (let z = 0; z <= 6; z++) {
    const p = map({ x: 0, y: 0, z });
    shape(svg, "line", {
      x1: 40,
      y1: p.y,
      x2: 460,
      y2: p.y,
      stroke: "#dce5f0",
    });
    shape(
      svg,
      "text",
      {
        x: 29,
        y: p.y + 4,
        fill: "#52647a",
        "font-size": 11,
        "text-anchor": "end",
      },
      String(z),
    );
  }
  shape(
    svg,
    "text",
    { x: 40, y: 23, fill: "#415774", "font-size": 12, "font-weight": 600 },
    "Z · into play area (m)",
  );
  shape(
    svg,
    "text",
    {
      x: 250,
      y: 340,
      fill: "#415774",
      "font-size": 12,
      "text-anchor": "middle",
    },
    "X · participant screen-right (m)",
  );
  shape(svg, "line", {
    x1: 185,
    y1: 300,
    x2: 315,
    y2: 300,
    stroke: "#435874",
    "stroke-width": 4,
  });
  shape(
    svg,
    "text",
    {
      x: 250,
      y: 270,
      fill: "#52647a",
      "font-size": 10,
      "text-anchor": "middle",
    },
    "Display / floor origin",
  );
  for (const view of frame.views) {
    const p = map(view.positionM);
    // Keep labels apart even for nearly coincident cameras; leaders retain true positions.
    const labelX = view.role === "primary" ? 92 : 408;
    shape(svg, "line", {
      x1: labelX,
      y1: 289,
      x2: p.x,
      y2: p.y - 7,
      stroke: "#8297b3",
      "stroke-width": 1,
    });
    shape(svg, "rect", {
      x: p.x - 7,
      y: p.y - 6,
      width: 14,
      height: 12,
      rx: 2,
      fill: "#536a89",
    });
    shape(
      svg,
      "text",
      {
        x: labelX,
        y: 285,
        fill: "#415774",
        "font-size": 11,
        "text-anchor": "middle",
      },
      view.role === "primary" ? "Reference" : "Supporting",
    );
  }
  const reference = map(frame.reference.root);
  shape(svg, "circle", {
    cx: reference.x,
    cy: reference.y,
    r: 8,
    fill: "#f4c875",
    stroke: "#946c21",
    "stroke-width": 1.5,
  });
  const root = frame.reconstruction.root;
  if (root) {
    const p = map(root);
    shape(svg, "line", {
      x1: reference.x,
      y1: reference.y,
      x2: p.x,
      y2: p.y,
      stroke: "#8b7046",
      "stroke-dasharray": "4 3",
    });
    shape(svg, "circle", {
      cx: p.x,
      cy: p.y,
      r: 5,
      fill: "#235ac4",
      stroke: "white",
      "stroke-width": 1.5,
    });
  }
  shape(
    svg,
    "text",
    {
      x: 535,
      y: 23,
      fill: "#415774",
      "font-size": 12,
      "text-anchor": "middle",
      "font-weight": 600,
    },
    "Y · up (m)",
  );
  shape(svg, "line", {
    x1: 535,
    y1: 40,
    x2: 535,
    y2: 300,
    stroke: "#b7cbe5",
    "stroke-width": 2,
  });
  for (const y of [0, 1, 2, 2.6]) {
    const at = 300 - (y / 2.6) * 260;
    shape(svg, "line", { x1: 529, y1: at, x2: 541, y2: at, stroke: "#8297b3" });
    shape(
      svg,
      "text",
      { x: 550, y: at + 4, fill: "#52647a", "font-size": 11 },
      String(y),
    );
  }
  shape(svg, "circle", {
    cx: 535,
    cy: 300 - (frame.reference.root.y / 2.6) * 260,
    r: 8,
    fill: "#f4c875",
    stroke: "#946c21",
  });
  if (root)
    shape(svg, "circle", {
      cx: 535,
      cy: 300 - (root.y / 2.6) * 260,
      r: 5,
      fill: "#235ac4",
      stroke: "white",
      "stroke-width": 1.5,
    });
}
