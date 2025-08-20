import { z } from 'zod';

export const StrokePointSchema = z.object({
  x: z.number(),
  y: z.number(),
  timestamp: z.number(),
  cmd: z.enum(['M', 'L', 'Q']),
  cx: z.number().optional(),
  cy: z.number().optional()
});

export const StrokeSchema = z.object({
  order: z.number(),
  points: z.array(StrokePointSchema)
});

export const GestureSchema = z.object({
  order: z.number(),
  strokes: z.array(StrokeSchema),
  brush_width: z.number(),
  brush_color: z.string(),
  animation_duration: z.number()
});

export const StrokeDataSchema = z.object({
  gestures: z.array(GestureSchema)
});

export type StrokePoint = z.infer<typeof StrokePointSchema>;

export type Stroke = z.infer<typeof StrokeSchema>;

export type Gesture = z.infer<typeof GestureSchema>;

export type GestureData = z.infer<typeof StrokeDataSchema>;

export const GESTURE_FLAGS = {
  isGestureVisualization: 'isGestureVisualization',
  isMainCharacterPath: 'isMainCharacterPath'
} as const;

export const CANVAS_DIMS = {
  width: 400,
  height: 400
} as const;
