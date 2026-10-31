import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';

/**
 * After a gesture is saved (a proposal applied, a version restored, a save in the editor, a
 * review or notes change): refetch everything that shows it — the chats' focus bars and
 * proposal cards, its hub and history, the sidebar's badges, the review queue and the batches
 * (a save or an approval settles the gesture's batch items).
 */
export function useRefreshGesture() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (gestureId: number) => {
    for (const queryKey of [
      trpc.agents.get_gesture.queryKey({ id: gestureId }),
      trpc.agents.list_revisions.queryKey({ gesture_id: gestureId }),
      trpc.agents.gesture_hub.queryKey({ gesture_id: gestureId }),
      trpc.agents.chats_for_gesture.queryKey({ gesture_id: gestureId }),
      trpc.agents.list_chats.queryKey(),
      trpc.agents.sidebar_gestures.queryKey(),
      trpc.agents.review_queue.queryKey(),
      trpc.agents.list_mentionable_gestures.queryKey(),
      trpc.agents.list_batches.queryKey()
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
    void queryClient.invalidateQueries(trpc.agents.get_batch.pathFilter());
    void queryClient.invalidateQueries(trpc.agents.batch_proposals.pathFilter());
  };
}
