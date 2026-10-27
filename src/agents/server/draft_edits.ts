import { findTraceInMessages, type GestureHarness } from '~/agents/gesture_creator/harness';
import { draftEditContext } from '~/agents/gesture_creator/draft_edit_context';
import type { DraftEditData } from '~/agents/gesture_creator/schemas';
import type { AgentUIMessage } from '~/agents/ui_message';

/**
 * The admin's draft edit in a new message, filled in on the server: the edited plan is traced
 * against the glyph (so the agent can propose it like its own trace), the marked areas placed on
 * the skeleton, and the draft drawn with the marks for the model. What the client sent in the
 * server's fields is dropped.
 */

type Part = AgentUIMessage['parts'][number];

/** Only the admin's input of an edit; the server fills the rest. */
const clientFields = ({
  trace: _trace,
  mark_info: _markInfo,
  error: _error,
  context: _context,
  ...edit
}: DraftEditData): DraftEditData => edit;

const isDraftPart = (part: Part) =>
  part.type === 'data-draft_edit' || part.type === 'data-draft_image';

/** Chats without the Gesture Creator take no draft edits. */
export const withoutDraftParts = (message: AgentUIMessage): AgentUIMessage =>
  message.parts.some(isDraftPart)
    ? { ...message, parts: message.parts.filter((part) => !isDraftPart(part)) }
    : message;

export async function resolveDraftEdit(
  message: AgentUIMessage,
  history: readonly AgentUIMessage[],
  harness: GestureHarness,
  signal: AbortSignal
): Promise<AgentUIMessage> {
  // one edit per message; images come only from here
  const editPart = message.parts.find((part) => part.type === 'data-draft_edit');
  const rest = message.parts.filter((part) => !isDraftPart(part));
  if (!editPart || editPart.type !== 'data-draft_edit') {
    return rest.length === message.parts.length ? message : { ...message, parts: rest };
  }
  const edit = clientFields(editPart.data);
  const base = findTraceInMessages(history, edit.base_id);
  const parts: Part[] = [];
  let filled: DraftEditData;
  if (!base || base.gesture_id !== edit.gesture_id) {
    filled = { ...edit, error: 'The draft this edit is based on is not in this chat.' };
  } else {
    const traced = await harness.traceEdit(
      { gesture_id: edit.gesture_id, base, strokes: edit.strokes, marks: edit.marks },
      signal
    );
    if (traced.ok) {
      filled = { ...edit, trace: traced.trace, mark_info: traced.mark_info };
      parts.push({
        type: 'data-draft_image',
        data: { edit_id: edit.edit_id, url: traced.image }
      });
    } else {
      filled = { ...edit, error: traced.error };
    }
  }
  filled.context = draftEditContext(filled, base);
  return {
    ...message,
    parts: [{ type: 'data-draft_edit', data: filled }, ...parts, ...rest]
  };
}
