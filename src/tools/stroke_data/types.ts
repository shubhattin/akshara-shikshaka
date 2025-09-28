import { z } from 'zod';

/*
 * linear : Equal to cubic-bezier(0.0, 0.0, 1.0, 1.0), animates at an even speed.
 * ease : Equal to cubic-bezier(0.25, 0.1, 0.25, 1.0), the default value, increases in velocity towards the middle of the animation, slowing back down at the end.
 * ease-in: Equal to cubic-bezier(0.42, 0, 1.0, 1.0), starts off slowly, with the speed of the transition of the animating property increasing until complete.
 * ease-out: Equal to cubic-bezier(0, 0, 0.58, 1.0), starts quickly, slowing down the animation continues.
 * ease-in-out: Equal to cubic-bezier(0.42, 0, 0.58, 1.0), with the animating properties slowly transitioning, speeding up, and then slowing down again.
 */
const ANIMATION_FUNCTIONS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'] as const;
export const AnimationsFunctionsEnumSchema = z.enum(ANIMATION_FUNCTIONS);

/*
 * `M` (Move to) `[x, y]` :- Move to point (x, y)
 *
 * `L` (Line to) `[x, y]` :- Line to point (x, y)
 *
 * `Q` (Quadratic Bezier Curve) `[cpx, cpy, x, y]` :- Quadratic Bezier Curve from current point to (x, y) with control point (cpx, cpy)
 */

/**
 * The points recorded and stored are raw and they are only smoothened and processed for display at runtime
 */
export const StrokePathSchema = z.tuple([z.number(), z.number()]);

export const GestureSchema = z.object({
  index: z.number().int(),
  width: z.number(),
  color: z.string(),
  duration: z.number(),
  anim_fn: AnimationsFunctionsEnumSchema,
  simulate_pressure: z.boolean(),
  points: z.array(StrokePathSchema)
});
export const AnimationGestureSchema = GestureSchema.pick({
  index: true,
  width: true,
  color: true,
  points: true,
  simulate_pressure: true
}).extend({
  isAnimatedPath: z.boolean().optional()
});

export type GesturePoints = z.infer<typeof StrokePathSchema>;

export type Gesture = z.infer<typeof GestureSchema>;
export type AnimationGesture = z.infer<typeof AnimationGestureSchema>;

export const CANVAS_DIMS = {
  width: 400,
  height: 400
} as const;

export const GESTURE_GAP_DURATION = 100;

// Enhanced types for HanziWriter-inspired approach
export interface GestureMatchOptions {
  targetGestures: Gesture[];
  currentGestureIndex: number;
  leniency?: number;
  isOutlineVisible?: boolean;
  strictPedagogy?: boolean;
  scriptType?: keyof typeof INDIC_SCRIPT_CONFIG;
}

export interface GestureEvaluationResult {
  accuracy: number;
  isCorrectStroke: boolean;
  isValid: boolean;
  suggestedIndex?: number;
  feedback: string[];
  metrics?: DetailedMetrics;
}

export interface DetailedMetrics {
  dtw: number;
  hausdorff: number;
  mse: number;
  curvature: number;
  direction: number;
  endpoints: number;
  length: number;
}

export interface StrokeComplexityMetrics {
  curvatureVariation: number;
  directionChanges: number;
  pathLength: number;
  normalizedComplexity: number;
}

// Indian script specific configurations
export const INDIC_SCRIPT_CONFIG = {
  DEVANAGARI: {
    horizontalStrokeBonus: 1.1,
    curveComplexityWeight: 0.8,
    conjunctLeniency: 1.2,
    baseThreshold: 0.7 as number
  },
  TAMIL: {
    curveComplexityWeight: 1.2,
    endpointWeight: 0.9,
    baseThreshold: 0.65 as number
  },
  TELUGU: {
    curveComplexityWeight: 1.1,
    baseThreshold: 0.68 as number
  },
  KANNADA: {
    curveComplexityWeight: 1.0,
    baseThreshold: 0.7 as number
  },
  MALAYALAM: {
    curveComplexityWeight: 1.15,
    baseThreshold: 0.66 as number
  },
  ODIA: {
    curveComplexityWeight: 1.05,
    baseThreshold: 0.69 as number
  }
} as const;
