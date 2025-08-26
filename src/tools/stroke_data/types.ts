import { z } from 'zod';

export const StrokePointSchema = z.object({
  x: z.number(),
  y: z.number(),
  timestamp: z.number(),
  cmd: z.enum(['M', 'L', 'Q']),
  cx: z.number().optional(),
  cy: z.number().optional()
});

export const GestureSchema = z.object({
  order: z.number(),
  brush_width: z.number(),
  brush_color: z.string(),
  animation_duration: z.number(),
  points: z.array(StrokePointSchema)
});

export type GesturePoint = z.infer<typeof StrokePointSchema>;

export type Gesture = z.infer<typeof GestureSchema>;

export const GESTURE_FLAGS = {
  isGestureVisualization: 'isGestureVisualization',
  isMainCharacterPath: 'isMainCharacterPath',
  /** The strokes which are manually drawn by the user */
  isUserStroke: 'isUserStroke',
  /** Stroke for the current Gesture */
  isCurrentAnimatedGesture: 'isCurrentAnimatedStroke'
} as const;

export const CANVAS_DIMS = {
  width: 400,
  height: 400
} as const;

export const GESTURE_GAP_DURATION = 100 as const;
