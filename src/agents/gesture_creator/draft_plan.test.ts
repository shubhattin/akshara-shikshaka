import { describe, expect, it } from 'vitest';
import { draftEditContext, draftEditSummary } from './draft_edit_context';
import {
  canJoin,
  describeDirection,
  joinPoints,
  reverseSpec,
  splitPoints,
  waypointsSpec
} from './draft_plan';
import type { DraftEditData } from './schemas';
import { buildSkeletonGraph, type GlyphMask } from './skeleton';
import { buildStroke } from './strokes';

type Pt = [number, number];

/** A raster (scale 2) of thick lines and rings, canvas units. */
function paint(segments: [Pt, Pt][], rings: { c: Pt; r: number }[] = []): GlyphMask {
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
  for (const ring of rings) {
    for (let k = 0; k < 720; k++) {
      const t = (k / 720) * Math.PI * 2;
      disc(ring.c[0] + Math.cos(t) * ring.r, ring.c[1] + Math.sin(t) * ring.r, 6);
    }
  }
  return { data, width: size, height: size, scale };
}

const onInkOf =
  (mask: GlyphMask) =>
  ([x, y]: Pt) =>
    mask.data[Math.round(y * mask.scale) * mask.width + Math.round(x * mask.scale)] === 1;

const near = (a: Pt, b: Pt, tolerance = 3) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;

describe('reverseSpec', () => {
  it('flips loop directions and cut kinds, and reverses waypoints', () => {
    expect(reverseSpec({ path: ['N1', 'E4:cw', 'N1', 'E2|to=240,120'], label: 'Loop' })).toEqual({
      path: ['E2|from=240,120', 'N1', 'E4:ccw', 'N1'],
      label: 'Loop'
    });
    expect(
      reverseSpec({
        waypoints: [
          [1, 2],
          [3, 4]
        ]
      })
    ).toEqual({
      waypoints: [
        [3, 4],
        [1, 2]
      ]
    });
    expect(reverseSpec({ dot: [5, 5] })).toEqual({ dot: [5, 5] });
  });

  // A horizontal bar 100→300 at y=200
  const bar = paint([
    [
      [100, 200],
      [300, 200]
    ]
  ]);
  const barGraph = buildSkeletonGraph(bar);

  it('traces a reversed path the other way along the same line', () => {
    const edge = barGraph.edges[0]!;
    const spec = { path: [edge.from, edge.id, edge.to] };
    const forward = buildStroke(spec, barGraph, onInkOf(bar)).points;
    const backward = buildStroke(reverseSpec(spec), barGraph, onInkOf(bar)).points;
    expect(near(backward[0]!, forward.at(-1)!)).toBe(true);
    expect(near(backward.at(-1)!, forward[0]!)).toBe(true);
  });

  it('keeps a pen lift mid-edge in place when reversed', () => {
    const edge = barGraph.edges[0]!;
    const start = barGraph.nodes.find((n) => n.id === edge.from)!;
    const spec = { path: [edge.from, `${edge.id}|to=200,200`] };
    const forward = buildStroke(spec, barGraph, onInkOf(bar)).points;
    const backward = buildStroke(reverseSpec(spec), barGraph, onInkOf(bar)).points;
    expect(near(forward.at(-1)!, [200, 200])).toBe(true);
    expect(near(backward[0]!, [200, 200])).toBe(true);
    expect(near(backward.at(-1)!, forward[0]!, 4)).toBe(true);
    expect(Math.abs(backward.at(-1)![0] - start.x)).toBeLessThan(8);
  });

  it('turns a clockwise loop anticlockwise', () => {
    const mask = paint([], [{ c: [200, 200], r: 60 }]);
    const graph = buildSkeletonGraph(mask);
    const loop = graph.edges.find((e) => e.closed)!;
    const spec = { path: [loop.from, `${loop.id}:cw`, loop.from] };
    const cw = buildStroke(spec, graph, onInkOf(mask)).points;
    const ccw = buildStroke(reverseSpec(spec), graph, onInkOf(mask)).points;
    expect(describeDirection(cw)).toBe('loop, clockwise');
    expect(describeDirection(ccw)).toBe('loop, anticlockwise');
  });
});

describe('describeDirection', () => {
  const line = (a: Pt, b: Pt, n = 20): Pt[] =>
    Array.from({ length: n + 1 }, (_, i) => [
      a[0] + ((b[0] - a[0]) * i) / n,
      a[1] + ((b[1] - a[1]) * i) / n
    ]);

  it('names straight strokes by where they start and end', () => {
    expect(describeDirection(line([100, 100], [300, 100]))).toBe('left → right');
    expect(describeDirection(line([200, 300], [200, 100]))).toBe('bottom → top');
    expect(describeDirection(line([100, 100], [250, 250]))).toBe('top-left → bottom-right');
  });

  it('says which way a curved stroke bows', () => {
    // top → bottom through x = 140: a "(" bowing left
    const arc: Pt[] = Array.from({ length: 41 }, (_, i) => {
      const t = (i / 40) * Math.PI;
      return [200 - Math.sin(t) * 60, 100 + (1 - Math.cos(t)) * 100];
    });
    expect(describeDirection(arc)).toBe('top → bottom, bowing left');
  });

  it('calls tiny strokes dots', () => {
    expect(
      describeDirection([
        [10, 10],
        [12, 11]
      ])
    ).toBe('dot');
  });
});

describe('split, join and waypoints', () => {
  const pts: Pt[] = Array.from({ length: 51 }, (_, i) => [100 + i * 2, 200]);

  it('splits a stroke into two halves sharing the cut point', () => {
    const halves = splitPoints(pts, 20)!;
    expect(halves[0].at(-1)).toEqual(halves[1][0]);
    expect(halves[0]).toHaveLength(21);
    expect(halves[1]).toHaveLength(31);
    // too close to an end
    expect(splitPoints(pts, 2)).toBeNull();
  });

  it('joins strokes that meet, not ones far apart', () => {
    const [a, b] = splitPoints(pts, 20)!;
    expect(canJoin(a, b)).toBe(true);
    expect(joinPoints(a, b)).toEqual(pts);
    expect(canJoin(b, a)).toBe(false);
  });

  it('keeps both ends and spaces waypoints evenly', () => {
    const spec = waypointsSpec(pts, 'Bar');
    if (!('waypoints' in spec)) throw new Error('expected waypoints');
    expect(spec.label).toBe('Bar');
    expect(spec.waypoints[0]).toEqual([100, 200]);
    expect(spec.waypoints.at(-1)).toEqual([200, 200]);
    expect(spec.waypoints.length).toBeGreaterThan(10);
    expect(spec.waypoints.length).toBeLessThan(16);
  });
});

describe('draft edit context', () => {
  const edit: DraftEditData = {
    edit_id: 'edit-1',
    gesture_id: 7,
    base_id: 'call-1',
    strokes: [
      { path: ['N5', 'E1', 'N6'], label: 'Headline' },
      { path: ['N3', 'E3', 'N2'], label: 'Vertical bar' }
    ],
    origins: [
      { from: [3], reversed: false },
      { from: [1], reversed: true }
    ],
    deleted: [2],
    marks: [{ id: 'A', x: 236, y: 242, r: 30, note: 'lift here' }],
    preview: [
      [
        [60, 90],
        [340, 90]
      ],
      [
        [235, 330],
        [235, 92]
      ]
    ],
    mark_info: [
      {
        id: 'A',
        x: 236,
        y: 242,
        r: 30,
        note: 'lift here',
        strokes: [2],
        nodes: ['N4'],
        edges: [{ id: 'E2', inside: 0.4 }]
      }
    ]
  };

  it('lists the new order, origins, deletions and placed marks for the model', () => {
    const text = draftEditContext(edit, undefined);
    expect(text).toContain('<admin_draft_edit edit_id="edit-1"');
    expect(text).toContain('1. "Headline", left → right — was stroke 3');
    expect(text).toContain('2. "Vertical bar", bottom → top — was stroke 1, REVERSED');
    expect(text).toContain('Deleted: stroke 2.');
    expect(text).toContain('- A at 236,242, radius 30: "lift here" — strokes 2 (Vertical bar)');
    expect(text).toContain('nodes N4; edges E2 (40% inside)');
  });

  it('summarises an edit in a line', () => {
    expect(draftEditSummary(edit)).toBe('reordered · 1 reversed · 1 deleted · 1 marked area');
    expect(
      draftEditSummary({
        origins: [
          { from: [1], reversed: false, split_part: 1 },
          { from: [1], reversed: false, split_part: 2 },
          { from: [2], reversed: false }
        ],
        deleted: [],
        marks: []
      })
    ).toBe('1 split');
  });
});
