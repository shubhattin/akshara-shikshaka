import type { AgentUIMessage } from '~/agents/ui_message';

export type ChatGestureLink = {
  gesture_id: number;
  /** The newest message proposes strokes for it (this save is that proposal landing). */
  proposed: boolean;
};

type Part = AgentUIMessage['parts'][number];

function proposedGestureId(part: Part): number | null {
  return part.type === 'tool-propose_gesture' && part.state === 'output-available' && part.output.ok
    ? part.output.proposal.gesture_id
    : null;
}

/**
 * The gestures a conversation mentions (`@` refs, admin draft edits) or proposes, once each.
 * Only proposals in the newest message count as new: earlier ones were linked when they landed.
 */
export function chatGestureLinks(messages: readonly AgentUIMessage[]): ChatGestureLink[] {
  const links = new Map<number, boolean>();
  const add = (id: number, proposed: boolean) =>
    links.set(id, (links.get(id) ?? false) || proposed);
  messages.forEach((message, index) => {
    const newest = index === messages.length - 1;
    for (const part of message.parts) {
      if (part.type === 'data-gesture_ref') add(part.data.id, false);
      else if (part.type === 'data-draft_edit') add(part.data.gesture_id, false);
      else {
        const id = proposedGestureId(part);
        if (id !== null) add(id, newest);
      }
    }
  });
  return [...links].map(([gesture_id, proposed]) => ({ gesture_id, proposed }));
}
