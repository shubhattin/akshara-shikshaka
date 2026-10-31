import type { QueryClient } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';

type TRPC = ReturnType<typeof useTRPC>;

/**
 * Refetch everything a batch review changes: the batch, the list, proposals, the queue, the
 * sidebar's badges, and the reviewed gestures (their strokes, history and review state).
 */
export function invalidateBatch(queryClient: QueryClient, trpc: TRPC, batchId: number) {
  void queryClient.invalidateQueries({
    queryKey: trpc.agents.get_batch.queryKey({ batch_id: batchId })
  });
  void queryClient.invalidateQueries({ queryKey: trpc.agents.list_batches.queryKey() });
  void queryClient.invalidateQueries({
    queryKey: trpc.agents.batch_proposals.queryKey({ batch_id: batchId })
  });
  void queryClient.invalidateQueries({ queryKey: trpc.agents.review_queue.queryKey() });
  void queryClient.invalidateQueries({ queryKey: trpc.agents.sidebar_gestures.queryKey() });
  for (const filter of [
    trpc.agents.get_gesture.pathFilter(),
    trpc.agents.list_revisions.pathFilter(),
    trpc.agents.gesture_hub.pathFilter(),
    trpc.agents.chats_for_gesture.pathFilter()
  ]) {
    void queryClient.invalidateQueries(filter);
  }
}
