import { describe, expect, it } from 'vitest';
import { createGestureHarness, type HarnessGesture } from './harness';
import { serverCanvasEnv } from './server_canvas.server';

type Pt = [number, number];

const glyph = (id: number, text: string, font: string): HarnessGesture => ({
  id,
  uuid: `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`,
  text,
  script_id: 1,
  font_family: font,
  font_size: 15,
  // SAFETY: literal pair matches the fixed 2-tuple shape of text_center_offset.
  text_center_offset: [0, 0] as [number, number],
  gestures: []
});

const harnessFor = (gesture: HarnessGesture) =>
  createGestureHarness({
    env: serverCanvasEnv,
    loadGesture: async () => gesture,
    findTrace: () => undefined
  });

const signal = new AbortController().signal;

/**
 * Which way the pen moves across the top of the loop drawn in a knot: left for an anticlockwise
 * loop (as seen on screen), right for a clockwise one.
 */
function topOfLoop(points: Pt[], knot: { x: number; y: number; r: number }): 'left' | 'right' {
  let top = -1;
  points.forEach((p, i) => {
    if (Math.hypot(p[0] - knot.x, p[1] - knot.y) < knot.r && (top < 0 || p[1] < points[top]![1]))
      top = i;
  });
  const dx = points[top + 2]![0] - points[top - 2]![0];
  return dx < 0 ? 'left' : 'right';
}

describe('knots and crossings on क्ष (Noto Serif)', () => {
  const KSHA = glyph(71, 'क्ष', 'Noto_Serif_Devanagari');

  it('finds the filled lower loop and the crossing at the neck', async () => {
    const out = await harnessFor(KSHA).inspect({ gesture_id: 71 }, signal);
    expect(out.knots).toHaveLength(1);
    const knot = out.knots![0]!;
    expect(knot.at).toBe('through');
    expect(Math.hypot(knot.x - 200, knot.y - 223)).toBeLessThan(6);
    // the neck of the upper loop: two junctions joined by a short connector
    const neck = out.straight_through!.find((s) => s.via);
    expect(neck).toBeDefined();
    const loop = out.edges.find(
      (e) => e.from === neck!.nodes[0] && e.to === neck!.nodes[1] && e.id !== neck!.via
    )!;
    // each end of the loop runs straight on into another edge across the neck
    const partners = neck!.pairs.filter((pair) =>
      pair.some((ref) => ref.startsWith(`${loop.id}@`))
    );
    expect(partners).toHaveLength(2);
    expect(out.images.skeleton).toMatch(/^data:image\/png/);
  });

  it('draws a small anticlockwise loop inside the knot and shows it close up', async () => {
    const harness = harnessFor(KSHA);
    const out = await harness.inspect({ gesture_id: 71 }, signal);
    const knot = out.knots![0]!;
    // the long lower curve that runs past the knot to the tail
    const curve = out.edges.reduce((a, b) => (b.length > a.length && !b.closed ? b : a));
    const plain = await harness.trace(
      { gesture_id: 71, strokes: [{ path: [curve.from, curve.id, curve.to] }] },
      signal
    );
    const looped = await harness.trace(
      { gesture_id: 71, strokes: [{ path: [curve.from, curve.id, knot.id, curve.to] }] },
      signal
    );
    const before = plain.strokes[0]!;
    const after = looped.strokes[0]!;
    // one extra turn of roughly 2π·r more ink, kept on the glyph
    expect(after.length - before.length).toBeGreaterThan(knot.r * 3);
    expect(after.off_ink).toBeLessThan(0.08);
    // the stroke runs right along the bottom of the knot, so the loop flows on anticlockwise
    expect(topOfLoop(after.points, knot)).toBe('left');
    expect(looped.images.closeups).toMatch(/^data:image\/png/);

    const forced = await harness.trace(
      { gesture_id: 71, strokes: [{ path: [curve.from, curve.id, `${knot.id}:cw`, curve.to] }] },
      signal
    );
    expect(topOfLoop(forced.strokes[0]!.points, knot)).toBe('right');
  });

  it('refuses a knot the stroke does not pass', async () => {
    const harness = harnessFor(KSHA);
    const out = await harness.inspect({ gesture_id: 71 }, signal);
    const bar = out.edges.find((e) => e.from === 'N2' && e.to === 'N6')!;
    await expect(
      harness.trace(
        { gesture_id: 71, strokes: [{ path: [bar.from, bar.id, 'K1', bar.to] }] },
        signal
      )
    ).rejects.toThrow(/does not pass K1/);
  });
});

describe('knots at the start of Devanagari curls', () => {
  it('marks the starting curl of म as a knot at a stroke end', async () => {
    const out = await harnessFor(glyph(62, 'म', 'Noto_Serif_Devanagari')).inspect(
      { gesture_id: 62 },
      signal
    );
    expect(out.knots!.some((k) => k.at === 'end')).toBe(true);
  });

  it('does not take the thick bottom of a Telugu bowl for a knot', async () => {
    const TELUGU_A = { ...glyph(8, 'అ', 'Noto_Serif_Telugu'), script_id: 2 };
    const out = await harnessFor(TELUGU_A).inspect({ gesture_id: 8 }, signal);
    expect(out.knots!.filter((k) => k.y > 230)).toHaveLength(0);
  });
});
