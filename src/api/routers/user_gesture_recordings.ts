import z from 'zod';
import { publicProcedure, t, verify_cloudflare_turnstile_token } from '../trpc_init';
import { user_gesture_recording_vectors, user_gesture_recordings } from '~/db/schema';
import { db } from '~/db/db';
import { TRPCError } from '@trpc/server';

const submit_user_gesture_recording_route = publicProcedure
  .input(
    z.object({
      turnstile_token: z.string(),
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
    const is_valid = await verify_cloudflare_turnstile_token(input.turnstile_token);
    if (!is_valid) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid turnstile token' });
    }
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
