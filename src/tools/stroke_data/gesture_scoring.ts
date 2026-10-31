import type { GesturePoints } from './types';

/*
 * Scores a user-drawn stroke against the reference stroke it is meant to trace.
 *
 * Both strokes live in the same logical canvas space (`CANVAS_DIMS`), and the learner draws
 * over the guide, so *where* a stroke is drawn, its size, orientation and direction are all part
 * of being correct. The score is a weighted geometric mean of independent checks, so one badly
 * failed aspect (wrong place, drawn backwards, half finished, different shape) sinks the result
 * instead of being averaged away by the others.
 *
 * Invariances are bounded rather than free: small rotations (handwriting slant), moderate size
 * changes and small offsets cost little, but a vertical line never matches a horizontal one and a
 * stroke drawn in the wrong corner never passes.
 *
 * Reference strokes are classified once:
 * - dot: tiny marks (bindu, nukta, dots of ಥ / ఠ) — only placement and size are judged, a tap counts.
 * - closed: loops (ఈ, ठ-like bowls, visarga parts) — direction is judged by winding (clockwise or
 *   not) and the loop may start anywhere on its path.
 * - open: everything else — start/end points and direction matter; overshooting the ends (common
 *   for the shirorekha) is tolerated.
 *
 * Retracing: a stroke often starts or ends by running along ink an earlier stroke already left
 * (the Kannada/Telugu talakattu over the top of the letter, the Devanagari danda over a bowl's
 * rising side, the i-mātrā hook of రి closing over the circle). Those runs add nothing new to the
 * letter, so when the earlier strokes are known (`priorStrokes`) the learner may skip them, draw
 * them partly or fully, or even run further along the old ink than the reference does.
 */

/** Scores at or above this are accepted. */
export const GESTURE_PASS_THRESHOLD = 0.6;

export type GestureIssue =
  | 'backwards'
  | 'misplaced'
  | 'too_small'
  | 'too_large'
  | 'incomplete'
  | 'mismatch'
  | 'wrong_stroke';

export type GestureScore = {
  /** 0..1 */
  score: number;
  passed: boolean;
  /** Main reason for failing, `null` when passed */
  issue: GestureIssue | null;
  /** When the stroke matched a later stroke of the glyph instead (`issue === 'wrong_stroke'`) */
  matchedStrokeIndex?: number;
  /** Individual check scores (0..1), useful for debugging and tuning */
  checks: Record<string, number>;
};

export type GestureScoreOptions = {
  /**
   * Size of the whole glyph (longest side of its bounding box) in logical canvas units.
   * Tolerances scale with it. Defaults to the target stroke's own size.
   */
  glyphSize?: number;
  /**
   * Minimum positional tolerance in logical canvas units. Callers should derive this from the
   * on-screen scale and input type so a finger on a small phone gets more slack than a mouse.
   */
  minTolerance?: number;
  /**
   * Strokes already on the canvas (earlier strokes of the glyph). Where the start or end of the
   * target runs along them, that run may be skipped, and drawn ink running along them past the
   * target's ends is ignored.
   */
  priorStrokes?: GesturePoints[][];
};

type Pt = { x: number; y: number };

const SAMPLE_SIZE = 64;
const DEFAULT_MIN_TOLERANCE = 10;
/** Positional tolerance as a fraction of the glyph size */
const TOLERANCE_FRAC = 0.05;
/** Rotations tried when comparing paths (degrees) — covers natural handwriting slant */
const SLANT_ROTATIONS = [-20, -15, -10, -5, 0, 5, 10, 15, 20].map((d) => (d * Math.PI) / 180);
/** Size difference that is normalised away before comparing paths */
const SIZE_NORMALISE_RANGE = [0.8, 1.25] as const;
/** Samples back from an end used to estimate the direction a stroke ends in */
const TANGENT_SPAN = 5;
/** The final score never exceeds the worst single check by more than this */
const GATE_MARGIN = 0.4;
/** A retraced run at a stroke's end shorter than this many tolerances is just a junction */
const MIN_RETRACE_TOLS = 2;
/** What is left of a stroke after skipping its retraced ends must be at least this long … */
const MIN_CORE_TOLS = 3;
/** … and at least this fraction of the stroke; otherwise the stroke is mostly a retrace and must be drawn */
const MIN_CORE_FRAC = 0.3;
/** Old ink a drawing may retrace beyond the reference's own retrace, as a fraction of the stroke */
const EXTRA_RETRACE_FRAC = 0.5;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

const pathLength = (pts: Pt[]) => {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i], pts[i - 1]);
  return len;
};

const centroid = (pts: Pt[]): Pt => {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
};

/** Root-mean-square distance from the centroid */
const spread = (pts: Pt[], c: Pt) =>
  Math.sqrt(pts.reduce((acc, p) => acc + (p.x - c.x) ** 2 + (p.y - c.y) ** 2, 0) / pts.length);

const boxSize = (pts: Pt[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return Math.max(maxX - minX, maxY - minY);
};

/** Signed area (shoelace); the sign gives the winding direction of a loop */
const signedArea = (pts: Pt[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

const toPts = (points: GesturePoints[]): Pt[] => {
  const out: Pt[] = [];
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const last = out[out.length - 1];
    if (last && last.x === x && last.y === y) continue;
    out.push({ x, y });
  }
  return out;
};

/** Moving average — removes pointer jitter and the stair-steps of integer reference points */
const smooth = (pts: Pt[], half = 1) => {
  if (pts.length <= 2) return pts;
  return pts.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(pts.length - 1, i + half);
    let x = 0;
    let y = 0;
    for (let j = start; j <= end; j++) {
      x += pts[j].x;
      y += pts[j].y;
    }
    const n = end - start + 1;
    return { x: x / n, y: y / n };
  });
};

/** Resample to `n` points spaced evenly by arc length (first and last points are kept) */
const resample = (pts: Pt[], n: number): Pt[] => {
  if (pts.length === 1) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  const total = cum[cum.length - 1];
  if (total === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
  const out: Pt[] = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1);
    while (j < pts.length - 1 && cum[j] < target) j++;
    const seg = cum[j] - cum[j - 1];
    const t = seg === 0 ? 0 : Math.min(1, Math.max(0, (target - cum[j - 1]) / seg));
    out.push({
      x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * t,
      y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * t
    });
  }
  return out;
};

const distToSegment = (p: Pt, a: Pt, b: Pt) => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const l2 = vx * vx + vy * vy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
  return Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy);
};

const distToPolyline = (p: Pt, poly: Pt[]) => {
  if (poly.length === 1) return dist(p, poly[0]);
  let min = Infinity;
  for (let i = 1; i < poly.length; i++) min = Math.min(min, distToSegment(p, poly[i - 1], poly[i]));
  return min;
};

/** Fraction of `pts` lying within `tol` of `poly` */
const fractionNear = (pts: Pt[], poly: Pt[], tol: number) =>
  pts.filter((p) => distToPolyline(p, poly) <= tol).length / pts.length;

/** Mean point distance along the optimal dynamic-time-warping path (order-sensitive) */
const dtwMeanDistance = (a: Pt[], b: Pt[]) => {
  const n = a.length;
  const m = b.length;
  const cost = new Float64Array(n * m);
  const steps = new Float64Array(n * m);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const d = dist(a[i], b[j]);
      const k = i * m + j;
      if (i === 0 && j === 0) {
        cost[k] = d;
        steps[k] = 1;
        continue;
      }
      let best = Infinity;
      let bestSteps = 0;
      if (i > 0 && cost[k - m] < best) {
        best = cost[k - m];
        bestSteps = steps[k - m];
      }
      if (j > 0 && cost[k - 1] < best) {
        best = cost[k - 1];
        bestSteps = steps[k - 1];
      }
      if (i > 0 && j > 0 && cost[k - m - 1] <= best) {
        best = cost[k - m - 1];
        bestSteps = steps[k - m - 1];
      }
      cost[k] = best + d;
      steps[k] = bestSteps + 1;
    }
  }
  return cost[n * m - 1] / steps[n * m - 1];
};

/** 1 when `err <= lo`, 0 when `err >= hi`, smooth in between */
const soft = (err: number, lo: number, hi: number) => {
  const t = Math.max(0, Math.min(1, (err - lo) / (hi - lo)));
  return 1 - t * t * (3 - 2 * t);
};

const transform = (pts: Pt[], from: Pt, to: Pt, scale: number, theta: number) => {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return pts.map((p) => {
    const dx = (p.x - from.x) * scale;
    const dy = (p.y - from.y) * scale;
    return { x: to.x + dx * c - dy * s, y: to.y + dx * s + dy * c };
  });
};

/** Rotate a closed loop's samples so it starts at the point nearest `start` */
const startLoopAt = (loop: Pt[], start: Pt) => {
  let best = 0;
  for (let i = 1; i < loop.length; i++)
    if (dist(loop[i], start) < dist(loop[best], start)) best = i;
  return [...loop.slice(best), ...loop.slice(0, best)];
};

/**
 * Distance between a drawn endpoint and the reference endpoint, ignoring overshoot past the end
 * along the stroke's own direction (up to `allowance`). Drawing the shirorekha a bit too long is
 * fine; stopping short or ending somewhere else is not.
 */
const endpointError = (drawn: Pt, ref: Pt, refInner: Pt, allowance: number) => {
  const ox = ref.x - refInner.x;
  const oy = ref.y - refInner.y;
  const ol = Math.hypot(ox, oy) || 1;
  const dx = drawn.x - ref.x;
  const dy = drawn.y - ref.y;
  const along = (dx * ox + dy * oy) / ol;
  const perp = Math.abs((dx * oy - dy * ox) / ol);
  const beyond = along > 0 ? Math.max(0, along - allowance) : -along;
  return Math.hypot(beyond, perp);
};

type Check = {
  name: string;
  score: number;
  weight: number;
  issue: GestureIssue;
  /** Soft checks only lower the score; they never fail a stroke on their own */
  soft?: boolean;
};

const combine = (checks: Check[]) => {
  let logSum = 0;
  let weightSum = 0;
  let worst = checks[0];
  let gate = 1;
  for (const c of checks) {
    logSum += c.weight * Math.log(Math.max(1e-3, c.score));
    weightSum += c.weight;
    if (c.score < worst.score) worst = c;
    if (!c.soft) gate = Math.min(gate, c.score + GATE_MARGIN);
  }
  // One clearly failed check (score < ~0.2) fails the stroke however good the rest is
  const score = Math.min(Math.exp(logSum / weightSum), gate);
  return {
    score,
    issue: worst.issue,
    checks: Object.fromEntries(checks.map((c) => [c.name, c.score]))
  };
};

const failed = (issue: GestureIssue): GestureScore => ({
  score: 0,
  passed: false,
  issue,
  checks: {}
});

const result = ({
  score,
  issue,
  checks
}: {
  score: number;
  issue: GestureIssue;
  checks: Record<string, number>;
}): GestureScore => {
  const passed = score >= GESTURE_PASS_THRESHOLD;
  return { score, passed, issue: passed ? null : issue, checks };
};

const tolerance = (target: Pt[], options: GestureScoreOptions) => {
  const glyphSize = options.glyphSize ?? boxSize(target);
  return Math.max(options.minTolerance ?? DEFAULT_MIN_TOLERANCE, TOLERANCE_FRAC * glyphSize);
};

/** Tiny reference strokes (dots) are judged only on placement and size */
const isDotStroke = (target: GesturePoints[], options: GestureScoreOptions = {}) => {
  const pts = toPts(target);
  if (pts.length === 0) return false;
  const tol = tolerance(pts, options);
  return pathLength(pts) < 2 * tol && boxSize(pts) < 1.5 * tol;
};

const scoreDot = (user: Pt[], target: Pt[], tol: number): GestureScore => {
  const offset = dist(centroid(user), centroid(target));
  const allowedSize = Math.max(3 * tol, 2.5 * boxSize(target));
  return result(
    combine([
      { name: 'placement', score: soft(offset, 1.5 * tol, 4 * tol), weight: 1, issue: 'misplaced' },
      {
        name: 'size',
        score: soft(boxSize(user), allowedSize, 2 * allowedSize),
        weight: 1,
        issue: 'too_large'
      }
    ])
  );
};

/** Small strokes get a tighter band, otherwise a 20px band swallows the whole shape */
const bandFor = (target: Pt[], tol: number) =>
  Math.max(tol, Math.min(2 * tol, 0.25 * boxSize(target)));

/** A loop: ends meet and it's long enough to have a shape (judged by winding, any start point) */
const isClosed = (target: Pt[], tol: number) => {
  const len = pathLength(target);
  return (
    dist(target[0], target[target.length - 1]) <= Math.max(1.5 * tol, 0.12 * len) && len > 4 * tol
  );
};

const scoreLine = (
  userRaw: Pt[],
  targetRaw: Pt[],
  tol: number,
  glyphSize: number,
  prior: Pt[][]
) => {
  const target = resample(smooth(targetRaw), SAMPLE_SIZE);
  const closed = isClosed(target, tol);
  const drawn = resample(smooth(userRaw), SAMPLE_SIZE);
  let best = scorePath(drawn, target, closed, tol, glyphSize);
  if (prior.length === 0) return best;

  // Also judge the drawing with the ink it ran along earlier strokes set aside: against the whole
  // stroke, and — when the stroke starts or ends by retracing old ink — against just its new part
  // (which may be open even when the whole stroke closes a loop over old ink, like the hook of రి).
  // So skipping, half-drawing or fully drawing a retrace all pass. The best match counts, so
  // setting ink aside can only ever help a drawing.
  const consider = (own: Pt[] | null, ref: Pt[], refClosed: boolean) => {
    if (!own) return;
    const scored = scorePath(own, ref, refClosed, tol, glyphSize);
    if (scored.score > best.score) best = scored;
  };
  if (!closed) {
    const allowance = EXTRA_RETRACE_FRAC * pathLength(target);
    consider(stripPriorInk(drawn, target, prior, bandFor(target, tol), allowance), target, false);
  }
  const runs = retracedEnds(target, prior, tol);
  const core = withoutRetrace(target, runs);
  if (core) {
    const allowance = runs.start + runs.end + EXTRA_RETRACE_FRAC * pathLength(core);
    const skipped = { start: runs.start > 0, end: runs.end > 0 };
    const own = stripPriorInk(drawn, core, prior, bandFor(core, tol), allowance, skipped);
    consider(own ?? drawn, core, isClosed(core, tol));
  }
  return best;
};

/** Score a sampled drawing against a sampled reference path */
const scorePath = (
  drawn: Pt[],
  targetSampled: Pt[],
  closed: boolean,
  tol: number,
  glyphSize: number
) => {
  let target = targetSampled;
  const targetLen = pathLength(target);
  const targetBox = boxSize(target);
  const band = bandFor(target, tol);

  // Running past the ends (common for the shirorekha) is cut off and judged on its own, so it
  // doesn't also shift the placement, size and shape of the rest of the stroke
  const trim = closed ? null : trimOvershoot(drawn, target, band, targetLen);
  const user = trim ? resample(trim.kept, SAMPLE_SIZE) : drawn;
  const overshoot = trim ? trim.overshoot : 0;
  const userLen = pathLength(user);

  const cu = centroid(user);
  const ct = centroid(target);

  // Where: placement and size, judged in canvas space
  const offset = dist(cu, ct);
  const placement = soft(offset, 0.08 * glyphSize + tol, 0.22 * glyphSize + tol);
  const sizeRatio = (spread(user, cu) + tol / 4) / (spread(target, ct) + tol / 4);
  // The `2 * tol` cushion keeps tiny strokes (where a little wobble doubles the length) lenient
  const lengthRatio = (userLen + 2 * tol) / (targetLen + 2 * tol);
  const size = soft(Math.abs(Math.log(sizeRatio)), Math.log(1.4), Math.log(2.5));
  // Stopping short is a stronger sign of a wrong attempt than overshooting
  const length =
    lengthRatio < 1
      ? soft(-Math.log(lengthRatio), Math.log(1.25), Math.log(1.65))
      : soft(Math.log(lengthRatio), Math.log(1.5), Math.log(2.6));
  const sizeIssue: GestureIssue = sizeRatio < 1 ? 'too_small' : 'too_large';
  const lengthIssue: GestureIssue = lengthRatio < 1 ? 'incomplete' : 'too_large';

  // What: the path after removing the offset, a bounded size change and a bounded slant
  const scale = Math.max(SIZE_NORMALISE_RANGE[0], Math.min(SIZE_NORMALISE_RANGE[1], 1 / sizeRatio));
  const fit = alignToTarget(user, target, closed, cu, ct, scale);
  const aligned = fit.aligned;
  target = fit.target;

  // Overshoot allowance at the open ends (also used to extend the reference for `precision`)
  const allowance = closed ? 0 : 0.35 * targetLen + tol;
  const extended = closed ? target : extendEnds(target, allowance);

  const coverage = fractionNear(target, aligned, band);
  const precision = fractionNear(aligned, extended, band);
  const deviationScale = Math.max(tol, 0.15 * targetBox);

  const checks: Check[] = [
    { name: 'placement', score: placement, weight: 1, issue: 'misplaced' },
    { name: 'size', score: size, weight: 0.7, issue: sizeIssue },
    { name: 'length', score: length, weight: 0.8, issue: lengthIssue },
    { name: 'coverage', score: soft(1 - coverage, 0.15, 0.55), weight: 1.2, issue: 'incomplete' },
    { name: 'precision', score: soft(1 - precision, 0.15, 0.55), weight: 1, issue: 'mismatch' },
    {
      name: 'path',
      score: soft(fit.deviation / deviationScale, 0.6, 2),
      weight: 1.2,
      issue: 'mismatch'
    },
    ...(closed ? [] : endChecks(aligned, target, allowance, overshoot, targetLen, tol))
  ];

  const combined = combine(checks);
  if (isBackwards(aligned, target, closed, fit.deviation, tol)) {
    return { ...combined, score: Math.min(combined.score, 0.2), issue: 'backwards' as const };
  }
  return combined;
};

/**
 * Move the drawn stroke onto the reference (centroid, bounded size) and pick the slant that fits
 * best. Loops are re-started at the point nearest the drawn start, since they may begin anywhere.
 */
const alignToTarget = (
  user: Pt[],
  target: Pt[],
  closed: boolean,
  from: Pt,
  to: Pt,
  scale: number
) => {
  let best = { aligned: user, target, deviation: Infinity };
  for (const theta of SLANT_ROTATIONS) {
    const aligned = transform(user, from, to, scale, theta);
    const ref = closed ? startLoopAt(target, aligned[0]) : target;
    const deviation = dtwMeanDistance(aligned, ref);
    if (deviation < best.deviation) best = { aligned, target: ref, deviation };
  }
  return best;
};

/** Start/end placement and overshoot checks for open strokes */
const endChecks = (
  aligned: Pt[],
  target: Pt[],
  allowance: number,
  overshoot: number,
  targetLen: number,
  tol: number
): Check[] => {
  const n = target.length - 1;
  const startErr = endpointError(aligned[0], target[0], target[TANGENT_SPAN], allowance);
  const endErr = endpointError(aligned[n], target[n], target[n - TANGENT_SPAN], allowance);
  return [
    {
      name: 'endpoints',
      score: soft(Math.max(startErr, endErr), 2 * tol, 5 * tol),
      weight: 0.8,
      issue: 'mismatch',
      // A small tail or hook at an end shouldn't fail an otherwise correct stroke
      soft: true
    },
    {
      name: 'overshoot',
      score: soft(overshoot / Math.max(targetLen, 4 * tol), 0.8, 2),
      weight: 0.6,
      issue: 'too_large'
    }
  ];
};

/** Whether the stroke was drawn in the opposite direction to the reference */
const isBackwards = (
  aligned: Pt[],
  target: Pt[],
  closed: boolean,
  deviation: number,
  tol: number
) => {
  if (closed) {
    // Winding direction, only when the loop encloses a meaningful area
    const box = boxSize(target);
    const targetArea = signedArea(target);
    return (
      Math.abs(targetArea) > 0.1 * box * box &&
      Math.sign(targetArea) !== Math.sign(signedArea(aligned))
    );
  }
  // The reversed drawing fits the reference far better than the drawing itself
  const reversedDeviation = dtwMeanDistance([...aligned].reverse(), target);
  return (
    pathLength(target) > 2 * tol && reversedDeviation < 0.5 * deviation && deviation > 0.6 * tol
  );
};

/** Unit vector pointing out of a stroke's end, from a point a little way inside it */
const outward = (end: Pt, inner: Pt): Pt => {
  const dx = end.x - inner.x;
  const dy = end.y - inner.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
};

/** Extend both open ends of a sampled polyline along their end directions */
const extendEnds = (pts: Pt[], by: number) => {
  const n = pts.length - 1;
  const extend = (end: Pt, inner: Pt): Pt => {
    const o = outward(end, inner);
    return { x: end.x + o.x * by, y: end.y + o.y * by };
  };
  return [extend(pts[0], pts[TANGENT_SPAN]), ...pts, extend(pts[n], pts[n - TANGENT_SPAN])];
};

/**
 * Cut the leading/trailing parts of a drawn stroke that run on past the reference's ends (in
 * roughly the direction the reference ends in). Returns `null` when nothing sensible is left, e.g.
 * the whole stroke lies beyond an end — that is a misplaced stroke, not an overshoot.
 */
const trimOvershoot = (drawn: Pt[], target: Pt[], band: number, targetLen: number) => {
  const n = target.length - 1;
  const beyond = (p: Pt, end: Pt, inner: Pt) => {
    const o = outward(end, inner);
    const along = (p.x - end.x) * o.x + (p.y - end.y) * o.y;
    const perp = Math.abs((p.x - end.x) * o.y - (p.y - end.y) * o.x);
    // Only points past the end itself (not alongside the stroke) count; a little drift is fine
    return (
      along > 0 && perp <= band + 0.4 * along && distToPolyline(p, target) >= dist(p, end) - 1e-6
    );
  };
  let first = 0;
  let last = drawn.length - 1;
  while (first < last && beyond(drawn[first], target[0], target[TANGENT_SPAN])) first++;
  while (last > first && beyond(drawn[last], target[n], target[n - TANGENT_SPAN])) last--;
  if (first === 0 && last === drawn.length - 1) return null;
  const kept = drawn.slice(Math.max(0, first - 1), last + 2);
  const keptLen = pathLength(kept);
  if (kept.length < 2 || keptLen < 0.5 * targetLen) return null;
  // What is left must still span the reference end to end — a stroke shifted along its own
  // direction is misplaced, not overshooting
  const reach = Math.max(1.5 * band, 0.25 * targetLen);
  if (dist(kept[0], target[0]) > reach || dist(kept[kept.length - 1], target[n]) > reach) {
    return null;
  }
  return { kept, overshoot: Math.max(0, pathLength(drawn) - keptLen) };
};

const minDistToAny = (p: Pt, polys: Pt[][]) => {
  let min = Infinity;
  for (const poly of polys) min = Math.min(min, distToPolyline(p, poly));
  return min;
};

/**
 * Lengths of the leading and trailing runs of `target` that lie on earlier strokes' ink. Runs
 * shorter than a junction count as 0, and a stroke that is mostly retrace gets nothing to skip.
 */
const retracedEnds = (target: Pt[], prior: Pt[][], tol: number) => {
  const n = target.length;
  const onInk = target.map((p) => minDistToAny(p, prior) <= tol);
  let first = 0;
  while (first < n && onInk[first]) first++;
  let last = n - 1;
  while (last >= first && onInk[last]) last--;
  const total = pathLength(target);
  const start = first > 0 ? pathLength(target.slice(0, first)) : 0;
  const end = last < n - 1 ? pathLength(target.slice(last + 1)) : 0;
  const minRun = MIN_RETRACE_TOLS * tol;
  const runs = { start: start >= minRun ? start : 0, end: end >= minRun ? end : 0 };
  const core = total - runs.start - runs.end;
  if (core < Math.max(MIN_CORE_TOLS * tol, MIN_CORE_FRAC * total)) return { start: 0, end: 0 };
  return runs;
};

/** The reference without its retraced ends; `null` when it has none */
const withoutRetrace = (target: Pt[], runs: { start: number; end: number }) => {
  if (runs.start === 0 && runs.end === 0) return null;
  const n = target.length - 1;
  const cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + dist(target[i], target[i - 1]));
  let from = 0;
  while (from < n && cum[from] < runs.start) from++;
  let to = n;
  while (to > from && cum[to] > cum[n] - runs.end) to--;
  return resample(target.slice(from, to + 1), SAMPLE_SIZE);
};

/**
 * Drop leading/trailing parts of the drawing that run along earlier strokes. On the `skipped`
 * ends everything on old ink goes (the reference's retrace there was dropped too); elsewhere only
 * old ink away from the reference goes (retracing further than the reference does). At most
 * `allowance` of ink is dropped — redrawing a whole earlier stroke that happens to cross the
 * target is not a retrace. `null` when nothing is dropped or too little would be left.
 */
const stripPriorInk = (
  drawn: Pt[],
  target: Pt[],
  prior: Pt[][],
  band: number,
  allowance: number,
  skipped = { start: false, end: false }
) => {
  const extra = (p: Pt, skippedEnd: boolean) =>
    minDistToAny(p, prior) <= band && (skippedEnd || distToPolyline(p, target) > band);
  let first = 0;
  let last = drawn.length - 1;
  while (first < last && extra(drawn[first], skipped.start)) first++;
  while (last > first && extra(drawn[last], skipped.end)) last--;
  if (first === 0 && last === drawn.length - 1) return null;
  const kept = drawn.slice(first, last + 1);
  const keptLen = pathLength(kept);
  if (kept.length < 2 || keptLen < 0.25 * pathLength(target)) return null;
  if (pathLength(drawn) - keptLen > allowance) return null;
  return resample(kept, SAMPLE_SIZE);
};

/** Score one drawn stroke against its reference stroke */
export const scoreGesture = (
  userPoints: GesturePoints[],
  targetPoints: GesturePoints[],
  options: GestureScoreOptions = {}
): GestureScore => {
  const user = toPts(userPoints);
  const target = toPts(targetPoints);
  if (target.length === 0) return failed('mismatch');
  if (user.length === 0) return failed('incomplete');

  const tol = tolerance(target, options);
  const glyphSize = Math.max(options.glyphSize ?? boxSize(target), 4 * tol);

  if (isDotStroke(targetPoints, options)) return scoreDot(user, target, tol);
  if (pathLength(user) < 0.5 * tol) return failed('incomplete');

  const prior = (options.priorStrokes ?? []).map(toPts).filter((p) => p.length > 0);
  return result(scoreLine(user, target, tol, glyphSize, prior));
};

/** Longest side of the bounding box around all strokes of a glyph */
export const glyphSizeOf = (strokes: GesturePoints[][]) => {
  const pts = strokes.flatMap(toPts);
  return pts.length ? boxSize(pts) : 0;
};

/**
 * Score a drawn stroke against stroke `index` of a glyph. When it fails, also check the strokes
 * still to be drawn, so drawing them out of order gets specific feedback.
 */
export const scoreGlyphStroke = (
  userPoints: GesturePoints[],
  strokes: GesturePoints[][],
  index: number,
  options: Omit<GestureScoreOptions, 'glyphSize'> = {}
): GestureScore => {
  // Only the strokes before `index` are on the canvas, also when checking against later strokes
  const opts = {
    ...options,
    glyphSize: glyphSizeOf(strokes),
    priorStrokes: strokes.slice(0, index)
  };
  const own = scoreGesture(userPoints, strokes[index] ?? [], opts);
  if (own.passed) return own;
  for (let i = index + 1; i < strokes.length; i++) {
    const other = scoreGesture(userPoints, strokes[i], opts);
    if (other.passed && other.score > own.score + 0.15) {
      return { ...own, issue: 'wrong_stroke', matchedStrokeIndex: i };
    }
  }
  return own;
};
