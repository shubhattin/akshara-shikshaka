import { describe, expect, it } from 'vitest';
import type { AgentUIMessage } from '~/agents/ui_message';
import { closeDanglingToolCalls, mergeClientToolOutputs, pruneHarnessImages } from './chat_messages';

type Part = AgentUIMessage['parts'][number];

// SAFETY: test fixtures shaped like stored UI parts; only the fields the helpers read are set.
const part = (value: Record<string, unknown>) => value as unknown as Part;

const assistant = (parts: Part[], id = 'a1'): AgentUIMessage => ({ id, role: 'assistant', parts });

const inspect = (toolCallId: string, gestureId: number, state = 'output-available') =>
  part({
    type: 'tool-inspect_glyph',
    toolCallId,
    state,
    input: { gesture_id: gestureId },
    output: state === 'output-available' ? { gesture_id: gestureId, images: { glyph: 'data:image/png;base64,AA' } } : undefined
  });

const trace = (toolCallId: string) =>
  part({
    type: 'tool-trace_strokes',
    toolCallId,
    state: 'output-available',
    input: { gesture_id: 1, strokes: [] },
    output: { gesture_id: 1, images: { strokes: 'data:image/png;base64,AA' } }
  });

describe('mergeClientToolOutputs', () => {
  it('takes only the browser results of pending harness calls', () => {
    const stored = assistant([
      part({ type: 'text', text: 'stored text' }),
      inspect('c1', 1, 'input-available'),
      part({ type: 'tool-sql_query', toolCallId: 'c2', state: 'input-available', input: { purpose: 'x', query: 'select 1' } })
    ]);
    const incoming = assistant([
      part({ type: 'text', text: 'tampered text' }),
      part({ type: 'tool-inspect_glyph', toolCallId: 'c1', state: 'output-available', input: {}, output: { gesture_id: 1 } }),
      part({ type: 'tool-sql_query', toolCallId: 'c2', state: 'output-available', input: {}, output: { rows: [] } })
    ]);
    const merged = mergeClientToolOutputs(stored, incoming);
    expect(merged.parts[0]).toMatchObject({ text: 'stored text' });
    expect(merged.parts[1]).toMatchObject({ state: 'output-available', output: { gesture_id: 1 }, input: { gesture_id: 1 } });
    // a server tool's result never comes from the client
    expect(merged.parts[2]).toMatchObject({ state: 'input-available' });
  });
});

describe('closeDanglingToolCalls', () => {
  it('fails calls that never ran and drops half-streamed ones', () => {
    const [closed] = closeDanglingToolCalls([
      assistant([inspect('c1', 1, 'input-available'), part({ type: 'tool-trace_strokes', toolCallId: 'c2', state: 'input-streaming' })])
    ]);
    expect(closed!.parts).toHaveLength(1);
    expect(closed!.parts[0]).toMatchObject({ state: 'output-error' });
  });

  it('drops replies cancelled before any content', () => {
    const user: AgentUIMessage = { id: 'u1', role: 'user', parts: [part({ type: 'text', text: 'hi' })] };
    expect(closeDanglingToolCalls([user, assistant([part({ type: 'step-start' })])])).toEqual([user]);
  });
});

describe('pruneHarnessImages', () => {
  it('keeps images of the latest inspect per gesture and the two latest traces', () => {
    const pruned = pruneHarnessImages([
      assistant([inspect('i-old', 1), trace('t1'), trace('t2')], 'a1'),
      assistant([inspect('i-new', 1), trace('t3')], 'a2')
    ]);
    const images = (id: string) => {
      const found = pruned.flatMap((m) => m.parts).find((p) => 'toolCallId' in p && p.toolCallId === id);
      // SAFETY: fixture parts all carry an output with images.
      return Object.keys((found as unknown as { output: { images: object } }).output.images).length;
    };
    expect(images('i-old')).toBe(0);
    expect(images('i-new')).toBe(1);
    expect(images('t1')).toBe(0);
    expect(images('t2')).toBe(1);
    expect(images('t3')).toBe(1);
  });
});
