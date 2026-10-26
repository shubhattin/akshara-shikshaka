import type { DataUIPart, TextPart } from 'ai';
import { z } from 'zod';
import type { AgentDataTypes, AgentUIMessage, GestureRefData } from './ui_message';

/** Gestures one message may mention with `@`; each adds its description to the prompt. */
export const MAX_GESTURE_REFS = 6;

export const gesture_ref_schema = z.object({
  id: z.int().positive(),
  text: z.string().min(1).max(40),
  script_id: z.int(),
  context: z.string().optional()
});

/** `dataSchemas` for `validateUIMessages`. */
export const AGENT_DATA_SCHEMAS = { gesture_ref: gesture_ref_schema };

/** How a mention reads inside the message text, e.g. `@क#12`. */
export const mentionToken = (ref: Pick<GestureRefData, 'text' | 'id'>) => `@${ref.text}#${ref.id}`;

export function messageGestureRefs(message: AgentUIMessage): GestureRefData[] {
  return message.parts.flatMap((part) => (part.type === 'data-gesture_ref' ? [part.data] : []));
}

/** `convertDataPart` for `convertToModelMessages`: a mention becomes its rendered gesture. */
export function gestureRefToModelText(part: DataUIPart<AgentDataTypes>): TextPart | undefined {
  if (part.type !== 'data-gesture_ref' || !part.data.context) return undefined;
  return { type: 'text', text: part.data.context };
}
