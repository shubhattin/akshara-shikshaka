import { z } from 'zod';
import { Effect } from 'effect';
import { and, eq } from 'drizzle-orm';
import { gesture_text_key_category_join, lesson_gestures, text_gestures } from '~/db/schema';
import { dbRun, dbTransaction, type DbTransaction } from '~/effect/database';
import { NotFoundError, BadRequestError } from '~/effect/errors';
import { CACHE, invalidateAndRefreshCache } from '~/effect/cache';
import { FONT_FAMILIES, type FontFamily } from '~/state/font_list';
import { GestureSchema } from '~/tools/stroke_data/types';
import { t, protectedAdminProcedure, publicProcedure } from '~/api/trpc_init';
import { runTrpcEffect } from '~/effect/run';
import { gesture_categories_router, reorder_text_gesture_in_category } from './gesture_categories';

type Gesture = z.infer<typeof GestureSchema>;

const parseFontFamily = (value: string): FontFamily | undefined => {
  for (const family of FONT_FAMILIES) {
    if (family === value) return family;
  }
  return undefined;
};

const connect_gestures_to_text_lessons = async (
  textKey: string,
  text_gesture_id: number,
  dbConn: DbTransaction
) => {
  const lessons = await dbConn.query.text_lessons.findMany({
    columns: { id: true },
    where: (tbl, { eq }) => eq(tbl.text_key, textKey)
  });
  if (lessons.length === 0) return;
  await dbConn.insert(lesson_gestures).values(
    lessons.map((lesson) => ({
      text_gesture_id,
      text_lesson_id: lesson.id
    }))
  );
};

export const addTextGestureData = Effect.fn('addTextGestureData')(function* (input: {
  text: string;
  textKey: string;
  gestures: Gesture[];
  scriptID: number;
  fontFamily: string;
  fontSize: number;
  textCenterOffset: [number, number];
}) {
  const fontFamily = parseFontFamily(input.fontFamily);
  if (!fontFamily) {
    return yield* Effect.fail(
      BadRequestError.make({ message: `Invalid font family: ${input.fontFamily}` })
    );
  }

  const textKey = input.textKey.trim();

  const result = yield* dbTransaction('add_text_gesture', async (tx) => {
    const existingText = await tx.query.text_gestures.findFirst({
      where: (tbl, { and, eq }) => and(eq(tbl.text, input.text), eq(tbl.script_id, input.scriptID)),
      columns: { id: true }
    });

    if (existingText) {
      return { success: false as const, err_code: 'text_already_exists' as const };
    }

    const [inserted] = await tx
      .insert(text_gestures)
      .values({
        text: input.text,
        text_key: textKey,
        gestures: input.gestures,
        script_id: input.scriptID,
        font_family: fontFamily,
        font_size: input.fontSize,
        text_center_offset: input.textCenterOffset
      })
      .returning();

    await connect_gestures_to_text_lessons(textKey, inserted.id, tx);
    return { success: true as const, id: inserted.id, uuid: inserted.uuid };
  });

  if (!result.success) return result;

  yield* invalidateAndRefreshCache({
    cache: CACHE.gestures.gesture_data,
    params: {
      gesture_id: result.id,
      gesture_uuid: result.uuid
    }
  });
  return result;
});

export const editTextGestureData = Effect.fn('editTextGestureData')(function* (input: {
  id: number;
  uuid: string;
  gestures: Gesture[];
  fontFamily: string;
  fontSize: number;
  textCenterOffset: [number, number];
}) {
  const fontFamily = parseFontFamily(input.fontFamily);
  if (!fontFamily) {
    return yield* Effect.fail(
      BadRequestError.make({ message: `Invalid font family: ${input.fontFamily}` })
    );
  }
  const updated = yield* dbRun('edit_text_gesture', async (db) => {
    const rows = await db
      .update(text_gestures)
      .set({
        gestures: input.gestures,
        font_family: fontFamily,
        font_size: input.fontSize,
        text_center_offset: input.textCenterOffset,
        updated_at: new Date()
      })
      .where(and(eq(text_gestures.uuid, input.uuid), eq(text_gestures.id, input.id)))
      .returning();
    return rows;
  });

  if (updated.length === 0) {
    return yield* Effect.fail(
      NotFoundError.make({ resource: 'text_gesture', message: 'Text gesture not found' })
    );
  }

  yield* invalidateAndRefreshCache({
    cache: CACHE.gestures.gesture_data,
    params: {
      gesture_id: input.id,
      gesture_uuid: input.uuid
    }
  });
  return { updated: true as const };
});

export const deleteTextGestureData = Effect.fn('deleteTextGestureData')(function* (input: {
  id: number;
  uuid: string;
  script_id: number;
}) {
  const outcome = yield* dbTransaction('delete_text_gesture', async (tx) => {
    const [text_gesture_] = await tx
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

    const data = await tx.query.text_gestures.findFirst({
      where: (table, { eq }) =>
        and(
          eq(table.id, input.id),
          eq(table.uuid, input.uuid),
          eq(table.script_id, input.script_id)
        ),
      columns: { id: true },
      with: {
        lessons: {
          columns: { text_lesson_id: true }
        }
      }
    });

    if (!text_gesture_) {
      return { ok: false as const };
    }

    if (text_gesture_.category_id) {
      await reorder_text_gesture_in_category(
        text_gesture_.category_id,
        input.script_id,
        input.id,
        tx
      );
    }
    await tx
      .delete(text_gestures)
      .where(and(eq(text_gestures.uuid, input.uuid), eq(text_gestures.id, input.id)));

    return {
      ok: true as const,
      category_id: text_gesture_.category_id,
      lessons: data?.lessons ?? []
    };
  });

  if (!outcome.ok) {
    return yield* Effect.fail(
      NotFoundError.make({ resource: 'text_gesture', message: 'Text gesture not found' })
    );
  }

  if (outcome.lessons.length > 0) {
    yield* Effect.forEach(
      outcome.lessons,
      ({ text_lesson_id }) =>
        invalidateAndRefreshCache({
          cache: CACHE.lessons.text_lesson_info,
          params: { lesson_id: text_lesson_id }
        }).pipe(
          Effect.catch((error) =>
            Effect.logWarning('lesson cache refresh failed', { text_lesson_id, error }).pipe(
              Effect.asVoid
            )
          )
        ),
      { concurrency: 4 }
    );
  }

  yield* CACHE.gestures.gesture_data.delete({
    gesture_id: input.id,
    gesture_uuid: input.uuid
  });

  return { deleted: true as const };
});

export const getTextGestureData = Effect.fn('getTextGestureData')(function* (input: {
  id: number;
  uuid: string;
}) {
  return yield* CACHE.gestures.gesture_data.get({
    gesture_id: input.id,
    gesture_uuid: input.uuid
  });
});

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
  .mutation(async ({ input }) => runTrpcEffect(addTextGestureData(input)));

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
  .mutation(async ({ input }) => runTrpcEffect(editTextGestureData(input)));

const delete_text_gesture_data_route = protectedAdminProcedure
  .input(z.object({ id: z.number(), uuid: z.uuid(), script_id: z.int() }))
  .mutation(async ({ input }) => runTrpcEffect(deleteTextGestureData(input)));

const get_text_gesture_data_route = publicProcedure
  .input(z.object({ id: z.int(), uuid: z.uuid() }))
  .query(async ({ input }) => runTrpcEffect(getTextGestureData(input)));

export const text_gestures_router = t.router({
  add_text_gesture_data: add_text_gesture_data_route,
  edit_text_gesture_data: edit_text_gesture_data_route,
  delete_text_gesture_data: delete_text_gesture_data_route,
  categories: gesture_categories_router,
  get_text_gesture_data: get_text_gesture_data_route
});
