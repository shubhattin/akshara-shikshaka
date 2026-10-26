import { z } from 'zod';
import type { AgentModelId } from './models';

export const AGENT_KINDS = ['general', 'gesture_creator'] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];
export const agent_kind_schema = z.enum(AGENT_KINDS);

export const AGENT_KIND_META = {
  general: {
    label: 'General',
    description:
      'Ask about gestures, lessons and practice. Reads the database and the web; never changes anything.',
    defaultModel: 'gpt-6-luna'
  },
  gesture_creator: {
    label: 'Gesture Creator',
    description:
      'Traces the strokes of an @-mentioned gesture over its glyph, checks its own work, and proposes it for you to apply.',
    defaultModel: 'claude-opus-5.5'
  }
} as const satisfies Record<
  AgentKind,
  { label: string; description: string; defaultModel: AgentModelId }
>;
