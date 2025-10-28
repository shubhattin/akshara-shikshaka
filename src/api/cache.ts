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
  refresh: (params: TParams) => Promise<void>;
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

    refresh: async (params) => {
      const parsed = validate(params);
      const key = getKey(parsed);
      const data = await fetchFn(parsed);
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
        lang_id: z.number().int().positive()
      }),
      ({ lang_id }) => `${lang_id}`,
      async ({ lang_id }) => {
        const data = await db.query.lesson_categories.findMany({
          where: (tbl, { eq }) => eq(tbl.lang_id, lang_id),
          columns: { id: true, name: true, order: true },
          orderBy: (lesson_categories, { asc }) => [asc(lesson_categories.order)]
        });
        return data;
      }
    ),
    category_lesson_list: createCache(
      'text_lesson_category_lessons_list',
      z.object({
        category_id: z.number().int()
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
          where: (tbl, { eq }) => eq(tbl.category_id, category_id)
        });
        return lessons;
      }
    )
  }
};
