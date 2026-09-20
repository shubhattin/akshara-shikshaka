import { z } from 'zod';
import { createCache, fromDb } from '~/effect/cache';

const category_list = createCache({
  keyPrefix: 'text_lesson_category_list',
  schema: z.object({
    lang_id: z.int().positive()
  }),
  keyBuilder: ({ lang_id }) => `${lang_id}`,
  fetch: ({ lang_id }) =>
    fromDb('category_list', (db) =>
      db.query.lesson_categories.findMany({
        where: (tbl, { eq }) => eq(tbl.lang_id, lang_id),
        columns: { id: true, name: true, order: true },
        orderBy: (lesson_categories, { asc }) => [asc(lesson_categories.order)]
      })
    )
});

const category_lesson_list = createCache({
  keyPrefix: 'text_lesson_category_lessons_list',
  schema: z.object({
    category_id: z.int()
  }),
  keyBuilder: ({ category_id }) => `${category_id}`,
  fetch: ({ category_id }) =>
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
});

const text_lesson_info = createCache({
  keyPrefix: 'text_lesson_info',
  schema: z.object({
    lesson_id: z.int()
  }),
  keyBuilder: ({ lesson_id }) => `${lesson_id}`,
  fetch: ({ lesson_id }) =>
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
});

export type LessonsCacheLoaders = {
  category_list: typeof category_list;
  category_lesson_list: typeof category_lesson_list;
  text_lesson_info: typeof text_lesson_info;
};

export const lessons_cache_loaders: LessonsCacheLoaders = {
  category_list,
  category_lesson_list,
  text_lesson_info
};
