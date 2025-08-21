import type { Gesture, Stroke, StrokePoint } from './types';
import { Canvas } from 'fabric';
import * as fabric from 'fabric';
import { GESTURE_FLAGS } from './types';

// Utility: sample a stroke (with optional quadratic segments) into a polyline for playback
export function sampleStrokeToPolyline(
  stroke: Stroke,
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

export function buildSvgPathFromStroke(stroke: Stroke): string {
  let path = '';
  stroke.points.forEach((pt, idx) => {
    // First point must always start with a move command
    if (idx === 0 || pt.cmd === 'M') {
      path += `M ${pt.x} ${pt.y}`;
      return;
    }

    if (pt.cmd === 'L') {
      path += ` L ${pt.x} ${pt.y}`;
    } else if (pt.cmd === 'Q' && typeof pt.cx === 'number' && typeof pt.cy === 'number') {
      path += ` Q ${pt.cx} ${pt.cy} ${pt.x} ${pt.y}`;
    } else {
      // Fallback to a simple line if command is unknown
      path += ` L ${pt.x} ${pt.y}`;
    }
  });
  return path;
}

export const playGestureWithoutClear = async (
  gesture: Gesture,
  fabricCanvasRef: React.RefObject<Canvas | null>,
  extraFlags: Record<string, unknown> = {}
) => {
  if (!fabricCanvasRef.current) return;

  for (const stroke of gesture.strokes) {
    if (stroke.points.length < 2) continue;

    // Create a path for smooth animation (sample curves to polyline)
    const sampledPoints = sampleStrokeToPolyline(stroke);

    // Build the full SVG path respecting the original stroke commands (M, L, Q)
    const pathString = buildSvgPathFromStroke(stroke);

    // Create the full path but make it invisible initially
    const fullPath = new fabric.Path(pathString, {
      stroke: gesture.brush_color,
      strokeWidth: gesture.brush_width,
      fill: '',
      selectable: false,
      evented: false,
      [GESTURE_FLAGS.isGestureVisualization]: true,
      opacity: 0
    } as any);

    fabricCanvasRef.current.add(fullPath);

    // Animate the path drawing
    const totalPoints = sampledPoints.length;
    const animationSteps = Math.min(totalPoints * 2, 50); // More steps for smoother animation

    for (let step = 1; step <= animationSteps; step++) {
      const progress = step / animationSteps;
      const pointIndex = Math.floor(progress * (totalPoints - 1));

      // Create partial path up to current point
      let partialPath = '';
      for (let i = 0; i <= pointIndex; i++) {
        if (i === 0) {
          partialPath += `M ${sampledPoints[i].x} ${sampledPoints[i].y}`;
        } else {
          partialPath += ` L ${sampledPoints[i].x} ${sampledPoints[i].y}`;
        }
      }

      // Add interpolated point for smooth animation
      if (pointIndex < totalPoints - 1) {
        const currentPoint = sampledPoints[pointIndex];
        const nextPoint = sampledPoints[pointIndex + 1];
        const subProgress = (progress * (totalPoints - 1)) % 1;

        const interpolatedX = currentPoint.x + (nextPoint.x - currentPoint.x) * subProgress;
        const interpolatedY = currentPoint.y + (nextPoint.y - currentPoint.y) * subProgress;

        partialPath += ` L ${interpolatedX} ${interpolatedY}`;
      }

      // Update the path
      fullPath.set('path', fabric.util.parsePath(partialPath));
      fullPath.set('opacity', 1);
      fabricCanvasRef.current.renderAll();

      // Wait based on animation duration
      const delay = gesture.animation_duration / animationSteps;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

export async function playStrokeWithoutClear(
  stroke: Stroke,
  brushColor: string,
  brushWidth: number,
  animationDuration: number,
  fabricCanvasRef: React.RefObject<Canvas | null>,
  extraPathProps?: Record<string, unknown>
): Promise<void> {
  if (!fabricCanvasRef.current || stroke.points.length < 2) return;

  const sampledPoints = sampleStrokeToPolyline(stroke);
  const pathString = buildSvgPathFromStroke(stroke);

  const fullPath = new fabric.Path(pathString, {
    stroke: brushColor,
    strokeWidth: brushWidth,
    fill: '',
    selectable: false,
    evented: false,
    isGestureVisualization: true,
    opacity: 0,
    ...(extraPathProps || {})
  } as any);

  fabricCanvasRef.current.add(fullPath);

  const totalPoints = sampledPoints.length;
  const animationSteps = Math.min(totalPoints * 2, 50);

  for (let step = 1; step <= animationSteps; step++) {
    const progress = step / animationSteps;
    const pointIndex = Math.floor(progress * (totalPoints - 1));

    let partialPath = '';
    for (let i = 0; i <= pointIndex; i++) {
      if (i === 0) {
        partialPath += `M ${sampledPoints[i].x} ${sampledPoints[i].y}`;
      } else {
        partialPath += ` L ${sampledPoints[i].x} ${sampledPoints[i].y}`;
      }
    }

    if (pointIndex < totalPoints - 1) {
      const currentPoint = sampledPoints[pointIndex];
      const nextPoint = sampledPoints[pointIndex + 1];
      const subProgress = (progress * (totalPoints - 1)) % 1;

      const interpolatedX = currentPoint.x + (nextPoint.x - currentPoint.x) * subProgress;
      const interpolatedY = currentPoint.y + (nextPoint.y - currentPoint.y) * subProgress;

      partialPath += ` L ${interpolatedX} ${interpolatedY}`;
    }

    fullPath.set('path', fabric.util.parsePath(partialPath));
    fullPath.set('opacity', 1);
    fabricCanvasRef.current.renderAll();

    const delay = animationDuration / animationSteps;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export const evaluateStrokeAccuracy = (
  userPoints: StrokePoint[],
  targetPoints: StrokePoint[]
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
  const flatten = (pts: StrokePoint[]): EvalPoint[] =>
    sampleStrokeToPolyline({ order: 0, points: pts } as any, 20).map((p, i) => ({
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
