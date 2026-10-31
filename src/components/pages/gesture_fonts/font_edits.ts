import type { FontFamily } from '~/state/font_families';

/** A gesture's glyph settings the font tools change. */
export type FontSetting = { font_family: FontFamily; font_size: number };

export type FontRow = FontSetting & { id: number; strokes: number };

/** Pending settings by gesture id; only gestures that differ from what is saved. */
export type FontEdits = ReadonlyMap<number, FontSetting>;

export const FONT_SCOPES = ['all', 'empty', 'recorded', 'selected'] as const;
export type FontScope = (typeof FONT_SCOPES)[number];

export const FONT_SCOPE_META = {
  all: { label: 'All', hint: 'Every gesture listed' },
  empty: { label: 'Empty only', hint: 'Gestures without strokes (nothing to misalign)' },
  recorded: { label: 'Recorded only', hint: 'Gestures with strokes (check their alignment)' },
  selected: { label: 'Selected', hint: 'The ticked gestures' }
} as const satisfies Record<FontScope, { label: string; hint: string }>;

export type ReplaceRule = {
  /** Only gestures (currently) in this font; `any` for every font */
  from: FontFamily | 'any';
  to: FontFamily;
  /** New size; null keeps each gesture's size */
  size: number | null;
  scope: FontScope;
};

const same = (a: FontSetting, b: FontSetting) =>
  a.font_family === b.font_family && a.font_size === b.font_size;

/** The setting shown for a gesture: its pending edit, or what is saved. */
export const effectiveSetting = (row: FontRow, edits: FontEdits): FontSetting =>
  edits.get(row.id) ?? { font_family: row.font_family, font_size: row.font_size };

/** Set one gesture's pending setting; going back to the saved one drops the edit. */
export function setEdit(edits: FontEdits, row: FontRow, next: FontSetting): FontEdits {
  const out = new Map(edits);
  if (same(next, row)) out.delete(row.id);
  else out.set(row.id, next);
  return out;
}

/** Does a rule's scope take this gesture? */
function inScope(row: FontRow, scope: FontScope, selected: ReadonlySet<number>) {
  switch (scope) {
    case 'all':
      return true;
    case 'empty':
      return row.strokes === 0;
    case 'recorded':
      return row.strokes > 0;
    case 'selected':
      return selected.has(row.id);
  }
}

/** Gestures a replace rule would change (matching its scope and `from` font, not already there). */
export function ruleTargets(
  rows: readonly FontRow[],
  edits: FontEdits,
  rule: ReplaceRule,
  selected: ReadonlySet<number>
): FontRow[] {
  return rows.filter((row) => {
    const current = effectiveSetting(row, edits);
    if (!inScope(row, rule.scope, selected)) return false;
    if (rule.from !== 'any' && current.font_family !== rule.from) return false;
    return !same(current, { font_family: rule.to, font_size: rule.size ?? current.font_size });
  });
}

/** Apply a replace rule to every gesture it targets, as pending edits. */
export function applyRule(
  rows: readonly FontRow[],
  edits: FontEdits,
  rule: ReplaceRule,
  selected: ReadonlySet<number>
): FontEdits {
  let out: FontEdits = edits;
  for (const row of ruleTargets(rows, edits, rule, selected)) {
    const current = effectiveSetting(row, out);
    out = setEdit(out, row, { font_family: rule.to, font_size: rule.size ?? current.font_size });
  }
  return out;
}

/** How many gestures use each font (pending edits included), most used first. */
export function fontUsage(rows: readonly FontRow[], edits: FontEdits) {
  const counts = new Map<FontFamily, number>();
  for (const row of rows) {
    const font = effectiveSetting(row, edits).font_family;
    counts.set(font, (counts.get(font) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([font, count]) => ({ font, count }));
}

// ---------------------------------------------------------------- undo / redo

export type History = { past: FontEdits[]; present: FontEdits; future: FontEdits[] };

export type HistoryAction =
  | { type: 'set'; edits: FontEdits }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' };

const EMPTY: FontEdits = new Map();
export const initialHistory = (): History => ({ past: [], present: EMPTY, future: [] });

const sameEdits = (a: FontEdits, b: FontEdits) =>
  a.size === b.size &&
  [...a].every(([id, setting]) => {
    const other = b.get(id);
    return other !== undefined && same(setting, other);
  });

/** Every change is one undo step; a change that changes nothing is not recorded. */
export function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case 'set':
      if (sameEdits(state.present, action.edits)) return state;
      return { past: [...state.past, state.present], present: action.edits, future: [] };
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future]
      };
    }
    case 'redo': {
      const [next, ...future] = state.future;
      if (!next) return state;
      return { past: [...state.past, state.present], present: next, future };
    }
    case 'reset':
      return state.present.size === 0
        ? state
        : { past: [...state.past, state.present], present: EMPTY, future: [] };
  }
}
