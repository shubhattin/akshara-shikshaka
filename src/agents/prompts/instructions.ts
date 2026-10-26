import type { SystemModelMessage } from 'ai';
import type { AgentKind } from '~/agents/agent_kinds';
import { describeDatabaseSchema } from '~/agents/db_schema/describe_schema';
import { GENERAL_SYSTEM_PROMPT } from './general';
import { GESTURE_CREATOR_SYSTEM_PROMPT } from './gesture_creator';
import { buildLanguagesContext } from './languages';

export type InstructionSection = {
  id: 'system_prompt' | 'database_schema' | 'languages';
  title: string;
  content: string;
};

/**
 * Everything the agent reads before the conversation, most stable first. The cache breakpoint
 * goes after the last section, so every turn of a chat reuses the whole prefix.
 */
export function agentInstructionSections(kind: AgentKind = 'general'): InstructionSection[] {
  const systemPrompt = kind === 'gesture_creator' ? GESTURE_CREATOR_SYSTEM_PROMPT : GENERAL_SYSTEM_PROMPT;
  return [
    { id: 'system_prompt', title: 'System prompt', content: systemPrompt },
    {
      id: 'database_schema',
      title: 'Database schema',
      content: `<database_schema>\n${describeDatabaseSchema()}\n</database_schema>`
    },
    {
      id: 'languages',
      title: 'Languages & scripts',
      content: `<languages>\n${buildLanguagesContext()}\n</languages>`
    }
  ];
}

export function toSystemMessages(sections: InstructionSection[]): SystemModelMessage[] {
  const messages: SystemModelMessage[] = sections.map((section) => ({
    role: 'system',
    content: section.content
  }));
  // OpenAI caches prefixes automatically; Anthropic (via OpenRouter) needs the breakpoint.
  const last = messages.at(-1);
  if (last) last.providerOptions = { openrouter: { cacheControl: { type: 'ephemeral' } } };
  return messages;
}
