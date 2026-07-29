import { and, eq, max, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { lesson_categories, text_lessons } from '~/db/schema';
import { dbRun, dbTransaction, type DbTransaction } from '~/effect/database';
import { CACHE } from '~/effect/cache';
import { BackgroundWork } from '~/effect/background';
import { appRuntime } from '~/effect/runtime';

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
  lesson_id: number;
  lang_id: number;
}) {
  yield* dbTransaction('delete_lesson_category', async (tx) => {
    const categories = await tx.query.lesson_categories.findMany({
      where: (tbl, { eq, ne, and }) =>
        and(eq(tbl.lang_id, input.lang_id), ne(tbl.id, input.lesson_id)),
      columns: { id: true, order: true },
      orderBy: (lesson_categories, { asc }) => [asc(lesson_categories.order)]
    });

    await tx
      .delete(lesson_categories)
      .where(
        and(eq(lesson_categories.id, input.lesson_id), eq(lesson_categories.lang_id, input.lang_id))
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
  const background = yield* BackgroundWork;
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
  yield* background.enqueue(() =>
    appRuntime.runPromise(
      CACHE.lessons.category_lesson_list.refresh({ category_id: input.category_id })
    )
  );
  return { updated: true as const };
});

export const addUpdateLessonCategory = Effect.fn('addUpdateLessonCategory')(function* (input: {
  category_id: number | null;
  prev_category_id?: number;
  lesson_id: number;
}) {
  const background = yield* BackgroundWork;
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
    const category_id = input.category_id;
    yield* background.enqueue(() =>
      appRuntime.runPromise(CACHE.lessons.category_lesson_list.refresh({ category_id }))
    );
  }
  if (input.prev_category_id) {
    const category_id = input.prev_category_id;
    yield* background.enqueue(() =>
      appRuntime.runPromise(CACHE.lessons.category_lesson_list.refresh({ category_id }))
    );
  }
  return { added: true as const };
});

export const getCategoryTextLessonList = Effect.fn('getCategoryTextLessonList')(function* (input: {
  category_id: number;
}) {
  return yield* CACHE.lessons.category_lesson_list.get(input);
});
