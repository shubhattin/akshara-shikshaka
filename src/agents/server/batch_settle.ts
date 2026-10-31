import { and, eq, inArray } from 'drizzle-orm';
import { agent_batch_items } from '~/db/schema';
import type { DbTransaction } from '~/effect/database';
import type { BatchItemStatus } from '~/agents/batch';

/**
 * Batch items follow their gesture, so none stays "to review" once it was settled somewhere
 * else (the run's chat, the gesture hub, the editor). Called inside the gesture's save.
 *
 * - A save from a batch run's chat applies that item, whichever of the chat's proposals it was
 *   (the admin may have asked the agent for changes first). This also revives an item that was
 *   rejected or superseded, and moves `applied_revision` to the newest save from the chat. Runs
 *   that never proposed (failed, no proposal, cancelled) keep their outcome; a run still going
 *   settles itself (and may auto-apply through this very save).
 * - Any save leaves the other proposals still waiting superseded: each one replaces a version
 *   that is gone (accepting it from the batch page is refused). Its chat can still apply it.
 */
/** Items whose run ended with a proposal. */
const PROPOSED_STATUSES: BatchItemStatus[] = ['proposed', 'applied', 'rejected', 'superseded'];

export async function settleBatchItemsOnSave(
  tx: DbTransaction,
  input: { gestureId: number; revision: number; userId: string; chatId: string | null }
) {
  const now = new Date();
  if (input.chatId !== null) {
    await tx
      .update(agent_batch_items)
      .set({
        status: 'applied',
        applied_revision: input.revision,
        reviewed_by: input.userId,
        reviewed_at: now
      })
      .where(
        and(
          eq(agent_batch_items.text_gesture_id, input.gestureId),
          eq(agent_batch_items.chat_id, input.chatId),
          inArray(agent_batch_items.status, PROPOSED_STATUSES)
        )
      );
  }
  await supersedeProposals(tx, input.gestureId, input.userId, now);
}

/**
 * The gesture was approved as it is: proposals still waiting for it are settled (superseded),
 * not left to review. "Needs work" leaves them waiting — one of them may be the fix.
 */
export async function settleBatchItemsOnApprove(
  tx: DbTransaction,
  input: { gestureId: number; userId: string }
) {
  await supersedeProposals(tx, input.gestureId, input.userId, new Date());
}

function supersedeProposals(tx: DbTransaction, gestureId: number, userId: string, now: Date) {
  return tx
    .update(agent_batch_items)
    .set({ status: 'superseded', reviewed_by: userId, reviewed_at: now })
    .where(
      and(
        eq(agent_batch_items.text_gesture_id, gestureId),
        eq(agent_batch_items.status, 'proposed')
      )
    );
}
