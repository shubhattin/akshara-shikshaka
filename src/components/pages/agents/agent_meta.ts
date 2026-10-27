import type { LucideIcon } from 'lucide-react';
import { MessageSquareTextIcon, PenToolIcon } from 'lucide-react';
import type { AgentKind } from '~/agents/agent_kinds';

export const AGENT_ICONS = {
  general: MessageSquareTextIcon,
  gesture_creator: PenToolIcon
} as const satisfies Record<AgentKind, LucideIcon>;

/** Starter prompts on an empty chat. */
export const AGENT_SUGGESTIONS = {
  general: [
    'Show the Devanagari vowel gestures',
    'Which akṣaras have the lowest average practice accuracy this month?',
    'Which lessons have no example words or no audio yet?',
    'How many practice attempts per script in the last 7 days?'
  ],
  gesture_creator: [
    'Which gestures have no strokes yet?',
    'How do you trace a gesture? Walk me through it.'
  ]
} as const satisfies Record<AgentKind, readonly string[]>;
