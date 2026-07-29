import z from 'zod';
import { publicProcedure, t, runTrpcEffect, verify_cloudflare_turnstile_token } from '../trpc_init';
import { user_gesture_recording_vectors, user_gesture_recordings } from '~/db/schema';
import { Effect } from 'effect';
import { dbTransaction } from '~/effect/database';
import { BadRequestError } from '~/effect/errors';

const submit_user_gesture_recording_route = publicProcedure
  .input(
    z.object({
      turnstile_token: z.string(),
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
  .mutation(async ({ input }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        const is_valid = yield* Effect.tryPromise({
          try: () => verify_cloudflare_turnstile_token(input.turnstile_token),
          catch: (cause) => cause
        }).pipe(
          Effect.map((success) => success === true),
          Effect.catch(() => Effect.succeed(false))
        );

        if (!is_valid) {
          return yield* Effect.fail(BadRequestError.make({ message: 'Invalid turnstile token' }));
        }

        const { id } = yield* dbTransaction('submit_user_gesture_recording', async (tx) => {
          const [{ id }] = await tx
            .insert(user_gesture_recordings)
            .values({
              text: input.text,
              script_id: input.script_id,
              completed: input.completed
            })
            .returning();

          await tx.insert(user_gesture_recording_vectors).values(
            input.vectors.map((vector) => ({
              ...vector,
              user_gesture_recording_id: id
            }))
          );

          return { id };
        });

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
