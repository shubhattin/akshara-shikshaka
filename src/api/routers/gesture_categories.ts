import { z } from 'zod';
import { Effect } from 'effect';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { gesture_text_key_lesson_category_join, text_gestures, text_lessons } from '~/db/schema';
import { dbRunHttp, dbTransaction, type DbTransaction } from '~/effect/database';
import { BadRequestError } from '~/effect/errors';
import { t, protectedAdminProcedure } from '~/api/trpc_init';
import { runTrpcEffect } from '~/effect/run';
import { TextGesturesSchemaZod } from '~/db/schema_zod';
import { CACHE } from '~/util/cache.server/cache_loaders';

// Gestures are grouped by the lesson categories of a language, matched by `text_key`.
// `text_gestures.order` is the position inside that category for one script; a key in categories
// of several languages shares the same order.

/**
 * Renumber the ordered gestures of a category 1..n, separately for each script.
 * @param gesture_id_to_ignore Allow this function to run in parallel with deletes/moves.
 */
export const reorder_text_gestures_in_category = async (
  lesson_category_id: number,
  dbConn: DbTransaction,
  gesture_id_to_ignore?: number
) => {
  await dbConn.execute(sql`
    UPDATE ${text_gestures} AS t
    SET "order" = r.new_order, updated_at = NOW()
    FROM (
      SELECT g.id, ROW_NUMBER() OVER (PARTITION BY g.script_id ORDER BY g."order", g.id) AS new_order
      FROM ${text_gestures} AS g
      JOIN ${gesture_text_key_lesson_category_join} AS j ON j.gesture_text_key = g.text_key
      WHERE j.lesson_category_id = ${lesson_category_id}
        AND g."order" IS NOT NULL
        AND g.id <> ${gesture_id_to_ignore ?? -1}
    ) AS r
    WHERE t.id = r.id AND t."order" IS DISTINCT FROM r.new_order
  `);
};

/**
 * Put `text_key` (its gestures in every script) into `lesson_category_id`, or take it out of its
 * category in `lang_id` when null. Moved gestures lose their order; the category they left is
 * renumbered.
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
  await dbConn
    .update(text_gestures)
    .set({ order: null })
    .where(eq(text_gestures.text_key, input.text_key));
  if (prev) await reorder_text_gestures_in_category(prev.lesson_category_id, dbConn);
};

/**
 * A new gesture joins the categories of the lessons with its key, in every language where the
 * key has no category yet.
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
    ON CONFLICT (gesture_text_key, lang_id) DO NOTHING
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
    const columns = {
      id: text_gestures.id,
      text: text_gestures.text,
      text_key: text_gestures.text_key,
      order: text_gestures.order
    };
    if (input.category_id > 0) {
      const gestures = await db
        .select(columns)
        .from(text_gestures)
        .innerJoin(
          gesture_text_key_lesson_category_join,
          eq(text_gestures.text_key, gesture_text_key_lesson_category_join.gesture_text_key)
        )
        .where(
          and(
            eq(gesture_text_key_lesson_category_join.lesson_category_id, input.category_id),
            eq(text_gestures.script_id, input.script_id)
          )
        )
        .orderBy(asc(text_gestures.order), asc(text_gestures.text));
      return { gestures, type: 'categorized' as const };
    }

    const gestures = await db
      .select(columns)
      .from(text_gestures)
      .leftJoin(
        gesture_text_key_lesson_category_join,
        and(
          eq(text_gestures.text_key, gesture_text_key_lesson_category_join.gesture_text_key),
          eq(gesture_text_key_lesson_category_join.lang_id, input.lang_id)
        )
      )
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

export const updateGesturesOrder = Effect.fn('updateGesturesOrder')(function* (input: {
  gestures: Array<{ id: number; order: number | null }>;
  category_id: number;
}) {
  yield* dbTransaction('update_gestures_order', async (tx) => {
    if (input.gestures.length === 0) return;
    const value_rows = input.gestures.map(
      (gesture) => sql`(${gesture.id}::int, ${gesture.order}::smallint)`
    );
    await tx.execute(sql`
      UPDATE ${text_gestures} AS t
      SET "order" = v."order", updated_at = NOW()
      FROM (VALUES ${sql.join(value_rows, sql`, `)}) AS v(id, "order")
      WHERE t.id = v.id
        AND EXISTS (
          SELECT 1
          FROM ${gesture_text_key_lesson_category_join} AS j
          WHERE j.gesture_text_key = t.text_key
            AND j.lesson_category_id = ${input.category_id}
        )
    `);
  });
  return { updated: true as const };
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
      if (category?.lang_id !== input.lang_id) return { ok: false as const };
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
    return yield* Effect.fail(
      BadRequestError.make({ message: 'Category is not in the selected language' })
    );
  }
  return { added: true as const };
});

const get_categories_route = protectedAdminProcedure
  .input(z.object({ lang_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getGestureCategories(input)));

const get_gestures_route = protectedAdminProcedure
  .input(z.object({ category_id: z.int().min(0), script_id: z.int(), lang_id: z.int() }))
  .query(async ({ input }) => runTrpcEffect(getGesturesByCategory(input)));

const update_gestures_order_route = protectedAdminProcedure
  .input(
    z.object({
      gestures: TextGesturesSchemaZod.pick({ id: true, order: true }).array(),
      category_id: z.int()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(updateGesturesOrder(input)));

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
  update_gestures_order: update_gestures_order_route,
  add_update_gesture_category: add_update_gesture_category_route
});
