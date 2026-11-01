import z from 'zod';
import { Effect } from 'effect';
import { publicProcedure, t } from '../trpc_init';
import { runTrpcEffect } from '~/effect/run';
import { user_gesture_recording_vectors, user_gesture_recordings } from '~/db/schema';
import { dbRunHttp } from '~/effect/database';
import { BadRequestError, NotFoundError } from '~/effect/errors';
import { scoreGlyphStroke } from '~/tools/stroke_data/gesture_scoring';
import type { GesturePoints } from '~/tools/stroke_data/types';
import { optional_turnstile_token_schema, requireTurnstileIfGuest } from './turnstile_guard';
import { sessionUserFields } from './user/session_user';
import { CACHE, invalidateAndRefreshCache } from '~/util/cache.server/cache_loaders';

const submit_user_gesture_recording_route = publicProcedure
  .input(
    z.object({
      turnstile_token: optional_turnstile_token_schema,
      gesture_id: z.int().positive(),
      gesture_uuid: z.uuid(),
      completed: z.boolean().optional(),
      vectors: z
        .array(
          z.object({
            index: z.int().nonnegative(),
            drawn_vector: z.array(z.number()).min(2).max(20000),
            min_tolerance: z.number().positive().max(200).optional()
          })
        )
        .min(1)
        .max(64)
    })
  )
  .mutation(async ({ input, ctx }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        yield* requireTurnstileIfGuest(input.turnstile_token, ctx.user);

        const userFields = sessionUserFields(ctx.user);

        const gesture = yield* dbRunHttp('submit_user_gesture_recording.fetch_gesture', (db) =>
          db.query.text_gestures.findFirst({
            where: (table, { and, eq }) =>
              and(eq(table.id, input.gesture_id), eq(table.uuid, input.gesture_uuid)),
            columns: {
              id: true,
              uuid: true,
              text: true,
              script_id: true,
              gestures: true
            }
          })
        );

        if (!gesture) {
          return yield* Effect.fail(
            NotFoundError.make({ resource: 'text_gesture', message: 'Text gesture not found' })
          );
        }

        const strokes = gesture.gestures.map((g) => g.points);
        const scored = input.vectors.map((vector) => {
          const target = strokes[vector.index];
          if (!target) {
            return { ok: false as const, index: vector.index };
          }
          if (vector.drawn_vector.length % 2 !== 0) {
            return { ok: false as const, index: vector.index };
          }
          const drawn: GesturePoints[] = [];
          for (let i = 0; i < vector.drawn_vector.length; i += 2) {
            const x = vector.drawn_vector[i];
            const y = vector.drawn_vector[i + 1];
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
              return { ok: false as const, index: vector.index };
            }
            drawn.push([x, y]);
          }
          const result = scoreGlyphStroke(drawn, strokes, vector.index, {
            minTolerance: vector.min_tolerance
          });
          return {
            ok: true as const,
            index: vector.index,
            recorded_vector: target.flatMap(([x, y]) => [x, y]),
            drawn_vector: vector.drawn_vector,
            recorded_accuracy: result.score
          };
        });

        const bad = scored.find((s) => !s.ok);
        if (bad) {
          return yield* Effect.fail(
            BadRequestError.make({ message: `No stroke ${bad.index} on this gesture` })
          );
        }

        const { id } = yield* dbRunHttp('submit_user_gesture_recording', async (db) => {
          const [{ id }] = await db
            .insert(user_gesture_recordings)
            .values({
              text: gesture.text,
              script_id: gesture.script_id,
              completed: input.completed,
              user_id: userFields.user_id
            })
            .returning();

          await db.insert(user_gesture_recording_vectors).values(
            // SAFETY: filtered by the bad-index check above; every entry is ok here.
            (scored as Extract<(typeof scored)[number], { ok: true }>[]).map((vector) => ({
              index: vector.index,
              recorded_vector: vector.recorded_vector,
              drawn_vector: vector.drawn_vector,
              recorded_accuracy: vector.recorded_accuracy,
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
