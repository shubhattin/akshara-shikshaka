import { createContext, useContext, type ReactNode } from 'react';
import type { AgentKind } from '~/agents/agent_kinds';

/** What message parts need to know about the chat they sit in (proposal cards, harness steps). */
export type AgentChatContextValue = {
  chatId: string;
  agentKind: AgentKind;
  /** The agent is still replying (streaming here or running on the server). */
  replying: boolean;
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
