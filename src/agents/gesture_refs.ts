import type { DataUIPart, FilePart, TextPart } from 'ai';
import { z } from 'zod';
import {
  draft_edit_schema,
  draft_image_schema,
  saved_view_schema
} from './gesture_creator/schemas';
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
export const AGENT_DATA_SCHEMAS = {
  gesture_ref: gesture_ref_schema,
  draft_edit: draft_edit_schema,
  draft_image: draft_image_schema,
  saved_view: saved_view_schema
};

/** How a mention reads inside the message text, e.g. `@क#12`. */
export const mentionToken = (ref: Pick<GestureRefData, 'text' | 'id'>) => `@${ref.text}#${ref.id}`;

export function messageGestureRefs(message: AgentUIMessage): GestureRefData[] {
  return message.parts.flatMap((part) => (part.type === 'data-gesture_ref' ? [part.data] : []));
}

/**
 * `convertDataPart` for `convertToModelMessages`: a mention becomes its rendered gesture, a
 * draft edit its summary and image. Only what the server filled in reaches the model.
 */
export function dataPartToModel(part: DataUIPart<AgentDataTypes>): TextPart | FilePart | undefined {
  switch (part.type) {
    case 'data-gesture_ref':
    case 'data-draft_edit':
      return part.data.context ? { type: 'text', text: part.data.context } : undefined;
    case 'data-draft_image': {
      const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(part.data.url);
      if (!match) return { type: 'text', text: '(Image of this older draft edit omitted.)' };
      return { type: 'file', mediaType: match[1]!, data: match[2]! };
    }
    case 'data-saved_view':
      return part.data.context ? { type: 'text', text: part.data.context } : undefined;
  }
  return undefined;
}
