import { z } from 'zod';
import { Effect } from 'effect';
import {
  and,
  avg,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  sql,
  type SQL
} from 'drizzle-orm';
import { t, protectedAdminProcedure } from '../trpc_init';
import { user_gesture_recordings, user_gesture_recording_vectors } from '~/db/schema';
import { dbRunHttp } from '~/effect/database';
import { runTrpcEffect } from '~/effect/run';
import { resolveAuthUserNames } from '~/lib/auth_users.server';
import { displayUserName } from './user/session_user';

const date_range_schema = z
  .object({
    all_time: z.boolean(),
    start_date: z.date().optional(),
    end_date: z.date().optional()
  })
  .superRefine((data, ctx) => {
    if (!data.all_time && (!data.start_date || !data.end_date)) {
      ctx.addIssue({
        code: 'custom',
        message: 'start_date and end_date are required when all_time is false',
        path: ['start_date']
      });
    }
    if (!data.all_time && data.start_date && data.end_date && data.start_date > data.end_date) {
      ctx.addIssue({
        code: 'custom',
        message: 'start_date must be before end_date',
        path: ['end_date']
      });
    }
  });

const gesture_key_schema = z.object({
  text: z.string().min(1),
  script_id: z.int()
});

const completion_filter_schema = z.enum(['all', 'completed', 'incomplete']).default('all');

function recordingDateConditions(
  all_time: boolean,
  start_date: Date | undefined,
  end_date: Date | undefined
) {
  if (all_time || !start_date || !end_date) return [];
  return [
    gte(user_gesture_recordings.created_at, start_date),
    lte(user_gesture_recordings.created_at, end_date)
  ];
}

/** Split large IN lists so Postgres stays happy as submission volume grows. */
function chunkIds(ids: number[], size = 1000): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

const get_stats_data_input_schema = date_range_schema.extend({
  gesture_keys: z.array(gesture_key_schema).max(50).optional(),
  script_ids: z.array(z.int()).max(50).optional(),
  completion: completion_filter_schema
});

const get_stats_data_route = protectedAdminProcedure
  .input(get_stats_data_input_schema)
  .query(({ input }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        const { gesture_keys, script_ids, completion, all_time, start_date, end_date } = input;

        const recordings = yield* dbRunHttp('gesture_stats.list_recordings', (client) =>
          client.query.user_gesture_recordings.findMany({
            columns: {
              id: true,
              created_at: true,
              completed: true,
              text: true,
              script_id: true
            },
            where: (tbl, { and: andFn, inArray: inArrayFn, eq: eqFn }) => {
              const conditions = [...recordingDateConditions(all_time, start_date, end_date)];
              if (script_ids && script_ids.length > 0) {
                conditions.push(inArrayFn(tbl.script_id, script_ids));
              }
              if (gesture_keys && gesture_keys.length > 0) {
                conditions.push(
                  inArrayFn(
                    tbl.text,
                    gesture_keys.map((k) => k.text)
                  )
                );
              }
              if (completion === 'completed') conditions.push(eqFn(tbl.completed, true));
              if (completion === 'incomplete') conditions.push(eqFn(tbl.completed, false));
              return conditions.length > 0 ? andFn(...conditions) : undefined;
            }
          })
        );

        // gesture_keys pair (text, script_id) — the text-only IN above can over-match
        // across scripts, so narrow to exact pairs in JS (cheap; result set is bounded).
        const wantedPairs =
          gesture_keys && gesture_keys.length > 0
            ? new Set(gesture_keys.map((k) => `${k.script_id}::${k.text}`))
            : null;
        const filteredRecordings = wantedPairs
          ? recordings.filter((r) => wantedPairs.has(`${r.script_id}::${r.text}`))
          : recordings;

        type VectorStat = { recording_id: number; avg_accuracy: number; vector_count: number };
        let vector_stats: VectorStat[] = [];
        const recordingIds = filteredRecordings.map((r) => r.id);
        if (recordingIds.length > 0) {
          const perChunk = yield* Effect.forEach(
            chunkIds(recordingIds),
            (ids) =>
              dbRunHttp('gesture_stats.list_vector_stats', (client) =>
                client
                  .select({
                    recording_id: user_gesture_recording_vectors.user_gesture_recording_id,
                    avg_accuracy:
                      sql<number>`avg(${user_gesture_recording_vectors.recorded_accuracy})`.mapWith(
                        Number
                      ),
                    vector_count: count()
                  })
                  .from(user_gesture_recording_vectors)
                  .where(inArray(user_gesture_recording_vectors.user_gesture_recording_id, ids))
                  .groupBy(user_gesture_recording_vectors.user_gesture_recording_id)
              ),
            { concurrency: 4 }
          );
          vector_stats = perChunk.flat().map((row) => ({
            recording_id: row.recording_id,
            // recorded_accuracy is 0..1 in storage; expose as 0..100 percent
            avg_accuracy: Math.round(Number(row.avg_accuracy) * 100),
            vector_count: Number(row.vector_count)
          }));
        }

        return { recordings: filteredRecordings, vector_stats };
      })
    )
  );

const get_top_gestures_input_schema = date_range_schema.extend({
  script_id: z.int().optional(),
  limit: z.int().min(1).max(50).default(10)
});

const get_top_gestures_route = protectedAdminProcedure
  .input(get_top_gestures_input_schema)
  .query(({ input: { all_time, start_date, end_date, script_id, limit } }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        const baseConditions = recordingDateConditions(all_time, start_date, end_date);
        if (script_id !== undefined) {
          baseConditions.push(eq(user_gesture_recordings.script_id, script_id));
        }

        const topRows = yield* dbRunHttp('gesture_stats.get_top_recordings', (client) =>
          client
            .select({
              text: user_gesture_recordings.text,
              script_id: user_gesture_recordings.script_id,
              started: count(),
              completed:
                sql<number>`sum(case when ${user_gesture_recordings.completed} then 1 else 0 end)`.mapWith(
                  Number
                )
            })
            .from(user_gesture_recordings)
            .where(baseConditions.length > 0 ? and(...baseConditions) : undefined)
            .groupBy(user_gesture_recordings.text, user_gesture_recordings.script_id)
            .orderBy(desc(count()))
            .limit(limit)
        );

        if (topRows.length === 0) return { gestures: [] };

        const topTexts = [...new Set(topRows.map((row) => row.text))];
        // Accuracy / attempts per (text, script_id) via a join — vector-weighted.
        const accuracyConditions = [...recordingDateConditions(all_time, start_date, end_date)];
        accuracyConditions.push(inArray(user_gesture_recordings.text, topTexts));
        if (script_id !== undefined) {
          accuracyConditions.push(eq(user_gesture_recordings.script_id, script_id));
        }

        const accuracyRows = yield* dbRunHttp('gesture_stats.get_top_vector_stats', (client) =>
          client
            .select({
              text: user_gesture_recordings.text,
              script_id: user_gesture_recordings.script_id,
              avg_accuracy:
                sql<number>`avg(${user_gesture_recording_vectors.recorded_accuracy})`.mapWith(
                  Number
                ),
              total_vectors: count(user_gesture_recording_vectors.id)
            })
            .from(user_gesture_recordings)
            .innerJoin(
              user_gesture_recording_vectors,
              eq(
                user_gesture_recording_vectors.user_gesture_recording_id,
                user_gesture_recordings.id
              )
            )
            .where(and(...accuracyConditions))
            .groupBy(user_gesture_recordings.text, user_gesture_recordings.script_id)
        );

        const accuracyByKey = new Map(
          accuracyRows.map((row) => [
            `${row.script_id}::${row.text}`,
            {
              avg_accuracy: Math.round(Number(row.avg_accuracy) * 100),
              total_vectors: Number(row.total_vectors)
            }
          ])
        );

        return {
          gestures: topRows.map((row) => {
            const started = Number(row.started);
            const completed = Number(row.completed);
            const extra = accuracyByKey.get(`${row.script_id}::${row.text}`);
            return {
              text: row.text,
              script_id: row.script_id,
              started,
              completed,
              avg_accuracy: extra?.avg_accuracy ?? 0,
              avg_attempts: extra && started > 0 ? extra.total_vectors / started : 0
            };
          })
        };
      })
    )
  );

const search_recorded_texts_input_schema = z.object({
  search: z.string().max(50).optional(),
  script_id: z.int().optional(),
  limit: z.int().min(1).max(20).default(8)
});

/** Distinct (text, script_id) pairs for the analytics gesture picker. */
const search_recorded_texts_route = protectedAdminProcedure
  .input(search_recorded_texts_input_schema)
  .query(({ input: { search, script_id, limit } }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        const conditions: SQL[] = [];
        const term = search?.trim();
        if (term) conditions.push(ilike(user_gesture_recordings.text, `%${term}%`));
        if (script_id !== undefined) {
          conditions.push(eq(user_gesture_recordings.script_id, script_id));
        }

        const rows = yield* dbRunHttp('gesture_stats.search_recorded_texts', (client) =>
          client
            .select({
              text: user_gesture_recordings.text,
              script_id: user_gesture_recordings.script_id,
              recordings_count: count()
            })
            .from(user_gesture_recordings)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .groupBy(user_gesture_recordings.text, user_gesture_recordings.script_id)
            .orderBy(desc(count()))
            .limit(limit)
        );

        return {
          gestures: rows.map((row) => ({
            text: row.text,
            script_id: row.script_id,
            recordings_count: Number(row.recordings_count)
          }))
        };
      })
    )
  );

const get_top_users_input_schema = date_range_schema.extend({
  script_id: z.int().optional(),
  limit: z.int().min(1).max(50).default(10)
});

const get_top_users_route = protectedAdminProcedure
  .input(get_top_users_input_schema)
  .query(({ input: { all_time, start_date, end_date, script_id, limit } }) =>
    runTrpcEffect(
      Effect.gen(function* () {
        const baseConditions = [
          isNotNull(user_gesture_recordings.user_id),
          ...recordingDateConditions(all_time, start_date, end_date)
        ];
        if (script_id !== undefined) {
          baseConditions.push(eq(user_gesture_recordings.script_id, script_id));
        }

        const topRows = yield* dbRunHttp('gesture_stats.get_top_users', (client) =>
          client
            .select({
              user_id: user_gesture_recordings.user_id,
              started: count(),
              completed:
                sql<number>`sum(case when ${user_gesture_recordings.completed} then 1 else 0 end)`.mapWith(
                  Number
                )
            })
            .from(user_gesture_recordings)
            .where(and(...baseConditions))
            .groupBy(user_gesture_recordings.user_id)
            .orderBy(desc(count()))
            .limit(limit)
        );

        const userIds = topRows.flatMap((row) => (row.user_id ? [row.user_id] : []));
        if (userIds.length === 0) return { users: [] };

        const namesById = yield* resolveAuthUserNames(userIds);

        const accuracyConditions = [
          inArray(user_gesture_recordings.user_id, userIds),
          ...recordingDateConditions(all_time, start_date, end_date)
        ];
        if (script_id !== undefined) {
          accuracyConditions.push(eq(user_gesture_recordings.script_id, script_id));
        }

        const accuracyRows = yield* dbRunHttp('gesture_stats.get_top_user_accuracy', (client) =>
          client
            .select({
              user_id: user_gesture_recordings.user_id,
              avg_accuracy: avg(user_gesture_recording_vectors.recorded_accuracy)
            })
            .from(user_gesture_recordings)
            .innerJoin(
              user_gesture_recording_vectors,
              eq(
                user_gesture_recording_vectors.user_gesture_recording_id,
                user_gesture_recordings.id
              )
            )
            .where(and(...accuracyConditions))
            .groupBy(user_gesture_recordings.user_id)
        );

        const accuracyByUser = new Map(
          accuracyRows.flatMap((row) =>
            row.user_id ? [[row.user_id, Math.round(Number(row.avg_accuracy) * 100)] as const] : []
          )
        );

        return {
          users: topRows.flatMap((row) => {
            if (!row.user_id) return [];
            return [
              {
                user_id: row.user_id,
                name: namesById.get(row.user_id) ?? displayUserName(row.user_id, null),
                started: Number(row.started),
                completed: Number(row.completed),
                avg_accuracy: accuracyByUser.get(row.user_id) ?? 0
              }
            ];
          })
        };
      })
    )
  );

export const gesture_stats_router = t.router({
  get_stats_data: get_stats_data_route,
  get_top_gestures: get_top_gestures_route,
  search_recorded_texts: search_recorded_texts_route,
  get_top_users: get_top_users_route
});
