import { getToolName, isToolUIPart } from 'ai';
import { isGestureCreatorToolName } from '~/agents/gesture_creator/schemas';
import { MAX_GESTURE_REFS, messageGestureRefs } from '~/agents/gesture_refs';
import type { AgentUIMessage, GestureRefData } from '~/agents/ui_message';

/**
 * Message plumbing for the chat route: merging tool results run in the browser, closing tool
 * calls that never ran, and keeping old harness images out of the model's context.
 */

type Part = AgentUIMessage['parts'][number];

/**
 * The browser ran the Gesture Creator tools of the stored assistant message and sent the message
 * back. Take only those results — everything else comes from the stored copy.
 */
export function mergeClientToolOutputs(stored: AgentUIMessage, incoming: AgentUIMessage): AgentUIMessage {
  const results = new Map<string, Part>();
  for (const part of incoming.parts) {
    if (isToolUIPart(part) && isGestureCreatorToolName(getToolName(part))) results.set(part.toolCallId, part);
  }
  return {
    ...stored,
    parts: stored.parts.map((part): Part => {
      if (!isToolUIPart(part) || part.state !== 'input-available') return part;
      if (!isGestureCreatorToolName(getToolName(part))) return part;
      const found = results.get(part.toolCallId);
      const result = found && isToolUIPart(found) ? found : undefined;
      if (result?.state === 'output-available') {
        // SAFETY: same tool call id and tool name as the stored part; only its result is taken.
        return { ...part, state: 'output-available', output: result.output } as Part;
      }
      if (result?.state === 'output-error') {
        // SAFETY: as above; the error text replaces the missing result.
        return { ...part, state: 'output-error', errorText: result.errorText } as Part;
      }
      return part;
    })
  };
}

const NOT_RUN = 'Not run: the admin cancelled it or left the chat before it ran.';

/**
 * A stopped or cancelled turn can leave tool calls without a result (or no content at all),
 * which the model API rejects. Mark them as failed, drop half-streamed calls and empty replies
 * before replaying history.
 */
export function closeDanglingToolCalls(messages: AgentUIMessage[]): AgentUIMessage[] {
  return messages.flatMap((message): AgentUIMessage[] => {
    if (message.role !== 'assistant') return [message];
    let changed = false;
    const parts = message.parts.flatMap((part): Part[] => {
      if (!isToolUIPart(part)) return [part];
      if (part.state === 'input-streaming') {
        changed = true;
        return [];
      }
      if (part.state === 'input-available') {
        changed = true;
        // SAFETY: same part with a terminal state; input and ids are kept.
        return [{ ...part, state: 'output-error', errorText: NOT_RUN } as Part];
      }
      return [part];
    });
    // A reply cancelled before it said anything is stored empty: leave it out of the history.
    if (!parts.some((part) => part.type !== 'step-start')) return [];
    return changed ? [{ ...message, parts }] : [message];
  });
}

/**
 * Harness images are large: keep them only for the latest inspect_glyph per gesture and the two
 * latest traces. The stored conversation keeps every image; only the model's copy is trimmed.
 */
export function pruneHarnessImages(messages: AgentUIMessage[]): AgentUIMessage[] {
  const keep = new Set<string>();
  const inspected = new Set<number>();
  let traces = 0;
  for (let m = messages.length - 1; m >= 0; m--) {
    const parts = messages[m]!.parts;
    for (let p = parts.length - 1; p >= 0; p--) {
      const part = parts[p]!;
      if (part.type === 'tool-inspect_glyph' && part.state === 'output-available') {
        if (!inspected.has(part.output.gesture_id)) {
          inspected.add(part.output.gesture_id);
          keep.add(part.toolCallId);
        }
      } else if (part.type === 'tool-trace_strokes' && part.state === 'output-available') {
        if (traces < 2) keep.add(part.toolCallId);
        traces++;
      }
    }
  }
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part): Part => {
      if (
        (part.type === 'tool-inspect_glyph' || part.type === 'tool-trace_strokes') &&
        part.state === 'output-available' &&
        !keep.has(part.toolCallId)
      ) {
        // SAFETY: same output with the images swapped for a marker.
        return { ...part, output: { ...part.output, images: {}, images_omitted: true } } as Part;
      }
      return part;
    })
  }));
}

/** The new message's mentions (capped), placed before its text by the route. */
export const newMessageRefs = (message: AgentUIMessage): GestureRefData[] =>
  messageGestureRefs(message).slice(0, MAX_GESTURE_REFS);

export const withResolvedRefs = (message: AgentUIMessage, resolved: GestureRefData[]): AgentUIMessage => ({
  ...message,
  parts: [
    ...resolved.map((data) => ({ type: 'data-gesture_ref' as const, data })),
    ...message.parts.filter((part) => part.type !== 'data-gesture_ref')
  ]
});
