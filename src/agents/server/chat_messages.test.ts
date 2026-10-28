import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import type { AgentUIMessage } from '~/agents/ui_message';
import {
  closeDanglingToolCalls,
  pruneHarnessImages,
  withHistoryCacheBreakpoint
} from './chat_messages';

type Part = AgentUIMessage['parts'][number];

const assistant = (parts: Part[], id = 'a1'): AgentUIMessage => ({ id, role: 'assistant', parts });

const inspect = (
  toolCallId: string,
  gestureId: number,
  state: 'input-available' | 'output-available' = 'output-available'
): Part =>
  state === 'input-available'
    ? {
        type: 'tool-inspect_glyph',
        toolCallId,
        state: 'input-available',
        input: { gesture_id: gestureId }
      }
    : {
        type: 'tool-inspect_glyph',
        toolCallId,
        state: 'output-available',
        input: { gesture_id: gestureId },
        output: {
          gesture_id: gestureId,
          text: 'a',
          script: 'Latn',
          font_family: 'sans',
          font_size: 16,
          text_center_offset: [0, 0],
          glyph_box: [0, 0, 10, 10],
          stroke_width: 2,
          nodes: [],
          edges: [],
          dots: [],
          images: { glyph: 'data:image/png;base64,AA' }
        }
      };

const trace = (toolCallId: string): Part => ({
  type: 'tool-trace_strokes',
  toolCallId,
  state: 'output-available',
  input: { gesture_id: 1, strokes: [] },
  output: {
    gesture_id: 1,
    glyph: { font_family: 'sans', font_size: 16, text_center_offset: [0, 0] },
    ok: true,
    strokes: [],
    coverage: 1,
    uncovered: [],
    retraced: 0,
    missed_dots: [],
    issues: [],
    images: { strokes: 'data:image/png;base64,AA' }
  }
});

describe('closeDanglingToolCalls', () => {
  it('fails calls that never ran and drops half-streamed ones', () => {
    const [closed] = closeDanglingToolCalls([
      assistant([
        inspect('c1', 1, 'input-available'),
        { type: 'tool-trace_strokes', toolCallId: 'c2', state: 'input-streaming' }
      ])
    ]);
    expect(closed!.parts).toHaveLength(1);
    expect(closed!.parts[0]).toMatchObject({ state: 'output-error' });
  });

  it('drops replies cancelled before any content', () => {
    const user: AgentUIMessage = {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text: 'hi' }]
    };
    expect(closeDanglingToolCalls([user, assistant([{ type: 'step-start' }])])).toEqual([user]);
  });
});

describe('pruneHarnessImages', () => {
  const imagesOf = (pruned: AgentUIMessage[], id: string) => {
    const found = pruned
      .flatMap((m) => m.parts)
      .find((p) => 'toolCallId' in p && p.toolCallId === id);
    if (found?.type === 'tool-inspect_glyph' && found.state === 'output-available')
      return Object.keys(found.output.images).length;
    if (found?.type === 'tool-trace_strokes' && found.state === 'output-available')
      return Object.keys(found.output.images).length;
    throw new Error(`missing images for ${id}`);
  };

  it('keeps images of the latest inspect per gesture and of recent traces', () => {
    const pruned = pruneHarnessImages([
      assistant([inspect('i-old', 1), trace('t1'), trace('t2')], 'a1'),
      assistant([inspect('i-new', 1), trace('t3')], 'a2')
    ]);
    expect(imagesOf(pruned, 'i-old')).toBe(0);
    expect(imagesOf(pruned, 'i-new')).toBe(1);
    // fewer than a batch past the newest two: nothing dropped yet
    expect(imagesOf(pruned, 't1')).toBe(1);
    expect(imagesOf(pruned, 't3')).toBe(1);
  });

  it('drops old trace images in batches, so earlier history stays the same for a while', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
    const kept = (n: number) => {
      const pruned = pruneHarnessImages([assistant(ids(n).map((id) => trace(id)))]);
      return ids(n).filter((id) => imagesOf(pruned, id) > 0);
    };
    expect(kept(5)).toEqual(ids(5));
    // the 6th trace drops the first four at once…
    expect(kept(6)).toEqual(['t5', 't6']);
    // …and the next three traces leave that cut where it is
    expect(kept(9)).toEqual(['t5', 't6', 't7', 't8', 't9']);
    expect(kept(10)).toEqual(['t9', 't10']);
  });
});

describe('withHistoryCacheBreakpoint', () => {
  const mark = { openrouter: { cacheControl: { type: 'ephemeral' } } };

  it('marks the last message', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' }
    ];
    const marked = withHistoryCacheBreakpoint(messages);
    expect(marked[0]!.providerOptions).toBeUndefined();
    expect(marked[1]!.providerOptions).toEqual(mark);
  });

  it('marks only the last result of a tool message', () => {
    const result = (id: string) => ({
      type: 'tool-result' as const,
      toolCallId: id,
      toolName: 'trace_strokes',
      output: { type: 'text' as const, value: 'ok' }
    });
    const marked = withHistoryCacheBreakpoint([
      { role: 'tool', content: [result('a'), result('b')] }
    ]);
    const tool = marked[0]!;
    if (tool.role !== 'tool') throw new Error('expected a tool message');
    expect(tool.providerOptions).toBeUndefined();
    expect(tool.content[0]!.type === 'tool-result' && tool.content[0]!.providerOptions).toBe(
      undefined
    );
    expect(tool.content[1]!.type === 'tool-result' && tool.content[1]!.providerOptions).toEqual(
      mark
    );
  });
});
