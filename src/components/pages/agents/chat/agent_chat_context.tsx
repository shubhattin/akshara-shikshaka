import { createContext, useContext, type ReactNode } from 'react';
import type { AgentKind } from '~/agents/agent_kinds';
import type { GestureHarness } from '~/agents/gesture_creator/harness';

/** What message parts need to know about the chat they sit in (proposal cards, harness steps). */
export type AgentChatContextValue = {
  chatId: string;
  agentKind: AgentKind;
  /** A Gesture Creator attempt is running (model streaming or a browser tool executing). */
  runActive: boolean;
  /** Browser tools of the Gesture Creator; null in other chats */
  harness: GestureHarness | null;
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
