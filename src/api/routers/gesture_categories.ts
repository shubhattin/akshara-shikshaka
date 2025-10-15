import { z } from 'zod';
import { t, protectedAdminProcedure } from '~/api/trpc_init';
import { db } from '~/db/db';
import { gesture_categories, gesture_text_key_category_join, text_gestures } from '~/db/schema';
import { and, asc, eq, exists, isNull, max } from 'drizzle-orm';
import { GestureCategoriesSchemaZod, TextGesturesSchemaZod } from '~/db/schema_zod';

export const reorder_text_gesture_in_category_func = async (
  category_id: number,
  script_id: number
) => {
  const gestures_ = await db
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
        eq(gesture_text_key_category_join.category_id, category_id)
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

  await Promise.allSettled(
    reordered_gestures.map((gesture) =>
      db.update(text_gestures).set({ order: gesture.order }).where(eq(text_gestures.id, gesture.id))
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
    const last_order = await db
      .select({ max_order: max(gesture_categories.order) })
      .from(gesture_categories);
    const order = last_order[0].max_order ? last_order[0].max_order + 1 : 1;
    const result = await db.insert(gesture_categories).values({ name, order }).returning();

    return {
      id: result[0].id,
      order: result[0].order
    };
  });

const update_list_route = protectedAdminProcedure
  .input(
    z.object({
      categories: GestureCategoriesSchemaZod.pick({ id: true, name: true, order: true }).array()
    })
  )
  .mutation(async ({ input: { categories } }) => {
    await Promise.all(
      categories.map(async (category) => {
        await db
          .update(gesture_categories)
          .set({ name: category.name, order: category.order })
          .where(eq(gesture_categories.id, category.id));
      })
    );

    return {
      updated: true
    };
  });

const delete_category_route = protectedAdminProcedure
  .input(z.object({ category_id: z.number().int() }))
  .mutation(async ({ input: { category_id } }) => {
    await db.delete(gesture_categories).where(eq(gesture_categories.id, category_id));

    const categories = await db.query.gesture_categories.findMany({
      columns: {
        id: true,
        order: true
      },
      orderBy: (gesture_categories, { asc }) => [asc(gesture_categories.order)]
    });

    const reordered_categories = categories.map((category, index) => ({
      ...category,
      order: index + 1
    }));
    // Update the order of the categories
    await Promise.allSettled(
      reordered_categories.map((category) =>
        db
          .update(gesture_categories)
          .set({ order: category.order })
          .where(eq(gesture_categories.id, category.id))
      )
    );

    return {
      deleted: true
    };
  });

const get_gestures_route = protectedAdminProcedure
  .input(z.object({ category_id: z.number().int().min(0), script_id: z.number().int() }))
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
      .orderBy(asc(text_gestures.order), asc(text_gestures.text));
    return {
      gestures,
      type: 'uncategorized'
    };
  });

const update_gestures_order_route = protectedAdminProcedure
  .input(
    z.object({
      gesture: TextGesturesSchemaZod.pick({ id: true, order: true }).array(),
      category_id: z.number().int()
    })
  )
  .mutation(async ({ input: { gesture, category_id } }) => {
    await Promise.allSettled(
      gesture.map((gesture) =>
        db
          .update(text_gestures)
          .set({ order: gesture.order })
          .where(
            and(
              eq(text_gestures.id, gesture.id),
              // security check
              exists(
                db
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
    return {
      updated: true
    };
  });

const add_update_gesture_category_route = protectedAdminProcedure
  .input(
    z.object({
      category_id: z.number().int(),
      prev_category_id: z.number().int().optional(),
      gesture_text_key: z.string().min(1),
      gesture_id: z.number().int(),
      script_id: z.number().int()
    })
  )
  .mutation(
    async ({
      input: { category_id, prev_category_id, gesture_id, gesture_text_key, script_id }
    }) => {
      const prev_join = await db.query.gesture_text_key_category_join.findFirst({
        where: (tbl, { and, eq }) =>
          prev_category_id
            ? and(eq(tbl.gesture_text_key, gesture_text_key), eq(tbl.category_id, prev_category_id))
            : and(eq(tbl.gesture_text_key, gesture_text_key))
      });
      await Promise.all([
        db
          .update(text_gestures)
          .set({ order: null })
          // reset the order to null on add/update to a category
          .where(and(eq(text_gestures.id, gesture_id), eq(text_gestures.script_id, script_id))),
        prev_join
          ? db
              .update(gesture_text_key_category_join)
              .set({ category_id: category_id })
              .where(eq(gesture_text_key_category_join.id, prev_join.id))
          : db.insert(gesture_text_key_category_join).values({ gesture_text_key, category_id })
      ]);
      if (prev_category_id && prev_category_id !== category_id)
        await reorder_text_gesture_in_category_func(prev_category_id, script_id);
      // no need to reorder the current category as order is set to null which does not affect the concerned order

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
