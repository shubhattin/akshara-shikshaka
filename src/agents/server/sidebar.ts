import { Effect } from 'effect';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  agent_batch_items,
  agent_batches,
  agent_chats,
  gesture_text_key_lesson_category_join,
  lesson_categories,
  text_gestures,
  text_lessons
} from '~/db/schema';
import { dbRunHttp } from '~/effect/database';
import { DEFAULT_GESTURE_CATEGORY_LANG_ID } from '~/state/lang_list';
import { liveStreaming } from './chat_store';
import { savedStrokeCount } from './stroke_count';

/**
 * The sidebar's Gestures tab: every gesture with focused chats, with what it is grouped and
 * filtered by — its lesson category and lesson order (default language), its review state, and
 * the batches it ran in. Aggregated per gesture, so no chat limit cuts gestures off.
 */
export const listSidebarGestures = Effect.fn('agents.sidebar_gestures')(function* () {
  const [gestures, categories, batchItems] = yield* Effect.all(
    [
      dbRunHttp('agents.sidebar_gestures', (client) => {
        const focused = client
          .select({
            gesture_id: agent_chats.focus_gesture_id,
            chats: sql<number>`count(*)::int`.as('chats'),
            latest_activity: sql<Date>`max(${agent_chats.updated_at})`.as('latest_activity'),
            streaming: sql<boolean>`bool_or(${liveStreaming})`.as('streaming')
          })
          .from(agent_chats)
          .where(sql`${agent_chats.focus_gesture_id} is not null`)
          .groupBy(agent_chats.focus_gesture_id)
          .as('focused');
        return client
          .select({
            id: text_gestures.id,
            text: text_gestures.text,
            text_key: text_gestures.text_key,
            script_id: text_gestures.script_id,
            review_status: text_gestures.review_status,
            revision: text_gestures.revision,
            updated_at: text_gestures.updated_at,
            strokes: savedStrokeCount,
            category_id: gesture_text_key_lesson_category_join.lesson_category_id,
            // the lesson's position, while it sits in the gesture's category
            lesson_order: sql<
              number | null
            >`case when ${text_lessons.category_id} = ${gesture_text_key_lesson_category_join.lesson_category_id} then ${text_lessons.order} end`,
            chats: focused.chats,
            latest_activity: focused.latest_activity,
            streaming: focused.streaming
          })
          .from(focused)
          .innerJoin(text_gestures, eq(text_gestures.id, focused.gesture_id))
          .leftJoin(
            gesture_text_key_lesson_category_join,
            and(
              eq(gesture_text_key_lesson_category_join.gesture_text_key, text_gestures.text_key),
              eq(gesture_text_key_lesson_category_join.lang_id, DEFAULT_GESTURE_CATEGORY_LANG_ID)
            )
          )
          .leftJoin(
            text_lessons,
            and(
              eq(text_lessons.text_key, text_gestures.text_key),
              eq(text_lessons.lang_id, DEFAULT_GESTURE_CATEGORY_LANG_ID)
            )
          );
      }),
      dbRunHttp('agents.sidebar_categories', (client) =>
        client
          .select({
            id: lesson_categories.id,
            name: lesson_categories.name,
            order: lesson_categories.order
          })
          .from(lesson_categories)
          .where(eq(lesson_categories.lang_id, DEFAULT_GESTURE_CATEGORY_LANG_ID))
          .orderBy(asc(lesson_categories.order))
      ),
      dbRunHttp('agents.sidebar_batch_items', (client) =>
        client
          .select({
            gesture_id: agent_batch_items.text_gesture_id,
            batch_id: agent_batch_items.batch_id,
            status: agent_batch_items.status,
            chat_id: agent_batch_items.chat_id,
            batch_title: agent_batches.title,
            batch_created_at: agent_batches.created_at
          })
          .from(agent_batch_items)
          .innerJoin(agent_batches, eq(agent_batches.id, agent_batch_items.batch_id))
          .orderBy(desc(agent_batches.id))
          .limit(5000)
      )
    ],
    { concurrency: 'unbounded' }
  );

  const batchesBy = new Map<number, Omit<(typeof batchItems)[number], 'gesture_id'>[]>();
  for (const { gesture_id, ...item } of batchItems) {
    batchesBy.set(gesture_id, [...(batchesBy.get(gesture_id) ?? []), item]);
  }
  return {
    categories,
    gestures: gestures.map((gesture) => ({
      ...gesture,
      latest_activity: new Date(gesture.latest_activity),
      streaming: !!gesture.streaming,
      /** Batches it ran in, newest first */
      batches: batchesBy.get(gesture.id) ?? []
    }))
  };
});
