import { describe, expect, it } from 'vitest';
import { createGestureHarness } from './harness';
import { serverCanvasEnv } from './server_canvas.server';
import { straightenStrokeEnd } from './strokes';

type Pt = [number, number];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Points every 0.5 units along a polyline through `corners`. */
function polyline(corners: Pt[]): Pt[] {
  const out: Pt[] = [corners[0]!];
  for (let i = 1; i < corners.length; i++) {
    const a = corners[i - 1]!;
    const b = corners[i]!;
    const n = Math.ceil(dist(a, b) / 0.5);
    for (let k = 1; k <= n; k++)
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** Clearance of an ink band of half-width `r` around a centreline. */
const bandClearance = (centre: Pt[], r: number) => (p: Pt) =>
  Math.max(0, r - Math.min(...centre.map((q) => dist(p, q))));

// a straight bar running right whose last ~12 units bend 4 up (an angled cut's centreline)
const hooked = polyline([
  [100, 200],
  [188, 200],
  [200, 196]
]);

describe('straightenStrokeEnd', () => {
  it('continues a straight stroke whose end bends towards an angled cut', () => {
    const fixed = straightenStrokeEnd(hooked, 15)!;
    expect(fixed).not.toBeNull();
    expect(Math.max(...fixed.map((p) => Math.abs(p[1] - 200)))).toBeLessThan(0.5);
    expect(fixed.at(-1)![0]).toBeGreaterThan(198);
  });

  it('leaves curved strokes alone', () => {
    const arc: Pt[] = Array.from({ length: 181 }, (_, i) => {
      const t = (i / 180) * (Math.PI / 2);
      return [200 + Math.cos(t) * 50, 200 - Math.sin(t) * 50];
    });
    expect(straightenStrokeEnd(arc, 15)).toBeNull();
  });

  it('leaves a big turn at the end alone', () => {
    const turn = polyline([
      [100, 200],
      [190, 200],
      [196, 188]
    ]);
    expect(straightenStrokeEnd(turn, 15)).toBeNull();
  });

  it('keeps a real hook: the ink turns with it, so a straight end runs off towards its edge', () => {
    const hook = polyline([
      [100, 200],
      [186, 200],
      [198, 193]
    ]);
    expect(straightenStrokeEnd(hook, 15)).not.toBeNull();
    expect(straightenStrokeEnd(hook, 15, bandClearance(hook, 7.5))).toBeNull();
  });
});

describe('straight strokes on a serif glyph', () => {
  it('draws the headline of क्ष (Noto Serif) level from end to end', async () => {
    const KSHA = {
      id: 71,
      uuid: '00000000-0000-0000-0000-000000000071',
      text: 'क्ष',
      script_id: 1,
      font_family: 'Noto_Serif_Devanagari',
      font_size: 15,
      // SAFETY: literal pair matches the fixed 2-tuple shape of text_center_offset.
      text_center_offset: [0, 0] as [number, number],
      gestures: []
    };
    const harness = createGestureHarness({
      env: serverCanvasEnv,
      loadGesture: async () => KSHA,
      findTrace: () => undefined
    });
    const signal = new AbortController().signal;
    const glyph = await harness.inspect({ gesture_id: 71 }, signal);
    // the headline: the two highest free ends, joined through the junction between them
    const [left, right] = glyph.nodes
      .filter((n) => n.kind === 'end')
      .sort((a, b) => a.y - b.y)
      .slice(0, 2)
      .sort((a, b) => a.x - b.x);
    const touching = (id: string) => glyph.edges.find((e) => e.from === id || e.to === id)!;
    const a = touching(left!.id);
    const b = touching(right!.id);
    const junction = a.from === left!.id ? a.to : a.from;
    const traced = await harness.trace(
      { gesture_id: 71, strokes: [{ path: [left!.id, a.id, junction, b.id, right!.id] }] },
      signal
    );
    const ys = traced.strokes[0]!.points.map((p) => p[1]);
    // before: the ends tilted about 6 up and 5 down
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2.5);
  });
});
