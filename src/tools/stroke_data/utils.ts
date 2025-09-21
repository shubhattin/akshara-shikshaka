import { z } from 'zod';
import { type Gesture, type GesturePoints } from './types';
import { getStroke, type StrokeOptions } from 'perfect-freehand';

// Framework-agnostic gesture animation data generator
export type GestureAnimationFrame = {
  step: number;
  totalSteps: number;
  progress: number;
  pointIndex: number;
  partialPoints: GesturePoints[];
  isComplete: boolean;
};

const GenerateGestureAnimationFramesOptions = z.object({
  maxSteps: z.number().int().min(2).optional().default(50)
});

// Map timing function names to easing implementations
const applyEasing = (t: number, fn: Gesture['anim_fn']): number => {
  switch (fn) {
    case 'linear':
      return t;
    case 'ease-in':
      // cubic-in (accelerating from 0 velocity)
      return t * t * t;
    case 'ease-out':
      // cubic-out (decelerating to 0 velocity)
      return 1 - Math.pow(1 - t, 3);
    case 'ease-in-out':
      // cubic-in-out
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'ease':
    default:
      // Use a mild in-out cubic that approximates CSS 'ease'
      return t < 0.5
        ? (Math.pow(t * 2, 2) * t) / 2
        : 1 - (Math.pow(-2 * t + 2, 2) * (-2 * t + 2)) / 2;
  }
};

function* generateGestureAnimationFrames(
  gesture: Gesture,
  options: z.output<typeof GenerateGestureAnimationFramesOptions>
): Generator<GestureAnimationFrame> {
  if (!gesture.points.length) return;
  const { maxSteps } = options;

  // Use centerline points as the source for animation
  const centerlinePoints = gesture.points;
  const totalPoints = centerlinePoints.length;
  const animationSteps = Math.min(totalPoints * 2, maxSteps);

  for (let step = 1; step <= animationSteps; step++) {
    const linearProgress = step / animationSteps;
    const progress = applyEasing(linearProgress, gesture.anim_fn);
    const pointIndex = Math.floor(progress * (totalPoints - 1));

    // Get partial centerline up to current position
    const partialCenterline: GesturePoints[] = centerlinePoints.slice(0, pointIndex + 1);

    // Add interpolated point for smooth animation along the centerline
    if (pointIndex < totalPoints - 1) {
      const currentPoint = centerlinePoints[pointIndex];
      const nextPoint = centerlinePoints[pointIndex + 1];
      const subProgress = (progress * (totalPoints - 1)) % 1;

      const [cx, cy] = currentPoint;
      const [nx, ny] = nextPoint;
      const interpolatedX = cx + (nx - cx) * subProgress;
      const interpolatedY = cy + (ny - cy) * subProgress;
      partialCenterline.push([interpolatedX, interpolatedY]);
    }

    // Generate polygon outline from the partial centerline
    const partialPoints = getSmoothenedPoints(partialCenterline, {
      size: gesture.width,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5
    });

    yield {
      step,
      totalSteps: animationSteps,
      progress,
      pointIndex,
      partialPoints,
      isComplete: step === animationSteps
    };
  }
}

// Simple promise-based animation helper
export async function animateGesture(
  gesture: Gesture,
  onFrame: (frame: GestureAnimationFrame) => void,
  options?: z.input<typeof GenerateGestureAnimationFramesOptions>
): Promise<void> {
  const parsedOptions = GenerateGestureAnimationFramesOptions.parse(options ?? {});
  const { maxSteps } = parsedOptions;

  const generator = generateGestureAnimationFrames(gesture, parsedOptions);
  const stepDuration = Math.max(0, (gesture.duration || 0) / maxSteps);

  for (const frame of generator) {
    onFrame(frame);

    if (!frame.isComplete) {
      await new Promise((resolve) => setTimeout(resolve, stepDuration));
    }
  }
}

export const evaluateGestureAccuracy = (
  userPoints: GesturePoints[],
  targetPoints: GesturePoints[]
): number => {
  if (userPoints.length < 2 || targetPoints.length < 2) return 0;
  type EvalPoint = { x: number; y: number; timestamp: number };

  // Parameters
  const SAMPLE_SIZE = 96; // more detail than 64
  const CURV_SIZE = 48;
  const DTW_WINDOW_FRAC = 0.15; // restrict warping for stricter matching
  const REVERSE_PENALTY = 0.9; // allow reverse with penalty to reduce false negatives

  // Helpers - convert GesturePoints to EvalPoints
  const toEval = (pts: GesturePoints[]): EvalPoint[] =>
    pts.map(([x, y], i) => ({ x, y, timestamp: i }));

  const pathLength = (pts: EvalPoint[]) =>
    pts.reduce(
      (acc, p, i) => (i === 0 ? 0 : acc + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)),
      0
    );

  const normalizeUnitSquare = (pts: EvalPoint[]) => {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = Math.max(1e-6, maxX - minX);
    const h = Math.max(1e-6, maxY - minY);
    const scale = 1 / Math.max(w, h);
    return pts.map((p, i) => ({ x: (p.x - minX) * scale, y: (p.y - minY) * scale, timestamp: i }));
  };

  const resample = (pts: EvalPoint[], n: number) => {
    if (pts.length === n) return pts;
    const dists: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      dists[i] = dists[i - 1] + Math.hypot(dx, dy);
    }
    const total = dists[dists.length - 1] || 1e-6;
    const step = total / (n - 1);
    const out: EvalPoint[] = [];
    let target = 0;
    let j = 0;
    for (let i = 0; i < n; i++) {
      while (j < dists.length - 1 && dists[j] < target) j++;
      const prev = Math.max(0, j - 1);
      const denom = dists[j] - dists[prev];
      const t = denom === 0 ? 0 : (target - dists[prev]) / denom;
      const x = pts[prev].x + (pts[j].x - pts[prev].x) * t;
      const y = pts[prev].y + (pts[j].y - pts[prev].y) * t;
      out.push({ x, y, timestamp: i });
      target = i * step;
    }
    return out;
  };

  const centroid = (pts: EvalPoint[]) => {
    const s = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    const n = Math.max(1, pts.length);
    return { x: s.x / n, y: s.y / n };
  };

  const rotate = (pts: EvalPoint[], theta: number) => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c, timestamp: p.timestamp }));
  };

  // Closed-form best rotation angle between two centered point sets
  const bestRotationAngle = (a: EvalPoint[], b: EvalPoint[]) => {
    let m = 0;
    let n = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      m += a[i].x * b[i].y - a[i].y * b[i].x;
      n += a[i].x * b[i].x + a[i].y * b[i].y;
    }
    return Math.atan2(m, n);
  };

  const center = (pts: EvalPoint[]) => {
    const c = centroid(pts);
    return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y, timestamp: p.timestamp }));
  };

  const curvatureSignature = (pts: EvalPoint[], outLen: number) => {
    if (pts.length < 3) return new Array(outLen).fill(0);
    const angles: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      angles.push(Math.atan2(dy, dx));
    }
    const turns: number[] = [];
    for (let i = 1; i < angles.length; i++) {
      let d = angles[i] - angles[i - 1];
      // wrap to [-pi, pi]
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      turns.push(d);
    }
    // resample turns to outLen
    const ptsTurns: EvalPoint[] = turns.map((v, i) => ({ x: i, y: v, timestamp: i }));
    const rs = resample(ptsTurns, outLen).map((p) => p.y);
    // z-normalize signature (avoid scale issues)
    const mean = rs.reduce((a, b) => a + b, 0) / outLen;
    const std =
      Math.sqrt(
        rs.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / Math.max(1, outLen - 1)
      ) || 1e-6;
    return rs.map((v) => (v - mean) / std);
  };

  const dtwWindowed = (a: EvalPoint[], b: EvalPoint[], windowFrac: number) => {
    const n = a.length;
    const m = b.length;
    const w = Math.max(1, Math.floor(windowFrac * Math.max(n, m)));
    const dp: number[][] = Array.from({ length: n + 1 }, () =>
      new Array<number>(m + 1).fill(Infinity)
    );
    dp[0][0] = 0;
    for (let i = 1; i <= n; i++) {
      const jStart = Math.max(1, i - w);
      const jEnd = Math.min(m, i + w);
      for (let j = jStart; j <= jEnd; j++) {
        const c = Math.hypot(a[i - 1].x - b[j - 1].x, a[i - 1].y - b[j - 1].y);
        dp[i][j] = c + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[n][m] / (n + m);
  };

  const hausdorff = (a: EvalPoint[], b: EvalPoint[]) => {
    const d = (p: EvalPoint, q: EvalPoint) => Math.hypot(p.x - q.x, p.y - q.y);
    const h = (p: EvalPoint[], q: EvalPoint[]) => {
      let maxMin = 0;
      for (let i = 0; i < p.length; i++) {
        let minD = Infinity;
        for (let j = 0; j < q.length; j++) {
          const dd = d(p[i], q[j]);
          if (dd < minD) minD = dd;
        }
        if (minD > maxMin) maxMin = minD;
      }
      return maxMin;
    };
    const hAB = h(a, b);
    const hBA = h(b, a);
    return Math.max(hAB, hBA);
  };

  const directionCosine = (pts: EvalPoint[]) => {
    const vx = pts[pts.length - 1].x - pts[0].x;
    const vy = pts[pts.length - 1].y - pts[0].y;
    const mag = Math.hypot(vx, vy) || 1e-6;
    const ux = vx / mag;
    const uy = vy / mag;
    return { ux, uy };
  };

  // Prepare normalized, resampled sequences
  const baseUser = resample(normalizeUnitSquare(toEval(userPoints)), SAMPLE_SIZE);
  const baseTarget = resample(normalizeUnitSquare(toEval(targetPoints)), SAMPLE_SIZE);

  // Reject degenerate strokes
  if (pathLength(baseUser) < 1e-3 || pathLength(baseTarget) < 1e-3) return 0;

  const evaluateSequence = (userSeq: EvalPoint[]) => {
    // Procrustes-like alignment: center, best rotation, no reflection
    const uC = center(userSeq);
    const tC = center(baseTarget);
    const theta = bestRotationAngle(uC, tC);
    const uAligned = rotate(uC, theta);

    // Compute metrics
    const dtwDist = dtwWindowed(uAligned, tC, DTW_WINDOW_FRAC);
    const dtwScore = Math.max(0, 1 - dtwDist);

    const hDist = hausdorff(uAligned, tC); // both centered and within ~unit square
    const hausdorffScore = Math.max(0, 1 - hDist);

    // MSE between corresponding points
    let mse = 0;
    for (let i = 0; i < uAligned.length; i++) {
      const dx = uAligned[i].x - tC[i].x;
      const dy = uAligned[i].y - tC[i].y;
      mse += dx * dx + dy * dy;
    }
    mse /= uAligned.length;
    const mseScore = Math.max(0, 1 - Math.sqrt(mse));

    // Curvature similarity
    const curU = curvatureSignature(uAligned, CURV_SIZE);
    const curT = curvatureSignature(tC, CURV_SIZE);
    let curDiff = 0;
    for (let i = 0; i < CURV_SIZE; i++) curDiff += Math.abs(curU[i] - curT[i]);
    curDiff /= CURV_SIZE;
    const curvatureScore = Math.max(0, 1 - Math.min(1, curDiff));

    // Direction and endpoint gating
    const uDir = directionCosine(userSeq);
    const tDir = directionCosine(baseTarget);
    const dirCos = Math.max(0, Math.min(1, uDir.ux * tDir.ux + uDir.uy * tDir.uy));
    const startDist = Math.hypot(userSeq[0].x - baseTarget[0].x, userSeq[0].y - baseTarget[0].y);
    const endDist = Math.hypot(
      userSeq[userSeq.length - 1].x - baseTarget[baseTarget.length - 1].x,
      userSeq[userSeq.length - 1].y - baseTarget[baseTarget.length - 1].y
    );
    const endpointScore = Math.max(0, 1 - (startDist + endDist) / 2);

    // Length ratio gate (using normalized shapes, but still informative)
    const lenU = pathLength(userSeq);
    const lenT = pathLength(baseTarget);
    const lenRatio = lenT > 0 ? Math.min(lenU, lenT) / Math.max(lenU, lenT) : 0;

    // Hard gates to reduce false positives
    if (hausdorffScore < 0.2) return 0;
    if (curvatureScore < 0.2) return 0;

    // Weighted aggregate
    const score =
      0.3 * dtwScore +
      0.25 * hausdorffScore +
      0.2 * mseScore +
      0.15 * curvatureScore +
      0.07 * endpointScore +
      0.03 * lenRatio;

    // Direction acts as soft gate multiplier
    const gated = score * (0.6 + 0.4 * dirCos);
    return Math.max(0, Math.min(1, gated));
  };

  const directScore = evaluateSequence(baseUser);
  const reversedScore = evaluateSequence([...baseUser].reverse()) * REVERSE_PENALTY;
  const finalScore = Math.max(directScore, reversedScore);

  return Math.max(0, Math.min(1, finalScore));
};

/**
 * Given centerline points, produce an SVG path for the smoothed stroke outline.
 *
 * Simulating pressure by default
 *
 * **This function should be applied to point array only once** otherwise it distorts it
 */
export function getSmoothenedPoints(
  points: GesturePoints[],
  options: Partial<StrokeOptions> = {}
): GesturePoints[] {
  const stroke = getStroke(points, {
    // reasonable defaults; callers typically override size
    size: 16,
    smoothing: 0.5,
    thinning: 0.5,
    streamline: 0.5,
    easing: (t) => t,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true },
    simulatePressure: false,
    ...options
  });
  return stroke as GesturePoints[];
}

/**
 * Convert perfect-freehand stroke outline points to SVG path string
 */
export function pointsToSvgPath(points: GesturePoints[]): string {
  if (!points || points.length === 0) return '';

  const pathCommands: string[] = [];

  // Move to the first point
  const [x0, y0] = points[0];
  pathCommands.push(`M ${x0.toFixed(2)} ${y0.toFixed(2)}`);

  // Draw lines to all subsequent points
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    pathCommands.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  // Close the path (perfect-freehand returns a closed polygon)
  pathCommands.push('Z');

  return pathCommands.join(' ');
}
