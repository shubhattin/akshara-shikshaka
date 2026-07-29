import { Effect } from 'effect';
import { and, asc, eq, isNull, max, ne, sql } from 'drizzle-orm';
import {
  gesture_categories,
  gesture_text_key_category_join,
  lesson_gestures,
  text_gestures
} from '~/db/schema';
import { dbRun, dbTransaction, type DbTransaction } from '~/effect/database';
import { NotFoundError, BadRequestError } from '~/effect/errors';
import { CACHE } from '~/effect/cache';
import { BackgroundWork } from '~/effect/background';
import { appRuntime } from '~/effect/runtime';
import { FONT_FAMILIES, type FontFamily } from '~/state/font_list';
import { GestureSchema } from '~/tools/stroke_data/types';
import type { z } from 'zod';

type Gesture = z.infer<typeof GestureSchema>;

const parseFontFamily = (value: string): FontFamily | undefined => {
  for (const family of FONT_FAMILIES) {
    if (family === value) return family;
  }
  return undefined;
};

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
  const background = yield* BackgroundWork;
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

  yield* background.enqueue(() =>
    appRuntime.runPromise(
      CACHE.gestures.gesture_data.refresh({
        gesture_id: result.id,
        gesture_uuid: result.uuid
      })
    )
  );
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
  const background = yield* BackgroundWork;
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

  yield* background.enqueue(() =>
    appRuntime.runPromise(
      CACHE.gestures.gesture_data.refresh({
        gesture_id: input.id,
        gesture_uuid: input.uuid
      })
    )
  );
  return { updated: true as const };
});

export const deleteTextGestureData = Effect.fn('deleteTextGestureData')(function* (input: {
  id: number;
  uuid: string;
  script_id: number;
}) {
  const background = yield* BackgroundWork;

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
    const refresh = Effect.forEach(
      outcome.lessons,
      ({ text_lesson_id }) =>
        CACHE.lessons.text_lesson_info
          .refresh({ lesson_id: text_lesson_id })
          .pipe(
            Effect.catch((error) =>
              Effect.logWarning('lesson cache refresh failed', { text_lesson_id, error }).pipe(
                Effect.asVoid
              )
            )
          ),
      { concurrency: 4 }
    );
    yield* background.enqueue(() => appRuntime.runPromise(refresh));
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
