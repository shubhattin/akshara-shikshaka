import type { Gesture, Stroke } from './types';
import { Canvas } from 'fabric';
import * as fabric from 'fabric';

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
  fabricCanvasRef: React.RefObject<Canvas | null>
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
      isGestureVisualization: true,
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
