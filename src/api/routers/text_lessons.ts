import { t, protectedAdminProcedure } from '../trpc_init';
import { z } from 'zod';
import { lesson_categories, lesson_gestures, text_lesson_words, text_lessons } from '~/db/schema';
import { db } from '~/db/db';
import { and, count, eq, ilike, inArray, max, sql } from 'drizzle-orm';
import {
  LessonCategoriesSchemaZod,
  TextLessonsSchemaZod,
  TextLessonWordsSchemaZod
} from '~/db/schema_zod';
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
      }).extend({
        text: z.string().min(1)
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

const reorder_text_lesson_in_category_func = async (category_id: number) => {
  const categories = await db.query.lesson_categories.findMany({
    columns: {
      id: true,
      order: true
    },
    where: eq(lesson_categories.id, category_id),
    orderBy: (lesson_categories, { asc }) => [asc(lesson_categories.order)]
  });
  const reordered_categories = categories.map((category, index) => ({
    ...category,
    order: index + 1
  }));

  await Promise.allSettled(
    reordered_categories.map((category) =>
      db
        .update(lesson_categories)
        .set({ order: category.order })
        .where(eq(lesson_categories.id, category.id))
    )
  );
};

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

    // reordering the catoegory id after deletion if needed
    if (text_lesson_.category_id) {
      await reorder_text_lesson_in_category_func(text_lesson_.category_id);
    }

    await db.delete(text_lessons).where(and(eq(text_lessons.id, id), eq(text_lessons.uuid, uuid)));
    // deletes both the lesson gestures and associated words with it
    // due to the cascade delete constraint

    return {
      deleted: true
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
      name: true,
      order: true
    },
    orderBy: (lesson_categories, { asc }) => [asc(lesson_categories.order)]
  });
  return categories;
};

const get_text_lesson_categories_route = protectedAdminProcedure
  .input(z.object({ lang_id: z.number().int() }))
  .query(async ({ input: { lang_id } }) => {
    return await get_text_lesson_categories_func(lang_id);
  });

const add_text_lesson_category_route = protectedAdminProcedure
  .input(LessonCategoriesSchemaZod.pick({ lang_id: true, name: true }))
  .mutation(async ({ input: { lang_id, name } }) => {
    const last_order = await db
      .select({ max_order: max(lesson_categories.order) })
      .from(lesson_categories)
      .where(eq(lesson_categories.lang_id, lang_id));
    const order = last_order[0].max_order ? last_order[0].max_order + 1 : 1;
    const result = await db.insert(lesson_categories).values({ lang_id, name, order }).returning();

    return {
      id: result[0].id,
      order: result[0].order
    };
  });

const update_text_lesson_category_list_route = protectedAdminProcedure
  .input(
    z.object({
      categories: LessonCategoriesSchemaZod.pick({ id: true, name: true, order: true }).array()
    })
  )
  .mutation(async ({ input: { categories } }) => {
    await Promise.all(
      categories.map(async (category) => {
        await db
          .update(lesson_categories)
          .set({ name: category.name, order: category.order })
          .where(eq(lesson_categories.id, category.id));
      })
    );

    return {
      updated: true
    };
  });

const delete_text_lesson_category_route = protectedAdminProcedure
  .input(z.object({ lesson_id: z.number().int(), lang_id: z.number().int() }))
  .mutation(async ({ input: { lesson_id, lang_id } }) => {
    await db
      .delete(lesson_categories)
      .where(and(eq(lesson_categories.id, lesson_id), eq(lesson_categories.lang_id, lang_id)));

    const categories = await db.query.lesson_categories.findMany({
      where: (tbl, { eq }) => eq(tbl.lang_id, lang_id),
      columns: {
        id: true,
        order: true
      },
      orderBy: (lesson_categories, { asc }) => [asc(lesson_categories.order)]
    });

    const reordered_categories = categories.map((category, index) => ({
      ...category,
      order: index + 1
    }));
    // Update the order of the categories
    await Promise.allSettled(
      reordered_categories.map((category) =>
        db
          .update(lesson_categories)
          .set({ order: category.order })
          .where(eq(lesson_categories.id, category.id))
      )
    );

    return {
      deleted: true
    };
  });

const get_category_text_lessons_route = protectedAdminProcedure
  .input(z.object({ category_id: z.number().int().min(0) }))
  .query(async ({ input: { category_id } }) => {
    if (category_id > 0) {
      const lessons = await db.query.text_lessons.findMany({
        columns: {
          id: true,
          text: true,
          order: true
        },
        where: (tbl, { eq }) => eq(tbl.category_id, category_id),
        orderBy: (text_lessons, { asc }) => [asc(text_lessons.order)]
      });
      return {
        lessons,
        type: 'categorized'
      };
    }
    // uncategorized -> 0, null in DB
    const lessons = await db.query.text_lessons.findMany({
      columns: {
        id: true,
        text: true,
        order: true
      },
      where: (tbl, { isNull }) => isNull(tbl.category_id),
      orderBy: (text_lessons, { asc }) => [asc(text_lessons.text)]
    });
    return {
      lessons,
      type: 'uncategorized'
    };
  });

const update_text_lessons_order_route = protectedAdminProcedure
  .input(
    z.object({
      lesson: TextLessonsSchemaZod.pick({ id: true, order: true }).array(),
      category_id: z.number().int()
    })
  )
  .mutation(async ({ input: { lesson, category_id } }) => {
    await Promise.allSettled(
      lesson.map((lesson) =>
        db
          .update(text_lessons)
          .set({ order: lesson.order })
          .where(and(eq(text_lessons.id, lesson.id), eq(text_lessons.category_id, category_id)))
      )
    );
    return {
      updated: true
    };
  });

const add_update_lesson_category_route = protectedAdminProcedure
  .input(
    z.object({
      category_id: z.number().int(),
      prev_category_id: z.number().int().optional(),
      lesson_id: z.number().int()
    })
  )
  .mutation(async ({ input: { category_id, prev_category_id, lesson_id } }) => {
    await db
      .update(text_lessons)
      .set({ category_id, order: null })
      // reset the order to null on add/update to a category
      .where(eq(text_lessons.id, lesson_id));

    if (prev_category_id) await reorder_text_lesson_in_category_func(category_id);
    // no need to reorder the current category as order is set to null which does not affect the concerned order

    return {
      added: true
    };
  });

export const text_lessons_router = t.router({
  add_text_lesson: add_text_lesson_route,
  update_text_lesson: update_text_lesson_route,
  delete_text_lesson: delete_text_lesson_route,
  get_gestures_from_text_key: get_gestures_from_text_key_route,
  get_text_lesson_word_media_data: get_text_lesson_word_media_data_route,
  categories: t.router({
    get_text_lesson_categories: get_text_lesson_categories_route,
    add_text_lesson_category: add_text_lesson_category_route,
    update_text_lesson_category_list: update_text_lesson_category_list_route,
    delete_text_lesson_category: delete_text_lesson_category_route,
    get_category_text_lessons: get_category_text_lessons_route,
    update_text_lessons_order: update_text_lessons_order_route,
    add_update_lesson_category: add_update_lesson_category_route
  })
});
