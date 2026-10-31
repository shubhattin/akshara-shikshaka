import { z } from 'zod';
import { Effect } from 'effect';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  agent_chat_gestures,
  lesson_gestures,
  text_gesture_revisions,
  text_gestures
} from '~/db/schema';
import { dbRunHttp, dbTransaction, type DbTransaction } from '~/effect/database';
import { NotFoundError, BadRequestError, ConflictError } from '~/effect/errors';
import { CACHE, invalidateAndRefreshCache } from '~/util/cache.server/cache_loaders';
import { FONT_FAMILIES, type FontFamily } from '~/state/font_list';
import { GestureSchema } from '~/tools/stroke_data/types';
import { t, protectedAdminProcedure, publicProcedure } from '~/api/trpc_init';
import { runTrpcEffect } from '~/effect/run';
import { fontAllowedForScript } from '~/state/font_scripts';
import {
  attach_text_key_to_lesson_categories,
  gesture_categories_router,
  getGesturesByCategory
} from './gesture_categories';

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
  userId: string;
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
        text_center_offset: input.textCenterOffset,
        // drawn by an admin in the editor: nothing to review
        review_status: 'approved'
      })
      .returning();

    await tx.insert(text_gesture_revisions).values({
      text_gesture_id: inserted.id,
      revision_no: inserted.revision,
      gestures: inserted.gestures,
      font_family: inserted.font_family,
      font_size: inserted.font_size,
      text_center_offset: inserted.text_center_offset,
      source: 'manual',
      user_id: input.userId
    });
    await connect_gestures_to_text_lessons(textKey, inserted.id, tx);
    await attach_text_key_to_lesson_categories(textKey, tx);
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

/** Who saved a version and why; written with every save as a `text_gesture_revisions` row. */
export type GestureSaveProvenance =
  | { source: 'manual'; userId: string }
  // a batch proposal whose chat was deleted since still records where it came from: nowhere
  | { source: 'agent'; userId: string; chatId: string | null; toolCallId: string | null }
  | { source: 'revert'; userId: string; revertedFrom: number }
  // only the glyph's font / size changed (bulk font tools)
  | { source: 'font'; userId: string };

type GestureSaveInput = {
  id: number;
  uuid: string;
  gestures: Gesture[];
  fontFamily: FontFamily;
  fontSize: number;
  textCenterOffset: [number, number];
  expectedRevision: number;
  provenance: GestureSaveProvenance;
};

type GestureSaveOutcome =
  | { ok: true; revision: number }
  | { ok: false; reason: 'conflict'; revision: number }
  | { ok: false; reason: 'missing' };

const hasStrokes = (gestures: Gesture[]) => gestures.some((g) => g.points.length > 0);

/**
 * Review state after a save: the admin's own edits keep it; strokes they did not draw wait for a
 * review; a font change waits too when there are strokes (they were traced on the old glyph).
 */
function reviewStatusAfterSave(input: GestureSaveInput) {
  const keep = sql`${text_gestures.review_status}`;
  switch (input.provenance.source) {
    case 'manual':
      return keep;
    case 'font':
      return hasStrokes(input.gestures) ? 'unreviewed' : keep;
    default:
      return 'unreviewed';
  }
}

/**
 * One gesture save inside a transaction: updates the gesture when it is still at
 * `expectedRevision`, bumps its revision and records the new version.
 */
async function saveGestureInTx(
  tx: DbTransaction,
  input: GestureSaveInput
): Promise<GestureSaveOutcome> {
  const { provenance } = input;
  const match = and(eq(text_gestures.uuid, input.uuid), eq(text_gestures.id, input.id));
  const [row] = await tx
    .update(text_gestures)
    .set({
      gestures: input.gestures,
      font_family: input.fontFamily,
      font_size: input.fontSize,
      text_center_offset: input.textCenterOffset,
      revision: sql`${text_gestures.revision} + 1`,
      review_status: reviewStatusAfterSave(input),
      updated_at: new Date()
    })
    .where(and(match, eq(text_gestures.revision, input.expectedRevision)))
    .returning();
  if (!row) {
    const [current] = await tx
      .select({ revision: text_gestures.revision })
      .from(text_gestures)
      .where(match)
      .limit(1);
    return current
      ? { ok: false, reason: 'conflict', revision: current.revision }
      : { ok: false, reason: 'missing' };
  }
  await tx.insert(text_gesture_revisions).values({
    text_gesture_id: input.id,
    revision_no: row.revision,
    gestures: input.gestures,
    font_family: input.fontFamily,
    font_size: input.fontSize,
    text_center_offset: input.textCenterOffset,
    source: provenance.source,
    user_id: provenance.userId,
    chat_id: provenance.source === 'agent' ? provenance.chatId : null,
    tool_call_id: provenance.source === 'agent' ? provenance.toolCallId : null,
    reverted_from: provenance.source === 'revert' ? provenance.revertedFrom : null
  });
  if (provenance.source === 'agent' && provenance.chatId !== null) {
    await tx
      .insert(agent_chat_gestures)
      .values({ chat_id: provenance.chatId, text_gesture_id: input.id, applied_at: new Date() })
      .onConflictDoUpdate({
        target: [agent_chat_gestures.chat_id, agent_chat_gestures.text_gesture_id],
        set: { applied_at: new Date() }
      });
  }
  return { ok: true, revision: row.revision };
}

const refreshGestureCache = (gesture: { id: number; uuid: string }) =>
  invalidateAndRefreshCache({
    cache: CACHE.gestures.gesture_data,
    params: { gesture_id: gesture.id, gesture_uuid: gesture.uuid }
  });

/**
 * The one write path for a gesture's strokes and glyph: updates the gesture, bumps its revision
 * and records the new version. `expectedRevision` is the version the save is based on: a save
 * based on an older version fails with a conflict instead of overwriting the newer one.
 */
export const editTextGestureData = Effect.fn('editTextGestureData')(function* (
  input: Omit<GestureSaveInput, 'fontFamily'> & { fontFamily: string }
) {
  const fontFamily = parseFontFamily(input.fontFamily);
  if (!fontFamily) {
    return yield* Effect.fail(
      BadRequestError.make({ message: `Invalid font family: ${input.fontFamily}` })
    );
  }
  const outcome = yield* dbTransaction('edit_text_gesture', (tx) =>
    saveGestureInTx(tx, { ...input, fontFamily })
  );

  if (!outcome.ok) {
    return yield* outcome.reason === 'conflict'
      ? Effect.fail(
          ConflictError.make({
            message: `This gesture was saved again since you opened it (now version ${outcome.revision}). Reload to see the latest version.`
          })
        )
      : Effect.fail(
          NotFoundError.make({ resource: 'text_gesture', message: 'Text gesture not found' })
        );
  }

  yield* refreshGestureCache(input);
  return { updated: true as const, revision: outcome.revision };
});

// ---------------------------------------------------------------- fonts

/** Most gestures one font save may change (a lesson category is far smaller). */
export const MAX_FONT_CHANGES = 300;

/**
 * Every gesture of a script in one lesson category (0: uncategorized), in lesson order, with its
 * glyph settings and strokes: what the font tools show and change.
 */
export const listCategoryGestureFonts = Effect.fn('listCategoryGestureFonts')(function* (input: {
  category_id: number;
  script_id: number;
  lang_id: number;
}) {
  const listed = yield* getGesturesByCategory(input);
  const ids = listed.gestures.map((g) => g.id);
  if (ids.length === 0) return [];
  const rows = yield* dbRunHttp('text_gestures.category_fonts', (client) =>
    client
      .select({
        id: text_gestures.id,
        uuid: text_gestures.uuid,
        text: text_gestures.text,
        script_id: text_gestures.script_id,
        gestures: text_gestures.gestures,
        font_family: text_gestures.font_family,
        font_size: text_gestures.font_size,
        text_center_offset: text_gestures.text_center_offset,
        revision: text_gestures.revision,
        review_status: text_gestures.review_status
      })
      .from(text_gestures)
      .where(inArray(text_gestures.id, ids))
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return listed.gestures.flatMap((g) => {
    const row = byId.get(g.id);
    return row ? [{ ...row, order: g.order }] : [];
  });
});

/**
 * Change the glyph font (and size) of many gestures at once, all or nothing: each change names
 * the revision it was made on, and if any gesture was saved since, nothing is written and the
 * conflicting ids come back. Each change is a new version (`source = 'font'`); gestures with
 * strokes go back to Unreviewed, as their strokes were traced on the old glyph.
 */
export const applyGestureFonts = Effect.fn('applyGestureFonts')(function* (input: {
  changes: { id: number; expected_revision: number; font_family: string; font_size: number }[];
  userId: string;
}) {
  const changes = new Map(input.changes.map((change) => [change.id, change]));
  if (changes.size !== input.changes.length) {
    return yield* Effect.fail(BadRequestError.make({ message: 'A gesture is listed twice' }));
  }
  const fonts = new Map<number, FontFamily>();
  for (const change of input.changes) {
    const font = parseFontFamily(change.font_family);
    if (!font) {
      return yield* Effect.fail(
        BadRequestError.make({ message: `Invalid font family: ${change.font_family}` })
      );
    }
    fonts.set(change.id, font);
  }

  const outcome = yield* dbTransaction('apply_gesture_fonts', async (tx) => {
    const current = await tx
      .select({
        id: text_gestures.id,
        uuid: text_gestures.uuid,
        script_id: text_gestures.script_id,
        gestures: text_gestures.gestures,
        text_center_offset: text_gestures.text_center_offset,
        revision: text_gestures.revision
      })
      .from(text_gestures)
      .where(inArray(text_gestures.id, [...changes.keys()]));
    if (current.length !== changes.size) return { ok: false, reason: 'missing' } as const;
    const conflicts = current
      .filter((row) => row.revision !== changes.get(row.id)!.expected_revision)
      .map((row) => row.id);
    if (conflicts.length > 0) return { ok: false, reason: 'conflict', conflicts } as const;
    const wrongScript = current.find(
      (row) => !fontAllowedForScript(fonts.get(row.id)!, row.script_id)
    );
    if (wrongScript) return { ok: false, reason: 'font', id: wrongScript.id } as const;

    const saved: { id: number; uuid: string; revision: number }[] = [];
    for (const row of current) {
      const change = changes.get(row.id)!;
      const result = await saveGestureInTx(tx, {
        id: row.id,
        uuid: row.uuid,
        gestures: row.gestures,
        fontFamily: fonts.get(row.id)!,
        fontSize: change.font_size,
        textCenterOffset: row.text_center_offset,
        expectedRevision: change.expected_revision,
        provenance: { source: 'font', userId: input.userId }
      });
      // saved by someone else between the check and here: undo everything
      if (!result.ok) throw new Error(`Gesture ${row.id} was saved meanwhile; nothing was changed`);
      saved.push({ id: row.id, uuid: row.uuid, revision: result.revision });
    }
    return { ok: true, saved } as const;
  });

  if (!outcome.ok) {
    switch (outcome.reason) {
      case 'missing':
        return yield* Effect.fail(
          NotFoundError.make({ resource: 'text_gesture', message: 'A gesture no longer exists' })
        );
      case 'font':
        return yield* Effect.fail(
          BadRequestError.make({
            message: `Gesture #${outcome.id}: this font has no glyphs for its script`
          })
        );
      case 'conflict':
        return yield* Effect.fail(
          ConflictError.make({
            message: `Saved again since you opened the font tools: ${outcome.conflicts.map((id) => `#${id}`).join(', ')}. Reload them and try again; your other changes are kept.`
          })
        );
    }
  }

  yield* Effect.forEach(outcome.saved, refreshGestureCache, { concurrency: 8, discard: true });
  return { saved: outcome.saved };
});

export const deleteTextGestureData = Effect.fn('deleteTextGestureData')(function* (input: {
  id: number;
  uuid: string;
  script_id: number;
}) {
  const outcome = yield* dbTransaction('delete_text_gesture', async (tx) => {
    const data = await tx.query.text_gestures.findFirst({
      where: (table, { eq }) =>
        and(
          eq(table.id, input.id),
          eq(table.uuid, input.uuid),
          eq(table.script_id, input.script_id)
        ),
      columns: { id: true, text_key: true },
      with: {
        lessons: {
          columns: { text_lesson_id: true }
        }
      }
    });

    if (!data) {
      return { ok: false as const };
    }

    await tx
      .delete(text_gestures)
      .where(and(eq(text_gestures.uuid, input.uuid), eq(text_gestures.id, input.id)));

    return { ok: true as const, lessons: data.lessons };
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
        }),
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
  .mutation(async ({ input, ctx }) =>
    runTrpcEffect(addTextGestureData({ ...input, userId: ctx.user.id }))
  );

const edit_text_gesture_data_route = protectedAdminProcedure
  .input(
    z.object({
      id: z.number(),
      uuid: z.uuid(),
      gestures: GestureSchema.array(),
      fontFamily: z.string().min(1),
      fontSize: z.int(),
      textCenterOffset: z.tuple([z.number(), z.number()]),
      /** The revision the editor loaded; a newer one saved meanwhile is a conflict. */
      expectedRevision: z.int().positive()
    })
  )
  .mutation(async ({ input, ctx }) =>
    runTrpcEffect(
      editTextGestureData({ ...input, provenance: { source: 'manual', userId: ctx.user.id } })
    )
  );

const list_category_fonts_route = protectedAdminProcedure
  .input(z.object({ category_id: z.int(), script_id: z.int(), lang_id: z.int() }))
  .query(({ input }) => runTrpcEffect(listCategoryGestureFonts(input)));

const save_fonts_route = protectedAdminProcedure
  .input(
    z.object({
      changes: z
        .array(
          z.object({
            id: z.int().positive(),
            expected_revision: z.int().positive(),
            font_family: z.string().min(1),
            font_size: z.int().min(1).max(100)
          })
        )
        .min(1)
        .max(MAX_FONT_CHANGES)
    })
  )
  .mutation(({ input, ctx }) =>
    runTrpcEffect(applyGestureFonts({ changes: input.changes, userId: ctx.user.id }))
  );

const delete_text_gesture_data_route = protectedAdminProcedure
  .input(z.object({ id: z.number(), uuid: z.uuid(), script_id: z.int() }))
  .mutation(async ({ input }) => runTrpcEffect(deleteTextGestureData(input)));

/**
 * Strokes + glyph settings for gesture previews (`GesturePreview`), by id. Used wherever a
 * gesture is shown by reference, e.g. previews embedded in admin agent replies.
 */
export const getGesturePreviews = Effect.fn('getGesturePreviews')(function* (ids: number[]) {
  if (ids.length === 0) return [];
  return yield* dbRunHttp('text_gestures.previews', (client) =>
    client
      .select({
        id: text_gestures.id,
        text: text_gestures.text,
        script_id: text_gestures.script_id,
        gestures: text_gestures.gestures,
        font_family: text_gestures.font_family,
        font_size: text_gestures.font_size,
        text_center_offset: text_gestures.text_center_offset
      })
      .from(text_gestures)
      .where(inArray(text_gestures.id, ids))
  );
});

const get_gesture_previews_route = protectedAdminProcedure
  .input(z.object({ ids: z.array(z.int().positive()).max(50) }))
  .query(async ({ input }) => runTrpcEffect(getGesturePreviews(input.ids)));

const get_text_gesture_data_route = publicProcedure
  .input(z.object({ id: z.int(), uuid: z.uuid() }))
  .query(async ({ input }) => runTrpcEffect(getTextGestureData(input)));

export const text_gestures_router = t.router({
  add_text_gesture_data: add_text_gesture_data_route,
  edit_text_gesture_data: edit_text_gesture_data_route,
  delete_text_gesture_data: delete_text_gesture_data_route,
  categories: gesture_categories_router,
  get_text_gesture_data: get_text_gesture_data_route,
  get_gesture_previews: get_gesture_previews_route,
  fonts: t.router({
    list: list_category_fonts_route,
    save: save_fonts_route
  })
});
