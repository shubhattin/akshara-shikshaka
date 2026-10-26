import { describe, expect, it } from 'vitest';
import type { AgentUIMessage } from '~/agents/ui_message';
import {
  closeDanglingToolCalls,
  mergeClientToolOutputs,
  pruneHarnessImages
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
          existing_strokes: 0,
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

describe('mergeClientToolOutputs', () => {
  it('takes only the browser results of pending harness calls', () => {
    const stored = assistant([
      { type: 'text', text: 'stored text' },
      inspect('c1', 1, 'input-available'),
      {
        type: 'tool-sql_query',
        toolCallId: 'c2',
        state: 'input-available',
        input: { purpose: 'x', query: 'select 1' }
      }
    ]);
    const incoming = assistant([
      { type: 'text', text: 'tampered text' },
      {
        type: 'tool-inspect_glyph',
        toolCallId: 'c1',
        state: 'output-available',
        input: { gesture_id: 999 },
        output: {
          gesture_id: 1,
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
          existing_strokes: 0,
          images: {}
        }
      },
      {
        type: 'tool-sql_query',
        toolCallId: 'c2',
        state: 'output-available',
        input: { purpose: 'x', query: 'select 1' },
        output: { columns: ['a'], rows: [['1']], row_count: 1, truncated: false, duration_ms: 1 }
      }
    ]);
    const merged = mergeClientToolOutputs(stored, incoming);
    expect(merged.parts[0]).toMatchObject({ text: 'stored text' });
    expect(merged.parts[1]).toMatchObject({
      state: 'output-available',
      output: { gesture_id: 1 },
      input: { gesture_id: 1 }
    });
    // a server tool's result never comes from the client
    expect(merged.parts[2]).toMatchObject({ state: 'input-available' });
  });
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
  it('keeps images of the latest inspect per gesture and the two latest traces', () => {
    const pruned = pruneHarnessImages([
      assistant([inspect('i-old', 1), trace('t1'), trace('t2')], 'a1'),
      assistant([inspect('i-new', 1), trace('t3')], 'a2')
    ]);
    const images = (id: string) => {
      const found = pruned
        .flatMap((m) => m.parts)
        .find((p) => 'toolCallId' in p && p.toolCallId === id);
      if (found?.type === 'tool-inspect_glyph' && found.state === 'output-available')
        return Object.keys(found.output.images).length;
      if (found?.type === 'tool-trace_strokes' && found.state === 'output-available')
        return Object.keys(found.output.images).length;
      throw new Error(`missing images for ${id}`);
    };
    expect(images('i-old')).toBe(0);
    expect(images('i-new')).toBe(1);
    expect(images('t1')).toBe(0);
    expect(images('t2')).toBe(1);
    expect(images('t3')).toBe(1);
  });
});
