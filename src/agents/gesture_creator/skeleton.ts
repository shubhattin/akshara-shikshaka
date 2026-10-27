/**
 * Glyph skeleton graph: thin the rendered glyph to a one-pixel centreline, then describe it as
 * nodes (pen ends and junctions) and edges (centreline runs between them). The Gesture Creator
 * plans strokes as walks over this graph. Pure array code, no DOM.
 */

/** Binary glyph raster: 1 = ink. `scale` raster pixels per canvas unit. */
export type GlyphMask = { data: Uint8Array; width: number; height: number; scale: number };

export type SkeletonNode = {
  id: string;
  x: number;
  y: number;
  kind: 'end' | 'junction' | 'loop';
  degree: number;
};

export type SkeletonEdge = {
  id: string;
  from: string;
  to: string;
  closed: boolean;
  /** Centreline in canvas units, from `from` to `to` */
  points: [number, number][];
  length: number;
  width: number;
};

export type SkeletonDot = { id: string; x: number; y: number; r: number };

export type SkeletonGraph = {
  nodes: SkeletonNode[];
  edges: SkeletonEdge[];
  dots: SkeletonDot[];
  /** Median stroke width of the glyph, canvas units */
  strokeWidth: number;
  /** Ink bounding box, canvas units */
  box: [number, number, number, number];
};

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0]
];

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** One dilation or erosion step with the 4-neighbour cross (scipy's default structure). */
function morph(src: Uint8Array, w: number, h: number, dilate: boolean): Uint8Array {
  const out = new Uint8Array(src.length);
  // outside the raster counts as background
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[y * w + x]!);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = src[y * w + x]!;
      const l = at(x - 1, y),
        r = at(x + 1, y),
        u = at(x, y - 1),
        d = at(x, y + 1);
      out[y * w + x] = dilate ? c | l | r | u | d : c & l & r & u & d;
    }
  }
  return out;
}

/** Morphological closing: fills hairline gaps from anti-aliasing without merging strokes. */
export function closeMask(mask: Uint8Array, w: number, h: number, iterations = 2): Uint8Array {
  let out = mask;
  for (let i = 0; i < iterations; i++) out = morph(out, w, h, true);
  for (let i = 0; i < iterations; i++) out = morph(out, w, h, false);
  return out;
}

/** Chamfer distance (1, √2) from each ink pixel to the nearest background pixel. */
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) d[i] = mask[i] ? INF : 0;
  const D = Math.SQRT2;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]!);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      d[i] = Math.min(
        d[i]!,
        at(x - 1, y) + 1,
        at(x, y - 1) + 1,
        at(x - 1, y - 1) + D,
        at(x + 1, y - 1) + D
      );
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!mask[i]) continue;
      d[i] = Math.min(
        d[i]!,
        at(x + 1, y) + 1,
        at(x, y + 1) + 1,
        at(x + 1, y + 1) + D,
        at(x - 1, y + 1) + D
      );
    }
  }
  return d;
}

/** Zhang–Suen removal test for one foreground pixel; `nb` holds p2..p9 clockwise from north. */
function zhangSuenRemovable(nb: readonly number[], step: number): boolean {
  const b = nb[0]! + nb[1]! + nb[2]! + nb[3]! + nb[4]! + nb[5]! + nb[6]! + nb[7]!;
  if (b < 2 || b > 6) return false;
  let a = 0;
  for (let k = 0; k < 8; k++) {
    if (nb[k] === 0 && nb[(k + 1) % 8] === 1) a++;
  }
  if (a !== 1) return false;
  return step === 0
    ? nb[0]! * nb[2]! * nb[4]! === 0 && nb[2]! * nb[4]! * nb[6]! === 0
    : nb[0]! * nb[2]! * nb[6]! === 0 && nb[0]! * nb[4]! * nb[6]! === 0;
}

/** One Zhang–Suen sub-iteration: collect removals over a full scan, then apply them. */
function zhangSuenPass(img: Uint8Array, w: number, h: number, step: number): number {
  const remove: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!img[i]) continue;
      const nb = [
        img[i - w]!,
        img[i - w + 1]!,
        img[i + 1]!,
        img[i + w + 1]!,
        img[i + w]!,
        img[i + w - 1]!,
        img[i - 1]!,
        img[i - w - 1]!
      ];
      if (zhangSuenRemovable(nb, step)) remove.push(i);
    }
  }
  for (const i of remove) img[i] = 0;
  return remove.length;
}

/** Staircase clean-up: drop a pixel whose 2–3 neighbours are already connected to each other. */
function removeStaircasePixels(img: Uint8Array, w: number, h: number): void {
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!img[i]) continue;
      const set = NEIGHBOURS.filter(([dx, dy]) => img[(y + dy) * w + x + dx]);
      if (set.length < 2 || set.length > 3) continue;
      if (neighbourComponents(set) === 1) img[i] = 0;
    }
  }
}

/** Zhang–Suen thinning, then one pass removing staircase corners so lines are one pixel wide. */
export function thin(mask: Uint8Array, w: number, h: number): Uint8Array {
  const img = mask.slice();
  // keep a blank border so neighbour reads never wrap
  for (let x = 0; x < w; x++) img[x] = img[(h - 1) * w + x] = 0;
  for (let y = 0; y < h; y++) img[y * w] = img[y * w + w - 1] = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      if (zhangSuenPass(img, w, h, step) > 0) changed = true;
    }
  }
  removeStaircasePixels(img, w, h);
  return img;
}

function neighbourComponents(set: readonly (readonly [number, number])[]): number {
  const seen = new Set<number>();
  let components = 0;
  for (let k = 0; k < set.length; k++) {
    if (seen.has(k)) continue;
    components++;
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const [ax, ay] = set[stack.pop()!]!;
      for (let j = 0; j < set.length; j++) {
        if (seen.has(j)) continue;
        const [bx, by] = set[j]!;
        if (Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
  }
  return components;
}

/** 8-connected components of `mask`: label per pixel (0 = none) and the pixel list of each. */
export function labelComponents(mask: Uint8Array, w: number, h: number) {
  const labels = new Int32Array(mask.length);
  const components: number[][] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = components.length + 1;
    const pixels: number[] = [];
    const stack = [start];
    labels[start] = id;
    while (stack.length) {
      const i = stack.pop()!;
      pixels.push(i);
      const x = i % w;
      const y = (i - x) / w;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && !labels[j]) {
          labels[j] = id;
          stack.push(j);
        }
      }
    }
    components.push(pixels);
  }
  return { labels, components };
}

type RawEdge = { a: number; b: number; path: number[] };

type WorkEdge = { a: number; b: number; pts: [number, number][]; widths: number[] };

/** Ink bounding box plus the small-blob dots, with the component ids to erase from the skeleton. */
type InkLayout = {
  box: [number, number, number, number];
  dots: SkeletonDot[];
  dotComponents: Set<number>;
};

/** Bounding box of the ink plus dot blobs (components within ~2.6 stroke widths). */
function computeInkLayout(
  components: number[][],
  w: number,
  h: number,
  scale: number,
  strokeWidthPx: number
): InkLayout {
  let x0 = w,
    y0 = h,
    x1 = 0,
    y1 = 0;
  const dots: SkeletonDot[] = [];
  const dotComponents = new Set<number>();
  components.forEach((pixels, index) => {
    let bx0 = w,
      by0 = h,
      bx1 = 0,
      by1 = 0;
    for (const i of pixels) {
      const x = i % w;
      const y = (i - x) / w;
      bx0 = Math.min(bx0, x);
      by0 = Math.min(by0, y);
      bx1 = Math.max(bx1, x);
      by1 = Math.max(by1, y);
    }
    x0 = Math.min(x0, bx0);
    y0 = Math.min(y0, by0);
    x1 = Math.max(x1, bx1);
    y1 = Math.max(y1, by1);
    if (Math.max(bx1 - bx0, by1 - by0) <= 2.6 * strokeWidthPx) {
      dotComponents.add(index + 1);
      dots.push({
        id: '',
        x: round1((bx0 + bx1) / 2 / scale),
        y: round1((by0 + by1) / 2 / scale),
        r: round1(Math.max(bx1 - bx0, by1 - by0) / 2 / scale)
      });
    }
  });
  return {
    box:
      x1 >= x0
        ? [round1(x0 / scale), round1(y0 / scale), round1(x1 / scale), round1(y1 / scale)]
        : [0, 0, 0, 0],
    dots,
    dotComponents
  };
}

/** Iteratively drop thinning-artefact spurs (re-thinning after each round). */
function pruneSpurs(sk: Uint8Array, w: number, h: number, spurPx: number) {
  let current = sk;
  let traced = trace(current, w, h);
  for (let round = 0; round < 4; round++) {
    const degree = new Map<number, number>();
    for (const e of traced.edges) {
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    }
    let changed = false;
    for (const e of traced.edges) {
      const da = degree.get(e.a) ?? 0;
      const db = degree.get(e.b) ?? 0;
      if (e.a === e.b || (da === 1) === (db === 1) || e.path.length >= spurPx) continue;
      // keep the junction pixel, drop the rest of the spur (including the end node cluster)
      const spur = da === 1 ? e.path.slice(0, -1) : e.path.slice(1);
      for (const px of spur) current[px] = 0;
      for (const px of traced.clusters[(da === 1 ? e.a : e.b) - 1] ?? []) current[px] = 0;
      changed = true;
    }
    if (!changed) break;
    current = thin(current, w, h);
    traced = trace(current, w, h);
  }
  return { sk: current, traced };
}

/** Merge pass-through nodes (degree 2, not a loop anchor) so an edge runs end to end. */
function mergePassThroughNodes(work: WorkEdge[]): WorkEdge[] {
  let current = work;
  for (;;) {
    const incident = new Map<number, number[]>();
    current.forEach((e, k) => {
      incident.set(e.a, [...(incident.get(e.a) ?? []), k]);
      incident.set(e.b, [...(incident.get(e.b) ?? []), k]);
    });
    const node = [...incident].find(([, ks]) => ks.length === 2 && ks[0] !== ks[1]);
    if (!node) break;
    // SAFETY: find predicate guarantees ks holds exactly two distinct edge indices, so the entry destructures to a node id plus a 2-tuple of edge keys.
    const [n, [k1, k2]] = node as [number, [number, number]];
    const e1 = current[k1]!;
    const e2 = current[k2]!;
    const p1 = e1.b === n ? e1.pts : [...e1.pts].reverse();
    const w1 = e1.b === n ? e1.widths : [...e1.widths].reverse();
    const p2 = e2.a === n ? e2.pts : [...e2.pts].reverse();
    const w2 = e2.a === n ? e2.widths : [...e2.widths].reverse();
    const merged: WorkEdge = {
      a: e1.b === n ? e1.a : e1.b,
      b: e2.a === n ? e2.b : e2.a,
      pts: [...p1, ...p2.slice(1)],
      widths: [...w1, ...w2]
    };
    current = current.filter((_, k) => k !== k1 && k !== k2);
    current.push(merged);
  }
  return current.filter((e) => e.pts.length >= 2 && (e.a !== e.b || pathLength(e.pts) > 4));
}

/** Trace a one-pixel skeleton into nodes (clusters of non-degree-2 pixels) and edges. */
function trace(sk: Uint8Array, w: number, h: number) {
  const neighbours = (i: number) => {
    const x = i % w;
    const y = (i - x) / w;
    const out: number[] = [];
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (sk[j]) out.push(j);
    }
    return out;
  };
  const special = new Uint8Array(sk.length);
  const pixels: number[] = [];
  for (let i = 0; i < sk.length; i++) {
    if (!sk[i]) continue;
    pixels.push(i);
    if (neighbours(i).length !== 2) special[i] = 1;
  }
  const { labels: nodeOf, components: clusters } = labelComponents(special, w, h);
  const edges: RawEdge[] = [];
  const seenKeys = new Set<string>();
  const addEdge = (edge: RawEdge) => {
    const key = [...edge.path].sort((p, q) => p - q).join(',');
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    edges.push(edge);
  };
  const covered = new Uint8Array(sk.length);
  for (const cluster of clusters) {
    for (const p of cluster) {
      covered[p] = 1;
      for (const q of neighbours(p)) {
        if (nodeOf[q]) {
          if (nodeOf[q] !== nodeOf[p]) addEdge({ a: nodeOf[p]!, b: nodeOf[q]!, path: [p, q] });
          continue;
        }
        const path = [p];
        let prev = p;
        let cur = q;
        let ok = true;
        while (!nodeOf[cur]) {
          path.push(cur);
          const next = neighbours(cur).filter((r) => r !== prev && !path.slice(-3).includes(r));
          if (next.length === 0) {
            ok = false;
            break;
          }
          prev = cur;
          cur = next[0]!;
        }
        if (!ok) continue;
        path.push(cur);
        for (const px of path) covered[px] = 1;
        addEdge({ a: nodeOf[p]!, b: nodeOf[cur]!, path });
      }
    }
  }
  // Closed loops with no special pixel at all (e.g. the ring of ० or a bindu-less circle)
  const nodeCentres = clusters.map((cluster) => cluster);
  for (const start of pixels) {
    if (covered[start]) continue;
    const path = [start];
    covered[start] = 1;
    let prev = -1;
    let cur = start;
    for (;;) {
      const next = neighbours(cur).filter((r) => r !== prev && !covered[r]);
      if (next.length === 0) break;
      prev = cur;
      cur = next[0]!;
      covered[cur] = 1;
      path.push(cur);
    }
    nodeCentres.push([start]);
    const id = nodeCentres.length;
    edges.push({ a: id, b: id, path: [...path, start] });
  }
  return { clusters: nodeCentres, edges };
}

const pathLength = (pts: [number, number][]) => {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  }
  return total;
};

/**
 * Build the skeleton graph of a glyph raster. Spurs shorter than ~¾ of the stroke width
 * (thinning artefacts at corners) are pruned; small separate blobs are reported as dots.
 */
export function buildSkeletonGraph(input: GlyphMask): SkeletonGraph {
  const { width: w, height: h, scale } = input;
  const ink = closeMask(input.data, w, h, 2);
  const dist = distanceTransform(ink, w, h);
  let sk = thin(ink, w, h);

  const skWidths: number[] = [];
  for (let i = 0; i < sk.length; i++) if (sk[i]) skWidths.push(dist[i]! * 2);
  const strokeWidthPx = Math.max(2, median(skWidths));

  // Box + dots from ink components
  const { labels: inkLabel, components } = labelComponents(ink, w, h);
  const { box, dots, dotComponents } = computeInkLayout(components, w, h, scale, strokeWidthPx);
  for (let i = 0; i < sk.length; i++) if (sk[i] && dotComponents.has(inkLabel[i]!)) sk[i] = 0;

  // Iterative spur pruning
  const spurPx = Math.max(6 * scale, 0.75 * strokeWidthPx);
  const pruned = pruneSpurs(sk, w, h, spurPx);
  sk = pruned.sk;
  const traced = pruned.traced;

  const centre = (cluster: number[]): [number, number] => {
    let sx = 0,
      sy = 0;
    for (const i of cluster) {
      const x = i % w;
      sx += x;
      sy += (i - x) / w;
    }
    return [sx / cluster.length / scale, sy / cluster.length / scale];
  };
  const toPoint = (i: number): [number, number] => {
    const x = i % w;
    return [x / scale, (i - x) / w / scale];
  };

  let work: WorkEdge[] = traced.edges.map((e) => ({
    a: e.a,
    b: e.b,
    pts: e.path.map(toPoint),
    widths: e.path.map((px) => (dist[px]! * 2) / scale)
  }));
  const nodePos = new Map<number, [number, number]>();
  traced.clusters.forEach((cluster, index) => nodePos.set(index + 1, centre(cluster)));
  for (const e of work) {
    // snap the ends onto the node centres
    e.pts = [nodePos.get(e.a)!, ...e.pts, nodePos.get(e.b)!];
  }

  // Merge pass-through nodes (degree 2, not a loop anchor) so an edge runs end to end.
  work = mergePassThroughNodes(work);

  // Stable, readable ids: nodes top-to-bottom then left-to-right, edges by their first node
  const used = [...new Set(work.flatMap((e) => [e.a, e.b]))];
  const degree = new Map<number, number>();
  for (const e of work) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  used.sort((p, q) => {
    const [px, py] = nodePos.get(p)!;
    const [qx, qy] = nodePos.get(q)!;
    return Math.round(py / 8) - Math.round(qy / 8) || px - qx;
  });
  const nodeId = new Map(used.map((n, k) => [n, `N${k + 1}`]));
  const nodes: SkeletonNode[] = used.map((n) => {
    const [x, y] = nodePos.get(n)!;
    const deg = degree.get(n) ?? 0;
    const selfLoopOnly = work.every((e) => (e.a !== n && e.b !== n) || e.a === e.b);
    return {
      id: nodeId.get(n)!,
      x: round1(x),
      y: round1(y),
      degree: deg,
      kind: deg === 1 ? 'end' : selfLoopOnly && deg === 2 ? 'loop' : 'junction'
    };
  });
  const order = (e: WorkEdge) => Math.min(used.indexOf(e.a), used.indexOf(e.b));
  work.sort((p, q) => order(p) - order(q) || pathLength(q.pts) - pathLength(p.pts));
  const edges: SkeletonEdge[] = work.map((e, k) => {
    // orient each edge from its lower-numbered node
    const flip = e.a !== e.b && used.indexOf(e.a) > used.indexOf(e.b);
    const pts = (flip ? [...e.pts].reverse() : e.pts).map(([x, y]) => {
      // SAFETY: round1 returns numbers, so each rounded pair remains a valid 2-tuple canvas point.
      return [round1(x), round1(y)] as [number, number];
    });
    return {
      id: `E${k + 1}`,
      from: nodeId.get(flip ? e.b : e.a)!,
      to: nodeId.get(flip ? e.a : e.b)!,
      closed: e.a === e.b,
      points: pts,
      length: Math.round(pathLength(pts)),
      width: round1(median(e.widths))
    };
  });
  dots.sort((p, q) => p.y - q.y || p.x - q.x);
  dots.forEach((dot, k) => (dot.id = `D${k + 1}`));

  return {
    nodes,
    edges,
    dots,
    strokeWidth: round1(strokeWidthPx / scale),
    box
  };
}
