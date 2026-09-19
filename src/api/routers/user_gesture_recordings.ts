import z from 'zod';
import { Effect } from 'effect';
import { publicProcedure, t } from '../trpc_init';
import { runTrpcEffect } from '~/effect/run';
import { user_gesture_recording_vectors, user_gesture_recordings } from '~/db/schema';
import { dbRunHttp } from '~/effect/database';
import { optional_turnstile_token_schema, requireTurnstileIfGuest } from './turnstile_guard';
import { sessionUserFields } from './user/session_user';
import { CACHE, invalidateAndRefreshCache } from '~/effect/cache';

const submit_user_gesture_recording_route = publicProcedure
  .input(
    z.object({
      turnstile_token: optional_turnstile_token_schema,
      text: z.string().min(1),
      script_id: z.int(),
      completed: z.boolean().optional(),
      vectors: z.array(
        z.object({
          index: z.int(),
          recorded_vector: z.array(z.number()).min(2),
          drawn_vector: z.array(z.number()).min(2),
          recorded_accuracy: z.number().min(0).max(1)
        })
      )
    })
  )
  .mutation(async ({ input, ctx }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        yield* requireTurnstileIfGuest(input.turnstile_token, ctx.user);

        const userFields = sessionUserFields(ctx.user);
        const { id } = yield* dbRunHttp('submit_user_gesture_recording', async (db) => {
          const [{ id }] = await db
            .insert(user_gesture_recordings)
            .values({
              text: input.text,
              script_id: input.script_id,
              completed: input.completed,
              user_id: userFields.user_id
            })
            .returning();

          await db.insert(user_gesture_recording_vectors).values(
            input.vectors.map((vector) => ({
              ...vector,
              user_gesture_recording_id: id
            }))
          );

          return { id };
        });

        if (userFields.user_id) {
          yield* invalidateAndRefreshCache({
            cache: CACHE.user.dashboard,
            params: { userId: userFields.user_id }
          });
        }

        return {
          success: true as const,
          recording_id: id
        };
      })
    )
  );

export const user_gesture_recordings_router = t.router({
  submit_user_gesture_recording: submit_user_gesture_recording_route
});
