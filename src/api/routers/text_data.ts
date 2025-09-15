import { z } from 'zod';
import { t, protectedAdminProcedure } from '~/api/trpc_init';
import { db } from '~/db/db';
import { text_gestures } from '~/db/schema';
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

const edit_text_data_route = protectedAdminProcedure
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

const delete_text_data_route = protectedAdminProcedure
  .input(z.object({ id: z.number(), uuid: z.string().uuid() }))
  .mutation(async ({ input }) => {
    await db
      .delete(text_gestures)
      .where(and(eq(text_gestures.uuid, input.uuid), eq(text_gestures.id, input.id)));
    return {
      deleted: true
    };
  });

export const text_data_router = t.router({
  add_text_data: add_text_data_route,
  edit_text_data: edit_text_data_route,
  delete_text_data: delete_text_data_route
});
