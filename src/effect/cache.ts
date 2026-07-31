import { Effect } from 'effect';
import ms from 'ms';
import { z } from 'zod';
import { RedisClient } from './redis';
import { CacheError } from './errors';
import { BackgroundWork } from './background';
import { Database, type DbClient } from './database';

const CACHE_EXPIRE_S = ms('30days') / 1000;

type CacheEnv = RedisClient | BackgroundWork | Database;

export interface CacheItem<TData, TParams> {
  key: (params: TParams) => string;
  get: (params: TParams) => Effect.Effect<TData, CacheError, CacheEnv>;
  set: (data: TData, params: TParams) => Effect.Effect<void, CacheError, RedisClient>;
  delete: (params: TParams) => Effect.Effect<void, CacheError, RedisClient>;
  refresh: (
    params: TParams,
    del?: boolean
  ) => Effect.Effect<void, CacheError, RedisClient | Database>;
}

export function createCache<TSchema extends z.ZodType, TData>(
  keyPrefix: string,
  schema: TSchema,
  keyBuilder: (params: z.infer<TSchema>) => string,
  fetchFn: (params: z.infer<TSchema>) => Effect.Effect<TData, CacheError, Database>,
  ttl = CACHE_EXPIRE_S
): CacheItem<TData, z.infer<TSchema>> {
  type TParams = z.infer<TSchema>;

  const validate = (params: TParams): TParams => schema.parse(params);
  const getKey = (params: TParams): string => `${keyPrefix}:${keyBuilder(validate(params))}`;

  /** Per-key generation so stale background fills cannot overwrite newer refresh/delete. */
  const generations = new Map<string, number>();
  const bumpGeneration = (key: string): number => {
    const next = (generations.get(key) ?? 0) + 1;
    generations.set(key, next);
    return next;
  };
  const currentGeneration = (key: string): number => generations.get(key) ?? 0;

  /** Serialize invalidate/write per key so generation check + Redis write stay atomic. */
  const keyOpTails = new Map<string, Promise<void>>();
  const enqueueKeyOp = <A>(key: string, op: () => Promise<A>): Promise<A> => {
    const previous = keyOpTails.get(key) ?? Promise.resolve();
    const current = previous.then(op, op);
    keyOpTails.set(
      key,
      current.then(
        () => undefined,
        () => undefined
      )
    );
    return current;
  };

  const toCacheError = (operation: string, key?: string) => (cause: unknown) =>
    CacheError.make({ operation, key, cause });

  const cache: CacheItem<TData, TParams> = {
    key: getKey,

    get: Effect.fn('cache.get')(function* (params: TParams) {
      const parsed = validate(params);
      const key = getKey(parsed);
      const redis = yield* RedisClient;
      const background = yield* BackgroundWork;

      const cached = yield* redis
        .get<TData>(key)
        .pipe(
          Effect.mapError(toCacheError('get', key)),
          Effect.annotateLogs({ category: 'cache', operation: 'get', key })
        );
      // Only null is a miss — preserve false / 0 / '' as valid cached values.
      if (cached !== null) return cached;

      const generationAtMiss = currentGeneration(key);
      const data = yield* fetchFn(parsed);
      const setProgram = Effect.tryPromise({
        try: () =>
          enqueueKeyOp(key, async () => {
            if (currentGeneration(key) !== generationAtMiss) return;
            await Effect.runPromise(
              cache.set(data, parsed).pipe(Effect.provideService(RedisClient, redis))
            );
          }),
        catch: (error) => error
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning('cache set failed', { key, error }).pipe(Effect.asVoid)
        )
      );
      yield* background.enqueue(() => Effect.runPromise(setProgram));
      return data;
    }),

    set: Effect.fn('cache.set')(function* (data: TData, params: TParams) {
      const parsed = validate(params);
      const key = getKey(parsed);
      const redis = yield* RedisClient;
      yield* redis
        .set(key, data, { ex: ttl })
        .pipe(
          Effect.mapError(toCacheError('set', key)),
          Effect.annotateLogs({ category: 'cache', operation: 'set', key })
        );
    }),

    delete: Effect.fn('cache.delete')(function* (params: TParams) {
      const parsed = validate(params);
      const key = getKey(parsed);
      bumpGeneration(key);
      const redis = yield* RedisClient;
      yield* Effect.tryPromise({
        try: () =>
          enqueueKeyOp(key, () =>
            Effect.runPromise(
              redis
                .del(key)
                .pipe(Effect.annotateLogs({ category: 'cache', operation: 'delete', key }))
            )
          ),
        catch: toCacheError('delete', key)
      });
    }),

    refresh: Effect.fn('cache.refresh')(function* (params: TParams, del = true) {
      const parsed = validate(params);
      const key = getKey(parsed);
      const generation = bumpGeneration(key);
      const redis = yield* RedisClient;

      const data = yield* fetchFn(parsed);
      yield* Effect.tryPromise({
        try: () =>
          enqueueKeyOp(key, async () => {
            if (currentGeneration(key) !== generation) return;
            if (del) {
              await Effect.runPromise(redis.del(key));
            }
            await Effect.runPromise(
              redis
                .set(key, data, { ex: ttl })
                .pipe(Effect.annotateLogs({ category: 'cache', operation: 'refresh', key }))
            );
          }),
        catch: toCacheError('refresh', key)
      });
    })
  };

  return cache;
}
const fromDb = <A>(operation: string, run: (client: DbClient) => Promise<A>) =>
  Effect.gen(function* () {
    const database = yield* Database;
    return yield* database.run(operation, run).pipe(
      Effect.mapError((cause) => CacheError.make({ operation, cause })),
      Effect.annotateLogs({ category: 'db', operation })
    );
  });

export const CACHE = {
  lessons: {
    category_list: createCache(
      'text_lesson_category_list',
      z.object({
        lang_id: z.int().positive()
      }),
      ({ lang_id }) => `${lang_id}`,
      ({ lang_id }) =>
        fromDb('category_list', (db) =>
          db.query.lesson_categories.findMany({
            where: (tbl, { eq }) => eq(tbl.lang_id, lang_id),
            columns: { id: true, name: true, order: true },
            orderBy: (lesson_categories, { asc }) => [asc(lesson_categories.order)]
          })
        )
    ),
    category_lesson_list: createCache(
      'text_lesson_category_lessons_list',
      z.object({
        category_id: z.int()
      }),
      ({ category_id }) => `${category_id}`,
      ({ category_id }) =>
        fromDb('category_lesson_list', (db) =>
          db.query.text_lessons.findMany({
            columns: {
              id: true,
              text: true,
              order: true,
              uuid: true
            },
            orderBy: (tbl, { asc }) => [asc(tbl.order)],
            where: (tbl, { eq, isNotNull, and }) =>
              and(eq(tbl.category_id, category_id), isNotNull(tbl.order))
          })
        )
    ),
    text_lesson_info: createCache(
      'text_lesson_info',
      z.object({
        lesson_id: z.int()
      }),
      ({ lesson_id }) => `${lesson_id}`,
      ({ lesson_id }) =>
        fromDb('text_lesson_info', (db) =>
          db.query.text_lessons.findFirst({
            where: (tbl, { eq }) => eq(tbl.id, lesson_id),
            columns: {
              id: true,
              base_word_script_id: true,
              text: true
            },
            with: {
              gestures: {
                columns: {
                  text_gesture_id: true
                },
                with: {
                  text_gesture: {
                    columns: {
                      id: true,
                      uuid: true,
                      script_id: true
                    }
                  }
                }
              },
              words: {
                columns: {
                  id: true,
                  word: true,
                  order: true
                },
                orderBy: (tbl, { asc }) => [asc(tbl.order)],
                with: {
                  image: {
                    columns: {
                      s3_key: true
                    }
                  },
                  audio: {
                    columns: {
                      s3_key: true
                    }
                  }
                }
              },
              optional_audio: {
                columns: {
                  s3_key: true
                }
              }
            }
          })
        )
    )
  },
  gestures: {
    gesture_data: createCache(
      'text_gesture_data',
      z.object({
        gesture_id: z.int(),
        gesture_uuid: z.uuid()
      }),
      ({ gesture_id, gesture_uuid }) => `${gesture_id}:${gesture_uuid}`,
      ({ gesture_id, gesture_uuid }) =>
        fromDb('gesture_data', (db) =>
          db.query.text_gestures.findFirst({
            where: (table, { eq, and }) =>
              and(eq(table.id, gesture_id), eq(table.uuid, gesture_uuid)),
            columns: {
              id: true,
              uuid: true,
              text: true,
              gestures: true,
              script_id: true
            }
          })
        )
    )
  }
};
