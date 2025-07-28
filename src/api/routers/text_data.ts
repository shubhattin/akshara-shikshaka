import { z } from 'zod';
import { t, protectedAdminProcedure } from '~/api/trpc_init';
import { db } from '~/db/db';
import { text_data } from '~/db/schema';
import { and, eq } from 'drizzle-orm';

const add_text_data_route = protectedAdminProcedure
  .input(
    z.object({
      text: z.string().min(1),
      svg_json: z.any(),
      strokes_json: z.any().optional()
    })
  )
  .mutation(async ({ input }) => {
    const result = await db
      .insert(text_data)
      .values({
        text: input.text,
        svg_json: input.svg_json!,
        strokes_json: input.strokes_json || null
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
      text: z.string().min(1),
      svg_json: z.any(),
      strokes_json: z.any().optional()
    })
  )
  .mutation(async ({ input }) => {
    await db
      .update(text_data)
      .set({
        text: input.text,
        svg_json: input.svg_json,
        strokes_json: input.strokes_json || null
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
