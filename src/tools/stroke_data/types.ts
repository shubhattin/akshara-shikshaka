import { z } from 'zod';

export const StrokePointSchema = z
  .object({
    x: z.number(),
    y: z.number()
  })
  .strict();

export const GestureSchema = z
  .object({
    index: z.number().int(),
    width: z.number(),
    color: z.string(),
    duration: z.number(),
    points: z.array(StrokePointSchema)
  })
  .strict();

export type GesturePoint = z.infer<typeof StrokePointSchema>;

export type Gesture = z.infer<typeof GestureSchema>;

export const CANVAS_DIMS = {
  width: 400,
  height: 400
} as const;

export const GESTURE_GAP_DURATION = 100 as const;
