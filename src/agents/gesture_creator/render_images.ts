import { getStrokeRender } from '~/tools/stroke_data/stroke_render';
import { CANVAS_DIMS } from '~/tools/stroke_data/types';
import { context2d, type CanvasEnv } from './canvas_env';
import { strokeColor } from './draft_plan';
import type { DraftMark } from './schemas';
import type { GlyphMask, SkeletonGraph } from './skeleton';

/**
 * The pictures the Gesture Creator looks at (and the admin sees in the trace): the glyph on a
 * coordinate grid, the labelled skeleton graph, and drafted strokes with their direction and
 * order. Returned as PNG data URLs.
 *
 * The full-glyph images show a square crop around the ink (the glyph is usually under half the
 * 400×400 canvas), always VIEW_PX wide: more pixels per canvas unit than the whole canvas at
 * 800 px, at about half the image tokens. The grid keeps its canvas-unit labels.
 */

type Pt = [number, number];

/** Pixels per canvas unit of the order strip and close-up panels' source raster */
const SCALE = 2;
const SIZE = CANVAS_DIMS.width * SCALE;

/** Side of the cropped full-glyph images, px */
const VIEW_PX = 560;
/** Canvas units of margin around the ink */
const VIEW_PAD = 28;
/** Smallest crop, canvas units (a tiny glyph is not blown up past ~3.5 px per unit) */
const VIEW_MIN = 160;

/** The square of the canvas an image shows: top-left corner, side (canvas units), px per unit. */
type View = { x0: number; y0: number; side: number; k: number };

const inkBoxes = new WeakMap<GlyphMask, [number, number, number, number] | null>();

/** Bounding box of the glyph ink in canvas units (null for an empty mask). */
function inkBox(mask: GlyphMask): [number, number, number, number] | null {
  if (inkBoxes.has(mask)) return inkBoxes.get(mask)!;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue;
    const x = i % mask.width;
    const y = (i - x) / mask.width;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const box: [number, number, number, number] | null =
    x1 < 0
      ? null
      : [x0 / mask.scale, y0 / mask.scale, (x1 + 1) / mask.scale, (y1 + 1) / mask.scale];
  inkBoxes.set(mask, box);
  return box;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The crop around the ink and anything else drawn (strokes, marked areas). */
function viewAround(mask: GlyphMask, extra: readonly Pt[] = []): View {
  const box = inkBox(mask);
  const pts: Pt[] = box ? [[box[0], box[1]], [box[2], box[3]], ...extra] : [...extra];
  if (pts.length === 0)
    return { x0: 0, y0: 0, side: CANVAS_DIMS.width, k: VIEW_PX / CANVAS_DIMS.width };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [bx0, bx1, by0, by1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const side = Math.round(
    clamp(Math.max(bx1 - bx0, by1 - by0) + 2 * VIEW_PAD, VIEW_MIN, CANVAS_DIMS.width)
  );
  const x0 = Math.round(clamp((bx0 + bx1) / 2 - side / 2, 0, CANVAS_DIMS.width - side));
  const y0 = Math.round(clamp((by0 + by1) / 2 - side / 2, 0, CANVAS_DIMS.height - side));
  return { x0, y0, side, k: VIEW_PX / side };
}

const toView = (view: View, [x, y]: Pt): Pt => [(x - view.x0) * view.k, (y - view.y0) * view.k];

/** The glyph ink of the view, scaled to fill the image. */
function drawGlyphView(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  mask: GlyphMask,
  view: View
) {
  const s = mask.scale;
  ctx.drawImage(
    layer,
    view.x0 * s,
    view.y0 * s,
    view.side * s,
    view.side * s,
    0,
    0,
    VIEW_PX,
    VIEW_PX
  );
}

function canvas(env: CanvasEnv, width = SIZE, height = SIZE) {
  const el = env.createCanvas(width, height);
  const ctx = context2d(el);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  return { el, ctx };
}

const glyphLayers = new WeakMap<GlyphMask, Map<string, HTMLCanvasElement>>();

/** The glyph ink in one colour, as a canvas to draw (cached per mask and colour). */
function glyphLayer(env: CanvasEnv, mask: GlyphMask, rgba: [number, number, number, number]) {
  const key = rgba.join(',');
  let byColour = glyphLayers.get(mask);
  if (!byColour) {
    byColour = new Map();
    glyphLayers.set(mask, byColour);
  }
  const cached = byColour.get(key);
  if (cached) return cached;
  const el = env.createCanvas(mask.width, mask.height);
  const ctx = context2d(el);
  const img = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue;
    img.data.set(rgba, i * 4);
  }
  ctx.putImageData(img, 0, 0);
  byColour.set(key, el);
  return el;
}

/** Grid lines every 25 canvas units, labelled every 50 along the top and left edges. */
function paintGrid(env: CanvasEnv, ctx: CanvasRenderingContext2D, view: View, strong: boolean) {
  const lines = (from: number) => {
    const out: number[] = [];
    for (let v = Math.ceil(from / 25) * 25; v <= from + view.side; v += 25) out.push(v);
    return out;
  };
  ctx.save();
  for (const [axis, from] of [
    ['x', view.x0],
    ['y', view.y0]
  ] as const) {
    for (const v of lines(from)) {
      const major = v % 50 === 0;
      ctx.strokeStyle = major ? (strong ? '#a3a3a3' : '#d4d4d4') : strong ? '#d4d4d4' : '#ececec';
      ctx.lineWidth = 1;
      const at = Math.round((v - from) * view.k) + 0.5;
      ctx.beginPath();
      if (axis === 'x') {
        ctx.moveTo(at, 0);
        ctx.lineTo(at, VIEW_PX);
      } else {
        ctx.moveTo(0, at);
        ctx.lineTo(VIEW_PX, at);
      }
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#c2410c';
  ctx.font = `600 14px ${env.labelFamily}`;
  ctx.textBaseline = 'top';
  for (const v of lines(view.x0)) {
    const at = (v - view.x0) * view.k;
    if (v % 50 === 0 && v > 0 && at > 24 && at < VIEW_PX - 30) ctx.fillText(String(v), at + 3, 3);
  }
  for (const v of lines(view.y0)) {
    const at = (v - view.y0) * view.k;
    if (v % 50 === 0 && v > 0 && at > 24 && at < VIEW_PX - 18) ctx.fillText(String(v), 3, at + 3);
  }
  ctx.restore();
}

function label(
  env: CanvasEnv,
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
) {
  ctx.save();
  ctx.font = `700 16px ${env.labelFamily}`;
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
export function renderGlyphImage(env: CanvasEnv, mask: GlyphMask): string {
  const view = viewAround(mask);
  const { el, ctx } = canvas(env, VIEW_PX, VIEW_PX);
  drawGlyphView(ctx, glyphLayer(env, mask, [38, 38, 38, 255]), mask, view);
  paintGrid(env, ctx, view, true);
  return el.toDataURL('image/png');
}

/** The skeleton graph over the faint glyph: coloured, labelled edges and black nodes. */
export function renderSkeletonImage(env: CanvasEnv, mask: GlyphMask, graph: SkeletonGraph): string {
  const view = viewAround(mask, [
    ...graph.nodes.map((n): Pt => [n.x, n.y]),
    ...graph.dots.flatMap((d): Pt[] => [
      [d.x - d.r, d.y - d.r],
      [d.x + d.r, d.y + d.r]
    ])
  ]);
  const at = (p: Pt) => toView(view, p);
  const { el, ctx } = canvas(env, VIEW_PX, VIEW_PX);
  drawGlyphView(ctx, glyphLayer(env, mask, [212, 212, 212, 255]), mask, view);
  paintGrid(env, ctx, view, false);
  graph.edges.forEach((edge, index) => {
    const color = strokeColor(index);
    const pts = edge.points.map(at);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
    const mid = pts[Math.floor(pts.length / 2)]!;
    label(env, ctx, edge.closed ? `${edge.id} loop` : edge.id, mid[0], mid[1], color);
  });
  for (const node of graph.nodes) {
    const [x, y] = at([node.x, node.y]);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `700 16px ${env.labelFamily}`;
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeText(node.id, x + 10, y + 18);
    ctx.fillText(node.id, x + 10, y + 18);
  }
  for (const knot of graph.knots) {
    ctx.save();
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    const [kx, ky] = at([knot.x, knot.y]);
    ctx.beginPath();
    ctx.arc(kx, ky, knot.r * view.k + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    label(env, ctx, knot.id, kx + knot.r * view.k + 16, ky - knot.r * view.k - 8, '#ea580c');
  }
  for (const dot of graph.dots) {
    const [dx, dy] = at([dot.x, dot.y]);
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(dx, dy, dot.r * view.k + 6, 0, Math.PI * 2);
    ctx.stroke();
    label(env, ctx, dot.id, dx, dy - dot.r * view.k - 18, '#7c3aed');
  }
  return el.toDataURL('image/png');
}

export type DrawnStroke = { points: Pt[]; width: number };

/** Stroke fill in canvas units; `view` maps them to the image, else to the SCALE raster. */
function paintStroke(
  env: CanvasEnv,
  ctx: CanvasRenderingContext2D,
  stroke: DrawnStroke,
  color: string,
  alpha: number,
  view?: View
) {
  const render = getStrokeRender({
    points: stroke.points,
    width: stroke.width,
    simulate_pressure: false
  });
  ctx.save();
  if (view) ctx.transform(view.k, 0, 0, view.k, -view.x0 * view.k, -view.y0 * view.k);
  else ctx.scale(SCALE, SCALE);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  if (render.path) ctx.fill(env.createPath(render.path));
  ctx.restore();
}

/** Drafted (or saved) strokes over the faint glyph: fills, centrelines, start dots, numbers and arrows. */
export function renderStrokesImage(
  env: CanvasEnv,
  mask: GlyphMask,
  strokes: DrawnStroke[],
  options: { uncovered?: { from: Pt; to: Pt; points: Pt[] }[]; marks?: DraftMark[] } = {}
): string {
  const view = viewAround(mask, [
    ...strokes.flatMap((stroke) => stroke.points),
    ...(options.marks ?? []).flatMap((m): Pt[] => [
      [m.x - m.r, m.y - m.r],
      [m.x + m.r, m.y + m.r]
    ])
  ]);
  const at = (p: Pt) => toView(view, p);
  const { el, ctx } = canvas(env, VIEW_PX, VIEW_PX);
  drawGlyphView(ctx, glyphLayer(env, mask, [200, 200, 200, 255]), mask, view);
  paintGrid(env, ctx, view, false);
  strokes.forEach((stroke, index) => paintStroke(env, ctx, stroke, strokeColor(index), 0.35, view));
  for (const gap of options.uncovered ?? []) {
    const pts = gap.points.map(at);
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
    const pts = stroke.points.map(at);
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
    const [sx, sy] = at(stroke.points[0]!);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    label(env, ctx, String(index + 1), sx + 18, sy - 18, color);
  });
  for (const mark of options.marks ?? []) paintMark(env, ctx, mark, view);
  return el.toDataURL('image/png');
}

/** An area the admin marked: a dashed red ring with its letter. */
function paintMark(env: CanvasEnv, ctx: CanvasRenderingContext2D, mark: DraftMark, view: View) {
  const [x, y] = toView(view, [mark.x, mark.y]);
  const r = mark.r * view.k;
  ctx.save();
  ctx.fillStyle = 'rgba(220,38,38,0.08)';
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  label(env, ctx, mark.id, x + r * 0.72 + 12, y - r * 0.72 - 12, '#dc2626');
}

/**
 * One small panel per stroke, cropped to the glyph: earlier strokes in grey, the current one in
 * colour with its arrow — the writing order at a glance.
 */
export function renderOrderStrip(
  env: CanvasEnv,
  mask: GlyphMask,
  strokes: DrawnStroke[],
  box: [number, number, number, number]
): string {
  const pad = 24;
  const [bx0, by0, bx1, by1] = box;
  const side = Math.max(bx1 - bx0, by1 - by0) + pad * 2;
  const cx = (bx0 + bx1) / 2;
  const cy = (by0 + by1) / 2;
  const panel = 240;
  const perRow = Math.min(4, Math.max(1, strokes.length));
  const rows = Math.ceil(strokes.length / perRow);
  const { el, ctx } = canvas(env, panel * perRow, panel * rows);
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
    ctx.drawImage(glyphLayer(env, mask, [226, 226, 226, 255]), 0, 0, SIZE, SIZE);
    strokes.slice(0, index).forEach((stroke) => paintStroke(env, ctx, stroke, '#737373', 0.55));
    const color = strokeColor(index);
    paintStroke(env, ctx, strokes[index]!, color, 0.85);
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
    label(env, ctx, `Stroke ${index + 1}`, ox + 46, oy + 18, color);
  });
  return el.toDataURL('image/png');
}

export type CloseupArea = { label: string; x: number; y: number; r: number };

/**
 * Enlarged views of small places that are hard to judge on the full image (knots, crossings):
 * one panel each, the strokes in their colours with direction arrows.
 */
export function renderCloseups(
  env: CanvasEnv,
  mask: GlyphMask,
  strokes: DrawnStroke[],
  areas: CloseupArea[]
): string {
  const panel = 320;
  const perRow = Math.min(3, Math.max(1, areas.length));
  const rows = Math.ceil(areas.length / perRow);
  const { el, ctx } = canvas(env, panel * perRow, panel * rows);
  areas.forEach((area, index) => {
    const side = Math.max(48, area.r * 2.6);
    const k = panel / (side * SCALE);
    const ox = (index % perRow) * panel;
    const oy = Math.floor(index / perRow) * panel;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, panel, panel);
    ctx.clip();
    ctx.translate(ox, oy);
    ctx.scale(k, k);
    ctx.translate(-(area.x - side / 2) * SCALE, -(area.y - side / 2) * SCALE);
    ctx.drawImage(glyphLayer(env, mask, [205, 205, 205, 255]), 0, 0, SIZE, SIZE);
    strokes.forEach((stroke, i) => paintStroke(env, ctx, stroke, strokeColor(i), 0.35));
    strokes.forEach((stroke, i) => {
      const color = strokeColor(i);
      const pts = toRaster(stroke.points);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5 / k;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      arrowsAlong(ctx, pts, color, 40);
    });
    ctx.restore();
    ctx.strokeStyle = '#e5e5e5';
    ctx.strokeRect(ox + 0.5, oy + 0.5, panel - 1, panel - 1);
    label(env, ctx, area.label, ox + 60, oy + 18, '#ea580c');
  });
  return el.toDataURL('image/png');
}

/** The glyph alone in light grey on a transparent canvas, to sit under stroke previews. */
export function renderGlyphBackground(env: CanvasEnv, mask: GlyphMask): string {
  const el = env.createCanvas(SIZE, SIZE);
  context2d(el).drawImage(glyphLayer(env, mask, [215, 215, 215, 255]), 0, 0, SIZE, SIZE);
  return el.toDataURL('image/png');
}
