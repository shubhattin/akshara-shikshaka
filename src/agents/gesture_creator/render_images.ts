import { getStrokeRender } from '~/tools/stroke_data/stroke_render';
import { CANVAS_DIMS } from '~/tools/stroke_data/types';
import type { GlyphMask, SkeletonGraph } from './skeleton';

/**
 * The pictures the Gesture Creator looks at (and the admin sees in the trace): the glyph on a
 * coordinate grid, the labelled skeleton graph, and drafted strokes with their direction and
 * order. Drawn on an 800×800 canvas (2 px per canvas unit) and returned as PNG data URLs.
 */

type Pt = [number, number];

const SCALE = 2;
const SIZE = CANVAS_DIMS.width * SCALE;

export const STROKE_COLORS = [
  '#e5484d',
  '#0161fd',
  '#30a46c',
  '#f76b15',
  '#8e4ec6',
  '#12a594',
  '#d6409f',
  '#ad7f58',
  '#3e63dd',
  '#978365',
  '#e54666',
  '#46a758'
];
const strokeColor = (index: number) => STROKE_COLORS[index % STROKE_COLORS.length]!;

function canvas(width = SIZE, height = SIZE) {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  return { el, ctx };
}

const glyphLayers = new WeakMap<GlyphMask, Map<string, HTMLCanvasElement>>();

/** The glyph ink in one colour, as a canvas to draw (cached per mask and colour). */
function glyphLayer(mask: GlyphMask, rgba: [number, number, number, number]) {
  const key = rgba.join(',');
  let byColour = glyphLayers.get(mask);
  if (!byColour) {
    byColour = new Map();
    glyphLayers.set(mask, byColour);
  }
  const cached = byColour.get(key);
  if (cached) return cached;
  const el = document.createElement('canvas');
  el.width = mask.width;
  el.height = mask.height;
  const ctx = el.getContext('2d')!;
  const img = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue;
    img.data.set(rgba, i * 4);
  }
  ctx.putImageData(img, 0, 0);
  byColour.set(key, el);
  return el;
}

function paintGrid(ctx: CanvasRenderingContext2D, strong: boolean) {
  ctx.save();
  for (let v = 0; v <= CANVAS_DIMS.width; v += 25) {
    const major = v % 50 === 0;
    ctx.strokeStyle = major ? (strong ? '#a3a3a3' : '#d4d4d4') : strong ? '#d4d4d4' : '#ececec';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(v * SCALE + 0.5, 0);
    ctx.lineTo(v * SCALE + 0.5, SIZE);
    ctx.moveTo(0, v * SCALE + 0.5);
    ctx.lineTo(SIZE, v * SCALE + 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = '#c2410c';
  ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  for (let v = 50; v < CANVAS_DIMS.width; v += 50) {
    ctx.fillText(String(v), v * SCALE + 3, 3);
    ctx.fillText(String(v), 3, v * SCALE + 3);
  }
  ctx.restore();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.font = '700 16px ui-sans-serif, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 11, w, 22, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

function arrowHead(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, color: string, size = 11) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(to[0], to[1]);
  ctx.lineTo(to[0] - size * Math.cos(angle - 0.45), to[1] - size * Math.sin(angle - 0.45));
  ctx.lineTo(to[0] - size * Math.cos(angle + 0.45), to[1] - size * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

/** Arrowheads along a polyline (raster units) every `every` px, plus one at the end. */
function arrowsAlong(ctx: CanvasRenderingContext2D, pts: Pt[], color: string, every = 110) {
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    run += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    if (run >= every && i < pts.length - 4) {
      arrowHead(ctx, pts[Math.max(0, i - 3)]!, pts[i]!, color);
      run = 0;
    }
  }
  if (pts.length >= 2) arrowHead(ctx, pts[Math.max(0, pts.length - 4)]!, pts.at(-1)!, color, 13);
}

const toRaster = (pts: readonly Pt[]): Pt[] => pts.map(([x, y]) => [x * SCALE, y * SCALE]);

/** The glyph in dark ink on the coordinate grid. */
export function renderGlyphImage(mask: GlyphMask): string {
  const { el, ctx } = canvas();
  ctx.drawImage(glyphLayer(mask, [38, 38, 38, 255]), 0, 0, SIZE, SIZE);
  paintGrid(ctx, true);
  return el.toDataURL('image/png');
}

/** The skeleton graph over the faint glyph: coloured, labelled edges and black nodes. */
export function renderSkeletonImage(mask: GlyphMask, graph: SkeletonGraph): string {
  const { el, ctx } = canvas();
  ctx.drawImage(glyphLayer(mask, [212, 212, 212, 255]), 0, 0, SIZE, SIZE);
  paintGrid(ctx, false);
  graph.edges.forEach((edge, index) => {
    const color = strokeColor(index);
    const pts = toRaster(edge.points);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
    const mid = pts[Math.floor(pts.length / 2)]!;
    label(ctx, edge.closed ? `${edge.id} ⟲` : edge.id, mid[0], mid[1], color);
  });
  for (const node of graph.nodes) {
    const x = node.x * SCALE;
    const y = node.y * SCALE;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '700 16px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeText(node.id, x + 10, y + 18);
    ctx.fillText(node.id, x + 10, y + 18);
  }
  for (const dot of graph.dots) {
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(dot.x * SCALE, dot.y * SCALE, dot.r * SCALE + 6, 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, dot.id, dot.x * SCALE, (dot.y - dot.r) * SCALE - 18, '#7c3aed');
  }
  return el.toDataURL('image/png');
}

export type DrawnStroke = { points: Pt[]; width: number };

function paintStroke(ctx: CanvasRenderingContext2D, stroke: DrawnStroke, color: string, alpha: number) {
  const render = getStrokeRender({ points: stroke.points, width: stroke.width, simulate_pressure: false });
  ctx.save();
  ctx.scale(SCALE, SCALE);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  if (render.path) ctx.fill(new Path2D(render.path));
  ctx.restore();
}

/** Drafted (or saved) strokes over the faint glyph: fills, centrelines, start dots, numbers and arrows. */
export function renderStrokesImage(
  mask: GlyphMask,
  strokes: DrawnStroke[],
  options: { uncovered?: { from: Pt; to: Pt; points: Pt[] }[] } = {}
): string {
  const { el, ctx } = canvas();
  ctx.drawImage(glyphLayer(mask, [200, 200, 200, 255]), 0, 0, SIZE, SIZE);
  paintGrid(ctx, false);
  strokes.forEach((stroke, index) => paintStroke(ctx, stroke, strokeColor(index), 0.35));
  for (const gap of options.uncovered ?? []) {
    const pts = toRaster(gap.points);
    ctx.save();
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 5;
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
  }
  strokes.forEach((stroke, index) => {
    const color = strokeColor(index);
    const pts = toRaster(stroke.points);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
    arrowsAlong(ctx, pts, color);
  });
  strokes.forEach((stroke, index) => {
    const color = strokeColor(index);
    const [sx, sy] = toRaster([stroke.points[0]!])[0]!;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    label(ctx, String(index + 1), sx + 18, sy - 18, color);
  });
  return el.toDataURL('image/png');
}

/**
 * One small panel per stroke, cropped to the glyph: earlier strokes in grey, the current one in
 * colour with its arrow — the writing order at a glance.
 */
export function renderOrderStrip(
  mask: GlyphMask,
  strokes: DrawnStroke[],
  box: [number, number, number, number]
): string {
  const pad = 24;
  const [bx0, by0, bx1, by1] = box;
  const side = Math.max(bx1 - bx0, by1 - by0) + pad * 2;
  const cx = (bx0 + bx1) / 2;
  const cy = (by0 + by1) / 2;
  const panel = 300;
  const perRow = Math.min(4, Math.max(1, strokes.length));
  const rows = Math.ceil(strokes.length / perRow);
  const { el, ctx } = canvas(panel * perRow, panel * rows);
  const k = panel / (side * SCALE);
  strokes.forEach((_, index) => {
    const ox = (index % perRow) * panel;
    const oy = Math.floor(index / perRow) * panel;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, panel, panel);
    ctx.clip();
    ctx.translate(ox, oy);
    ctx.scale(k, k);
    ctx.translate(-(cx - side / 2) * SCALE, -(cy - side / 2) * SCALE);
    ctx.drawImage(glyphLayer(mask, [226, 226, 226, 255]), 0, 0, SIZE, SIZE);
    strokes.slice(0, index).forEach((stroke) => paintStroke(ctx, stroke, '#737373', 0.55));
    const color = strokeColor(index);
    paintStroke(ctx, strokes[index]!, color, 0.85);
    const pts = toRaster(strokes[index]!.points);
    arrowsAlong(ctx, pts, '#111111', 90);
    const [sx, sy] = pts[0]!;
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(sx, sy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#e5e5e5';
    ctx.strokeRect(ox + 0.5, oy + 0.5, panel - 1, panel - 1);
    label(ctx, `Stroke ${index + 1}`, ox + 46, oy + 18, color);
  });
  return el.toDataURL('image/png');
}

/** The glyph alone in light grey on a transparent canvas, to sit under stroke previews. */
export function renderGlyphBackground(mask: GlyphMask): string {
  const el = document.createElement('canvas');
  el.width = SIZE;
  el.height = SIZE;
  el.getContext('2d')!.drawImage(glyphLayer(mask, [215, 215, 215, 255]), 0, 0, SIZE, SIZE);
  return el.toDataURL('image/png');
}
