import type { SystemModelMessage } from 'ai';
import type { AgentKind } from '~/agents/agent_kinds';
import { focusInstructions, type FocusContext } from '~/agents/focus';
import { describeDatabaseSchema } from '~/agents/db_schema/describe_schema';
import { GENERAL_SYSTEM_PROMPT } from './general';
import { GESTURE_CREATOR_SYSTEM_PROMPT } from './gesture_creator';
import { buildLanguagesContext } from './languages';
import { buildSiteContext } from './site';
import { styleGuideEntries } from './style_guides';

export type InstructionSection = {
  id: 'system_prompt' | 'database_schema' | 'languages' | 'site' | 'focus';
  title: string;
  content: string;
};

/**
 * Everything the agent reads before the conversation, most stable first. The cache breakpoint
 * goes after the last section, so every turn of a chat reuses the whole prefix.
 */
export function agentInstructionSections(
  kind: AgentKind = 'general',
  /** A focused chat's gesture: its section goes last (it changes when the notes do). */
  focus: FocusContext | null = null
): InstructionSection[] {
  const languages: InstructionSection = {
    id: 'languages',
    title: 'Languages & scripts',
    content: `<languages>\n${buildLanguagesContext()}\n</languages>`
  };
  const site: InstructionSection = {
    id: 'site',
    title: 'Site links',
    content: `<site>\n${buildSiteContext()}\n</site>`
  };
  // The Gesture Creator has no database access (see create_agent), so no schema either.
  if (kind === 'gesture_creator') {
    return [
      { id: 'system_prompt', title: 'System prompt', content: GESTURE_CREATOR_SYSTEM_PROMPT },
      languages,
      site,
      ...(focus
        ? [{ id: 'focus' as const, title: 'Focused gesture', content: focusInstructions(focus) }]
        : [])
    ];
  }
  return [
    { id: 'system_prompt', title: 'System prompt', content: GENERAL_SYSTEM_PROMPT },
    {
      id: 'database_schema',
      title: 'Database schema',
      content: `<database_schema>\n${describeDatabaseSchema()}\n</database_schema>`
    },
    languages,
    site
  ];
}

/**
 * What the context dialog shows: the instruction sections, then (Gesture Creator) the script style
 * guides. The guides are not system messages: each rides with the first mention of its script.
 */
export function agentContext(kind: AgentKind = 'general', focus: FocusContext | null = null) {
  return {
    sections: agentInstructionSections(kind, focus),
    style_guides: kind === 'gesture_creator' ? styleGuideEntries() : []
  };
}

const EPHEMERAL = { openrouter: { cacheControl: { type: 'ephemeral' } } } as const;

/**
 * OpenAI caches prefixes automatically; Anthropic (via OpenRouter) needs breakpoints, and only
 * reuses a prefix that ends at one. So the last section is marked, and in a focused chat also the
 * section before the focus: every chat (each batch run is a new focused chat) then reads the
 * shared instructions from the cache instead of writing them again. With the history's two marks
 * that is Anthropic's limit of four.
 */
export function toSystemMessages(sections: InstructionSection[]): SystemModelMessage[] {
  return sections.map((section, index) => {
    const next = sections[index + 1];
    const marked = !next || next.id === 'focus';
    return marked
      ? { role: 'system', content: section.content, providerOptions: EPHEMERAL }
      : { role: 'system', content: section.content };
  });
}
