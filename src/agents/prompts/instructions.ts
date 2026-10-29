import type { SystemModelMessage } from 'ai';
import type { AgentKind } from '~/agents/agent_kinds';
import { describeDatabaseSchema } from '~/agents/db_schema/describe_schema';
import { GENERAL_SYSTEM_PROMPT } from './general';
import { GESTURE_CREATOR_SYSTEM_PROMPT } from './gesture_creator';
import { buildLanguagesContext } from './languages';
import { STYLE_GUIDE_TAG, styleGuideEntries } from './style_guides';

export type InstructionSection = {
  id: 'system_prompt' | 'database_schema' | 'languages' | 'style_guides';
  title: string;
  content: string;
};

/**
 * Everything the agent reads before the conversation, most stable first. The cache breakpoint
 * goes after the last section, so every turn of a chat reuses the whole prefix.
 */
export function agentInstructionSections(kind: AgentKind = 'general'): InstructionSection[] {
  const languages: InstructionSection = {
    id: 'languages',
    title: 'Languages & scripts',
    content: `<languages>\n${buildLanguagesContext()}\n</languages>`
  };
  // The Gesture Creator has no database access (see create_agent), so no schema either.
  if (kind === 'gesture_creator') {
    return [
      { id: 'system_prompt', title: 'System prompt', content: GESTURE_CREATOR_SYSTEM_PROMPT },
      languages
    ];
  }
  return [
    { id: 'system_prompt', title: 'System prompt', content: GENERAL_SYSTEM_PROMPT },
    {
      id: 'database_schema',
      title: 'Database schema',
      content: `<database_schema>\n${describeDatabaseSchema()}\n</database_schema>`
    },
    languages
  ];
}

/**
 * What the context dialog shows: the instruction sections, then (Gesture Creator) the script style
 * guides. The guides are not system messages: each rides with the first mention of its script.
 */
export function agentContextSections(kind: AgentKind = 'general'): InstructionSection[] {
  const sections = agentInstructionSections(kind);
  if (kind !== 'gesture_creator') return sections;
  const guides = styleGuideEntries().map(
    ({ scripts, guide }) =>
      `<${STYLE_GUIDE_TAG} script="${scripts.join(' / ')}">\n${guide}\n</${STYLE_GUIDE_TAG}>`
  );
  const note =
    "Not part of the system prompt: each script's guide is sent once per chat, with the first @ mention of a gesture in that script.";
  return [
    ...sections,
    { id: 'style_guides', title: 'Style guides', content: [note, ...guides].join('\n\n') }
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
