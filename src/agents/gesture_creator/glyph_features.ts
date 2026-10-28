import type { SkeletonEdge, SkeletonNode } from './skeleton';

/**
 * Features of a glyph that the bare skeleton loses and handwriting needs:
 * - knots: round blobs of ink much thicker than the strokes running into them. Fonts fill small
 *   loops in (the lower knot of क्ष, the starting curls of म, भ, न), and Telugu/Kannada fonts end
 *   strokes in ball terminals. Thinning shrinks a blob to a point or a pruned spur, so the
 *   skeleton has no loop there.
 * - straight-through pairs: at a junction (or a crossing split into two junctions joined by a
 *   short connector), which edges continue into each other without turning. A pen crossing a
 *   loop's neck goes straight through; it does not turn back.
 */

type Pt = [number, number];

export type SkeletonKnot = {
  id: string;
  x: number;
  y: number;
  /** Radius of the blob (largest circle inside the ink), canvas units */
  r: number;
  /** end: at a stroke's end (a curl the stroke starts with, or a ball end); through: mid-stroke */
  at: 'end' | 'through';
};

export type StraightThrough = {
  /** The junction node(s): two for a crossing split by a short connector */
  nodes: string[];
  /** The connector edge between them, if any */
  via?: string;
  /** Edge ends that continue straight into each other, "E5@N4" = edge E5 where it meets N4 */
  pairs: [string, string][];
};

/** Thickness, as a multiple of the median half-width, where a blob starts to count. */
const HOT = 1.45;
/** A knot's peak thickness, as a multiple of the median half-width. */
const KNOT_PEAK = 1.65;
/** The strokes into a knot are at most this thick, relative to the knot, 2.2 radii away. */
const KNOT_SIDE = 0.62;
/** The thickest core of a knot is round, not a long thick run (a heavy curve). */
const KNOT_ELONGATION = 2.2;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round1 = (value: number) => Math.round(value * 10) / 10;

/** Pixels connected to `start` (4-neighbours) where `keep` holds. */
function flood(start: number, w: number, h: number, keep: (i: number) => boolean): number[] {
  const seen = new Set([start]);
  const stack = [start];
  const out: number[] = [];
  while (stack.length) {
    const i = stack.pop()!;
    out.push(i);
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!seen.has(j) && keep(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return out;
}

/** Length of the long axis of a pixel set over its peak radius: ~1–2 for a round blob. */
function elongation(pixels: number[], w: number, peak: number): number {
  let mx = 0,
    my = 0;
  for (const i of pixels) {
    mx += i % w;
    my += Math.floor(i / w);
  }
  mx /= pixels.length;
  my /= pixels.length;
  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (const i of pixels) {
    const a = (i % w) - mx;
    const b = Math.floor(i / w) - my;
    sxx += a * a;
    syy += b * b;
    sxy += a * b;
  }
  const n = pixels.length;
  const tr = (sxx + syy) / n;
  const det = (sxx * syy - sxy * sxy) / (n * n);
  const major = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  return (4 * Math.sqrt(major)) / peak;
}

type Side = { thickness: number } | { endsAt: string };

/** Walk `reach` units both ways along the edge from point `index`: how thick is the ink there? */
function sidesOf(
  edge: SkeletonEdge,
  index: number,
  reach: number,
  thickness: (p: Pt) => number
): Side[] {
  return [-1, 1].map((step): Side => {
    let i = index;
    let run = 0;
    while (run < reach && i + step >= 0 && i + step < edge.points.length) {
      run += dist(edge.points[i]!, edge.points[i + step]!);
      i += step;
    }
    if (run < reach * 0.9) return { endsAt: step < 0 ? edge.from : edge.to };
    return { thickness: thickness(edge.points[i]!) };
  });
}

/**
 * Round blobs of ink. `dist` is the distance transform of the (closed) ink raster, `skip` marks
 * pixels to leave out (separate dots).
 */
export function findKnots(input: {
  dist: Float32Array;
  w: number;
  h: number;
  scale: number;
  strokeWidthPx: number;
  skip: (i: number) => boolean;
  nodes: SkeletonNode[];
  edges: SkeletonEdge[];
}): SkeletonKnot[] {
  const { dist: dt, w, h, scale, nodes, edges } = input;
  const half = input.strokeWidthPx / 2;
  const kindOf = new Map(nodes.map((n) => [n.id, n.kind]));
  const thickness = ([x, y]: Pt) => dt[Math.round(y * scale) * w + Math.round(x * scale)] ?? 0;
  const seen = new Uint8Array(dt.length);
  const knots: SkeletonKnot[] = [];
  for (let start = 0; start < dt.length; start++) {
    if (seen[start] || dt[start]! < HOT * half || input.skip(start)) continue;
    const blob = flood(start, w, h, (i) => dt[i]! >= HOT * half && !input.skip(i));
    for (const i of blob) seen[i] = 1;
    if (blob.length <= 4) continue;
    let best = blob[0]!;
    for (const i of blob) if (dt[i]! > dt[best]!) best = i;
    const peak = dt[best]!;
    if (peak < KNOT_PEAK * half) continue;
    const core = flood(best, w, h, (i) => dt[i]! >= 0.8 * peak);
    if (elongation(core, w, peak) > KNOT_ELONGATION) continue;
    const bx = best % w;
    const centre: Pt = [bx / scale, (best - bx) / w / scale];
    const r = peak / scale;
    // the skeleton edge nearest the blob (the blob's own spur is often pruned away)
    let nearest: { edge: SkeletonEdge; index: number; d: number } | undefined;
    for (const edge of edges) {
      edge.points.forEach((p, index) => {
        const d = dist(p, centre);
        if (!nearest || d < nearest.d) nearest = { edge, index, d };
      });
    }
    if (!nearest || nearest.d > r + half / scale) continue;
    const sides = sidesOf(nearest.edge, nearest.index, 2.2 * r, (p) => thickness(p) / peak);
    if (sides.some((s) => 'thickness' in s && s.thickness > KNOT_SIDE)) continue;
    const atEnd = sides.some((s) => 'endsAt' in s && kindOf.get(s.endsAt) === 'end');
    if (!atEnd && sides.every((s) => 'endsAt' in s)) continue;
    knots.push({
      id: '',
      x: round1(centre[0]),
      y: round1(centre[1]),
      r: round1(r),
      at: atEnd ? 'end' : 'through'
    });
  }
  knots.sort((p, q) => Math.round(p.y / 8) - Math.round(q.y / 8) || p.x - q.x);
  knots.forEach((knot, k) => (knot.id = `K${k + 1}`));
  return knots;
}

type EdgeEnd = { ref: string; dir: Pt };

/** Unit direction an edge leaves `node` in, measured `reach` units out. */
function leaving(edge: SkeletonEdge, atStart: boolean, reach: number): Pt {
  const pts = atStart ? edge.points : [...edge.points].reverse();
  const origin = pts[0]!;
  let far = pts.at(-1)!;
  for (const p of pts) {
    far = p;
    if (dist(p, origin) >= reach) break;
  }
  const len = dist(far, origin) || 1;
  return [(far[0] - origin[0]) / len, (far[1] - origin[1]) / len];
}

/** Edges of a junction group pointing away from it (the connector and closed loops left out). */
function endsOf(
  group: string[],
  edges: SkeletonEdge[],
  connector: SkeletonEdge | undefined,
  reach: number
): EdgeEnd[] {
  const ends: EdgeEnd[] = [];
  for (const edge of edges) {
    if (edge === connector || edge.closed) continue;
    for (const id of group) {
      if (edge.from === id) ends.push({ ref: `${edge.id}@${id}`, dir: leaving(edge, true, reach) });
      if (edge.to === id) ends.push({ ref: `${edge.id}@${id}`, dir: leaving(edge, false, reach) });
    }
  }
  return ends;
}

/** Edge ends leaving in nearly opposite directions, paired most opposite first. */
function straightPairs(ends: EdgeEnd[]): [string, string][] {
  const candidates: { a: number; b: number; cos: number }[] = [];
  for (let a = 0; a < ends.length; a++) {
    for (let b = a + 1; b < ends.length; b++) {
      const cos = ends[a]!.dir[0] * ends[b]!.dir[0] + ends[a]!.dir[1] * ends[b]!.dir[1];
      if (cos <= -0.64) candidates.push({ a, b, cos });
    }
  }
  candidates.sort((p, q) => p.cos - q.cos);
  const used = new Set<number>();
  const pairs: [string, string][] = [];
  for (const { a, b } of candidates) {
    if (used.has(a) || used.has(b)) continue;
    used.add(a);
    used.add(b);
    pairs.push([ends[a]!.ref, ends[b]!.ref]);
  }
  return pairs;
}

/**
 * For every junction, or pair of junctions joined by a short connector (a crossing), the edge
 * ends that run straight into each other (turning less than ~50°), most opposite first.
 */
export function findStraightThrough(
  nodes: SkeletonNode[],
  edges: SkeletonEdge[],
  strokeWidth: number
): StraightThrough[] {
  const junctions = new Set(nodes.filter((n) => n.kind === 'junction').map((n) => n.id));
  const connectorOf = new Map<string, SkeletonEdge>();
  for (const edge of edges) {
    const short = !edge.closed && edge.length < 1.6 * strokeWidth;
    if (short && junctions.has(edge.from) && junctions.has(edge.to)) {
      connectorOf.set(edge.from, edge);
      connectorOf.set(edge.to, edge);
    }
  }
  const done = new Set<string>();
  const out: StraightThrough[] = [];
  for (const node of nodes) {
    if (!junctions.has(node.id) || done.has(node.id)) continue;
    const connector = connectorOf.get(node.id);
    const group = connector ? [connector.from, connector.to] : [node.id];
    for (const id of group) done.add(id);
    const pairs = straightPairs(endsOf(group, edges, connector, 1.5 * strokeWidth));
    if (pairs.length === 0) continue;
    out.push(connector ? { nodes: group, via: connector.id, pairs } : { nodes: group, pairs });
  }
  return out;
}
