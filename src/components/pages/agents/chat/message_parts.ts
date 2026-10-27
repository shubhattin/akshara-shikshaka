import type { AgentUIMessage, AgentUITools } from '~/agents/ui_message';

export type AgentPart = AgentUIMessage['parts'][number];

export type AgentToolPart<N extends keyof AgentUITools> = Extract<AgentPart, { type: `tool-${N}` }>;

/** Parts shown as rows of the step trace (thinking and tool calls). */
export type StepPart =
  | Extract<AgentPart, { type: 'reasoning' }>
  | AgentToolPart<'sql_query'>
  | AgentToolPart<'web_search'>
  | AgentToolPart<'inspect_glyph'>
  | AgentToolPart<'trace_strokes'>;

export type PartGroup =
  | { kind: 'steps'; key: string; parts: StepPart[] }
  | { kind: 'text'; key: string; text: string }
  | { kind: 'proposal'; key: string; part: AgentToolPart<'propose_gesture'> };

const STEP_TYPES = new Set<string>([
  'reasoning',
  'tool-sql_query',
  'tool-web_search',
  'tool-inspect_glyph',
  'tool-trace_strokes'
]);

const isStep = (part: AgentPart): part is StepPart => STEP_TYPES.has(part.type);

/** Consecutive steps share one trace; text and proposals stand on their own. */
export function groupParts(parts: AgentPart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  parts.forEach((part, index) => {
    if (isStep(part)) {
      const last = groups.at(-1);
      if (last?.kind === 'steps') last.parts.push(part);
      else groups.push({ kind: 'steps', key: `steps-${index}`, parts: [part] });
    } else if (part.type === 'tool-propose_gesture') {
      groups.push({ kind: 'proposal', key: `proposal-${index}`, part });
    } else if (part.type === 'text' && part.text.trim()) {
      groups.push({ kind: 'text', key: `text-${index}`, text: part.text });
    }
  });
  return groups;
}

export function messageText(message: AgentUIMessage) {
  return message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('\n');
}
