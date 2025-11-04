import { db } from '~/db/db';
import { redis } from '~/db/redis';
import { waitUntil } from '@vercel/functions';
import ms from 'ms';
import { z, type ZodSchema } from 'zod';

const CACHE_EXPIRE_S = ms('30days') / 1000;

interface CacheItem<TData, TParams> {
  key: (params: TParams) => string;
  get: (params: TParams) => Promise<TData>;
  set: (data: TData, params: TParams) => Promise<void>;
  delete: (params: TParams) => Promise<void>;
  refresh: (params: TParams, del?: boolean) => Promise<void>;
}

function createCache<TSchema extends ZodSchema, TData>(
  keyPrefix: string,
  schema: TSchema,
  keyBuilder: (params: z.infer<TSchema>) => string,
  fetchFn: (params: z.infer<TSchema>) => Promise<TData>,
  ttl = CACHE_EXPIRE_S
): CacheItem<TData, z.infer<TSchema>> {
  type TParams = z.infer<TSchema>;

  const validate = (params: TParams): TParams => schema.parse(params);
  const getKey = (params: TParams): string => `${keyPrefix}:${keyBuilder(validate(params))}`;

  const cache: CacheItem<TData, TParams> = {
    key: getKey,

    get: async (params) => {
      const parsed = validate(params);
      const key = getKey(parsed);

      const cached = await redis.get(key);
      if (cached) return cached as TData;

      const data = await fetchFn(parsed);
      waitUntil(cache.set(data, parsed));
      return data;
    },

    set: async (data, params) => {
      const parsed = validate(params);
      await redis.set(getKey(parsed), data, { ex: ttl });
    },

    delete: async (params) => {
      const parsed = validate(params);
      await redis.del(getKey(parsed));
    },

    refresh: async (params, del = true) => {
      const parsed = validate(params);
      const key = getKey(parsed);
      const [data] = await Promise.all([fetchFn(parsed), del && cache.delete(parsed)]);
      await redis.set(key, data, { ex: ttl });
    }
  };

  return cache;
}

export const CACHE = {
  lessons: {
    category_list: createCache(
      'text_lesson_category_list',
      z.object({
        lang_id: z.int().positive()
      }),
      ({ lang_id }) => `${lang_id}`,
      async ({ lang_id }) => {
        const data = await db.query.lesson_categories.findMany({
          where: (tbl, { eq }) => eq(tbl.lang_id, lang_id),
          columns: { id: true, name: true, order: true },
          orderBy: (lesson_categories, { asc }) => [asc(lesson_categories.order)]
        });
        // this cache has to be invalidated when
        // ADD new category
        // UPDATE/REORDER category list
        // DELETE category
        return data;
      }
    ),
    category_lesson_list: createCache(
      'text_lesson_category_lessons_list',
      z.object({
        category_id: z.int()
      }),
      ({ category_id }) => `${category_id}`,
      async ({ category_id }) => {
        const lessons = await db.query.text_lessons.findMany({
          columns: {
            id: true,
            text: true,
            order: true,
            uuid: true
          },
          orderBy: (tbl, { asc }) => [asc(tbl.order)],
          where: (tbl, { eq, isNotNull, and }) =>
            and(eq(tbl.category_id, category_id), isNotNull(tbl.order))
        });
        // this cache has to be invalidated when
        // ADD new lesson to a category
        // UPDATE/REORDER lesson list in a category
        // REMOVE lesson from a category
        // DELETE lesson
        return lessons;
      }
    ),
    text_lesson_info: createCache(
      'text_lesson_info',
      z.object({
        lesson_id: z.int()
      }),
      ({ lesson_id }) => `${lesson_id}`,
      async ({ lesson_id }) => {
        const lesson = await db.query.text_lessons.findFirst({
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
        });
        // all words, audio, video and gestures that depend on this have to invalidate this cache when they modify/delete
        // gestures -> only on DELETE as we are storing only its id/uuid reference
        // lesson/words -> on UPDATE order, word and on DELETE. As they are updated together so just invalidate on lesson change/delete
        // audio -> on DELETE of both optional lesson audio and word audio
        // image -> on DELETE of lesson words
        // precache when
        // ADD new lesson
        return lesson;
      }
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
      async ({ gesture_id, gesture_uuid }) => {
        const text_data = await db.query.text_gestures.findFirst({
          where: (table, { eq, and }) =>
            and(eq(table.id, gesture_id), eq(table.uuid, gesture_uuid)),
          columns: {
            id: true,
            uuid: true,
            text: true,
            gestures: true,
            script_id: true
          }
        });
        // invalidate this cache when
        // UPDATE gesture
        // DELETE gesture
        // precache when
        // ADD new gesture
        return text_data;
      }
    )
  }
};
