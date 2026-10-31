import { getStrokeRender } from './stroke_render';
import type { Gesture } from './types';

/**
 * CSS-style cubic-bezier timing function (x1, y1, x2, y2), solved for x with Newton's method and
 * a bisection fallback, as browsers do.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  const solveX = (x: number) => {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < 1e-6) return s;
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    while (hi - lo > 1e-6) {
      if (sampleX(s) < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };

  return (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solveX(t)));
}

// The curves documented on AnimationsFunctionsEnumSchema
const EASINGS = {
  linear: (t) => t,
  ease: cubicBezier(0.25, 0.1, 0.25, 1),
  'ease-in': cubicBezier(0.42, 0, 1, 1),
  'ease-out': cubicBezier(0, 0, 0.58, 1),
  'ease-in-out': cubicBezier(0.42, 0, 0.58, 1)
} satisfies Record<Gesture['anim_fn'], (t: number) => number>;

export const applyEasing = (t: number, fn: Gesture['anim_fn']): number => EASINGS[fn](t);

/**
 * A gesture's `duration` is the time to draw a stroke of this length (about a typical stroke on
 * the 400×400 canvas). Other strokes scale with their length so the pen moves at a steady pace:
 * with a fixed duration per stroke a short tick crawled while a long shirorekha raced.
 */
export const STROKE_REFERENCE_LENGTH = 200;
/**
 * Fixed share of every stroke's time, as if the pen were STROKE_LENGTH_OFFSET units longer, so
 * dots and short ticks stay readable instead of flashing past. Hanzi Writer does the same.
 */
const STROKE_LENGTH_OFFSET = 60;

/** Playback time in ms for a stroke whose spine is `length` canvas units long */
export function getStrokeDuration(duration: number, length: number): number {
  return (
    (Math.max(0, duration) * (length + STROKE_LENGTH_OFFSET)) /
    (STROKE_REFERENCE_LENGTH + STROKE_LENGTH_OFFSET)
  );
}

export const getGestureDuration = (gesture: Gesture): number =>
  getStrokeDuration(gesture.duration, getStrokeRender(gesture).length);

export type GestureAnimationFrame = {
  /** Time progress, 0..1 */
  progress: number;
  /** Canvas units of the stroke's spine revealed so far */
  reveal: number;
  isComplete: boolean;
};

// Only called from animateGesture, which runs in the browser
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Resolves `true` after `ms`, or `false` as soon as `signal` aborts */
export function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Animates one stroke on `requestAnimationFrame`: progress comes from elapsed time, so the
 * stroke takes its real duration on any display, and maps to distance along the stroke, so the
 * pen moves at an even speed however densely the points were sampled.
 *
 * With reduced motion the stroke appears whole and is held for its duration, which keeps the
 * stroke order readable.
 *
 * Resolves `true` when the stroke finished, `false` if `signal` aborted it first.
 */
export function animateGesture(
  gesture: Gesture,
  onFrame: (frame: GestureAnimationFrame) => void,
  {
    signal,
    speed = 1
  }: {
    signal?: AbortSignal;
    /** Playback rate: 2 draws twice as fast (for inspecting, never in practice) */
    speed?: number;
  } = {}
): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  const { length } = getStrokeRender(gesture);
  const duration = getStrokeDuration(gesture.duration, length) / (speed > 0 ? speed : 1);

  if (length === 0 || duration === 0 || prefersReducedMotion()) {
    onFrame({ progress: 1, reveal: length, isComplete: true });
    return sleep(duration, signal);
  }

  return new Promise((resolve) => {
    let start: number | null = null;
    let frame = 0;
    const onAbort = () => {
      cancelAnimationFrame(frame);
      resolve(false);
    };
    const tick = (now: number) => {
      start ??= now;
      const progress = Math.min(1, (now - start) / duration);
      const isComplete = progress >= 1;
      onFrame({ progress, reveal: applyEasing(progress, gesture.anim_fn) * length, isComplete });
      if (isComplete) {
        signal?.removeEventListener('abort', onAbort);
        resolve(true);
      } else {
        frame = requestAnimationFrame(tick);
      }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    frame = requestAnimationFrame(tick);
  });
}
