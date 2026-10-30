import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import type { AgentKind } from '~/agents/agent_kinds';
import type { AgentModelId } from '~/agents/models';
import type { ComposerMessage } from './chat/ChatComposer';
import { setPendingMessage } from './pending_message';

export type StartChatInput = {
  agentKind: AgentKind;
  model: AgentModelId;
  /** A focused chat on this gesture */
  focusGestureId?: number;
  message: ComposerMessage;
};

/**
 * Create a chat and leave its first message for the chat view, which sends it once mounted (the
 * reply streams on the chat's own id). `onCreated` opens it: a route, or the editor's panel.
 */
export function useStartChat(onCreated: (chatId: string) => void) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const create_mut = useMutation(
    trpc.agents.create_chat.mutationOptions({
      onSuccess: (chat) => {
        void queryClient.invalidateQueries({ queryKey: trpc.agents.list_chats.queryKey() });
        if (chat.focus_gesture_id !== null) {
          void queryClient.invalidateQueries({
            queryKey: trpc.agents.gesture_hub.queryKey({ gesture_id: chat.focus_gesture_id })
          });
          void queryClient.invalidateQueries({ queryKey: trpc.agents.review_queue.queryKey() });
        }
        onCreated(chat.id);
      },
      onError: (error) => toast.error(error.message)
    })
  );

  const start = ({ agentKind, model, focusGestureId, message }: StartChatInput) => {
    const id = nanoid(16);
    setPendingMessage(id, message);
    create_mut.mutate({
      id,
      model,
      agent_kind: focusGestureId === undefined ? agentKind : 'gesture_creator',
      focus_gesture_id: focusGestureId
    });
  };

  return { start, pending: create_mut.isPending };
}
