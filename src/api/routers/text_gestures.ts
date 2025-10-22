import { z } from 'zod';
import { t, protectedAdminProcedure, publicProcedure } from '~/api/trpc_init';
import { db } from '~/db/db';
import { gesture_text_key_category_join, lesson_gestures, text_gestures } from '~/db/schema';
import { and, count, eq, ilike } from 'drizzle-orm';
import { GestureSchema } from '~/tools/stroke_data/types';
import { type FontFamily } from '~/state/font_list';
import { dev_delay } from '~/tools/delay';
import { TRPCError } from '@trpc/server';
import {
  gesture_categories_router,
  reorder_text_gesture_in_category_func
} from './gesture_categories';

const connect_gestures_to_text_lessons_func = async (textKey: string, text_gesture_id: number) => {
  const lessons = await db.query.text_lessons.findMany({
    columns: {
      id: true
    },
    where: (tbl, { eq }) => eq(tbl.text_key, textKey)
  });
  await db.insert(lesson_gestures).values(
    lessons.map((lesson) => ({
      text_gesture_id: text_gesture_id,
      text_lesson_id: lesson.id
    }))
  );
};

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
    // on text gesture creation scan for lessons associated with the text key
    // and connect them to the text gesture via the join table `lesson_gestures`
    await connect_gestures_to_text_lessons_func(input.textKey, result[0].id);

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

const delete_text_gesture_data_route = protectedAdminProcedure
  .input(z.object({ id: z.number(), uuid: z.string().uuid(), script_id: z.number().int() }))
  .mutation(async ({ input }) => {
    const [text_gesture_] = await db
      .select({
        id: text_gestures.id,
        category_id: gesture_text_key_category_join.category_id
      })
      .from(text_gestures)
      .leftJoin(
        gesture_text_key_category_join,
        eq(text_gestures.text_key, gesture_text_key_category_join.gesture_text_key)
      )
      .where(
        and(
          eq(text_gestures.uuid, input.uuid),
          eq(text_gestures.id, input.id),
          eq(text_gestures.script_id, input.script_id)
        )
      )
      .limit(1);
    if (!text_gesture_) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Text gesture not found' });
    }

    await Promise.all([
      text_gesture_.category_id &&
        reorder_text_gesture_in_category_func(text_gesture_.category_id, input.script_id, input.id),
      db
        .delete(text_gestures)
        .where(and(eq(text_gestures.uuid, input.uuid), eq(text_gestures.id, input.id)))
    ]);

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

const get_text_gesture_data_route = publicProcedure
  .input(z.object({ id: z.number().int(), uuid: z.string().uuid() }))
  .query(async ({ input: { id, uuid } }) => {
    const text_data = await db.query.text_gestures.findFirst({
      where: (table, { eq }) => and(eq(table.id, id), eq(table.uuid, uuid)),
      columns: {
        id: true,
        uuid: true,
        text: true,
        gestures: true
      }
    });
    return text_data;
  });

export const text_gestures_router = t.router({
  add_text_gesture_data: add_text_gesture_data_route,
  edit_text_gesture_data: edit_text_gesture_data_route,
  delete_text_gesture_data: delete_text_gesture_data_route,
  list_text_gesture_data: list_text_gesture_data_route,
  categories: gesture_categories_router,
  get_text_gesture_data: get_text_gesture_data_route
});
