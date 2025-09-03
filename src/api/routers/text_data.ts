import { z } from 'zod';
import { t, protectedAdminProcedure } from '~/api/trpc_init';
import { db } from '~/db/db';
import { text_data } from '~/db/schema';
import { and, eq } from 'drizzle-orm';
import { GestureSchema } from '~/tools/stroke_data/types';
import { type FontFamily } from '~/state/font_list';

const add_text_data_route = protectedAdminProcedure
  .input(
    z.object({
      text: z.string().min(1),
      gestures: GestureSchema.array(),
      scriptID: z.number().int(),
      fontFamily: z.string().min(1),
      fontSize: z.number().int()
    })
  )
  .mutation(async ({ input }) => {
    const result = await db
      .insert(text_data)
      .values({
        text: input.text,
        gestures: input.gestures,
        scriptID: input.scriptID,
        fontFamily: input.fontFamily as FontFamily,
        fontSize: input.fontSize
      })
      .returning();
    return {
      id: result[0].id,
      uuid: result[0].uuid
    };
  });

const edit_text_data_route = protectedAdminProcedure
  .input(
    z.object({
      id: z.number(),
      uuid: z.string().uuid(),
      gestures: GestureSchema.array(),
      fontFamily: z.string().min(1),
      fontSize: z.number().int()
    })
  )
  .mutation(async ({ input }) => {
    await db
      .update(text_data)
      .set({
        gestures: input.gestures,
        fontFamily: input.fontFamily as FontFamily,
        fontSize: input.fontSize
      })
      .where(and(eq(text_data.uuid, input.uuid), eq(text_data.id, input.id)));
    return {
      updated: true
    };
  });

const delete_text_data_route = protectedAdminProcedure
  .input(z.object({ id: z.number(), uuid: z.string().uuid() }))
  .mutation(async ({ input }) => {
    await db
      .delete(text_data)
      .where(and(eq(text_data.uuid, input.uuid), eq(text_data.id, input.id)));
    return {
      deleted: true
    };
  });

export const text_data_router = t.router({
  add_text_data: add_text_data_route,
  edit_text_data: edit_text_data_route,
  delete_text_data: delete_text_data_route
});
