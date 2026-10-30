import { createContext, useContext, type ReactNode } from 'react';
import type { AgentKind } from '~/agents/agent_kinds';
import type { DraftEditData, SavedViewData } from '~/agents/gesture_creator/schemas';

/** What message parts need to know about the chat they sit in (proposal cards, harness steps). */
export type AgentChatContextValue = {
  chatId: string;
  agentKind: AgentKind;
  /** The agent is still replying (streaming here or running on the server). */
  replying: boolean;
  /** The chat's newest draft (trace call id or edit id): the one the draft editor opens. */
  latestDraftId: string | null;
  /** Send the admin's draft edit, with an optional note, as a new message. */
  sendDraftEdit: (edit: DraftEditData, note: string) => void;
  /** A focused chat's gesture (null in free chats) */
  focusGestureId: number | null;
  /** Show the agent saved strokes (focused chats), with an optional note, as a new message. */
  sendSavedView: (view: SavedViewData, note: string) => void;
  /** A proposal from this chat was saved to its gesture (the editor's panel reloads the editor). */
  onGestureSaved?: (gestureId: number) => void;
};

const AgentChatContext = createContext<AgentChatContextValue | null>(null);

export function AgentChatProvider({
  value,
  children
}: {
  value: AgentChatContextValue;
  children: ReactNode;
}) {
  return <AgentChatContext.Provider value={value}>{children}</AgentChatContext.Provider>;
}

export function useAgentChatContext(): AgentChatContextValue {
  const value = useContext(AgentChatContext);
  if (!value) throw new Error('useAgentChatContext must be used inside <AgentChatProvider>');
  return value;
}
