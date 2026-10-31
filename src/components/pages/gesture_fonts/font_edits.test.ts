import { describe, expect, it } from 'vitest';
import {
  applyRule,
  fontUsage,
  historyReducer,
  initialHistory,
  ruleTargets,
  setEdit,
  type FontRow
} from './font_edits';

const rows: FontRow[] = [
  { id: 1, font_family: 'Nirmala_UI', font_size: 15, strokes: 0 },
  { id: 2, font_family: 'Nirmala_UI', font_size: 15, strokes: 3 },
  { id: 3, font_family: 'Noto_Sans_Odia', font_size: 14, strokes: 0 }
];
const none = new Set<number>();

describe('applyRule', () => {
  it('replaces one font with another only where the gesture is empty', () => {
    const edits = applyRule(
      rows,
      new Map(),
      { from: 'Nirmala_UI', to: 'Noto_Serif_Odia', size: null, scope: 'empty' },
      none
    );
    expect([...edits]).toEqual([[1, { font_family: 'Noto_Serif_Odia', font_size: 15 }]]);
  });

  it('applies to any font and sets the size, skipping gestures already there', () => {
    const rule = { from: 'any', to: 'Noto_Sans_Odia', size: 14, scope: 'all' } as const;
    expect(ruleTargets(rows, new Map(), rule, none).map((r) => r.id)).toEqual([1, 2]);
  });

  it('applies to the selected gestures', () => {
    const edits = applyRule(
      rows,
      new Map(),
      { from: 'any', to: 'Noto_Serif_Odia', size: null, scope: 'selected' },
      new Set([3])
    );
    expect([...edits.keys()]).toEqual([3]);
  });
});

describe('setEdit', () => {
  it('drops an edit that goes back to the saved setting', () => {
    const edited = setEdit(new Map(), rows[0]!, { font_family: 'Noto_Sans_Odia', font_size: 15 });
    expect(edited.size).toBe(1);
    expect(setEdit(edited, rows[0]!, { font_family: 'Nirmala_UI', font_size: 15 }).size).toBe(0);
  });
});

describe('fontUsage', () => {
  it('counts fonts with pending edits, most used first', () => {
    const edits = new Map([[1, { font_family: 'Noto_Sans_Odia' as const, font_size: 15 }]]);
    expect(fontUsage(rows, edits)).toEqual([
      { font: 'Noto_Sans_Odia', count: 2 },
      { font: 'Nirmala_UI', count: 1 }
    ]);
  });
});

describe('historyReducer', () => {
  it('undoes and redoes whole steps, and skips no-op changes', () => {
    const a = new Map([[1, { font_family: 'Noto_Sans_Odia' as const, font_size: 15 }]]);
    let state = historyReducer(initialHistory(), { type: 'set', edits: a });
    expect(historyReducer(state, { type: 'set', edits: new Map(a) })).toBe(state);
    state = historyReducer(state, { type: 'reset' });
    expect(state.present.size).toBe(0);
    state = historyReducer(state, { type: 'undo' });
    expect(state.present).toBe(a);
    state = historyReducer(state, { type: 'redo' });
    expect(state.present.size).toBe(0);
    expect(state.future).toEqual([]);
  });
});
