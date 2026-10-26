import { getStrokeOutlinePoints, getStrokePoints, type StrokeOptions } from 'perfect-freehand';
import type { Gesture, GesturePoints } from './types';

/** What a stroke needs to be drawn: the raw recorded centerline plus its brush */
export type StrokeStyle = Pick<Gesture, 'points' | 'width' | 'simulate_pressure'>;

const strokeOptions = (style: StrokeStyle, complete: boolean): StrokeOptions => ({
  size: style.width,
  smoothing: 0.5,
  thinning: 0.5,
  streamline: 0.5,
  easing: (t) => t,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
  simulatePressure: style.simulate_pressure,
  // A finished stroke must end on its last recorded point; without this streamline pulls the
  // end back toward the previous point, so every stroke stopped short of where the pen lifted
  last: complete
});

const average = (a: number, b: number) => (a + b) / 2;

/** Closed SVG path through a perfect-freehand outline polygon */
export function pointsToSvgPath(points: GesturePoints[], closed = true) {
  const len = points.length;

  if (len < 4) {
    return ``;
  }

  let a = points[0];
  let b = points[1];
  const c = points[2];

  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(
    2
  )},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(b[1], c[1]).toFixed(2)} T`;

  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i];
    b = points[i + 1];
    result += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(2)} `;
  }

  if (closed) {
    result += 'Z';
  }

  return result;
}

/** SVG path of a stroke that is still being drawn (no caching, the points change every move) */
export function getLiveStrokePath(style: StrokeStyle): string {
  if (!style.points.length) return '';
  const strokePoints = getStrokePoints(style.points, strokeOptions(style, false));
  // SAFETY: perfect-freehand returns [x, y] pairs; the tuple type is only lost in its typings.
  return pointsToSvgPath(
    getStrokeOutlinePoints(strokePoints, strokeOptions(style, false)) as GesturePoints[]
  );
}

/**
 * Everything needed to draw a finished stroke and reveal it progressively.
 *
 * The reveal works like a pen moving along the stroke's spine (the streamlined centerline the
 * outline was built around): the full outline is drawn once and clipped to the union of discs
 * and capsules swept along the spine up to the revealed length. The outline never changes shape
 * mid-animation, so the last frame is exactly the static stroke.
 */
export type StrokeRender = {
  /** SVG path of the complete stroke outline */
  path: string;
  /** Spine vertices, spaced a fraction of the brush radius apart */
  spine: GesturePoints[];
  /** Cumulative spine length at each vertex */
  distances: number[];
  /** Clip radius at each vertex: covers the outline's local half-width */
  radii: number[];
  /** Total spine length in canvas units; the animation's arc-length domain */
  length: number;
  /** Clip path of the whole spine, and where each vertex's disc ends inside it */
  clipPath: string;
  clipOffsets: number[];
};

const cache = new WeakMap<GesturePoints[], Map<string, StrokeRender>>();

/** Cached per points array, so re-rendering every animation frame doesn't rebuild static strokes */
export function getStrokeRender(style: StrokeStyle): StrokeRender {
  const key = `${style.width}|${style.simulate_pressure}`;
  let byStyle = cache.get(style.points);
  if (!byStyle) {
    byStyle = new Map();
    cache.set(style.points, byStyle);
  }
  let render = byStyle.get(key);
  if (!render) {
    render = buildStrokeRender(style);
    byStyle.set(key, render);
  }
  return render;
}

/** Slightly over-cover the outline so antialiased edges aren't shaved by the clip */
const CLIP_MARGIN = 1;

function buildStrokeRender(style: StrokeStyle): StrokeRender {
  if (!style.points.length) {
    return {
      path: '',
      spine: [],
      distances: [],
      radii: [],
      length: 0,
      clipPath: '',
      clipOffsets: []
    };
  }
  const options = strokeOptions(style, true);
  const strokePoints = getStrokePoints(style.points, options);
  // SAFETY: perfect-freehand returns [x, y] pairs; the tuple type is only lost in its typings.
  const outline = getStrokeOutlinePoints(strokePoints, options) as GesturePoints[];

  // Decimate the spine: the clip only needs vertices a fraction of the radius apart, and fewer
  // vertices keep the per-frame clip path small for long strokes
  const step = Math.max(1, style.width / 4);
  const spine: GesturePoints[] = [];
  const distances: number[] = [];
  let length = 0;
  for (let i = 0; i < strokePoints.length; i++) {
    const [x, y] = strokePoints[i]!.point;
    const prev = spine.at(-1);
    if (!prev) {
      spine.push([x, y]);
      distances.push(0);
      continue;
    }
    const segment = Math.hypot(x - prev[0], y - prev[1]);
    if (segment < step && i < strokePoints.length - 1) continue;
    if (segment === 0) continue;
    length += segment;
    spine.push([x, y]);
    distances.push(length);
  }

  // Each outline point is covered by the disc of its nearest spine vertex, so the clip reaches
  // the whole outline by the end. Where a stroke loops back near itself, the nearer pass claims
  // the point; it then lies inside that pass's own ink, so revealing it early doesn't show.
  const reach = spine.map(() => 0);
  for (const [ox, oy] of outline) {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < spine.length; i++) {
      const d = (spine[i]![0] - ox) ** 2 + (spine[i]![1] - oy) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    reach[best] = Math.max(reach[best]!, Math.sqrt(bestDistance));
  }
  const fallback = style.width / 2;
  const radii = reach.map((_, i) => {
    const local = Math.max(reach[i - 1] ?? 0, reach[i]!, reach[i + 1] ?? 0);
    return (local > 0 ? local : fallback) + CLIP_MARGIN;
  });

  let clipPath = '';
  const clipOffsets: number[] = [];
  for (let i = 0; i < spine.length; i++) {
    clipPath += circlePath(spine[i]!, radii[i]!);
    clipOffsets.push(clipPath.length);
    if (i < spine.length - 1) {
      clipPath += quadPath(spine[i]!, spine[i + 1]!, Math.max(radii[i]!, radii[i + 1]!));
    }
  }

  return { path: pointsToSvgPath(outline), spine, distances, radii, length, clipPath, clipOffsets };
}

/**
 * Clip path revealing the stroke up to `reveal` canvas units along its spine, or `null` once the
 * whole stroke is visible. Every sub-shape winds the same way, so with the default `nonzero` rule
 * overlapping shapes union instead of cancelling.
 */
export function getRevealClipPath(render: StrokeRender, reveal: number): string | null {
  const { spine, distances, radii, length } = render;
  if (reveal >= length) return null;
  if (reveal <= 0 || !spine.length) return '';

  // Last vertex at or before the revealed length
  let lo = 0;
  let hi = distances.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (distances[mid]! <= reveal) lo = mid;
    else hi = mid - 1;
  }
  const k = lo;
  const t = (reveal - distances[k]!) / (distances[k + 1]! - distances[k]!);
  const from = spine[k]!;
  const to = spine[k + 1]!;
  const tip: GesturePoints = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  const tipRadius = radii[k]! + (radii[k + 1]! - radii[k]!) * t;

  return (
    render.clipPath.slice(0, render.clipOffsets[k]) +
    quadPath(from, tip, Math.max(radii[k]!, tipRadius)) +
    circlePath(tip, tipRadius)
  );
}

const f = (n: number) => n.toFixed(2);

/** Full circle, drawn with positive (clockwise on screen) winding */
function circlePath([x, y]: GesturePoints, r: number): string {
  return `M${f(x + r)},${f(y)}A${f(r)},${f(r)} 0 1 1 ${f(x - r)},${f(y)}A${f(r)},${f(r)} 0 1 1 ${f(x + r)},${f(y)}Z`;
}

/** Corners of the rectangle of half-width `r` around segment a→b, with the same winding as circles */
export function quadCorners(a: GesturePoints, b: GesturePoints, r: number): GesturePoints[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len === 0) return [];
  const nx = (-(b[1] - a[1]) / len) * r;
  const ny = ((b[0] - a[0]) / len) * r;
  return [
    [a[0] + nx, a[1] + ny],
    [a[0] - nx, a[1] - ny],
    [b[0] - nx, b[1] - ny],
    [b[0] + nx, b[1] + ny]
  ];
}

function quadPath(a: GesturePoints, b: GesturePoints, r: number): string {
  const corners = quadCorners(a, b, r);
  if (!corners.length) return '';
  return `M${corners.map(([x, y]) => `${f(x)},${f(y)}`).join('L')}Z`;
}
