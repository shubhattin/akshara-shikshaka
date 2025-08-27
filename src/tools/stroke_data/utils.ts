import type { Gesture, GesturePoint } from './types';

// Utility: sample a stroke (with optional quadratic segments) into a polyline for playback
function sampleGestureToPolyline(
  stroke: Gesture,
  samplesPerSegment = 12
): { x: number; y: number }[] {
  const sampled: { x: number; y: number }[] = [];
  if (!stroke.points.length) return sampled;
  for (let i = 0; i < stroke.points.length; i++) {
    const point = stroke.points[i];
    if (i === 0) {
      sampled.push({ x: point.x, y: point.y });
      continue;
    }
    const prev = stroke.points[i - 1];
    if (point.cmd === 'Q' && typeof point.cx === 'number' && typeof point.cy === 'number') {
      const p0 = { x: prev.x, y: prev.y };
      const p1 = { x: point.cx, y: point.cy };
      const p2 = { x: point.x, y: point.y };
      for (let s = 1; s <= samplesPerSegment; s++) {
        const t = s / samplesPerSegment;
        const mt = 1 - t;
        const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
        const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
        sampled.push({ x, y });
      }
    } else {
      sampled.push({ x: point.x, y: point.y });
    }
  }
  return sampled;
}

// Framework-agnostic gesture animation data generator
export interface GestureAnimationFrame {
  step: number;
  totalSteps: number;
  progress: number;
  pointIndex: number;
  partialPoints: { x: number; y: number }[];
  partialSvgPath: string;
  isComplete: boolean;
}

export function* generateGestureAnimationFrames(
  gesture: Gesture,
  maxSteps: number = 50
): Generator<GestureAnimationFrame> {
  if (!gesture.points.length) return;

  const sampledPoints = sampleGestureToPolyline(gesture);
  const totalPoints = sampledPoints.length;
  const animationSteps = Math.min(totalPoints * 2, maxSteps);

  for (let step = 1; step <= animationSteps; step++) {
    const progress = step / animationSteps;
    const pointIndex = Math.floor(progress * (totalPoints - 1));

    // Get partial points up to current position
    const partialPoints = sampledPoints.slice(0, pointIndex + 1);

    // Add interpolated point for smooth animation
    if (pointIndex < totalPoints - 1) {
      const currentPoint = sampledPoints[pointIndex];
      const nextPoint = sampledPoints[pointIndex + 1];
      const subProgress = (progress * (totalPoints - 1)) % 1;

      const interpolatedX = currentPoint.x + (nextPoint.x - currentPoint.x) * subProgress;
      const interpolatedY = currentPoint.y + (nextPoint.y - currentPoint.y) * subProgress;

      partialPoints.push({ x: interpolatedX, y: interpolatedY });
    }

    // Build SVG path for current frame
    let partialSvgPath = '';
    partialPoints.forEach((point, i) => {
      if (i === 0) {
        partialSvgPath += `M ${point.x} ${point.y}`;
      } else {
        partialSvgPath += ` L ${point.x} ${point.y}`;
      }
    });

    yield {
      step,
      totalSteps: animationSteps,
      progress,
      pointIndex,
      partialPoints,
      partialSvgPath,
      isComplete: step === animationSteps
    };
  }
}

// Simple promise-based animation helper
export async function animateGesture(
  gesture: Gesture,
  onFrame: (frame: GestureAnimationFrame) => void,
  maxSteps: number = 50
): Promise<void> {
  const generator = generateGestureAnimationFrames(gesture, maxSteps);
  const stepDuration = gesture.animation_duration / maxSteps;

  for (const frame of generator) {
    onFrame(frame);

    if (!frame.isComplete) {
      await new Promise((resolve) => setTimeout(resolve, stepDuration));
    }
  }
}

// better
export const evaluateStrokeAccuracy = (
  userPoints: GesturePoint[],
  targetPoints: GesturePoint[]
): number => {
  if (userPoints.length < 2 || targetPoints.length < 2) return 0;
  type EvalPoint = { x: number; y: number; timestamp: number };

  // 1) Normalize and resample both sequences to fixed length
  const SAMPLE_SIZE = 64;
  const normalize = (pts: EvalPoint[]) => {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const scale = 1 / Math.max(w, h);
    return pts.map((p) => ({ x: (p.x - minX) * scale, y: (p.y - minY) * scale, timestamp: 0 }));
  };

  const resample = (pts: EvalPoint[], n: number) => {
    if (pts.length === n) return pts;
    const dists: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      dists[i] = dists[i - 1] + Math.hypot(dx, dy);
    }
    const total = dists[dists.length - 1] || 1;
    const step = total / (n - 1);
    const res: EvalPoint[] = [];
    let target = 0;
    let j = 0;
    for (let i = 0; i < n; i++) {
      while (j < dists.length - 1 && dists[j] < target) j++;
      const prev = Math.max(0, j - 1);
      const t = dists[j] === dists[prev] ? 0 : (target - dists[prev]) / (dists[j] - dists[prev]);
      const x = pts[prev].x + (pts[j].x - pts[prev].x) * t;
      const y = pts[prev].y + (pts[j].y - pts[prev].y) * t;
      res.push({ x, y, timestamp: i });
      target = i * step;
    }
    return res;
  };

  // Flatten potential curves to polylines for fair comparison
  const flatten = (pts: GesturePoint[]): EvalPoint[] =>
    sampleGestureToPolyline({ order: 0, points: pts } as any, 20).map((p, i) => ({
      x: p.x,
      y: p.y,
      timestamp: i
    }));

  const uNorm = normalize(flatten(userPoints));
  const tNorm = normalize(flatten(targetPoints));
  const u = resample(uNorm, SAMPLE_SIZE);
  const t = resample(tNorm, SAMPLE_SIZE);

  // 2) Compute direction similarity (cosine between overall vectors)
  const vec = (pts: EvalPoint[]) => ({
    x: pts[pts.length - 1].x - pts[0].x,
    y: pts[pts.length - 1].y - pts[0].y
  });
  const dot = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.x + a.y * b.y;
  const mag = (a: { x: number; y: number }) => Math.hypot(a.x, a.y) || 1e-6;
  const vU = vec(u);
  const vT = vec(t);
  const directionCos = Math.max(0, Math.min(1, dot(vU, vT) / (mag(vU) * mag(vT))));

  // 3) Endpoint proximity
  const endDist = Math.hypot(
    u[u.length - 1].x - t[t.length - 1].x,
    u[u.length - 1].y - t[t.length - 1].y
  );
  const startDist = Math.hypot(u[0].x - t[0].x, u[0].y - t[0].y);
  const endpointScore = Math.max(0, 1 - (startDist + endDist) / 2);

  // 4) DTW path similarity for shape matching
  const dtw = (a: EvalPoint[], b: EvalPoint[]) => {
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
    dp[0][0] = 0;
    const cost = (i: number, j: number) => Math.hypot(a[i].x - b[j].x, a[i].y - b[j].y);
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const c = cost(i - 1, j - 1);
        dp[i][j] = c + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[n][m] / (n + m);
  };

  const dtwDist = dtw(u, t);
  const dtwScore = Math.max(0, 1 - dtwDist); // since coords are normalized to ~[0,1], distance ~[0,2]

  // 5) Path length ratio (to discourage overly short/long)
  const lengthOf = (pts: EvalPoint[]) =>
    pts.reduce((acc, p, i) => {
      if (i === 0) return 0;
      return acc + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    }, 0);
  const lenU = lengthOf(u);
  const lenT = lengthOf(t);
  const lenRatio = lenT > 0 ? Math.min(lenU, lenT) / Math.max(lenU, lenT) : 0;

  // Weighted aggregate score
  const score = 0.45 * dtwScore + 0.2 * directionCos + 0.2 * endpointScore + 0.15 * lenRatio;

  return Math.max(0, Math.min(1, score));
};
