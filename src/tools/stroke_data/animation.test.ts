import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  animateGesture,
  applyEasing,
  getStrokeDuration,
  STROKE_REFERENCE_LENGTH,
  type GestureAnimationFrame
} from './animation';
import { getStrokeRender } from './stroke_render';
import type { Gesture, GesturePoints } from './types';

const gesture = (points: GesturePoints[], overrides: Partial<Gesture> = {}): Gesture => ({
  index: 0,
  width: 12,
  color: '#000',
  duration: 600,
  anim_fn: 'linear',
  simulate_pressure: false,
  points,
  ...overrides
});

const line = (length: number, n = 60): GesturePoints[] =>
  Array.from({ length: n }, (_, i) => [50 + (length * i) / (n - 1), 100]);

describe('applyEasing', () => {
  const fns: Gesture['anim_fn'][] = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];

  it('is continuous and monotonic from 0 to 1', () => {
    for (const fn of fns) {
      expect(applyEasing(0, fn)).toBe(0);
      expect(applyEasing(1, fn)).toBe(1);
      let previous = 0;
      for (let t = 0.001; t <= 1; t += 0.001) {
        const value = applyEasing(t, fn);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
        // No jumps: the old `ease` leapt from 0.25 to 0.5 at the midpoint
        expect(value - previous).toBeLessThan(0.01);
        previous = value;
      }
    }
  });

  it('matches the CSS curves', () => {
    expect(applyEasing(0.5, 'ease')).toBeCloseTo(0.8024, 3);
    expect(applyEasing(0.5, 'ease-in-out')).toBeCloseTo(0.5, 5);
    expect(applyEasing(0.25, 'ease-in')).toBeCloseTo(0.0935, 3);
  });
});

describe('getStrokeDuration', () => {
  it('takes the gesture duration for a reference-length stroke', () => {
    expect(getStrokeDuration(600, STROKE_REFERENCE_LENGTH)).toBe(600);
  });

  it('keeps the pen pace far steadier than a fixed duration', () => {
    const short = getStrokeDuration(600, 30);
    const long = getStrokeDuration(600, 800);
    expect(long).toBeGreaterThan(short * 5);
    // ...while short strokes and dots still get readable time
    expect(short).toBeGreaterThan(150);
    expect(getStrokeDuration(600, 0)).toBeGreaterThan(100);
  });
});

describe('animateGesture', () => {
  let now = 0;
  let queue: ((time: number) => void)[] = [];
  const flushFrames = (ms: number) => {
    for (let t = 0; t < ms; t += 16) {
      now += 16;
      const callbacks = queue;
      queue = [];
      for (const cb of callbacks) cb(now);
    }
  };

  beforeEach(() => {
    now = 0;
    queue = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {
      queue = [];
    });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reveals at an even pace along the stroke in its real duration', async () => {
    const g = gesture(line(300));
    const { length } = getStrokeRender(g);
    const frames: GestureAnimationFrame[] = [];
    const done = animateGesture(g, (frame) => frames.push(frame));
    flushFrames(getStrokeDuration(600, length) + 32);
    await expect(done).resolves.toBe(true);

    expect(frames.at(-1)).toMatchObject({ isComplete: true, reveal: length, progress: 1 });
    // Linear: reveal is proportional to elapsed time
    for (const frame of frames) expect(frame.reveal).toBeCloseTo(frame.progress * length, 6);
    // Frame count follows the duration, not the number of recorded points
    const expected = getStrokeDuration(600, length) / 16;
    expect(frames.length).toBeGreaterThan(expected - 2);
    expect(frames.length).toBeLessThan(expected + 3);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    const frames: GestureAnimationFrame[] = [];
    const done = animateGesture(gesture(line(300)), (frame) => frames.push(frame), {
      signal: controller.signal
    });
    flushFrames(100);
    controller.abort();
    await expect(done).resolves.toBe(false);
    const count = frames.length;
    flushFrames(1000);
    expect(frames.length).toBe(count);
    expect(frames.every((f) => !f.isComplete)).toBe(true);
  });

  it('shows the whole stroke at once with reduced motion', async () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    vi.useFakeTimers();
    const frames: GestureAnimationFrame[] = [];
    const done = animateGesture(gesture(line(300)), (frame) => frames.push(frame));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.isComplete).toBe(true);
    await vi.runAllTimersAsync();
    await expect(done).resolves.toBe(true);
    vi.useRealTimers();
  });
});
