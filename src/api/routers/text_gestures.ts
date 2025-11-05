import { z } from 'zod';
import { t, protectedAdminProcedure, publicProcedure } from '~/api/trpc_init';
import { db, type transactionType } from '~/db/db';
import { gesture_text_key_category_join, lesson_gestures, text_gestures } from '~/db/schema';
import { and, eq } from 'drizzle-orm';
import { GestureSchema } from '~/tools/stroke_data/types';
import { type FontFamily } from '~/state/font_list';
import { TRPCError } from '@trpc/server';
import {
  gesture_categories_router,
  reorder_text_gesture_in_category_func
} from './gesture_categories';
import { waitUntil } from '@vercel/functions';
import { CACHE } from '../cache';

const connect_gestures_to_text_lessons_func = async (
  textKey: string,
  text_gesture_id: number,
  dbConn: transactionType
) => {
  const lessons = await dbConn.query.text_lessons.findMany({
    columns: {
      id: true
    },
    where: (tbl, { eq }) => eq(tbl.text_key, textKey)
  });
  if (lessons.length === 0) return;
  await dbConn.insert(lesson_gestures).values(
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
      scriptID: z.int(),
      fontFamily: z.string().min(1),
      fontSize: z.int(),
      textCenterOffset: z.tuple([z.number(), z.number()])
    })
  )
  .output(
    z.discriminatedUnion('success', [
      z.object({
        success: z.literal(true),
        id: z.number(),
        uuid: z.uuid()
      }),
      z.object({
        success: z.literal(false),
        err_code: z.enum(['text_already_exists'])
      })
    ])
  )
  .mutation(async ({ input }) => {
    const result = await db.transaction(async (tx) => {
      // Check if the text already exists
      const existingText = await tx.query.text_gestures.findFirst({
        where: (tbl, { and, eq }) =>
          and(eq(tbl.text, input.text), eq(tbl.script_id, input.scriptID)),
        columns: {
          id: true
        }
      });

      if (existingText) {
        return { success: false, err_code: 'text_already_exists' } as const;
      }

      const [inserted] = await tx
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
      await connect_gestures_to_text_lessons_func(input.textKey.trim(), inserted.id, tx);

      return { success: true, id: inserted.id, uuid: inserted.uuid } as const;
    });

    if (!result.success) {
      return result;
    }

    // precache the new gesture data for faster future access
    waitUntil(
      CACHE.gestures.gesture_data.refresh({
        gesture_id: result.id,
        gesture_uuid: result.uuid
      })
    );

    return result;
  });

const edit_text_gesture_data_route = protectedAdminProcedure
  .input(
    z.object({
      id: z.number(),
      uuid: z.uuid(),
      gestures: GestureSchema.array(),
      fontFamily: z.string().min(1),
      fontSize: z.int(),
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

    waitUntil(
      CACHE.gestures.gesture_data.refresh({ gesture_id: input.id, gesture_uuid: input.uuid })
    );
    return {
      updated: true
    };
  });

const delete_text_gesture_data_route = protectedAdminProcedure
  .input(z.object({ id: z.number(), uuid: z.uuid(), script_id: z.int() }))
  .mutation(async ({ input }) => {
    const { lessons } = await db.transaction(async (tx) => {
      const [[text_gesture_], data] = await Promise.all([
        tx
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
          .limit(1),
        // prefetching this data as after deletion it wont be available
        tx.query.text_gestures.findFirst({
          where: (table, { eq }) =>
            and(
              eq(table.id, input.id),
              eq(table.uuid, input.uuid),
              eq(table.script_id, input.script_id)
            ),
          columns: {
            id: true
          },
          with: {
            lessons: {
              columns: {
                text_lesson_id: true
              }
            }
          }
        })
      ]);
      if (!text_gesture_) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Text gesture not found' });
      }

      await Promise.all([
        text_gesture_.category_id &&
          reorder_text_gesture_in_category_func(
            text_gesture_.category_id,
            input.script_id,
            input.id,
            tx
          ),
        tx
          .delete(text_gestures)
          .where(and(eq(text_gestures.uuid, input.uuid), eq(text_gestures.id, input.id)))
      ]);

      return { category_id: text_gesture_.category_id, lessons: data?.lessons ?? [] };
    });

    waitUntil(
      (async () => {
        // if associated text lessons exist then refresh their caches in background
        if (lessons.length > 0) {
          await Promise.allSettled(
            lessons.map(({ text_lesson_id }) =>
              CACHE.lessons.text_lesson_info.refresh({ lesson_id: text_lesson_id })
            )
          );
        }
      })()
    );

    // delete gesture data cache on gesture deletion
    await CACHE.gestures.gesture_data.delete({ gesture_id: input.id, gesture_uuid: input.uuid });

    return {
      deleted: true
    };
  });

const get_text_gesture_data_route = publicProcedure
  .input(z.object({ id: z.int(), uuid: z.uuid() }))
  .query(async ({ input: { id, uuid } }) => {
    const text_data = CACHE.gestures.gesture_data.get({ gesture_id: id, gesture_uuid: uuid });
    return text_data;
  });

export const text_gestures_router = t.router({
  add_text_gesture_data: add_text_gesture_data_route,
  edit_text_gesture_data: edit_text_gesture_data_route,
  delete_text_gesture_data: delete_text_gesture_data_route,
  categories: gesture_categories_router,
  get_text_gesture_data: get_text_gesture_data_route
});
