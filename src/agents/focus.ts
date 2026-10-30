import { mentionToken } from './gesture_refs';
import type { AgentUIMessage, GestureRefData } from './ui_message';

/**
 * Focused chats: a Gesture Creator chat bound to one gesture of one script. The server keeps it
 * there — its mention rides with the first message, other gestures cannot be mentioned, and the
 * tools refuse any other gesture.
 */

export type FocusGesture = {
  id: number;
  text: string;
  script_id: number;
  agent_notes: string;
};

export type FocusSibling = {
  id: number;
  text: string;
  script_id: number;
  strokes: number;
};

export type FocusContext = {
  gesture: FocusGesture;
  /** Its script's name, e.g. "Devanagari" */
  script: string;
  siblings: (FocusSibling & { script: string })[];
};

export const FOCUS_TAG = 'focused_gesture';

/** The instruction section of a focused chat (its gesture, notes and sibling scripts). */
export function focusInstructions({ gesture, script, siblings }: FocusContext): string {
  const lines = [
    `<${FOCUS_TAG} id="${gesture.id}" mention="${mentionToken(gesture)}">`,
    `This chat is focused on one gesture: ${gesture.text} in ${script} (#${gesture.id}). Work on it alone: inspect, trace and propose only this gesture. The admin cannot mention other gestures here, and the tools refuse them.`
  ];
  const notes = gesture.agent_notes.trim();
  lines.push(
    notes
      ? `<gesture_notes>\n${notes}\n</gesture_notes>`
      : 'No notes are kept for this gesture yet.'
  );
  if (siblings.length > 0) {
    lines.push(
      'The same akṣara in other scripts (the admin can show you how one is written):',
      ...siblings.map(
        (s) =>
          `- ${s.text} in ${s.script} (#${s.id}): ${s.strokes > 0 ? `${s.strokes} saved strokes` : 'no strokes yet'}`
      )
    );
  }
  lines.push(`</${FOCUS_TAG}>`);
  return lines.join('\n');
}

const hasRefTo = (messages: readonly AgentUIMessage[], id: number) =>
  messages.some((message) =>
    message.parts.some((part) => part.type === 'data-gesture_ref' && part.data.id === id)
  );

/**
 * The mentions a new message of a focused chat carries: the focus gesture's (added to the
 * chat's first message), never another one.
 */
export function focusedRefs(
  refs: GestureRefData[],
  earlier: readonly AgentUIMessage[],
  focus: Pick<FocusGesture, 'id' | 'text' | 'script_id'>
): { ok: true; refs: GestureRefData[] } | { ok: false; error: string } {
  const other = refs.find((ref) => ref.id !== focus.id);
  if (other) {
    return {
      ok: false,
      error: `This chat works only on ${focus.text} (#${focus.id}); start a free chat to work on ${other.text}.`
    };
  }
  if (refs.length > 0 || hasRefTo(earlier, focus.id)) return { ok: true, refs };
  return { ok: true, refs: [{ id: focus.id, text: focus.text, script_id: focus.script_id }] };
}

/** May a focused chat show the agent this gesture's saved strokes, and for what? */
export function savedViewAllowed(
  view: { gesture_id: number; purpose: 'critique' | 'sibling' },
  focus: { id: number },
  siblings: readonly { id: number }[]
): string | null {
  if (view.purpose === 'critique') {
    return view.gesture_id === focus.id ? null : 'Only the focused gesture can be critiqued here.';
  }
  return siblings.some((s) => s.id === view.gesture_id)
    ? null
    : 'Only the same akṣara in another script can be shown as a sibling.';
}
