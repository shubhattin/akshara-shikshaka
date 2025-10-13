import { z } from 'zod';
import { t, protectedAdminProcedure } from '~/api/trpc_init';
import { db } from '~/db/db';
import { gesture_categories, text_gestures } from '~/db/schema';
import { and, count, eq, ilike, max, type SQL } from 'drizzle-orm';
import { GestureSchema } from '~/tools/stroke_data/types';
import { type FontFamily } from '~/state/font_list';
import { dev_delay } from '~/tools/delay';
import { TRPCError } from '@trpc/server';
import { GestureCategoriesSchemaZod, TextGesturesSchemaZod } from '~/db/schema_zod';

const add_text_gesture_data_route = protectedAdminProcedure
  .input(
    z.object({
      text: z.string().min(1),
      textKey: z.string().min(1),
      gestures: GestureSchema.array(),
      scriptID: z.number().int(),
      fontFamily: z.string().min(1),
      fontSize: z.number().int(),
      textCenterOffset: z.tuple([z.number(), z.number()])
    })
  )
  .output(
    z.discriminatedUnion('success', [
      z.object({
        success: z.literal(true),
        id: z.number(),
        uuid: z.string().uuid()
      }),
      z.object({
        success: z.literal(false),
        err_code: z.enum(['text_already_exists'])
      })
    ])
  )
  .mutation(async ({ input }) => {
    // Check if the text already exists
    const existingText = await db
      .select()
      .from(text_gestures)
      .where(eq(text_gestures.text, input.text))
      .limit(1);
    if (existingText.length > 0) {
      return {
        success: false,
        err_code: 'text_already_exists'
      };
    }

    const result = await db
      .insert(text_gestures)
      .values({
        text: input.text,
        text_key: input.textKey,
        gestures: input.gestures,
        script_id: input.scriptID,
        font_family: input.fontFamily as FontFamily,
        font_size: input.fontSize,
        text_center_offset: input.textCenterOffset
      })
      .returning();
    return {
      success: true,
      id: result[0].id,
      uuid: result[0].uuid
    };
  });

const edit_text_gesture_data_route = protectedAdminProcedure
  .input(
    z.object({
      id: z.number(),
      uuid: z.string().uuid(),
      gestures: GestureSchema.array(),
      fontFamily: z.string().min(1),
      fontSize: z.number().int(),
      textCenterOffset: z.tuple([z.number(), z.number()])
    })
  )
  .mutation(async ({ input }) => {
    await db
      .update(text_gestures)
      .set({
        gestures: input.gestures,
        font_family: input.fontFamily as FontFamily,
        font_size: input.fontSize,
        text_center_offset: input.textCenterOffset
      })
      .where(and(eq(text_gestures.uuid, input.uuid), eq(text_gestures.id, input.id)));
    return {
      updated: true
    };
  });

const reorder_text_gesture_in_category_func = async (category_id: number) => {
  const categories = await db.query.text_gestures.findMany({
    columns: {
      id: true,
      order: true
    },
    where: (tbl, { eq }) => eq(tbl.category_id, category_id),
    orderBy: (tbl, { asc }) => [asc(tbl.order)]
  });
  const reordered_gestures = categories.map((category, index) => ({
    ...category,
    order: index + 1
  }));

  await Promise.allSettled(
    reordered_gestures.map((gesture) =>
      db
        .update(text_gestures)
        .set({ order: gesture.order })
        .where(and(eq(text_gestures.id, gesture.id), eq(text_gestures.category_id, category_id)))
    )
  );
};

const delete_text_gesture_data_route = protectedAdminProcedure
  .input(z.object({ id: z.number(), uuid: z.string().uuid() }))
  .mutation(async ({ input }) => {
    const text_gesture_ = await db.query.text_gestures.findFirst({
      columns: {
        id: true,
        category_id: true
      },
      where: and(eq(text_gestures.uuid, input.uuid), eq(text_gestures.id, input.id))
    });
    if (!text_gesture_) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Text gesture not found' });
    }

    if (text_gesture_.category_id) {
      await reorder_text_gesture_in_category_func(text_gesture_.category_id);
    }

    await db
      .delete(text_gestures)
      .where(and(eq(text_gestures.uuid, input.uuid), eq(text_gestures.id, input.id)));
    return {
      deleted: true
    };
  });

const list_text_gesture_data_route = protectedAdminProcedure
  .input(
    z.object({
      script_id: z.number().int(),
      search_text: z.string().optional(),
      page: z.number().int().min(1),
      limit: z.number().int().min(1)
    })
  )
  .query(async ({ input }) => {
    await dev_delay(500);

    const baseWhereClause = eq(text_gestures.script_id, input.script_id);
    const [{ count: totalCount }] = await db
      .select({ count: count() })
      .from(text_gestures)
      .where(baseWhereClause);

    const offset = (input.page - 1) * input.limit;

    const list = await db.query.text_gestures.findMany({
      where: () => {
        if (input.search_text && input.search_text.trim().length > 0) {
          return and(baseWhereClause, ilike(text_gestures.text, `%${input.search_text.trim()}%`))!;
        }
        return baseWhereClause;
      },
      orderBy: (text_gestures, { asc }) => [asc(text_gestures.text)],
      limit: input.limit,
      offset,
      columns: {
        id: true,
        text: true,
        created_at: true,
        updated_at: true
      }
    });

    const total = Number(totalCount ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / input.limit));
    const hasPrev = input.page > 1;
    const hasNext = input.page < pageCount;

    return {
      list,
      total,
      page: input.page,
      pageCount,
      hasPrev,
      hasNext
    };
  });

export const get_text_gesture_categories_func = async (script_id: number) => {
  const categories = await db.query.gesture_categories.findMany({
    where: (tbl, { eq }) => eq(tbl.script_id, script_id),
    columns: {
      id: true,
      name: true,
      order: true
    },
    orderBy: (tbl, { asc }) => [asc(tbl.order)]
  });
  return categories;
};

const get_text_gesture_categories_route = protectedAdminProcedure
  .input(z.object({ script_id: z.number().int() }))
  .query(async ({ input: { script_id } }) => {
    return await get_text_gesture_categories_func(script_id);
  });

const add_text_gesture_category_route = protectedAdminProcedure
  .input(GestureCategoriesSchemaZod.pick({ script_id: true, name: true }))
  .mutation(async ({ input: { script_id, name } }) => {
    const last_order = await db
      .select({ max_order: max(gesture_categories.order) })
      .from(gesture_categories)
      .where(eq(gesture_categories.script_id, script_id));
    const order = last_order[0].max_order ? last_order[0].max_order + 1 : 1;
    const result = await db
      .insert(gesture_categories)
      .values({ script_id, name, order })
      .returning();

    return {
      id: result[0].id,
      order: result[0].order
    };
  });

const update_text_gesture_category_list_route = protectedAdminProcedure
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

const delete_text_gesture_category_route = protectedAdminProcedure
  .input(z.object({ category_id: z.number().int(), script_id: z.number().int() }))
  .mutation(async ({ input: { category_id, script_id } }) => {
    await db
      .delete(gesture_categories)
      .where(
        and(eq(gesture_categories.id, category_id), eq(gesture_categories.script_id, script_id))
      );

    const categories = await db.query.gesture_categories.findMany({
      where: (tbl, { eq }) => eq(tbl.script_id, script_id),
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

const get_category_text_gestures_route = protectedAdminProcedure
  .input(z.object({ category_id: z.number().int().min(0) }))
  .query(async ({ input: { category_id } }) => {
    if (category_id > 0) {
      const gestures = await db.query.text_gestures.findMany({
        columns: {
          id: true,
          text: true,
          order: true
        },
        where: (tbl, { eq }) => eq(tbl.category_id, category_id),
        orderBy: (text_gestures, { asc }) => [asc(text_gestures.order)]
      });
      return {
        gestures,
        type: 'categorized'
      };
    }
    // uncategorized -> 0, null in DB
    const gestures = await db.query.text_gestures.findMany({
      columns: {
        id: true,
        text: true,
        order: true
      },
      where: (tbl, { isNull }) => isNull(tbl.category_id),
      orderBy: (text_gestures, { asc }) => [asc(text_gestures.text)]
    });
    return {
      gestures,
      type: 'uncategorized'
    };
  });

const update_text_gestures_order_route = protectedAdminProcedure
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
          .where(and(eq(text_gestures.id, gesture.id), eq(text_gestures.category_id, category_id)))
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
      gesture_id: z.number().int()
    })
  )
  .mutation(async ({ input: { category_id, prev_category_id, gesture_id } }) => {
    await db
      .update(text_gestures)
      .set({ category_id, order: null })
      // reset the order to null on add/update to a category
      .where(eq(text_gestures.id, gesture_id));

    if (prev_category_id) await reorder_text_gesture_in_category_func(category_id);
    // no need to reorder the current category as order is set to null which does not affect the concerned order

    return {
      added: true
    };
  });

export const text_gestures_router = t.router({
  add_text_gesture_data: add_text_gesture_data_route,
  edit_text_gesture_data: edit_text_gesture_data_route,
  delete_text_gesture_data: delete_text_gesture_data_route,
  list_text_gesture_data: list_text_gesture_data_route,
  categories: t.router({
    get_text_gesture_categories: get_text_gesture_categories_route,
    add_text_gesture_category: add_text_gesture_category_route,
    update_text_gesture_category_list: update_text_gesture_category_list_route,
    delete_text_gesture_category: delete_text_gesture_category_route,
    get_category_text_gestures: get_category_text_gestures_route,
    update_text_gestures_order: update_text_gestures_order_route,
    add_update_gesture_category: add_update_gesture_category_route
  })
});
