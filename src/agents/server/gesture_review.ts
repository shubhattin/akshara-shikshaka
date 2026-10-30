import { Effect } from 'effect';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import {
  agent_chats,
  text_gesture_revisions,
  text_gestures,
  user_gesture_recordings
} from '~/db/schema';
import { dbRunHttp } from '~/effect/database';
import { BadRequestError, NotFoundError } from '~/effect/errors';
import { editTextGestureData } from '~/api/routers/text_gestures';
import { resolveAuthUserNames } from '~/lib/auth_users.server';
import type { ReviewStatus } from '~/agents/gesture_review';
import { getGestureForAgent } from './gestures';
import { listChatsForGesture } from './chat_store';

/** Display names for admin ids; history still shows (without names) if the lookup fails. */
const userNames = (ids: (string | null)[]) =>
  resolveAuthUserNames(ids.filter((id): id is string => !!id)).pipe(
    Effect.orElseSucceed(() => new Map<string, string>())
  );

const strokeCount = sql<number>`jsonb_array_length(${text_gestures.gestures})`.mapWith(Number);

/** A gesture's saved versions, newest first, with who saved each. */
export const listGestureRevisions = Effect.fn('gesture_review.list_revisions')(function* (
  gestureId: number
) {
  const rows = yield* dbRunHttp('gesture_review.list_revisions', (client) =>
    client
      .select({
        id: text_gesture_revisions.id,
        revision_no: text_gesture_revisions.revision_no,
        gestures: text_gesture_revisions.gestures,
        font_family: text_gesture_revisions.font_family,
        font_size: text_gesture_revisions.font_size,
        text_center_offset: text_gesture_revisions.text_center_offset,
        source: text_gesture_revisions.source,
        chat_id: text_gesture_revisions.chat_id,
        chat_title: agent_chats.title,
        tool_call_id: text_gesture_revisions.tool_call_id,
        reverted_from: text_gesture_revisions.reverted_from,
        user_id: text_gesture_revisions.user_id,
        created_at: text_gesture_revisions.created_at
      })
      .from(text_gesture_revisions)
      .leftJoin(agent_chats, eq(agent_chats.id, text_gesture_revisions.chat_id))
      .where(eq(text_gesture_revisions.text_gesture_id, gestureId))
      .orderBy(desc(text_gesture_revisions.revision_no))
      .limit(100)
  );
  const names = yield* userNames(rows.map((row) => row.user_id));
  return rows.map((row) => ({
    ...row,
    user_name: row.user_id ? (names.get(row.user_id) ?? null) : null
  }));
});

/** Save an older version again, as a new revision (history is never rewritten). */
export const revertGestureRevision = Effect.fn('gesture_review.revert')(function* (input: {
  gestureId: number;
  revisionId: number;
  expectedRevision: number;
  userId: string;
}) {
  const [revision] = yield* dbRunHttp('gesture_review.find_revision', (client) =>
    client
      .select()
      .from(text_gesture_revisions)
      .where(
        and(
          eq(text_gesture_revisions.id, input.revisionId),
          eq(text_gesture_revisions.text_gesture_id, input.gestureId)
        )
      )
      .limit(1)
  );
  if (!revision) {
    return yield* Effect.fail(
      NotFoundError.make({ resource: 'text_gesture_revision', message: 'Version not found' })
    );
  }
  const current = yield* getGestureForAgent(input.gestureId);
  if (revision.revision_no === current.revision) {
    return yield* Effect.fail(
      BadRequestError.make({ message: 'This is already the saved version' })
    );
  }
  return yield* editTextGestureData({
    id: current.id,
    uuid: current.uuid,
    gestures: revision.gestures,
    fontFamily: revision.font_family,
    fontSize: revision.font_size,
    textCenterOffset: revision.text_center_offset,
    expectedRevision: input.expectedRevision,
    provenance: { source: 'revert', userId: input.userId, revertedFrom: revision.id }
  });
});

export const setGestureReview = Effect.fn('gesture_review.set_review')(function* (input: {
  gestureId: number;
  status: ReviewStatus;
  note: string;
}) {
  const rows = yield* dbRunHttp('gesture_review.set_review', (client) =>
    client
      .update(text_gestures)
      .set({
        review_status: input.status,
        review_note: input.status === 'approved' ? '' : input.note
      })
      .where(eq(text_gestures.id, input.gestureId))
      .returning()
  );
  if (rows.length === 0) {
    return yield* Effect.fail(
      NotFoundError.make({ resource: 'text_gesture', message: 'Gesture not found' })
    );
  }
  return { updated: true as const };
});

export const setGestureAgentNotes = Effect.fn('gesture_review.set_agent_notes')(function* (input: {
  gestureId: number;
  notes: string;
}) {
  const rows = yield* dbRunHttp('gesture_review.set_agent_notes', (client) =>
    client
      .update(text_gestures)
      .set({ agent_notes: input.notes.trim() })
      .where(eq(text_gestures.id, input.gestureId))
      .returning()
  );
  if (rows.length === 0) {
    return yield* Effect.fail(
      NotFoundError.make({ resource: 'text_gesture', message: 'Gesture not found' })
    );
  }
  return { updated: true as const };
});

/** The same akṣara in the other scripts (shared `text_key`). */
export const listSiblingGestures = Effect.fn('gesture_review.siblings')(function* (gesture: {
  id: number;
  text_key: string;
}) {
  return yield* dbRunHttp('gesture_review.siblings', (client) =>
    client
      .select({
        id: text_gestures.id,
        text: text_gestures.text,
        script_id: text_gestures.script_id,
        strokes: strokeCount,
        review_status: text_gestures.review_status
      })
      .from(text_gestures)
      .where(
        and(eq(text_gestures.text_key, gesture.text_key), sql`${text_gestures.id} <> ${gesture.id}`)
      )
      .orderBy(text_gestures.script_id)
  );
});

/** Everything the gesture hub (and the editor's agent panel) shows about one gesture. */
export const getGestureHub = Effect.fn('gesture_review.hub')(function* (gestureId: number) {
  const gesture = yield* getGestureForAgent(gestureId);
  const [siblings, chats] = yield* Effect.all(
    [listSiblingGestures(gesture), listChatsForGesture(gestureId)],
    { concurrency: 'unbounded' }
  );
  const names = yield* userNames(chats.map((chat) => chat.user_id));
  return {
    gesture,
    siblings,
    chats: chats.map((chat) => ({ ...chat, user_name: names.get(chat.user_id) ?? null }))
  };
});

/** Practice attempts counted for the queue's "learners struggle" bucket. */
const PRACTICE_WINDOW_DAYS = 30;

/**
 * Every gesture with what the review queue ranks it by: strokes, review state, learners'
 * recent practice (attempts and how many finished) and its newest focused chat.
 */
export const getReviewQueue = Effect.fn('gesture_review.queue')(function* () {
  const since = new Date(Date.now() - PRACTICE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [gestures, practice, focused] = yield* Effect.all(
    [
      dbRunHttp('gesture_review.queue_gestures', (client) =>
        client
          .select({
            id: text_gestures.id,
            text: text_gestures.text,
            text_key: text_gestures.text_key,
            script_id: text_gestures.script_id,
            strokes: strokeCount,
            review_status: text_gestures.review_status,
            review_note: text_gestures.review_note,
            revision: text_gestures.revision,
            updated_at: text_gestures.updated_at
          })
          .from(text_gestures)
      ),
      dbRunHttp('gesture_review.queue_practice', (client) =>
        client
          .select({
            text: user_gesture_recordings.text,
            script_id: user_gesture_recordings.script_id,
            attempts: sql<number>`count(*)`.mapWith(Number),
            completed:
              sql<number>`count(*) filter (where ${user_gesture_recordings.completed})`.mapWith(
                Number
              )
          })
          .from(user_gesture_recordings)
          .where(gte(user_gesture_recordings.created_at, since))
          .groupBy(user_gesture_recordings.text, user_gesture_recordings.script_id)
      ),
      dbRunHttp('gesture_review.queue_chats', (client) =>
        client
          .select({
            gesture_id: agent_chats.focus_gesture_id,
            chats: sql<number>`count(*)`.mapWith(Number),
            latest_chat_id: sql<string>`(array_agg(${agent_chats.id} order by ${agent_chats.updated_at} desc))[1]`
          })
          .from(agent_chats)
          .where(sql`${agent_chats.focus_gesture_id} is not null`)
          .groupBy(agent_chats.focus_gesture_id)
      )
    ],
    { concurrency: 'unbounded' }
  );
  const practiceKey = (text: string, scriptId: number) => `${scriptId}:${text}`;
  const practiceBy = new Map(practice.map((row) => [practiceKey(row.text, row.script_id), row]));
  const chatsBy = new Map(focused.map((row) => [row.gesture_id, row]));
  return {
    practice_window_days: PRACTICE_WINDOW_DAYS,
    gestures: gestures.map((gesture) => {
      const stats = practiceBy.get(practiceKey(gesture.text, gesture.script_id));
      const chats = chatsBy.get(gesture.id);
      return {
        ...gesture,
        attempts: stats?.attempts ?? 0,
        completed: stats?.completed ?? 0,
        focused_chats: chats?.chats ?? 0,
        latest_chat_id: chats?.latest_chat_id ?? null
      };
    })
  };
});
