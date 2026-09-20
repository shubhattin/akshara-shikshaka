import { Effect } from 'effect';
import { and, avg, count, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { user_gesture_recording_vectors, user_gesture_recordings } from '~/db/schema';
import {
  emptyDashboardStats,
  type AksharaDashboardStats,
  type DashboardGestureRow,
  type DashboardRecentRow
} from '~/api/routers/user/user_dashboard';
import { createCache } from '~/effect/cache';
import { dbRunHttp } from '~/effect/database';
import { CacheError } from '~/effect/errors';

const TOP_GESTURE_LIMIT = 5;
const RECENT_LIMIT = 8;

export type UserDashboardParams = { userId: string };

const aksharaDashboardKey = ({ userId }: UserDashboardParams) => `user:${userId}:akshara`;

/** Exported for tests — must stay aligned with createCache key builders. */
export const userCacheKeys = {
  dashboard: aksharaDashboardKey
} as const;

const toCacheError = (operation: string, key: string) => (cause: unknown) =>
  CacheError.make({ operation, key, cause });

function toCount(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toPercent(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export const fetchAksharaDashboard = Effect.fn('user_cache.akshara_dashboard')(function* (
  userId: string
) {
  const { countRows, accuracyRows, topGestures, recentRows } = yield* Effect.all({
    countRows: dbRunHttp('user_cache.akshara_counts', (client) =>
      client
        .select({
          started: count(),
          completed:
            sql<number>`sum(case when ${user_gesture_recordings.completed} then 1 else 0 end)`.mapWith(
              Number
            )
        })
        .from(user_gesture_recordings)
        .where(eq(user_gesture_recordings.user_id, userId))
    ),
    accuracyRows: dbRunHttp('user_cache.akshara_accuracy', (client) =>
      client
        .select({
          avg_accuracy: avg(user_gesture_recording_vectors.recorded_accuracy),
          best_accuracy: max(user_gesture_recording_vectors.recorded_accuracy)
        })
        .from(user_gesture_recording_vectors)
        .innerJoin(
          user_gesture_recordings,
          eq(user_gesture_recording_vectors.user_gesture_recording_id, user_gesture_recordings.id)
        )
        .where(eq(user_gesture_recordings.user_id, userId))
    ),
    topGestures: dbRunHttp('user_cache.akshara_top_gestures', (client) =>
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
        .where(eq(user_gesture_recordings.user_id, userId))
        .groupBy(user_gesture_recordings.text, user_gesture_recordings.script_id)
        .orderBy(desc(count()))
        .limit(TOP_GESTURE_LIMIT)
    ),
    recentRows: dbRunHttp('user_cache.akshara_recent', (client) =>
      client
        .select({
          id: user_gesture_recordings.id,
          text: user_gesture_recordings.text,
          script_id: user_gesture_recordings.script_id,
          completed: user_gesture_recordings.completed,
          created_at: user_gesture_recordings.created_at,
          avg_accuracy: avg(user_gesture_recording_vectors.recorded_accuracy)
        })
        .from(user_gesture_recordings)
        .leftJoin(
          user_gesture_recording_vectors,
          eq(user_gesture_recording_vectors.user_gesture_recording_id, user_gesture_recordings.id)
        )
        .where(eq(user_gesture_recordings.user_id, userId))
        .groupBy(
          user_gesture_recordings.id,
          user_gesture_recordings.text,
          user_gesture_recordings.script_id,
          user_gesture_recordings.completed,
          user_gesture_recordings.created_at
        )
        .orderBy(desc(user_gesture_recordings.created_at))
        .limit(RECENT_LIMIT)
    )
  });

  const started = toCount(countRows[0]?.started);
  const completed = toCount(countRows[0]?.completed);

  let top_gestures: DashboardGestureRow[] = topGestures.map((row) => ({
    text: row.text,
    script_id: row.script_id,
    started: toCount(row.started),
    completed: toCount(row.completed),
    avg_accuracy: null
  }));

  if (top_gestures.length > 0) {
    const topTexts = [...new Set(top_gestures.map((row) => row.text))];
    const accuracyByGesture = yield* dbRunHttp(
      'user_cache.akshara_top_gesture_accuracy',
      (client) =>
        client
          .select({
            text: user_gesture_recordings.text,
            script_id: user_gesture_recordings.script_id,
            avg_accuracy: avg(user_gesture_recording_vectors.recorded_accuracy)
          })
          .from(user_gesture_recordings)
          .innerJoin(
            user_gesture_recording_vectors,
            eq(user_gesture_recording_vectors.user_gesture_recording_id, user_gesture_recordings.id)
          )
          .where(
            and(
              eq(user_gesture_recordings.user_id, userId),
              inArray(user_gesture_recordings.text, topTexts)
            )
          )
          .groupBy(user_gesture_recordings.text, user_gesture_recordings.script_id)
    );

    const byKey = new Map(
      accuracyByGesture.map((row) => [`${row.script_id}::${row.text}`, toPercent(row.avg_accuracy)])
    );
    top_gestures = top_gestures.map((row) => ({
      ...row,
      avg_accuracy: byKey.get(`${row.script_id}::${row.text}`) ?? null
    }));
  }
  const recent: DashboardRecentRow[] = recentRows.map((row) => ({
    id: row.id,
    text: row.text,
    script_id: row.script_id,
    completed: row.completed,
    avg_accuracy: toPercent(row.avg_accuracy),
    created_at: row.created_at
  }));

  const stats: AksharaDashboardStats = {
    started,
    completed,
    completion_rate: started > 0 ? Math.round((completed / started) * 100) : 0,
    best_accuracy: toPercent(accuracyRows[0]?.best_accuracy),
    avg_accuracy: toPercent(accuracyRows[0]?.avg_accuracy),
    top_gestures,
    recent
  };

  return stats;
});

export const fetchAksharaDashboardCached = (params: UserDashboardParams) => {
  const key = aksharaDashboardKey(params);
  if (!params.userId) {
    return Effect.succeed(emptyDashboardStats());
  }
  return fetchAksharaDashboard(params.userId).pipe(
    Effect.mapError(toCacheError('fetchAksharaDashboard', key))
  );
};

const dashboard = createCache({
  keyPrefix: 'user',
  schema: z.object({
    userId: z.string().min(1)
  }),
  keyBuilder: ({ userId }) => `${userId}:akshara`,
  fetch: fetchAksharaDashboardCached
});

export type UserCacheLoaders = {
  dashboard: typeof dashboard;
};

export const user_cache_loaders: UserCacheLoaders = {
  dashboard
};
