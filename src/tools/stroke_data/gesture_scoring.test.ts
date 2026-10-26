import { describe, expect, it } from 'vitest';
import { scoreGesture, scoreGlyphStroke } from './gesture_scoring';
import type { GesturePoints } from './types';

// Deterministic pseudo-random jitter so results don't flake
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31 - 0.5;
};

const line = (x0: number, y0: number, x1: number, y1: number, n = 40): GesturePoints[] =>
  Array.from({ length: n }, (_, i) => [
    x0 + ((x1 - x0) * i) / (n - 1),
    y0 + ((y1 - y0) * i) / (n - 1)
  ]);

const arc = (
  cx: number,
  cy: number,
  r: number,
  from: number,
  to: number,
  n = 60
): GesturePoints[] =>
  Array.from({ length: n }, (_, i) => {
    const a = from + ((to - from) * i) / (n - 1);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

const jitter = (pts: GesturePoints[], amount = 3, seed = 1): GesturePoints[] => {
  const rand = seeded(seed);
  return pts.map(([x, y]) => [x + rand() * amount, y + rand() * amount]);
};

const reversed = (pts: GesturePoints[]) => [...pts].reverse();

const shift = (pts: GesturePoints[], dx: number, dy: number): GesturePoints[] =>
  pts.map(([x, y]) => [x + dx, y + dy]);

/** Rotate (and optionally scale) about the centroid */
const rotate = (pts: GesturePoints[], degrees: number, scale = 1): GesturePoints[] => {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const a = (degrees * Math.PI) / 180;
  return pts.map(([x, y]) => {
    const dx = (x - cx) * scale;
    const dy = (y - cy) * scale;
    return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
  });
};

// A Devanagari-like glyph: bowl, danda, shirorekha, then an anusvara dot
const BOWL = arc(170, 220, 60, -Math.PI / 2, Math.PI);
const DANDA = line(260, 110, 260, 320);
const SHIROREKHA = line(90, 110, 300, 110);
const BINDU = line(262, 70, 264, 72, 4);
const GLYPH = [BOWL, DANDA, SHIROREKHA, BINDU];

const glyphScore = (user: GesturePoints[], index: number) => scoreGlyphStroke(user, GLYPH, index);

describe('scoreGlyphStroke — correct drawings pass', () => {
  it('accepts a wobbly trace of each stroke', () => {
    expect(glyphScore(jitter(BOWL), 0).passed).toBe(true);
    expect(glyphScore(jitter(DANDA), 1).passed).toBe(true);
    expect(glyphScore(jitter(SHIROREKHA), 2).passed).toBe(true);
  });

  it('accepts natural slant, size change and a small offset', () => {
    expect(glyphScore(rotate(jitter(BOWL), 10, 1.15), 0).passed).toBe(true);
    expect(glyphScore(shift(jitter(DANDA), 12, -8), 1).passed).toBe(true);
    expect(glyphScore(rotate(jitter(SHIROREKHA), -6, 0.9), 2).passed).toBe(true);
  });

  it('accepts a shirorekha drawn past its end', () => {
    expect(glyphScore(jitter(line(90, 110, 390, 104)), 2).passed).toBe(true);
  });

  it('accepts sparse points from a fast stroke', () => {
    expect(
      glyphScore(
        BOWL.filter((_, i) => i % 8 === 0 || i === BOWL.length - 1),
        0
      ).passed
    ).toBe(true);
  });

  it('accepts a tap or a tiny scribble for a dot', () => {
    expect(glyphScore([[265, 73]], 3).passed).toBe(true);
    expect(glyphScore(arc(263, 71, 4, 0, 2 * Math.PI, 12), 3).passed).toBe(true);
  });

  it('accepts a loop started at a different point on it', () => {
    const loop = arc(200, 200, 50, 0, 2 * Math.PI);
    const user = arc(200, 200, 50, Math.PI / 2, Math.PI / 2 + 2 * Math.PI);
    expect(scoreGesture(jitter(user), loop, { glyphSize: 200 }).passed).toBe(true);
  });
});

describe('scoreGlyphStroke — wrong drawings fail', () => {
  it('rejects a stroke drawn backwards', () => {
    const r = glyphScore(jitter(reversed(SHIROREKHA)), 2);
    expect(r.passed).toBe(false);
    expect(r.issue).toBe('backwards');
    expect(glyphScore(jitter(reversed(BOWL)), 0).issue).toBe('backwards');
  });

  it('rejects a loop drawn the other way round', () => {
    const loop = arc(200, 200, 50, 0, 2 * Math.PI);
    const r = scoreGesture(arc(200, 200, 50, 0, -2 * Math.PI), loop, { glyphSize: 200 });
    expect(r.passed).toBe(false);
    expect(r.issue).toBe('backwards');
  });

  it('rejects a vertical line where a horizontal one is expected', () => {
    expect(glyphScore(rotate(jitter(SHIROREKHA), 90), 2).passed).toBe(false);
  });

  it('rejects a rotated or flipped curve', () => {
    expect(glyphScore(rotate(jitter(BOWL), 180), 0).passed).toBe(false);
    expect(glyphScore(rotate(jitter(BOWL), 90), 0).passed).toBe(false);
  });

  it('rejects the right shape in the wrong place', () => {
    const r = glyphScore(shift(SHIROREKHA, 0, 180), 2);
    expect(r.passed).toBe(false);
    expect(r.issue).toBe('misplaced');
  });

  it('rejects a shrunken copy drawn elsewhere', () => {
    expect(glyphScore(rotate(shift(BOWL, -60, 120), 0, 0.5), 0).passed).toBe(false);
  });

  it('rejects a half-drawn stroke', () => {
    const r = glyphScore(DANDA.slice(0, DANDA.length / 2), 1);
    expect(r.passed).toBe(false);
    expect(r.issue).toBe('incomplete');
  });

  it('rejects a scribble', () => {
    const rand = seeded(7);
    const scribble: GesturePoints[] = Array.from({ length: 60 }, () => [
      170 + rand() * 160,
      220 + rand() * 160
    ]);
    expect(glyphScore(scribble, 0).passed).toBe(false);
  });

  it('rejects a dot far from where it belongs', () => {
    expect(glyphScore([[150, 70]], 3).passed).toBe(false);
  });

  it('rejects a tap for a stroke that is not a dot', () => {
    expect(glyphScore([[260, 200]], 1).passed).toBe(false);
  });

  it('points out when a later stroke was drawn instead', () => {
    const r = glyphScore(jitter(SHIROREKHA), 1);
    expect(r.passed).toBe(false);
    expect(r.issue).toBe('wrong_stroke');
    expect(r.matchedStrokeIndex).toBe(2);
  });
});

describe('scoreGesture — edge cases', () => {
  it('handles empty and non-finite input without throwing', () => {
    expect(scoreGesture([], DANDA).passed).toBe(false);
    expect(scoreGesture(DANDA, []).passed).toBe(false);
    const withNaN: GesturePoints[] = [...DANDA.slice(0, 20), [Number.NaN, 5], ...DANDA.slice(20)];
    expect(scoreGesture(withNaN, DANDA).passed).toBe(true);
  });

  it('scores a perfect trace at 1', () => {
    expect(scoreGesture(BOWL, BOWL, { glyphSize: 230 }).score).toBeCloseTo(1, 5);
  });
});
