import { describe, expect, it } from 'vitest';
import { canJoinStrokes, joinStrokes, type DraftStroke } from './draft_state';

type Pt = [number, number];

const line = (a: Pt, b: Pt, n = 20): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => [
    a[0] + ((b[0] - a[0]) * i) / n,
    a[1] + ((b[1] - a[1]) * i) / n
  ]);

const stroke = (key: string, n: number, points: Pt[], label: string): DraftStroke => ({
  key,
  spec: { path: ['N1', 'E1', 'N2'], label },
  points,
  origin: { from: [n], reversed: false }
});

describe('joinStrokes', () => {
  // क्ष: the curls start at the junction (173,168) and end at the tail; the connector starts at
  // the junction's other node (185,167), a few units away, and runs to the stem.
  const curls = stroke('s3', 3, line([173, 168], [227, 270]), 'Left curls');
  const connector = stroke('s4', 4, line([185, 167], [240, 190]), 'Middle connector');

  it('joins strokes whose ends only meet once one is reversed', () => {
    expect(canJoinStrokes(curls, connector)).toBe(true);
    const joined = joinStrokes(curls, connector);
    // the curls are drawn backwards, from the tail into the connector
    expect(joined.points[0]).toEqual([227, 270]);
    expect(joined.points.at(-1)).toEqual([240, 190]);
    expect(joined.origin).toEqual({ from: [3, 4], reversed: true });
    expect(joined.spec.label).toBe('Left curls + Middle connector');
    expect('waypoints' in joined.spec).toBe(true);
  });

  it('keeps both directions when the ends already meet', () => {
    const a = stroke('a', 1, line([100, 100], [200, 100]), 'Bar');
    const b = stroke('b', 2, line([205, 102], [205, 200]), 'Stem');
    const joined = joinStrokes(a, b);
    expect(joined.points[0]).toEqual([100, 100]);
    expect(joined.origin.reversed).toBe(false);
  });

  it('refuses strokes that never meet', () => {
    const a = stroke('a', 1, line([100, 100], [150, 100]), 'Bar');
    const b = stroke('b', 2, line([300, 300], [350, 300]), 'Dash');
    expect(canJoinStrokes(a, b)).toBe(false);
  });
});
