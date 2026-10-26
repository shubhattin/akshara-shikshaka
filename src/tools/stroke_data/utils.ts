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
  maxSteps: z.int().min(2).optional().prefault(50)
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
      streamline: 0.5,
      simulatePressure: gesture.simulate_pressure
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
  // SAFETY: validated at boundary - type assertion is safe based on prior schema check.
  return stroke as GesturePoints[];
}

// /**
//  * Convert perfect-freehand stroke outline points to SVG path string
//  */
// export function pointsToSvgPath(points: GesturePoints[]): string {
//   if (!points || points.length === 0) return '';

//   const pathCommands: string[] = [];

//   // Move to the first point
//   const [x0, y0] = points[0];
//   pathCommands.push(`M ${x0.toFixed(2)} ${y0.toFixed(2)}`);

//   // Draw lines to all subsequent points
//   for (let i = 1; i < points.length; i++) {
//     const [x, y] = points[i];
//     pathCommands.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
//   }

//   // Close the path (perfect-freehand returns a closed polygon)
//   pathCommands.push('Z');

//   return pathCommands.join(' ');
// }

const average = (a: number, b: number) => (a + b) / 2;

export function pointsToSvgPath(points: GesturePoints[], closed = true) {
  const len = points.length;

  if (len < 4) {
    return ``;
  }

  let a = points[0];
  let b = points[1];
  const c = points[2];

  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(
    2
  )},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(b[1], c[1]).toFixed(2)} T`;

  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i];
    b = points[i + 1];
    result += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(2)} `;
  }

  if (closed) {
    result += 'Z';
  }

  return result;
}

/*
The simulate pressure option works by making a boundary and a complete polygon around the stroke.
*/
