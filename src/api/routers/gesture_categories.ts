import { z } from 'zod';
import { t, protectedAdminProcedure } from '~/api/trpc_init';
import { db, type transactionType } from '~/db/db';
import { gesture_categories, gesture_text_key_category_join, text_gestures } from '~/db/schema';
import { and, asc, eq, exists, isNull, max, ne } from 'drizzle-orm';
import { GestureCategoriesSchemaZod, TextGesturesSchemaZod } from '~/db/schema_zod';

/**
 *
 * @param gesture_id_to_ignore This is to allow this function to run in parallel with other operations
 */
export const reorder_text_gesture_in_category_func = async (
  category_id: number,
  script_id: number,
  gesture_id_to_ignore: number,
  dbConn: transactionType
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
        // script id to filter out common text keys shared accross multiple scripts
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

  // inside a transaction we do not use  `allSettled` as it swallows write failures and the transaction cannot do its intended job
  await Promise.all(
    reordered_gestures.map((gesture) =>
      dbConn
        .update(text_gestures)
        .set({ order: gesture.order })
        .where(eq(text_gestures.id, gesture.id))
    )
  );
};

export const get_text_gesture_categories_func = async () => {
  const categories = await db.query.gesture_categories.findMany({
    columns: {
      id: true,
      name: true,
      order: true
    },
    orderBy: (tbl, { asc }) => [asc(tbl.order)]
  });
  return categories;
};

const get_categories_route = protectedAdminProcedure.query(async () => {
  return await get_text_gesture_categories_func();
});

const add_category_route = protectedAdminProcedure
  .input(GestureCategoriesSchemaZod.pick({ name: true }))
  .mutation(async ({ input: { name } }) => {
    const result = await db.transaction(async (tx) => {
      const last_order = await tx
        .select({ max_order: max(gesture_categories.order) })
        .from(gesture_categories);
      const order = last_order[0].max_order ? last_order[0].max_order + 1 : 1;
      const result = await tx.insert(gesture_categories).values({ name, order }).returning();
      return result[0];
    });

    return {
      id: result.id,
      order: result.order
    };
  });

const update_list_route = protectedAdminProcedure
  .input(
    z.object({
      categories: GestureCategoriesSchemaZod.pick({ id: true, name: true, order: true }).array()
    })
  )
  .mutation(async ({ input: { categories } }) => {
    await db.transaction(async (tx) => {
      // Run updates in parallel within a transaction
      // as order of these categories are dependent on each other
      await Promise.all(
        categories.map((category) =>
          tx
            .update(gesture_categories)
            .set({ name: category.name, order: category.order })
            .where(eq(gesture_categories.id, category.id))
        )
      );
    });

    return {
      updated: true
    };
  });

const delete_category_route = protectedAdminProcedure
  .input(z.object({ category_id: z.int() }))
  .mutation(async ({ input: { category_id } }) => {
    await db.transaction(async (tx) => {
      const [, categories] = await Promise.all([
        tx.delete(gesture_categories).where(eq(gesture_categories.id, category_id)),
        tx.query.gesture_categories.findMany({
          columns: {
            id: true,
            order: true
          },
          // ignore the category to be deleted
          where: (tbl, { ne }) => ne(tbl.id, category_id),
          orderBy: (gesture_categories, { asc }) => [asc(gesture_categories.order)]
        })
      ]);

      const reordered_categories = categories.map((category, index) => ({
        ...category,
        order: index + 1
      }));
      // Update the order of the categories
      await Promise.all(
        reordered_categories.map((category) =>
          tx
            .update(gesture_categories)
            .set({ order: category.order })
            .where(eq(gesture_categories.id, category.id))
        )
      );
    });

    return {
      deleted: true
    };
  });

const get_gestures_route = protectedAdminProcedure
  .input(z.object({ category_id: z.int().min(0), script_id: z.int() }))
  .query(async ({ input: { category_id, script_id } }) => {
    if (category_id > 0) {
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
            eq(gesture_text_key_category_join.category_id, category_id),
            eq(text_gestures.script_id, script_id)
          )
        )
        .orderBy(asc(text_gestures.order), asc(text_gestures.text));
      return {
        gestures,
        type: 'categorized'
      };
    }
    // uncategorized -> 0, null in DB

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
          isNull(gesture_text_key_category_join.category_id), // No match in join table
          eq(text_gestures.script_id, script_id)
        )
      )
      .orderBy(asc(text_gestures.text));
    return {
      gestures,
      type: 'uncategorized'
    };
  });

const update_gestures_order_route = protectedAdminProcedure
  .input(
    z.object({
      gestures: TextGesturesSchemaZod.pick({ id: true, order: true }).array(),
      category_id: z.int()
    })
  )
  .mutation(async ({ input: { gestures, category_id } }) => {
    await db.transaction(async (tx) => {
      // a transaction is not necessary here but fine to use too
      // also the order of these gestures are dependent on each other
      await Promise.all(
        gestures.map((gesture) =>
          tx
            .update(text_gestures)
            .set({ order: gesture.order })
            .where(
              and(
                eq(text_gestures.id, gesture.id),
                // security check
                exists(
                  tx
                    .select()
                    .from(gesture_text_key_category_join)
                    .where(
                      and(
                        eq(gesture_text_key_category_join.gesture_text_key, text_gestures.text_key),
                        eq(gesture_text_key_category_join.category_id, category_id)
                      )
                    )
                )
              )
            )
        )
      );
    });
    return {
      updated: true
    };
  });

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
  .mutation(
    async ({
      input: { category_id, prev_category_id, gesture_id, gesture_text_key, script_id }
    }) => {
      await db.transaction(async (tx) => {
        const prev_join = await tx.query.gesture_text_key_category_join.findFirst({
          where: (tbl, { and, eq }) =>
            prev_category_id
              ? and(
                  eq(tbl.gesture_text_key, gesture_text_key),
                  eq(tbl.category_id, prev_category_id)
                )
              : eq(tbl.gesture_text_key, gesture_text_key)
        });

        await Promise.all([
          tx
            .update(text_gestures)
            .set({ order: null })
            // reset the order to null on add/update to a category
            .where(and(eq(text_gestures.id, gesture_id), eq(text_gestures.script_id, script_id))),
          category_id
            ? prev_join
              ? tx
                  .update(gesture_text_key_category_join)
                  .set({ category_id: category_id })
                  .where(eq(gesture_text_key_category_join.id, prev_join.id))
              : tx
                  .insert(gesture_text_key_category_join)
                  .values({ gesture_text_key, category_id: category_id })
            : tx
                .delete(gesture_text_key_category_join)
                .where(and(eq(gesture_text_key_category_join.gesture_text_key, gesture_text_key))),
          // removing the category join, thus making it uncategorized
          prev_category_id &&
            prev_category_id !== category_id &&
            reorder_text_gesture_in_category_func(prev_category_id, script_id, gesture_id, tx)
          // no need to reorder the current category as order is set to null which does not affect the concerned order
        ]);
      });

      return {
        added: true
      };
    }
  );

export const gesture_categories_router = t.router({
  get_categories: get_categories_route,
  add_category: add_category_route,
  update_list: update_list_route,
  delete_category: delete_category_route,
  get_gestures: get_gestures_route,
  update_gestures_order: update_gestures_order_route,
  add_update_gesture_category: add_update_gesture_category_route
});
