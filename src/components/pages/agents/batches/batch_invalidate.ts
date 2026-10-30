import type { QueryClient } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';

type TRPC = ReturnType<typeof useTRPC>;

/** Refetch everything a batch review changes: the batch, the list, proposals, the queue. */
export function invalidateBatch(queryClient: QueryClient, trpc: TRPC, batchId: number) {
  void queryClient.invalidateQueries({
    queryKey: trpc.agents.get_batch.queryKey({ batch_id: batchId })
  });
  void queryClient.invalidateQueries({ queryKey: trpc.agents.list_batches.queryKey() });
  void queryClient.invalidateQueries({
    queryKey: trpc.agents.batch_proposals.queryKey({ batch_id: batchId })
  });
  void queryClient.invalidateQueries({ queryKey: trpc.agents.review_queue.queryKey() });
}
