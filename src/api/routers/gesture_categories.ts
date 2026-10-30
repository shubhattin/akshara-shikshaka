import { z } from 'zod';
import { Effect } from 'effect';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { gesture_text_key_lesson_category_join, text_gestures, text_lessons } from '~/db/schema';
import { dbRunHttp, dbTransaction, type DbTransaction } from '~/effect/database';
import { BadRequestError } from '~/effect/errors';
import { t, protectedAdminProcedure } from '~/api/trpc_init';
import { runTrpcEffect } from '~/effect/run';
import { CACHE } from '~/util/cache.server/cache_loaders';

// Gestures are grouped by the lesson categories of a language, matched by `text_key`. A key with
// a lesson in that language follows the lesson: same category, and its gestures take the
// lesson's order. Keys without a lesson there are placed by hand and stay unordered.

/**
 * Put `text_key` (its gestures in every script) into `lesson_category_id`, or take it out of its
 * category in `lang_id` when null.
 */
export const set_text_key_lesson_category = async (
  input: { text_key: string; lang_id: number; lesson_category_id: number | null },
  dbConn: DbTransaction
) => {
  const prev = await dbConn.query.gesture_text_key_lesson_category_join.findFirst({
    where: (tbl, { and, eq }) =>
      and(eq(tbl.gesture_text_key, input.text_key), eq(tbl.lang_id, input.lang_id))
  });
  if ((prev?.lesson_category_id ?? null) === input.lesson_category_id) return;

  if (prev) {
    await dbConn
      .delete(gesture_text_key_lesson_category_join)
      .where(eq(gesture_text_key_lesson_category_join.id, prev.id));
  }
  if (input.lesson_category_id !== null) {
    await dbConn.insert(gesture_text_key_lesson_category_join).values({
      gesture_text_key: input.text_key,
      lesson_category_id: input.lesson_category_id,
      lang_id: input.lang_id
    });
  }
};

/**
 * A new gesture joins the categories of the lessons with its key, in every language where such
 * a lesson is categorized.
 */
export const attach_text_key_to_lesson_categories = async (
  text_key: string,
  dbConn: DbTransaction
) => {
  await dbConn.execute(sql`
    INSERT INTO ${gesture_text_key_lesson_category_join} (gesture_text_key, lesson_category_id, lang_id)
    SELECT DISTINCT ON (l.lang_id) l.text_key, l.category_id, l.lang_id
    FROM ${text_lessons} AS l
    WHERE l.text_key = ${text_key} AND l.category_id IS NOT NULL
    ORDER BY l.lang_id, l.id
    ON CONFLICT (gesture_text_key, lang_id)
    DO UPDATE SET lesson_category_id = excluded.lesson_category_id
  `);
};

export const getGestureCategories = Effect.fn('getGestureCategories')(function* (input: {
  lang_id: number;
}) {
  return yield* CACHE.lessons.category_list.get(input);
});

export const getGesturesByCategory = Effect.fn('getGesturesByCategory')(function* (input: {
  category_id: number;
  script_id: number;
  lang_id: number;
}) {
  return yield* dbRunHttp('get_gestures_by_category', async (db) => {
    // the key's lesson in this language, if any
    const lessonJoin = and(
      eq(text_lessons.text_key, text_gestures.text_key),
      eq(text_lessons.lang_id, input.lang_id)
    );
    const columns = {
      id: text_gestures.id,
      text: text_gestures.text,
      text_key: text_gestures.text_key,
      lesson_id: text_lessons.id,
      updated_at: text_gestures.updated_at,
      stroke_count: sql<number>`jsonb_array_length(${text_gestures.gestures})`.mapWith(Number)
    };
    if (input.category_id > 0) {
      // the lesson's position, while it sits in the same category
      const order = sql<
        number | null
      >`CASE WHEN ${text_lessons.category_id} = ${gesture_text_key_lesson_category_join.lesson_category_id} THEN ${text_lessons.order} END`;
      const gestures = await db
        .select({ ...columns, order })
        .from(text_gestures)
        .innerJoin(
          gesture_text_key_lesson_category_join,
          and(
            eq(text_gestures.text_key, gesture_text_key_lesson_category_join.gesture_text_key),
            eq(gesture_text_key_lesson_category_join.lesson_category_id, input.category_id)
          )
        )
        .leftJoin(text_lessons, lessonJoin)
        .where(eq(text_gestures.script_id, input.script_id))
        .orderBy(sql`${order} ASC NULLS LAST`, asc(text_gestures.text));
      return { gestures, type: 'categorized' as const };
    }

    const gestures = await db
      .select({ ...columns, order: sql<null>`NULL::smallint` })
      .from(text_gestures)
      .leftJoin(
        gesture_text_key_lesson_category_join,
        and(
          eq(text_gestures.text_key, gesture_text_key_lesson_category_join.gesture_text_key),
          eq(gesture_text_key_lesson_category_join.lang_id, input.lang_id)
        )
      )
      .leftJoin(text_lessons, lessonJoin)
      .where(
        and(
          isNull(gesture_text_key_lesson_category_join.id),
          eq(text_gestures.script_id, input.script_id)
        )
      )
      .orderBy(asc(text_gestures.text));
    return { gestures, type: 'uncategorized' as const };
  });
});

export const addUpdateGestureCategory = Effect.fn('addUpdateGestureCategory')(function* (input: {
  category_id: number | null;
  gesture_text_key: string;
  lang_id: number;
}) {
  const result = yield* dbTransaction('add_update_gesture_category', async (tx) => {
    if (input.category_id !== null) {
      const category = await tx.query.lesson_categories.findFirst({
        columns: { lang_id: true },
        where: (tbl, { eq }) => eq(tbl.id, input.category_id!)
      });
      if (category?.lang_id !== input.lang_id) {
        return { ok: false as const, message: 'Category is not in the selected language' };
      }
    }
    const lesson = await tx.query.text_lessons.findFirst({
      columns: { id: true },
      where: (tbl, { and, eq }) =>
        and(eq(tbl.text_key, input.gesture_text_key), eq(tbl.lang_id, input.lang_id))
    });
    if (lesson) {
      return {
        ok: false as const,
        message: "This gesture follows its lesson's category; change it on the lesson"
      };
    }
    await set_text_key_lesson_category(
      {
        text_key: input.gesture_text_key,
        lang_id: input.lang_id,
        lesson_category_id: input.category_id
      },
      tx
    );
    return { ok: true as const };
  });
  if (!result.ok) {
    return yield* Effect.fail(BadRequestError.make({ message: result.message }));
  }
  return { added: true as const };
});

const get_categories_route = protectedAdminProcedure
  .input(z.object({ lang_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getGestureCategories(input)));

const get_gestures_route = protectedAdminProcedure
  .input(z.object({ category_id: z.int().min(0), script_id: z.int(), lang_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getGesturesByCategory(input)));

const add_update_gesture_category_route = protectedAdminProcedure
  .input(
    z.object({
      category_id: z.int().min(1).nullable(),
      gesture_text_key: z.string().min(1),
      lang_id: z.int()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(addUpdateGestureCategory(input)));

export const gesture_categories_router = t.router({
  get_categories: get_categories_route,
  get_gestures: get_gestures_route,
  add_update_gesture_category: add_update_gesture_category_route
});
