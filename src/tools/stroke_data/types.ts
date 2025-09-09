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

export const StrokePointSchema = z.tuple([z.number(), z.number()]);

export const GestureSchema = z.object({
  index: z.number().int(),
  width: z.number(),
  color: z.string(),
  duration: z.number(),
  anim_fn: AnimationsFunctionsEnumSchema,
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

export const GESTURE_GAP_DURATION = 100;
export const KONVA_LINE_TENSION = 0.5;
