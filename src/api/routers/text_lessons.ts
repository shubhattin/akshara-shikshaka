import { t, protectedAdminProcedure } from '../trpc_init';
import { z } from 'zod';
import { lesson_gestures, text_lesson_words, text_lessons } from '~/db/schema';
import { db } from '~/db/db';
import { and, count, eq, ilike, inArray } from 'drizzle-orm';
import { TextLessonsSchemaZod, TextLessonWordsSchemaZod } from '~/db/schema_zod';
import { dev_delay } from '~/tools/delay';
import { TRPCError } from '@trpc/server';

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
      }),
      gesture_ids: z.array(z.number().int()),
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
        gesture_ids: gestures_ids,
        words
      }
    }) => {
      const result = await db
        .insert(text_lessons)
        .values({ lang_id, base_word_script_id, audio_id, text })
        .returning();

      const [, added_word_ids] = await Promise.all([
        // insert values in the join table
        gestures_ids.length > 0 &&
          db.insert(lesson_gestures).values(
            gestures_ids.map((gesture_id) => ({
              text_lesson_id: result[0].id,
              text_gesture_id: gesture_id
            }))
          ),
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
      gesture_ids: z.array(z.number().int()),
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
        gesture_ids,
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

      // updating lesson gestures
      const existing_gesture_ids = (
        await db.query.lesson_gestures.findMany({
          where: eq(lesson_gestures.text_lesson_id, id)
        })
      ).map((gesture) => gesture.text_gesture_id);

      const to_add_gesture_ids = gesture_ids.filter(
        (gesture_id) => !existing_gesture_ids.includes(gesture_id)
      );
      const deleted_gesture_ids = existing_gesture_ids.filter(
        (gesture_id) => !gesture_ids.includes(gesture_id)
      );
      await Promise.allSettled([
        db
          .delete(lesson_gestures)
          .where(
            and(
              inArray(lesson_gestures.text_gesture_id, deleted_gesture_ids),
              eq(lesson_gestures.text_lesson_id, id)
            )
          ),
        to_add_gesture_ids.length > 0 &&
          db.insert(lesson_gestures).values(
            to_add_gesture_ids.map((gesture_id) => ({
              text_lesson_id: id,
              text_gesture_id: gesture_id
            }))
          )
      ]);

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
        )
      ]);

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
        id: true
      },
      where: and(eq(text_lessons.id, id), eq(text_lessons.uuid, uuid))
    });
    if (!text_lesson_) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Text lesson not found' });
    }

    await Promise.all([
      db.delete(lesson_gestures).where(eq(lesson_gestures.text_lesson_id, id)),
      db.delete(text_lesson_words).where(eq(text_lesson_words.text_lesson_id, id))
    ]);
    // ^ The above records will be deleted automatically due to the cascade delete constraint
    // but we are doing it explicitly to be sure

    await db.delete(text_lessons).where(and(eq(text_lessons.id, id), eq(text_lessons.uuid, uuid)));

    return {
      deleted: true
    };
  });

const list_text_lessons_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.number().int(),
      search_text: z.string().optional(),
      page: z.number().int().min(1),
      limit: z.number().int().min(1)
    })
  )
  .query(async ({ input: { page, limit, lang_id, search_text } }) => {
    await dev_delay(500);

    const baseWhereClause = eq(text_lessons.lang_id, lang_id);
    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(text_lessons)
      .where(baseWhereClause);

    const offset = (page - 1) * limit;

    const list = await db.query.text_lessons.findMany({
      where: () => {
        if (search_text && search_text.trim().length > 0) {
          return and(baseWhereClause, ilike(text_lessons.text, `%${search_text.trim()}%`))!;
        }
        return baseWhereClause;
      },
      orderBy: (text_lessons, { asc }) => [asc(text_lessons.text)],
      limit: limit,
      offset,
      columns: {
        id: true,
        text: true,
        created_at: true,
        updated_at: true
      }
    });

    const total = Number(totalCount ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / limit));
    const hasPrev = page > 1;
    const hasNext = page < pageCount;

    return {
      list,
      total,
      page: page,
      pageCount,
      hasPrev,
      hasNext
    };
  });

const get_gestures_from_text_key_route = protectedAdminProcedure
  .input(z.object({ text_key: z.string().min(1) }))
  .query(async ({ input: { text_key } }) => {
    const gestures = await db.query.text_gestures.findMany({
      where: (tbl, { eq }) => eq(tbl.text_key, text_key),
      columns: {
        id: true,
        text: true,
        script_id: true
      }
    });
    return gestures;
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

export const get_text_lesson_categories_func = async (lang_id: number) => {
  const categories = await db.query.lesson_categories.findMany({
    where: (tbl, { eq }) => eq(tbl.lang_id, lang_id),
    columns: {
      id: true,
      name: true
    }
  });
  return categories;
};

const get_text_lesson_categories_route = protectedAdminProcedure
  .input(z.object({ lang_id: z.number().int() }))
  .query(async ({ input: { lang_id } }) => {
    return await get_text_lesson_categories_func(lang_id);
  });

export const text_lessons_router = t.router({
  add_text_lesson: add_text_lesson_route,
  update_text_lesson: update_text_lesson_route,
  delete_text_lesson: delete_text_lesson_route,
  list_text_lessons: list_text_lessons_route,
  get_gestures_from_text_key: get_gestures_from_text_key_route,
  get_text_lesson_word_media_data: get_text_lesson_word_media_data_route,
  categories: t.router({
    get_text_lesson_categories: get_text_lesson_categories_route
  })
});
