import { Effect } from 'effect';
import { asc, eq, sql } from 'drizzle-orm';
import { gesture_categories, gesture_text_key_category_join, text_gestures } from '~/db/schema';
import { dbRunHttp } from '~/effect/database';
import { BadRequestError, NotFoundError } from '~/effect/errors';
import { transliterateTexts } from '~/lib/transliterateTexts.server';
import { get_script_from_id } from '~/state/lang_list';
import { proposed_gesture_schema } from '~/agents/gesture_creator/schemas';
import { editTextGestureData } from '~/api/routers/text_gestures';
import { findAgentChat, loadAgentMessages } from './chat_store';

/** Gestures for the composer's `@` picker: every one, with a romanized form for search. */
export const listMentionableGestures = Effect.fn('agents.list_mentionable_gestures')(function* () {
  const rows = yield* dbRunHttp('agents.list_mentionable_gestures', (client) =>
    client
      .select({
        id: text_gestures.id,
        text: text_gestures.text,
        script_id: text_gestures.script_id,
        category_id: gesture_categories.id,
        category: gesture_categories.name,
        strokes: sql<number>`jsonb_array_length(${text_gestures.gestures})`.mapWith(Number)
      })
      .from(text_gestures)
      .leftJoin(
        gesture_text_key_category_join,
        eq(gesture_text_key_category_join.gesture_text_key, text_gestures.text_key)
      )
      .leftJoin(gesture_categories, eq(gesture_categories.id, gesture_text_key_category_join.category_id))
      .orderBy(asc(text_gestures.script_id), asc(gesture_categories.order), asc(text_gestures.order), asc(text_gestures.id))
  );
  // Romanize per script in one batch each, so "ka" finds क, క and ಕ.
  const byScript = new Map<number, number[]>();
  rows.forEach((row, index) => byScript.set(row.script_id, [...(byScript.get(row.script_id) ?? []), index]));
  const roman = Array.from({ length: rows.length }, () => '');
  yield* Effect.forEach(
    [...byScript],
    ([scriptId, indexes]) =>
      Effect.promise(async () => {
        const script = get_script_from_id(scriptId);
        if (!script) return;
        const out = await transliterateTexts(
          indexes.map((i) => rows[i]!.text),
          script,
          'Normal'
        );
        indexes.forEach((i, k) => (roman[i] = out[k] ?? ''));
      }),
    { concurrency: 'unbounded' }
  );
  return rows.map((row, index) => ({ ...row, roman: roman[index]! }));
});

/** One gesture with everything the harness and the apply dialog need. */
export const getGestureForAgent = Effect.fn('agents.get_gesture')(function* (id: number) {
  const [row] = yield* dbRunHttp('agents.get_gesture', (client) =>
    client
      .select({
        id: text_gestures.id,
        uuid: text_gestures.uuid,
        text: text_gestures.text,
        script_id: text_gestures.script_id,
        font_family: text_gestures.font_family,
        font_size: text_gestures.font_size,
        text_center_offset: text_gestures.text_center_offset,
        gestures: text_gestures.gestures,
        category: gesture_categories.name
      })
      .from(text_gestures)
      .leftJoin(
        gesture_text_key_category_join,
        eq(gesture_text_key_category_join.gesture_text_key, text_gestures.text_key)
      )
      .leftJoin(gesture_categories, eq(gesture_categories.id, gesture_text_key_category_join.category_id))
      .where(eq(text_gestures.id, id))
      .limit(1)
  );
  if (!row) {
    return yield* Effect.fail(NotFoundError.make({ resource: 'text_gesture', message: 'Gesture not found' }));
  }
  return row;
});

/**
 * Save a proposal to its gesture. The strokes come from the stored chat (what the agent
 * proposed), never from the client; replacing saved strokes needs an explicit yes.
 */
export const applyProposedGesture = Effect.fn('agents.apply_gesture')(function* (input: {
  chatId: string;
  toolCallId: string;
  userId: string;
  replaceExisting: boolean;
}) {
  const chat = yield* findAgentChat(input.chatId, input.userId);
  if (chat.agent_kind !== 'gesture_creator') {
    return yield* Effect.fail(BadRequestError.make({ message: 'This chat does not create gestures' }));
  }
  const messages = yield* loadAgentMessages(input.chatId);
  const part = messages
    .flatMap((message) => message.parts)
    .find((p) => p.type === 'tool-propose_gesture' && p.toolCallId === input.toolCallId);
  if (!part || part.type !== 'tool-propose_gesture' || part.state !== 'output-available' || !part.output.ok) {
    return yield* Effect.fail(BadRequestError.make({ message: 'That proposal is not in this chat' }));
  }
  const parsed = proposed_gesture_schema.safeParse(part.output.proposal);
  if (!parsed.success) {
    return yield* Effect.fail(BadRequestError.make({ message: 'The proposal is malformed' }));
  }
  const proposal = parsed.data;
  const current = yield* getGestureForAgent(proposal.gesture_id);
  if (current.uuid !== proposal.uuid) {
    return yield* Effect.fail(BadRequestError.make({ message: 'The gesture was replaced since the proposal' }));
  }
  const sameGlyph =
    current.font_family === proposal.font_family &&
    current.font_size === proposal.font_size &&
    current.text_center_offset[0] === proposal.text_center_offset[0] &&
    current.text_center_offset[1] === proposal.text_center_offset[1];
  if (!sameGlyph) {
    return yield* Effect.fail(
      BadRequestError.make({
        message: 'The glyph font, size or position changed since this was drawn. Ask the agent to retrace it.'
      })
    );
  }
  const hasSaved = current.gestures.some((g) => g.points.length > 0);
  if (hasSaved && !input.replaceExisting) {
    return yield* Effect.fail(
      BadRequestError.make({ message: 'This gesture already has strokes; confirm replacing them' })
    );
  }
  yield* editTextGestureData({
    id: current.id,
    uuid: current.uuid,
    gestures: proposal.gestures,
    fontFamily: current.font_family,
    fontSize: current.font_size,
    textCenterOffset: current.text_center_offset
  });
  return { applied: true as const, gesture_id: current.id };
});
