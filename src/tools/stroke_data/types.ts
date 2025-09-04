import { z } from 'zod';

export const StrokePointSchema = z.tuple([z.number(), z.number()]);

export const GestureSchema = z.object({
  index: z.number().int(),
  width: z.number(),
  color: z.string(),
  duration: z.number(),
  points: z.array(StrokePointSchema)
});
export const AnimationGestureSchema = GestureSchema.pick({
  index: true,
  width: true,
  color: true
}).extend({
  points_flat: z.number().array()
});

export type GesturePoint = z.infer<typeof StrokePointSchema>;

export type Gesture = z.infer<typeof GestureSchema>;
export type AnimationGesture = z.infer<typeof AnimationGestureSchema>;

export const CANVAS_DIMS = {
  width: 400,
  height: 400
} as const;

export const GESTURE_GAP_DURATION = 100 as const;
