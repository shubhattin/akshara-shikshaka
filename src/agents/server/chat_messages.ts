import { isToolUIPart, type ModelMessage } from 'ai';
import { MAX_GESTURE_REFS, messageGestureRefs } from '~/agents/gesture_refs';
import type { AgentUIMessage, GestureRefData } from '~/agents/ui_message';

/**
 * Message plumbing for the chat route: closing tool calls that never ran, and keeping old harness
 * images out of the model's context.
 */

type Part = AgentUIMessage['parts'][number];

const NOT_RUN = 'Not run: the reply was stopped before this tool finished.';

/**
 * A stopped turn can leave tool calls without a result (or no content at all),
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

/** Traces whose images the model always sees: the newest ones. */
const KEEP_TRACE_IMAGES = 2;
/**
 * Older trace images are dropped this many at a time, so the history the model reads only
 * changes every few traces: each change re-bills everything after it as uncached input.
 */
const PRUNE_BATCH = 4;

/** Ids of the image-bearing traces (the agent's traces and the admin's draft edits), in order. */
function traceImageIds(messages: AgentUIMessage[]): string[] {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (part.type === 'tool-trace_strokes' && part.state === 'output-available') {
        return [part.toolCallId];
      }
      return part.type === 'data-draft_image' ? [part.data.edit_id] : [];
    })
  );
}

/**
 * Harness images are large: the model sees them only for the latest inspect_glyph per gesture
 * and the newest traces — at least the last 2, and older ones until a batch of 4 can go at once,
 * so the cached history stays the same for several turns. The stored conversation keeps every
 * image; only the model's copy is trimmed.
 */
export function pruneHarnessImages(messages: AgentUIMessage[]): AgentUIMessage[] {
  const keep = new Set<string>();
  const inspected = new Set<number>();
  for (let m = messages.length - 1; m >= 0; m--) {
    const parts = messages[m]!.parts;
    for (let p = parts.length - 1; p >= 0; p--) {
      const part = parts[p]!;
      if (part.type === 'tool-inspect_glyph' && part.state === 'output-available') {
        if (!inspected.has(part.output.gesture_id)) {
          inspected.add(part.output.gesture_id);
          keep.add(part.toolCallId);
        }
      }
    }
  }
  const traces = traceImageIds(messages);
  const cutoff =
    Math.floor(Math.max(0, traces.length - KEEP_TRACE_IMAGES) / PRUNE_BATCH) * PRUNE_BATCH;
  traces.slice(cutoff).forEach((id) => keep.add(id));
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
      if (part.type === 'data-draft_image' && !keep.has(part.data.edit_id)) {
        return { ...part, data: { ...part.data, url: '' } };
      }
      return part;
    })
  }));
}

/** The new message's mentions (capped), placed before its text by the route. */
export const newMessageRefs = (message: AgentUIMessage): GestureRefData[] =>
  messageGestureRefs(message).slice(0, MAX_GESTURE_REFS);

export const withResolvedRefs = (
  message: AgentUIMessage,
  resolved: GestureRefData[]
): AgentUIMessage => ({
  ...message,
  parts: [
    ...resolved.map((data) => ({ type: 'data-gesture_ref' as const, data })),
    ...message.parts.filter((part) => part.type !== 'data-gesture_ref')
  ]
});

const EPHEMERAL = { openrouter: { cacheControl: { type: 'ephemeral' } } } as const;

/**
 * Mark the end of the conversation as a cache breakpoint (the system prompt has the other one).
 * The route marks the history; `prepareStep` marks each later step of the reply, so the tool
 * results it adds are cached too instead of being paid in full on every step. Providers that
 * cache automatically ignore it.
 *
 * A tool message's own mark is copied onto every result in it, and Anthropic takes at most 4
 * marks per request: so only its last result is marked.
 */
export function withHistoryCacheBreakpoint(messages: ModelMessage[]): ModelMessage[] {
  const last = messages.at(-1);
  if (!last) return messages;
  let marked: ModelMessage;
  if (last.role === 'tool') {
    let at = last.content.length - 1;
    while (at >= 0 && last.content[at]!.type !== 'tool-result') at--;
    const final = last.content[at];
    if (!final || final.type !== 'tool-result') return messages;
    const content = [...last.content];
    content[at] = {
      ...final,
      providerOptions: {
        ...final.providerOptions,
        openrouter: { ...final.providerOptions?.openrouter, ...EPHEMERAL.openrouter }
      }
    };
    marked = { ...last, content };
  } else {
    marked = {
      ...last,
      providerOptions: {
        ...last.providerOptions,
        openrouter: { ...last.providerOptions?.openrouter, ...EPHEMERAL.openrouter }
      }
    };
  }
  return [...messages.slice(0, -1), marked];
}
