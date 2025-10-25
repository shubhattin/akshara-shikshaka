import z from 'zod';
import { publicProcedure, t } from '../trpc_init';
import { user_gesture_recording_vectors, user_gesture_recordings } from '~/db/schema';
import { db } from '~/db/db';

const submit_user_gesture_recording_route = publicProcedure
  .input(
    z.object({
      text: z.string().min(1),
      script_id: z.number().int(),
      completed: z.boolean().optional(),
      vectors: z.array(
        z.object({
          index: z.number().int(),
          recorded_vector: z.array(z.number()).min(2),
          drawn_vector: z.array(z.number()).min(2),
          recorded_accuracy: z.number().min(0).max(1)
        })
      )
    })
  )
  .mutation(async ({ input }) => {
    const [{ id }] = await db
      .insert(user_gesture_recordings)
      .values({
        text: input.text,
        script_id: input.script_id,
        completed: input.completed
      })
      .returning();

    await db.insert(user_gesture_recording_vectors).values(
      input.vectors.map((vector) => ({
        ...vector,
        user_gesture_recording_id: id
      }))
    );

    return {
      success: true,
      recording_id: id
    };
  });

export const user_gesture_recordings_router = t.router({
  submit_user_gesture_recording: submit_user_gesture_recording_route
});
