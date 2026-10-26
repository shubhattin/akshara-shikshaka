import { describe, expect, it } from 'vitest';
import { evaluateDraft } from './evaluate';
import { buildSkeletonGraph, type GlyphMask } from './skeleton';
import { buildStroke, StrokePlanError } from './strokes';

type Pt = [number, number];

/** A raster (scale 2) with thick strokes painted as discs along line segments, canvas units. */
function paint(segments: [Pt, Pt][], extras: { dot?: Pt; ring?: { c: Pt; r: number } } = {}): GlyphMask {
  const scale = 2;
  const size = 800;
  const data = new Uint8Array(size * size);
  const disc = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor((cy - r) * scale); y <= (cy + r) * scale; y++) {
      for (let x = Math.floor((cx - r) * scale); x <= (cx + r) * scale; x++) {
        if ((x / scale - cx) ** 2 + (y / scale - cy) ** 2 <= r * r) data[y * size + x] = 1;
      }
    }
  };
  for (const [a, b] of segments) {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
    for (let i = 0; i <= steps; i++) {
      disc(a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps, 7);
    }
  }
  if (extras.dot) disc(extras.dot[0], extras.dot[1], 8);
  if (extras.ring) {
    for (let k = 0; k < 720; k++) {
      const t = (k / 720) * Math.PI * 2;
      disc(extras.ring.c[0] + Math.cos(t) * extras.ring.r, extras.ring.c[1] + Math.sin(t) * extras.ring.r, 6);
    }
  }
  return { data, width: size, height: size, scale };
}

const onInkOf = (mask: GlyphMask) => ([x, y]: Pt) =>
  mask.data[Math.round(y * mask.scale) * mask.width + Math.round(x * mask.scale)] === 1;

describe('buildSkeletonGraph', () => {
  // A "T": headline 100→300 at y=120, stem from (200,120) down to y=300
  const mask = paint([
    [[100, 120], [300, 120]],
    [[200, 120], [200, 300]]
  ]);
  const graph = buildSkeletonGraph(mask);

  it('finds three ends, one junction and three edges', () => {
    expect(graph.nodes.filter((n) => n.kind === 'end')).toHaveLength(3);
    expect(graph.nodes.filter((n) => n.kind === 'junction')).toHaveLength(1);
    expect(graph.edges).toHaveLength(3);
    expect(graph.strokeWidth).toBeGreaterThan(11);
    expect(graph.strokeWidth).toBeLessThan(17);
  });

  it('numbers nodes top-to-bottom, left-to-right', () => {
    const [n1, n2, n3, n4] = graph.nodes;
    expect(n1!.x).toBeLessThan(n2!.x);
    expect(n2!.x).toBeLessThan(n3!.x);
    expect(n4!.y).toBeGreaterThan(250);
  });

  it('reports separate small blobs as dots and closed rings as loop edges', () => {
    const withExtras = buildSkeletonGraph(
      paint([[[100, 300], [300, 300]]], { dot: [200, 80], ring: { c: [200, 190], r: 50 } })
    );
    expect(withExtras.dots).toHaveLength(1);
    expect(withExtras.dots[0]!.x).toBeCloseTo(200, 0);
    expect(withExtras.edges.some((e) => e.closed)).toBe(true);
  });
});

describe('buildStroke', () => {
  const mask = paint([
    [[100, 120], [300, 120]],
    [[200, 120], [200, 300]]
  ]);
  const graph = buildSkeletonGraph(mask);
  const onInk = onInkOf(mask);
  const ends = graph.nodes.filter((n) => n.kind === 'end');
  const junction = graph.nodes.find((n) => n.kind === 'junction')!;
  const left = ends.reduce((a, b) => (a.x < b.x ? a : b));
  const right = ends.reduce((a, b) => (a.x > b.x ? a : b));
  const bottom = ends.reduce((a, b) => (a.y > b.y ? a : b));
  const edgeBetween = (a: string, b: string) =>
    graph.edges.find((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))!.id;

  it('walks the graph in the given direction and reaches the glyph ends', () => {
    const { points } = buildStroke(
      { path: [left.id, edgeBetween(left.id, junction.id), junction.id, edgeBetween(junction.id, right.id), right.id] },
      graph,
      onInk
    );
    expect(points[0]![0]).toBeLessThan(110);
    expect(points.at(-1)![0]).toBeGreaterThan(290);
    expect(points.every(([, y]) => Math.abs(y - 120) < 3)).toBe(true);
  });

  it('stops at a pen-lift cut', () => {
    const stem = edgeBetween(junction.id, bottom.id);
    const { points } = buildStroke({ path: [junction.id, `${stem}|to=200,210`, bottom.id] }, graph, onInk);
    expect(points.at(-1)![1]).toBeCloseTo(210, -1);
  });

  it('explains plans that do not fit the graph', () => {
    expect(() => buildStroke({ path: [left.id, edgeBetween(junction.id, bottom.id), right.id] }, graph, onInk)).toThrow(
      StrokePlanError
    );
    expect(() => buildStroke({ path: ['N99', 'E1', 'N1'] }, graph, onInk)).toThrow(/Unknown node N99/);
  });

  it('makes a small dot and a smooth waypoint curve', () => {
    expect(buildStroke({ dot: [50, 50] }, graph, onInk).points).toHaveLength(6);
    const curve = buildStroke({ waypoints: [[100, 200], [150, 160], [200, 200]] }, graph, onInk).points;
    expect(curve.length).toBeGreaterThan(30);
  });
});

describe('evaluateDraft', () => {
  const mask = paint([
    [[100, 120], [300, 120]],
    [[200, 120], [200, 300]]
  ]);
  const graph = buildSkeletonGraph(mask);
  const onInk = onInkOf(mask);
  const line = (a: Pt, b: Pt): Pt[] =>
    Array.from({ length: 51 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / 50, a[1] + ((b[1] - a[1]) * i) / 50]);

  it('passes a full, on-ink draft', () => {
    const result = evaluateDraft({
      graph,
      strokes: [line([200, 120], [200, 300]), line([100, 120], [300, 120])],
      onInk,
      saved: []
    });
    expect(result.ok).toBe(true);
    expect(result.coverage).toBeGreaterThan(0.95);
  });

  it('flags a missing stroke and a stroke off the glyph', () => {
    const result = evaluateDraft({ graph, strokes: [line([100, 120], [300, 120]), line([50, 350], [350, 350])], onInk, saved: [] });
    expect(result.ok).toBe(false);
    expect(result.issues.join(' ')).toMatch(/covered/);
    expect(result.issues.join(' ')).toMatch(/Stroke 2 leaves the glyph/);
  });

  it('compares with saved strokes using the practice scorer', () => {
    const stem = line([200, 120], [200, 300]);
    const result = evaluateDraft({
      graph,
      strokes: [[...stem].reverse(), line([100, 120], [300, 120])],
      onInk,
      saved: [stem, line([100, 120], [300, 120])]
    });
    expect(result.perStroke[0]!.reference?.against_saved.issue).toBe('backwards');
    expect(result.perStroke[1]!.reference?.against_saved.passed).toBe(true);
  });
});

describe('pen-lift cuts at the ends of a path', () => {
  const mask = paint([
    [[100, 120], [300, 120]],
    [[200, 120], [200, 300]]
  ]);
  const graph = buildSkeletonGraph(mask);
  const onInk = onInkOf(mask);
  const junction = graph.nodes.find((n) => n.kind === 'junction')!;
  const bottom = graph.nodes.filter((n) => n.kind === 'end').reduce((a, b) => (a.y > b.y ? a : b));
  const stem = graph.edges.find((e) => [e.from, e.to].includes(bottom.id))!.id;

  it('accepts a to= cut as the last step and a from= cut as the first', () => {
    const first = buildStroke({ path: [junction.id, `${stem}|to=200,210`] }, graph, onInk).points;
    const second = buildStroke({ path: [`${stem}|from=200,210`, bottom.id] }, graph, onInk).points;
    expect(first.at(-1)![1]).toBeCloseTo(210, -1);
    expect(second[0]![1]).toBeCloseTo(210, -1);
    expect(second.at(-1)![1]).toBeGreaterThan(290);
  });
});
