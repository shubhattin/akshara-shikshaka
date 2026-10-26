import { describe, expect, it } from 'vitest';
import {
  getRevealClipPath,
  getStrokeRender,
  quadCorners,
  type StrokeRender,
  type StrokeStyle
} from './stroke_render';
import type { GesturePoints } from './types';

const line = (x0: number, y0: number, x1: number, y1: number, n = 40): GesturePoints[] =>
  Array.from({ length: n }, (_, i) => [
    x0 + ((x1 - x0) * i) / (n - 1),
    y0 + ((y1 - y0) * i) / (n - 1)
  ]);

// A loop that comes back near its start, like the curl of ह or द
const loop = (n = 120): GesturePoints[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / (n - 1)) * Math.PI * 1.9;
    return [200 + 60 * Math.cos(a), 200 + 60 * Math.sin(a)];
  });

const style = (points: GesturePoints[], width = 12): StrokeStyle => ({
  points,
  width,
  simulate_pressure: false
});

const signedArea = (poly: GesturePoints[]) =>
  poly.reduce((sum, [x, y], i) => {
    const [nx, ny] = poly[(i + 1) % poly.length]!;
    return sum + (x * ny - nx * y);
  }, 0);

const insidePolygon = ([px, py]: GesturePoints, poly: GesturePoints[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Is `p` inside the reveal region (discs + capsules) for `reveal` units of the spine? */
const revealed = (render: StrokeRender, p: GesturePoints, reveal: number) => {
  const { spine, radii, distances } = render;
  for (let i = 0; i < spine.length && distances[i]! <= reveal; i++) {
    if (Math.hypot(p[0] - spine[i]![0], p[1] - spine[i]![1]) <= radii[i]!) return true;
    const next = spine[i + 1];
    if (next && distances[i + 1]! <= reveal) {
      const quad = quadCorners(spine[i]!, next, Math.max(radii[i]!, radii[i + 1]!));
      if (insidePolygon(p, quad)) return true;
    }
  }
  return false;
};

/** Grid points inside the stroke outline, using the outline the renderer draws */
const inkPoints = (points: GesturePoints[], width = 12) => {
  // Rebuild the polygon from the SVG path's endpoints, close enough for sampling
  const render = getStrokeRender(style(points, width));
  const coords = [...render.path.matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g)].map((m): GesturePoints => [
    Number(m[1]),
    Number(m[2])
  ]);
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  const ink: GesturePoints[] = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1.5) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += 1.5) {
      if (insidePolygon([x, y], coords)) ink.push([x, y]);
    }
  }
  return { render, ink };
};

describe('getStrokeRender', () => {
  it('caches per points array and brush', () => {
    const points = line(50, 50, 300, 50);
    expect(getStrokeRender(style(points))).toBe(getStrokeRender(style(points)));
    expect(getStrokeRender(style(points, 8))).not.toBe(getStrokeRender(style(points)));
  });

  it('measures the spine length along the stroke', () => {
    const render = getStrokeRender(style(line(50, 50, 300, 50)));
    // perfect-freehand drops the first `size` units into the start cap
    expect(render.length).toBeGreaterThan(230);
    expect(render.length).toBeLessThanOrEqual(250);
  });

  it('ends the finished stroke on the last recorded point', () => {
    const { render } = inkPoints(line(50, 50, 300, 50));
    expect(render.spine.at(-1)).toEqual([300, 50]);
  });

  it('handles a single-point dot', () => {
    const render = getStrokeRender(style([[100, 100]]));
    expect(render.path).not.toBe('');
    expect(getRevealClipPath(render, render.length)).toBeNull();
  });
});

describe('reveal clip', () => {
  it('winds every capsule like the discs so nonzero filling unions them', () => {
    const segments: [GesturePoints, GesturePoints][] = [
      [
        [0, 0],
        [10, 0]
      ],
      [
        [5, 5],
        [-3, 12]
      ],
      [
        [0, 0],
        [0, -7]
      ]
    ];
    for (const [a, b] of segments) {
      // Discs are drawn with positive (y-down clockwise) winding
      expect(signedArea(quadCorners(a, b, 4))).toBeGreaterThan(0);
    }
  });

  it('covers the whole outline by the end', () => {
    for (const points of [line(50, 80, 320, 260), loop()]) {
      const { render, ink } = inkPoints(points);
      const missed = ink.filter((p) => !revealed(render, p, render.length));
      expect(missed).toEqual([]);
    }
  });

  it('does not reveal ink ahead of the pen', () => {
    const { render, ink } = inkPoints(line(50, 50, 350, 50));
    const startX = render.spine[0]![0];
    for (const reveal of [40, 120, 200]) {
      const ahead = ink.filter((p) => revealed(render, p, reveal) && p[0] > startX + reveal + 8);
      expect(ahead).toEqual([]);
    }
  });

  it('grows monotonically and is complete at full length', () => {
    const render = getStrokeRender(style(loop()));
    expect(getRevealClipPath(render, 0)).toBe('');
    expect(getRevealClipPath(render, render.length)).toBeNull();
    const { ink } = inkPoints(loop());
    let previous = 0;
    for (let reveal = 0; reveal < render.length; reveal += render.length / 10) {
      const count = ink.filter((p) => revealed(render, p, reveal)).length;
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });
});
