import { t, protectedAdminProcedure, publicProcedure } from '../trpc_init';
import { z } from 'zod';
import { lesson_categories, text_lessons } from '~/db/schema';
import { db } from '~/db/db';
import { and, eq, max } from 'drizzle-orm';
import { LessonCategoriesSchemaZod, TextLessonsSchemaZod } from '~/db/schema_zod';
import { CACHE } from '../cache';
import { waitUntil } from '@vercel/functions';

/**
 * @param lesson_id_to_ignore This is to allow this function to run in parallel with other operations
 */
export const reorder_text_lesson_in_category_func = async (
  category_id: number,
  lesson_id_to_ignore: number
) => {
  const lessons = await db.query.text_lessons.findMany({
    columns: {
      id: true,
      order: true
    },
    where: (tbl, { eq, ne, and }) =>
      and(eq(tbl.category_id, category_id), ne(tbl.id, lesson_id_to_ignore)),
    orderBy: (tbl, { asc }) => [asc(tbl.order)]
  });
  const reordered_lessons = lessons
    .filter((lesson) => lesson.order !== null)
    .map((lesson, index) => ({
      ...lesson,
      order: index + 1
    }));

  await Promise.allSettled(
    reordered_lessons.map((lesson) =>
      db
        .update(text_lessons)
        .set({ order: lesson.order })
        .where(and(eq(text_lessons.id, lesson.id), eq(text_lessons.category_id, category_id)))
    )
  );
};

const get_categories_route = publicProcedure
  .input(z.object({ lang_id: z.number().int() }))
  .query(async ({ input: { lang_id } }) => {
    return await CACHE.lessons.category_list.get({ lang_id });
  });

const add_category_route = protectedAdminProcedure
  .input(LessonCategoriesSchemaZod.pick({ lang_id: true, name: true }))
  .mutation(async ({ input: { lang_id, name } }) => {
    const last_order = await db
      .select({ max_order: max(lesson_categories.order) })
      .from(lesson_categories)
      .where(eq(lesson_categories.lang_id, lang_id));
    const order = last_order[0].max_order ? last_order[0].max_order + 1 : 1;
    const result = await db.insert(lesson_categories).values({ lang_id, name, order }).returning();

    // as this route refetches data from a cached route so we need to invalidate it
    // invalidate category_list cache
    await Promise.all([CACHE.lessons.category_list.delete({ lang_id })]);

    return {
      id: result[0].id,
      order: result[0].order
    };
  });

const update_category_list_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.number().int(),
      categories: LessonCategoriesSchemaZod.pick({ id: true, name: true, order: true }).array()
    })
  )
  .mutation(async ({ input: { categories, lang_id } }) => {
    await Promise.allSettled([
      ...categories.map((category) =>
        db
          .update(lesson_categories)
          .set({ name: category.name, order: category.order })
          .where(and(eq(lesson_categories.id, category.id), eq(lesson_categories.lang_id, lang_id)))
      ),
      // invalidate category list cache
      // as being referched onSuccess
      CACHE.lessons.category_list.delete({ lang_id })
    ]);

    return {
      updated: true
    };
  });

const delete_category_route = protectedAdminProcedure
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
    await Promise.allSettled([
      ...reordered_categories.map((category) =>
        db
          .update(lesson_categories)
          .set({ order: category.order })
          .where(eq(lesson_categories.id, category.id))
      ),
      // invalidate lessons category list cache
      CACHE.lessons.category_list.delete({ lang_id })
    ]);

    return {
      deleted: true
    };
  });

const get_text_lessons_route = protectedAdminProcedure
  .input(z.object({ category_id: z.number().int().min(0), lang_id: z.number().int() }))
  .query(async ({ input: { category_id, lang_id } }) => {
    if (category_id > 0) {
      const lessons = await db.query.text_lessons.findMany({
        columns: {
          id: true,
          text: true,
          order: true
        },
        where: (tbl, { eq, and }) =>
          and(eq(tbl.category_id, category_id), eq(tbl.lang_id, lang_id)),
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
      where: (tbl, { isNull, and }) => and(isNull(tbl.category_id), eq(tbl.lang_id, lang_id)),
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
      category_id: z.number().int(),
      lang_id: z.number().int()
    })
  )
  .mutation(async ({ input: { lesson, category_id, lang_id } }) => {
    await Promise.allSettled([
      ...lesson.map((lesson) =>
        db
          .update(text_lessons)
          .set({ order: lesson.order })
          .where(
            and(
              eq(text_lessons.id, lesson.id),
              eq(text_lessons.category_id, category_id),
              eq(text_lessons.lang_id, lang_id)
            )
          )
      )
    ]);

    // as this routes data invalidation does not depend on cached data so we revaidate the cache in background
    // invalidate category lesson list cache
    waitUntil(CACHE.lessons.category_lesson_list.refresh({ lang_id, category_id }));
    return {
      updated: true
    };
  });

const add_update_lesson_category_route = protectedAdminProcedure
  .input(
    z.object({
      category_id: z.number().int().min(1).nullable(),
      prev_category_id: z.number().int().optional(),
      lesson_id: z.number().int(),
      lang_id: z.number().int()
    })
  )
  .mutation(async ({ input: { category_id, prev_category_id, lesson_id, lang_id } }) => {
    await Promise.allSettled([
      db
        .update(text_lessons)
        .set({ category_id: category_id, order: null })
        // reset the order to null on add/update to a category
        .where(eq(text_lessons.id, lesson_id)),
      prev_category_id && reorder_text_lesson_in_category_func(prev_category_id, lesson_id)
      // no need to reorder the current category as order is set to null which does not affect the concerned order
    ]);

    // as the category_id list is fetched directly from db on list lessons page
    // so we revalidate the cache in background
    category_id && waitUntil(CACHE.lessons.category_lesson_list.refresh({ lang_id, category_id }));
    prev_category_id &&
      waitUntil(
        CACHE.lessons.category_lesson_list.refresh({ lang_id, category_id: prev_category_id })
      );

    return {
      added: true
    };
  });

const get_category_text_lesson_list_route = publicProcedure
  .input(z.object({ category_id: z.number().int(), lang_id: z.number().int() }))
  .query(async ({ input: { category_id, lang_id } }) => {
    const lessons = await CACHE.lessons.category_lesson_list.get({ lang_id, category_id });
    return lessons;
  });

export const lesson_categories_router = t.router({
  get_categories: get_categories_route,
  add_category: add_category_route,
  update_category_list: update_category_list_route,
  delete_category: delete_category_route,
  get_text_lessons: get_text_lessons_route,
  update_text_lessons_order: update_text_lessons_order_route,
  add_update_lesson_category: add_update_lesson_category_route,
  get_category_text_lesson_list: get_category_text_lesson_list_route
});
