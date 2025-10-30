import { t, protectedAdminProcedure, publicProcedure } from '../trpc_init';
import { z } from 'zod';
import { lesson_gestures, text_lesson_words, text_lessons } from '~/db/schema';
import { db } from '~/db/db';
import { and, eq, inArray } from 'drizzle-orm';
import { TextLessonsSchemaZod, TextLessonWordsSchemaZod } from '~/db/schema_zod';
import { TRPCError } from '@trpc/server';
import {
  reorder_text_lesson_in_category_func,
  lesson_categories_router
} from './lesson_categories';
import { waitUntil } from '@vercel/functions';
import { CACHE } from '../cache';

const connect_gestures_to_text_lessons_func = async (textKey: string, text_lesson_id: number) => {
  const gestures = await db.query.text_gestures.findMany({
    columns: {
      id: true
    },
    where: (tbl, { eq }) => eq(tbl.text_key, textKey)
  });
  if (gestures.length === 0) return;
  await db.insert(lesson_gestures).values(
    gestures.map((gesture) => ({
      text_gesture_id: gesture.id,
      text_lesson_id: text_lesson_id
    }))
  );
};

/**
 * Only for adding text lessons and not for adding words related\
 * Along with the text gestures data associated with it
 */
const add_text_lesson_route = protectedAdminProcedure
  .input(
    z.object({
      lesson_info: TextLessonsSchemaZod.pick({
        lang_id: true,
        base_word_script_id: true,
        audio_id: true,
        text: true
      }).extend({
        text: z.string().min(1)
      }),
      text_key: z.string().min(1),
      words: TextLessonWordsSchemaZod.omit({
        id: true,
        created_at: true,
        updated_at: true,
        text_lesson_id: true
      }).array()
    })
  )
  .output(
    z.object({
      id: z.number().int(),
      uuid: z.string().uuid(),
      added_word_ids: z.array(z.number().int())
    })
  )
  .mutation(
    async ({
      input: {
        lesson_info: { lang_id, base_word_script_id, audio_id, text },
        text_key,
        words
      }
    }) => {
      const result = await db
        .insert(text_lessons)
        .values({ lang_id, base_word_script_id, audio_id, text, text_key: text_key.trim() })
        .returning();

      const [, added_word_ids] = await Promise.all([
        // on text lesson creation scan for gestures associated with the text key
        // and connect them to the text lesson via the join table `lesson_gestures`
        connect_gestures_to_text_lessons_func(text_key.trim(), result[0].id),
        // insert values in the text lesson words table
        words.length > 0
          ? db
              .insert(text_lesson_words)
              .values(
                words.map((word) => ({
                  ...word,
                  text_lesson_id: result[0].id
                }))
              )
              .returning()
          : []
      ]);

      // cache for faster future access
      waitUntil(CACHE.lessons.text_lesson_info.refresh({ lesson_id: result[0].id }));

      return {
        id: result[0].id,
        uuid: result[0].uuid,
        added_word_ids: added_word_ids.map((word) => word.id)
      };
    }
  );

const update_text_lesson_route = protectedAdminProcedure
  .input(
    z.object({
      lesson_info: TextLessonsSchemaZod.pick({
        id: true,
        // lang_id: true,
        // base_word_script_id: true,
        // text: true,
        audio_id: true,
        uuid: true
      }),
      words: TextLessonWordsSchemaZod.omit({
        created_at: true,
        updated_at: true,
        text_lesson_id: true
      })
        .extend({
          id: z.number().int().optional()
        })
        .array()
    })
  )
  .mutation(
    async ({
      input: {
        lesson_info: { id, audio_id, uuid },
        words
      }
    }) => {
      // updating text lessons
      const res = await db
        .update(text_lessons)
        .set({ audio_id })
        .where(and(eq(text_lessons.id, id), eq(text_lessons.uuid, uuid)))
        .returning();
      if (res.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Text lesson not found' });
      }

      // updating lesson words
      const existing_word_ids = (
        await db.query.text_lesson_words.findMany({
          where: (tbl, { eq }) => eq(tbl.text_lesson_id, id)
        })
      ).map((word) => word.id);
      const to_update_words = words.filter(
        (word) => word.id !== undefined && word.id !== null && existing_word_ids.includes(word.id)
      ) as ((typeof words)[number] & { id: number })[];
      const to_add_words = words.filter((word) => word.id === undefined || word.id === null);
      const to_delete_word_ids = existing_word_ids.filter(
        (word_id) => !words.some((word) => word.id === word_id)
      );
      const [, inserted_words] = await Promise.all([
        to_delete_word_ids.length > 0 &&
          db
            .delete(text_lesson_words)
            .where(
              and(
                inArray(text_lesson_words.id, to_delete_word_ids),
                eq(text_lesson_words.text_lesson_id, id)
              )
            ),
        to_add_words.length > 0
          ? db
              .insert(text_lesson_words)
              .values(to_add_words.map((word) => ({ ...word, text_lesson_id: id })))
              .returning()
          : [],
        ...to_update_words.map((word) =>
          db
            .update(text_lesson_words)
            .set(word)
            .where(and(eq(text_lesson_words.id, word.id), eq(text_lesson_words.text_lesson_id, id)))
        ),
        CACHE.lessons.text_lesson_info.delete({ lesson_id: id })
      ]);

      // in the background refresh the cache
      waitUntil(CACHE.lessons.text_lesson_info.refresh({ lesson_id: id }));

      return {
        updated: true,
        inserted_words_ids: inserted_words.map((word) => word.id)
      };
    }
  );

const delete_text_lesson_route = protectedAdminProcedure
  .input(z.object({ id: z.number().int(), uuid: z.string().uuid() }))
  .mutation(async ({ input: { id, uuid } }) => {
    // verify the id, uuid combination
    const text_lesson_ = await db.query.text_lessons.findFirst({
      columns: {
        id: true,
        category_id: true
      },
      where: and(eq(text_lessons.id, id), eq(text_lessons.uuid, uuid))
    });
    if (!text_lesson_) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Text lesson not found' });
    }

    await Promise.allSettled([
      db.delete(text_lessons).where(and(eq(text_lessons.id, id), eq(text_lessons.uuid, uuid))),
      // deletes both the lesson gestures and associated words with it
      // due to the cascade delete constraint

      // reordering the catoegory id after deletion if needed
      text_lesson_.category_id &&
        reorder_text_lesson_in_category_func(text_lesson_.category_id, id),
      // delete cache
      CACHE.lessons.text_lesson_info.delete({ lesson_id: id })
    ]);
    // refreshing cache of the category it was part of
    text_lesson_.category_id &&
      waitUntil(
        CACHE.lessons.category_lesson_list.refresh({
          category_id: text_lesson_.category_id
        })
      );

    return {
      deleted: true
    };
  });

const get_text_lesson_word_media_data_route = protectedAdminProcedure
  .input(z.object({ word_id: z.number().int(), lesson_id: z.number().int() }))
  .query(async ({ input: { word_id, lesson_id } }) => {
    const word = await db.query.text_lesson_words.findFirst({
      where: (tbl, { eq }) => and(eq(tbl.id, word_id), eq(tbl.text_lesson_id, lesson_id)),
      columns: {
        id: true
      },
      with: {
        image: {
          columns: {
            id: true,
            description: true,
            s3_key: true,
            height: true,
            width: true
          }
        },
        audio: {
          columns: {
            id: true,
            description: true,
            s3_key: true
          }
        }
      }
    });
    return {
      image_asset: word?.image,
      audio_asset: word?.audio
    };
  });

const get_text_lesson_info_route = publicProcedure
  .input(z.object({ lesson_id: z.number().int() }))
  .query(async ({ input: { lesson_id } }) => {
    const lesson = await db.query.text_lessons.findFirst({
      where: eq(text_lessons.id, lesson_id),
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
        }
      }
    });
    return lesson;
  });

export const text_lessons_router = t.router({
  add_text_lesson: add_text_lesson_route,
  update_text_lesson: update_text_lesson_route,
  delete_text_lesson: delete_text_lesson_route,
  get_text_lesson_word_media_data: get_text_lesson_word_media_data_route,
  categories: lesson_categories_router,
  get_text_lesson_info: get_text_lesson_info_route
});
