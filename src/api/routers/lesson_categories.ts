import { z } from 'zod';
import { and, eq, max, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { lesson_categories, text_lessons } from '~/db/schema';
import { dbRun, dbTransaction, type DbTransaction } from '~/effect/database';
import { CACHE, invalidateAndRefreshCache } from '~/effect/cache';
import { t, protectedAdminProcedure, publicProcedure } from '~/api/trpc_init';
import { runTrpcEffect } from '~/effect/run';
import { LessonCategoriesSchemaZod, TextLessonsSchemaZod } from '~/db/schema_zod';

/**
 * @param lesson_id_to_ignore Allow this function to run in parallel with deletes/moves.
 */
export const reorder_text_lesson_in_category = async (
  category_id: number,
  lesson_id_to_ignore: number,
  dbConn: DbTransaction
) => {
  const lessons: { id: number; order: number | null }[] = await dbConn.query.text_lessons.findMany({
    columns: { id: true, order: true },
    where: (tbl: any, { eq, ne, and }: any) =>
      and(eq(tbl.category_id, category_id), ne(tbl.id, lesson_id_to_ignore)),
    orderBy: (tbl: any, { asc }: any) => [asc(tbl.order)]
  });
  const reordered_lessons = lessons
    .filter((lesson) => lesson.order !== null)
    .map((lesson, index) => ({
      ...lesson,
      order: index + 1
    }));

  if (reordered_lessons.length === 0) return;

  const value_rows = reordered_lessons.map(
    (lesson) => sql`(${lesson.id}::int, ${lesson.order}::smallint)`
  );
  await dbConn.execute(sql`
    UPDATE ${text_lessons} AS t
    SET "order" = v."order", updated_at = NOW()
    FROM (VALUES ${sql.join(value_rows, sql`, `)}) AS v(id, "order")
    WHERE t.id = v.id
      AND t.category_id = ${category_id}
  `);
};

export const getLessonCategories = Effect.fn('getLessonCategories')(function* (input: {
  lang_id: number;
}) {
  return yield* CACHE.lessons.category_list.get(input);
});

export const addLessonCategory = Effect.fn('addLessonCategory')(function* (input: {
  lang_id: number;
  name: string;
}) {
  const result = yield* dbTransaction('add_lesson_category', async (tx) => {
    const last_order = await tx
      .select({ max_order: max(lesson_categories.order) })
      .from(lesson_categories)
      .where(eq(lesson_categories.lang_id, input.lang_id));
    const order = last_order[0].max_order ? last_order[0].max_order + 1 : 1;
    const rows = await tx
      .insert(lesson_categories)
      .values({ lang_id: input.lang_id, name: input.name, order })
      .returning();
    return rows[0];
  });

  yield* CACHE.lessons.category_list.delete({ lang_id: input.lang_id });
  return { id: result.id, order: result.order };
});

export const updateLessonCategoryList = Effect.fn('updateLessonCategoryList')(function* (input: {
  lang_id: number;
  categories: Array<{ id: number; name: string; order: number }>;
}) {
  yield* dbTransaction('update_lesson_category_list', async (tx) => {
    if (input.categories.length === 0) return;
    const value_rows = input.categories.map(
      (category) => sql`(${category.id}::int, ${category.name}::text, ${category.order}::smallint)`
    );
    await tx.execute(sql`
      UPDATE ${lesson_categories} AS t
      SET name = v.name, "order" = v."order", updated_at = NOW()
      FROM (VALUES ${sql.join(value_rows, sql`, `)}) AS v(id, name, "order")
      WHERE t.id = v.id
        AND t.lang_id = ${input.lang_id}
    `);
  });
  yield* CACHE.lessons.category_list.delete({ lang_id: input.lang_id });
  return { updated: true as const };
});

export const deleteLessonCategory = Effect.fn('deleteLessonCategory')(function* (input: {
  category_id: number;
  lang_id: number;
}) {
  yield* dbTransaction('delete_lesson_category', async (tx) => {
    const categories = await tx.query.lesson_categories.findMany({
      where: (tbl, { eq, ne, and }) =>
        and(eq(tbl.lang_id, input.lang_id), ne(tbl.id, input.category_id)),
      columns: { id: true, order: true },
      orderBy: (lesson_categories, { asc }) => [asc(lesson_categories.order)]
    });

    await tx
      .delete(lesson_categories)
      .where(
        and(
          eq(lesson_categories.id, input.category_id),
          eq(lesson_categories.lang_id, input.lang_id)
        )
      );

    const reordered_categories = categories.map((category, index) => ({
      ...category,
      order: index + 1
    }));
    if (reordered_categories.length > 0) {
      const value_rows = reordered_categories.map(
        (category) => sql`(${category.id}::int, ${category.order}::smallint)`
      );
      await tx.execute(sql`
        UPDATE ${lesson_categories} AS t
        SET "order" = v."order", updated_at = NOW()
        FROM (VALUES ${sql.join(value_rows, sql`, `)}) AS v(id, "order")
        WHERE t.id = v.id
      `);
    }
  });
  yield* CACHE.lessons.category_list.delete({ lang_id: input.lang_id });
  return { deleted: true as const };
});

export const getTextLessonsByCategory = Effect.fn('getTextLessonsByCategory')(function* (input: {
  category_id: number;
  lang_id: number;
}) {
  return yield* dbRun('get_text_lessons_by_category', async (db) => {
    if (input.category_id > 0) {
      const lessons = await db.query.text_lessons.findMany({
        columns: { id: true, text: true, order: true },
        where: (tbl, { eq, and }) =>
          and(eq(tbl.category_id, input.category_id), eq(tbl.lang_id, input.lang_id)),
        orderBy: (text_lessons, { asc }) => [asc(text_lessons.order)]
      });
      return { lessons, type: 'categorized' as const };
    }
    const lessons = await db.query.text_lessons.findMany({
      columns: { id: true, text: true, order: true },
      where: (tbl, { isNull, and }) => and(isNull(tbl.category_id), eq(tbl.lang_id, input.lang_id)),
      orderBy: (text_lessons, { asc }) => [asc(text_lessons.text)]
    });
    return { lessons, type: 'uncategorized' as const };
  });
});

export const updateTextLessonsOrder = Effect.fn('updateTextLessonsOrder')(function* (input: {
  lessons: Array<{ id: number; order: number | null }>;
  category_id: number;
}) {
  yield* dbTransaction('update_text_lessons_order', async (tx) => {
    if (input.lessons.length === 0) return;
    const value_rows = input.lessons.map(
      (lesson) => sql`(${lesson.id}::int, ${lesson.order}::smallint)`
    );
    await tx.execute(sql`
      UPDATE ${text_lessons} AS t
      SET "order" = v."order", updated_at = NOW()
      FROM (VALUES ${sql.join(value_rows, sql`, `)}) AS v(id, "order")
      WHERE t.id = v.id
        AND t.category_id = ${input.category_id}
    `);
  });
  yield* invalidateAndRefreshCache({
    cache: CACHE.lessons.category_lesson_list,
    params: { category_id: input.category_id }
  });
  return { updated: true as const };
});

export const addUpdateLessonCategory = Effect.fn('addUpdateLessonCategory')(function* (input: {
  category_id: number | null;
  prev_category_id?: number;
  lesson_id: number;
}) {
  yield* dbTransaction('add_update_lesson_category', async (tx) => {
    await tx
      .update(text_lessons)
      .set({ category_id: input.category_id, order: null })
      .where(eq(text_lessons.id, input.lesson_id));
    if (input.prev_category_id) {
      await reorder_text_lesson_in_category(input.prev_category_id, input.lesson_id, tx);
    }
  });

  if (input.category_id) {
    yield* invalidateAndRefreshCache({
      cache: CACHE.lessons.category_lesson_list,
      params: { category_id: input.category_id }
    });
  }
  if (input.prev_category_id) {
    yield* invalidateAndRefreshCache({
      cache: CACHE.lessons.category_lesson_list,
      params: { category_id: input.prev_category_id }
    });
  }
  return { added: true as const };
});

export const getCategoryTextLessonList = Effect.fn('getCategoryTextLessonList')(function* (input: {
  category_id: number;
}) {
  return yield* CACHE.lessons.category_lesson_list.get(input);
});

const get_categories_route = publicProcedure
  .input(z.object({ lang_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getLessonCategories(input)));

const add_category_route = protectedAdminProcedure
  .input(LessonCategoriesSchemaZod.pick({ lang_id: true, name: true }))
  .mutation(async ({ input }) => runTrpcEffect(addLessonCategory(input)));

const update_category_list_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.int(),
      categories: LessonCategoriesSchemaZod.pick({ id: true, name: true, order: true }).array()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(updateLessonCategoryList(input)));

const delete_category_route = protectedAdminProcedure
  .input(z.object({ category_id: z.int(), lang_id: z.int() }))
  .mutation(async ({ input }) => runTrpcEffect(deleteLessonCategory(input)));

const get_text_lessons_route = protectedAdminProcedure
  .input(z.object({ category_id: z.int().min(0), lang_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getTextLessonsByCategory(input)));

const update_text_lessons_order_route = protectedAdminProcedure
  .input(
    z.object({
      lessons: TextLessonsSchemaZod.pick({ id: true, order: true }).array(),
      category_id: z.int()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(updateTextLessonsOrder(input)));

const add_update_lesson_category_route = protectedAdminProcedure
  .input(
    z.object({
      category_id: z.int().min(1).nullable(),
      prev_category_id: z.int().optional(),
      lesson_id: z.int()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(addUpdateLessonCategory(input)));

const get_category_text_lesson_list_route = publicProcedure
  .input(z.object({ category_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getCategoryTextLessonList(input)));

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
