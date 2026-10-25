import type { AgentUIMessage, AgentUITools } from '~/agents/ui_message';

export type AgentPart = AgentUIMessage['parts'][number];

export type AgentToolPart<N extends keyof AgentUITools> = Extract<AgentPart, { type: `tool-${N}` }>;

/** Parts shown as rows of the step trace (thinking and tool calls). */
export type StepPart =
  | Extract<AgentPart, { type: 'reasoning' }>
  | AgentToolPart<'sql_query'>
  | AgentToolPart<'web_search'>;

export type PartGroup =
  | { kind: 'steps'; key: string; parts: StepPart[] }
  | { kind: 'text'; key: string; text: string };

const isStep = (part: AgentPart): part is StepPart =>
  part.type === 'reasoning' || part.type === 'tool-sql_query' || part.type === 'tool-web_search';

/** Consecutive steps share one trace; text stands on its own. */
export function groupParts(parts: AgentPart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  parts.forEach((part, index) => {
    if (isStep(part)) {
      const last = groups.at(-1);
      if (last?.kind === 'steps') last.parts.push(part);
      else groups.push({ kind: 'steps', key: `steps-${index}`, parts: [part] });
    } else if (part.type === 'text' && part.text.trim()) {
      groups.push({ kind: 'text', key: `text-${index}`, text: part.text });
    }
  });
  return groups;
}

export function messageText(message: AgentUIMessage) {
  return message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
}
