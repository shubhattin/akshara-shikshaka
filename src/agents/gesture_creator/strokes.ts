import type { StrokeSpec } from './schemas';
import type { SkeletonGraph } from './skeleton';

/**
 * Stroke plans → stroke points. A plan walks the skeleton graph (or gives freehand waypoints,
 * or a dot); the result is smoothed and resampled into the `[x, y][]` a gesture stores.
 */

type Pt = [number, number];

/** A plan the model wrote that does not fit the graph; the message goes back to the model. */
export class StrokePlanError extends Error {}

/** Spacing of the output points in canvas units (playback paces by distance, not point count). */
const SPACING = 2;
const DENSE_STEP = 0.5;
/** Gaussian smoothing of graph walks, canvas units: irons out thinning wobble and junction jogs */
const PATH_SIGMA = 3;
const WAYPOINT_SIGMA = 1.2;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round1 = (v: number) => Math.round(v * 10) / 10;

export const pathLength = (pts: readonly Pt[]) => {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i]!, pts[i - 1]!);
  return total;
};

/** Points every `step` along the polyline (always keeping both ends). */
export function resample(pts: readonly Pt[], step: number): Pt[] {
  const clean = pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]!) > 1e-6);
  if (clean.length < 2) return clean.map((p) => [p[0], p[1]]);
  const out: Pt[] = [[clean[0]![0], clean[0]![1]]];
  let carry = 0;
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1]!;
    const b = clean[i]!;
    const seg = dist(a, b);
    let t = step - carry;
    while (t <= seg) {
      out.push([a[0] + ((b[0] - a[0]) * t) / seg, a[1] + ((b[1] - a[1]) * t) / seg]);
      t += step;
    }
    carry = seg - (t - step);
  }
  const last = clean.at(-1)!;
  if (dist(out.at(-1)!, last) > step * 0.25) out.push([last[0], last[1]]);
  else out[out.length - 1] = [last[0], last[1]];
  return out;
}

/** Gaussian smoothing over arc length with the ends pinned (edge values repeat). */
export function smooth(pts: readonly Pt[], sigma: number): Pt[] {
  const dense = resample(pts, DENSE_STEP);
  const s = sigma / DENSE_STEP;
  if (dense.length < 3 || s < 0.5) return dense;
  const radius = Math.ceil(3 * s);
  const kernel = Array.from({ length: 2 * radius + 1 }, (_, k) => Math.exp(-((k - radius) ** 2) / (2 * s * s)));
  const n = dense.length;
  return dense.map((_, i) => {
    let sx = 0, sy = 0, sw = 0;
    for (let k = -radius; k <= radius; k++) {
      const p = dense[Math.min(n - 1, Math.max(0, i + k))]!;
      const wk = kernel[k + radius]!;
      sx += p[0] * wk;
      sy += p[1] * wk;
      sw += wk;
    }
    return [sx / sw, sy / sw];
  });
}

/** Centripetal Catmull–Rom spline through the waypoints. */
export function catmullRom(points: readonly Pt[], samplesPerSegment = 24): Pt[] {
  if (points.length < 3) return points.map((p) => [p[0], p[1]]);
  const pts = [points[0]!, ...points, points.at(-1)!];
  const out: Pt[] = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2]!;
    const t0 = 0;
    const t1 = t0 + Math.sqrt(Math.max(dist(p0, p1), 1e-6));
    const t2 = t1 + Math.sqrt(Math.max(dist(p1, p2), 1e-6));
    const t3 = t2 + Math.sqrt(Math.max(dist(p2, p3), 1e-6));
    for (let k = 0; k < samplesPerSegment; k++) {
      const t = t1 + ((t2 - t1) * k) / samplesPerSegment;
      const lerp = (a: Pt, b: Pt, ta: number, tb: number): Pt => {
        const u = (t - ta) / (tb - ta);
        return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      };
      const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
      const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
      out.push(lerp(b1, b2, t1, t2));
    }
  }
  out.push([points.at(-1)![0], points.at(-1)![1]]);
  return out;
}

/** Shoelace area; on screen (y down) a visually counter-clockwise loop is negative. */
const signedArea = (pts: readonly Pt[]) => {
  let a = 0;
  for (let i = 1; i < pts.length; i++) a += pts[i - 1]![0] * pts[i]![1] - pts[i]![0] * pts[i - 1]![1];
  return a;
};

const parseCut = (cut: string) => {
  const match = /^(to|from)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(cut.replace(/\s+/g, ''));
  if (!match) return null;
  return { kind: match[1] as 'to' | 'from', at: [Number(match[2]), Number(match[3])] as Pt };
};

const nearestIndex = (pts: readonly Pt[], at: Pt) => {
  let best = 0;
  let bestD = Infinity;
  pts.forEach((p, i) => {
    const d = dist(p, at);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return { index: best, distance: bestD };
};

/**
 * A stroke may start with a `from=` cut edge or end with a `to=` cut edge without naming the
 * node beyond the cut (["E1|from=243,119","N2"], [..., "N1","E1|to=243,119"]): fill it in.
 */
function completeCutEnds(graph: SkeletonGraph, steps: readonly string[]): string[] {
  const out = [...steps];
  const edgeOf = (token: string) => graph.edges.find((e) => e.id === token.split('|')[0]!.split(':')[0]!.trim());
  if (out.length >= 2 && out[0]!.includes('|from=')) {
    const edge = edgeOf(out[0]!);
    if (edge && !edge.closed) out.unshift(out[1] === edge.to ? edge.from : edge.to);
  }
  if (out.length >= 2 && out.at(-1)!.includes('|to=')) {
    const edge = edgeOf(out.at(-1)!);
    if (edge && !edge.closed) out.push(out.at(-2) === edge.from ? edge.to : edge.from);
  }
  return out;
}

/** The centreline of a graph walk: ["N1","E2","N3", …]. */
export function walkPath(graph: SkeletonGraph, rawSteps: readonly string[]): { pts: Pt[]; startNode?: string; endNode?: string } {
  const steps = completeCutEnds(graph, rawSteps);
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges = new Map(graph.edges.map((e) => [e.id, e]));
  const nodeIds = () => graph.nodes.map((n) => n.id).join(', ');
  if (steps.length === 1) throw new StrokePlanError(`A path needs at least one edge: got only ${steps[0]}`);
  if (steps.length % 2 === 0) {
    throw new StrokePlanError(`A path alternates node, edge, node… and ends on a node: [${steps.join(', ')}]`);
  }
  const first = nodes.get(steps[0]!);
  if (!first) throw new StrokePlanError(`Unknown node ${steps[0]} (nodes: ${nodeIds()})`);
  let pts: Pt[] = [[first.x, first.y]];
  let startNode: string | undefined = first.id;
  let endNode: string | undefined;
  for (let i = 1; i < steps.length; i += 2) {
    const [token, cutText] = steps[i]!.split('|') as [string, string | undefined];
    const [edgeId, orient] = token.split(':') as [string, string | undefined];
    const edge = edges.get(edgeId.trim());
    const from = steps[i - 1]!;
    const to = steps[i + 1]!;
    if (!edge) throw new StrokePlanError(`Unknown edge ${edgeId} (edges: ${graph.edges.map((e) => e.id).join(', ')})`);
    if (!nodes.has(to)) throw new StrokePlanError(`Unknown node ${to} after ${edgeId}`);
    let seg: Pt[];
    if (edge.closed) {
      if (from !== edge.from || to !== edge.from) {
        throw new StrokePlanError(`${edge.id} is a closed loop at ${edge.from}: write ${edge.from}, ${edge.id}:cw|ccw, ${edge.from}`);
      }
      if (orient !== 'cw' && orient !== 'ccw') {
        throw new StrokePlanError(`${edge.id} is a closed loop: give its direction as "${edge.id}:cw" or "${edge.id}:ccw"`);
      }
      const ccw = signedArea(edge.points) < 0;
      seg = (orient === 'ccw') === ccw ? edge.points : [...edge.points].reverse();
    } else {
      const forward = edge.from === from && edge.to === to;
      const backward = edge.to === from && edge.from === to;
      if (!forward && !backward) {
        throw new StrokePlanError(`${edge.id} connects ${edge.from}–${edge.to}, not ${from}–${to}`);
      }
      seg = forward ? edge.points : [...edge.points].reverse();
    }
    if (cutText) {
      const cut = parseCut(cutText);
      if (!cut) throw new StrokePlanError(`Bad cut "${cutText}": use to=x,y or from=x,y`);
      const { index, distance } = nearestIndex(seg, cut.at);
      if (distance > Math.max(12, edge.width)) {
        throw new StrokePlanError(
          `Cut point ${cut.at.join(',')} is ${Math.round(distance)} px from ${edge.id}; pick a point on that edge (it runs from ${seg[0]!.join(',')} to ${seg.at(-1)!.join(',')})`
        );
      }
      if (cut.kind === 'to') {
        if (i !== steps.length - 2) throw new StrokePlanError(`"to=" cuts end the stroke: put ${steps[i]} last`);
        pts = [...pts, ...seg.slice(0, index + 1)];
        endNode = undefined;
        return { pts, startNode, endNode };
      }
      if (i !== 1) throw new StrokePlanError(`"from=" cuts start the stroke: put ${steps[i]} first`);
      pts = seg.slice(index);
      startNode = undefined;
    } else {
      pts.push(...seg);
    }
    const node = nodes.get(to)!;
    pts.push([node.x, node.y]);
    endNode = to;
  }
  return { pts, startNode, endNode };
}

/** Push a free end outward along its tangent while it stays on ink (thinning shortens ends). */
function extendEnd(pts: Pt[], atStart: boolean, reach: number, onInk: (p: Pt) => boolean): Pt[] {
  if (pts.length < 2 || reach <= 0) return pts;
  const end = atStart ? pts[0]! : pts.at(-1)!;
  // tangent from a point ~6 units in
  let inner = end;
  const seq = atStart ? pts : [...pts].reverse();
  for (const p of seq) {
    inner = p;
    if (dist(p, end) >= 6) break;
  }
  const len = dist(end, inner);
  if (len < 1e-3) return pts;
  const ux = (end[0] - inner[0]) / len;
  const uy = (end[1] - inner[1]) / len;
  let ext: Pt = end;
  for (let t = 1; t <= reach; t += 1) {
    const p: Pt = [end[0] + ux * t, end[1] + uy * t];
    if (!onInk(p)) break;
    ext = p;
  }
  if (ext === end) return pts;
  return atStart ? [ext, ...pts] : [...pts, ext];
}

export type BuiltStroke = { points: Pt[]; startNode?: string; endNode?: string };

/** One stroke spec → finished points (canvas units, one decimal). */
export function buildStroke(
  spec: StrokeSpec,
  graph: SkeletonGraph,
  onInk: (p: Pt) => boolean
): BuiltStroke {
  const finish = (pts: Pt[]) => resample(pts, SPACING).map(([x, y]) => [round1(x), round1(y)] as Pt);
  if ('dot' in spec) {
    const [x, y] = spec.dot;
    // a tiny circle, like a pen tap that wobbles a little
    return {
      points: Array.from({ length: 6 }, (_, k) => {
        const a = (k / 6) * Math.PI * 2;
        return [round1(x + Math.cos(a) * 1.5), round1(y + Math.sin(a) * 1.5)] as Pt;
      })
    };
  }
  if ('waypoints' in spec) {
    return { points: finish(smooth(catmullRom(spec.waypoints), WAYPOINT_SIGMA)) };
  }
  const walk = walkPath(graph, spec.path);
  let pts = smooth(walk.pts, PATH_SIGMA);
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const reach = graph.strokeWidth * 0.45;
  if (walk.startNode && nodes.get(walk.startNode)?.kind === 'end') pts = extendEnd(pts, true, reach, onInk);
  if (walk.endNode && nodes.get(walk.endNode)?.kind === 'end') pts = extendEnd(pts, false, reach, onInk);
  return { points: finish(pts), startNode: walk.startNode, endNode: walk.endNode };
}
