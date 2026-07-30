import { z } from 'zod';
import { Effect } from 'effect';
import { and, asc, eq, isNull, max, ne, sql } from 'drizzle-orm';
import { gesture_categories, gesture_text_key_category_join, text_gestures } from '~/db/schema';
import { dbRun, dbTransaction, type DbTransaction } from '~/effect/database';
import { t, protectedAdminProcedure, runTrpcEffect } from '~/api/trpc_init';
import { GestureCategoriesSchemaZod, TextGesturesSchemaZod } from '~/db/schema_zod';

/**
 * @param gesture_id_to_ignore Allow this function to run in parallel with deletes/moves.
 */
export const reorder_text_gesture_in_category = async (
  category_id: number,
  script_id: number,
  gesture_id_to_ignore: number,
  dbConn: DbTransaction
) => {
  const gestures_ = await dbConn
    .select()
    .from(text_gestures)
    .innerJoin(
      gesture_text_key_category_join,
      eq(text_gestures.text_key, gesture_text_key_category_join.gesture_text_key)
    )
    .where(
      and(
        eq(text_gestures.script_id, script_id),
        eq(gesture_text_key_category_join.category_id, category_id),
        ne(text_gestures.id, gesture_id_to_ignore)
      )
    )
    .orderBy(asc(text_gestures.order));

  const gestures = gestures_.map((gesture) => ({
    ...gesture.text_gestures,
    category_id: gesture.gesture_text_key_category_join?.category_id ?? null
  }));

  const reordered_gestures = gestures
    .filter((gesture) => gesture.order !== null)
    .map((gesture, index) => ({
      ...gesture,
      order: index + 1
    }));

  if (reordered_gestures.length === 0) return;

  const value_rows = reordered_gestures.map(
    (gesture) => sql`(${gesture.id}::int, ${gesture.order}::smallint)`
  );
  await dbConn.execute(sql`
    UPDATE ${text_gestures} AS t
    SET "order" = v."order", updated_at = NOW()
    FROM (VALUES ${sql.join(value_rows, sql`, `)}) AS v(id, "order")
    WHERE t.id = v.id
  `);
};

export const getGestureCategories = Effect.fn('getGestureCategories')(function* () {
  return yield* dbRun('get_gesture_categories', async (db) =>
    db.query.gesture_categories.findMany({
      columns: { id: true, name: true, order: true },
      orderBy: (tbl, { asc }) => [asc(tbl.order)]
    })
  );
});

export const addGestureCategory = Effect.fn('addGestureCategory')(function* (input: {
  name: string;
}) {
  const result = yield* dbTransaction('add_gesture_category', async (tx) => {
    const last_order = await tx
      .select({ max_order: max(gesture_categories.order) })
      .from(gesture_categories);
    const order = last_order[0].max_order ? last_order[0].max_order + 1 : 1;
    const rows = await tx
      .insert(gesture_categories)
      .values({ name: input.name, order })
      .returning();
    return rows[0];
  });
  return { id: result.id, order: result.order };
});

export const updateGestureCategoryList = Effect.fn('updateGestureCategoryList')(function* (input: {
  categories: Array<{ id: number; name: string; order: number }>;
}) {
  yield* dbTransaction('update_gesture_category_list', async (tx) => {
    if (input.categories.length === 0) return;
    const value_rows = input.categories.map(
      (category) => sql`(${category.id}::int, ${category.name}::text, ${category.order}::smallint)`
    );
    await tx.execute(sql`
      UPDATE ${gesture_categories} AS t
      SET name = v.name, "order" = v."order", updated_at = NOW()
      FROM (VALUES ${sql.join(value_rows, sql`, `)}) AS v(id, name, "order")
      WHERE t.id = v.id
    `);
  });
  return { updated: true as const };
});

export const deleteGestureCategory = Effect.fn('deleteGestureCategory')(function* (input: {
  category_id: number;
}) {
  yield* dbTransaction('delete_gesture_category', async (tx) => {
    const categories = await tx.query.gesture_categories.findMany({
      columns: { id: true, order: true },
      where: (tbl, { ne }) => ne(tbl.id, input.category_id),
      orderBy: (gesture_categories, { asc }) => [asc(gesture_categories.order)]
    });
    await tx.delete(gesture_categories).where(eq(gesture_categories.id, input.category_id));

    const reordered_categories = categories.map((category, index) => ({
      ...category,
      order: index + 1
    }));
    if (reordered_categories.length > 0) {
      const value_rows = reordered_categories.map(
        (category) => sql`(${category.id}::int, ${category.order}::smallint)`
      );
      await tx.execute(sql`
        UPDATE ${gesture_categories} AS t
        SET "order" = v."order", updated_at = NOW()
        FROM (VALUES ${sql.join(value_rows, sql`, `)}) AS v(id, "order")
        WHERE t.id = v.id
      `);
    }
  });
  return { deleted: true as const };
});

export const getGesturesByCategory = Effect.fn('getGesturesByCategory')(function* (input: {
  category_id: number;
  script_id: number;
}) {
  return yield* dbRun('get_gestures_by_category', async (db) => {
    if (input.category_id > 0) {
      const gestures = await db
        .select({
          id: text_gestures.id,
          text: text_gestures.text,
          text_key: text_gestures.text_key,
          order: text_gestures.order
        })
        .from(text_gestures)
        .innerJoin(
          gesture_text_key_category_join,
          eq(text_gestures.text_key, gesture_text_key_category_join.gesture_text_key)
        )
        .where(
          and(
            eq(gesture_text_key_category_join.category_id, input.category_id),
            eq(text_gestures.script_id, input.script_id)
          )
        )
        .orderBy(asc(text_gestures.order), asc(text_gestures.text));
      return { gestures, type: 'categorized' as const };
    }

    const gestures = await db
      .select({
        id: text_gestures.id,
        text: text_gestures.text,
        text_key: text_gestures.text_key,
        order: text_gestures.order
      })
      .from(text_gestures)
      .leftJoin(
        gesture_text_key_category_join,
        eq(text_gestures.text_key, gesture_text_key_category_join.gesture_text_key)
      )
      .where(
        and(
          isNull(gesture_text_key_category_join.category_id),
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
          FROM ${gesture_text_key_category_join} AS j
          WHERE j.gesture_text_key = t.text_key
            AND j.category_id = ${input.category_id}
        )
    `);
  });
  return { updated: true as const };
});

export const addUpdateGestureCategory = Effect.fn('addUpdateGestureCategory')(function* (input: {
  category_id: number | null;
  prev_category_id?: number;
  gesture_text_key: string;
  gesture_id: number;
  script_id: number;
}) {
  yield* dbTransaction('add_update_gesture_category', async (tx) => {
    const prev_join = await tx.query.gesture_text_key_category_join.findFirst({
      where: (tbl, { and, eq }) =>
        input.prev_category_id
          ? and(
              eq(tbl.gesture_text_key, input.gesture_text_key),
              eq(tbl.category_id, input.prev_category_id)
            )
          : eq(tbl.gesture_text_key, input.gesture_text_key)
    });

    await tx
      .update(text_gestures)
      .set({ order: null })
      .where(
        and(eq(text_gestures.id, input.gesture_id), eq(text_gestures.script_id, input.script_id))
      );

    if (input.category_id) {
      if (prev_join) {
        await tx
          .update(gesture_text_key_category_join)
          .set({ category_id: input.category_id })
          .where(eq(gesture_text_key_category_join.id, prev_join.id));
      } else {
        await tx.insert(gesture_text_key_category_join).values({
          gesture_text_key: input.gesture_text_key,
          category_id: input.category_id
        });
      }
    } else {
      await tx
        .delete(gesture_text_key_category_join)
        .where(eq(gesture_text_key_category_join.gesture_text_key, input.gesture_text_key));
    }

    if (input.prev_category_id && input.prev_category_id !== input.category_id) {
      await reorder_text_gesture_in_category(
        input.prev_category_id,
        input.script_id,
        input.gesture_id,
        tx
      );
    }
  });

  return { added: true as const };
});

const get_categories_route = protectedAdminProcedure.query(async () =>
  runTrpcEffect(getGestureCategories())
);

const add_category_route = protectedAdminProcedure
  .input(GestureCategoriesSchemaZod.pick({ name: true }))
  .mutation(async ({ input }) => runTrpcEffect(addGestureCategory(input)));

const update_list_route = protectedAdminProcedure
  .input(
    z.object({
      categories: GestureCategoriesSchemaZod.pick({ id: true, name: true, order: true }).array()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(updateGestureCategoryList(input)));

const delete_category_route = protectedAdminProcedure
  .input(z.object({ category_id: z.int() }))
  .mutation(async ({ input }) => runTrpcEffect(deleteGestureCategory(input)));

const get_gestures_route = protectedAdminProcedure
  .input(z.object({ category_id: z.int().min(0), script_id: z.int() }))
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
      prev_category_id: z.int().optional(),
      gesture_text_key: z.string().min(1),
      gesture_id: z.int(),
      script_id: z.int()
    })
  )
  .mutation(async ({ input }) => runTrpcEffect(addUpdateGestureCategory(input)));

export const gesture_categories_router = t.router({
  get_categories: get_categories_route,
  add_category: add_category_route,
  update_list: update_list_route,
  delete_category: delete_category_route,
  get_gestures: get_gestures_route,
  update_gestures_order: update_gestures_order_route,
  add_update_gesture_category: add_update_gesture_category_route
});

/** @deprecated Prefer `reorder_text_gesture_in_category` */
export const reorder_text_gesture_in_category_func = reorder_text_gesture_in_category;
