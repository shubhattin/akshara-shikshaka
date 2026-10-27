/** A gesture the `@` picker can mention (one row of `agents.list_mentionable_gestures`). */
export type MentionableGesture = {
  id: number;
  text: string;
  script_id: number;
  category_id: number | null;
  category: string | null;
  strokes: number;
  /** `text` romanized (Normal), for searching "ka" → क */
  roman: string;
};

/** `all`, or one script id. */
export type MentionScriptFilter = number | 'all';
/** `all`, `none` (uncategorised), or one category id. */
export type MentionCategoryFilter = number | 'all' | 'none';

/** Narrows a category filter to a concrete id by excluding the domain sentinels. */
export function isCategoryId(filter: MentionCategoryFilter): filter is number {
  return filter !== 'all' && filter !== 'none';
}

type IndexEntry = { gesture: MentionableGesture; roman: string; category: string };

export type MentionIndex = IndexEntry[];

/** Longest text after `@` still treated as a query. */
const MAX_QUERY_LENGTH = 32;

/** Lowercase, and drop Latin diacritics so "ā" and "a" meet. Indic marks are kept. */
export const foldSearchText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function buildMentionIndex(gestures: MentionableGesture[]): MentionIndex {
  return gestures.map((gesture) => ({
    gesture,
    roman: foldSearchText(gesture.roman),
    category: foldSearchText(gesture.category ?? '')
  }));
}

function rank(entry: IndexEntry, query: string): number {
  const { gesture } = entry;
  if (query === `#${gesture.id}` || query === String(gesture.id)) return 500;
  if (gesture.text === query) return 400;
  if (entry.roman === query) return 350;
  if (gesture.text.startsWith(query)) return 300;
  if (entry.roman.startsWith(query)) return 250;
  if (gesture.text.includes(query)) return 200;
  if (entry.roman.includes(query)) return 150;
  if (entry.category.includes(query)) return 50;
  return 0;
}

/**
 * Gestures matching `query` (akṣara as written, romanized, id or category), best first, within
 * the script and category filters; the list order (script, category, position) breaks ties.
 */
export function searchMentions(
  index: MentionIndex,
  options: {
    query: string;
    script: MentionScriptFilter;
    category: MentionCategoryFilter;
    /** Ids already mentioned in this message */
    exclude: Set<number>;
    limit: number;
  }
) {
  const query = foldSearchText(options.query.trim());
  const matches: { gesture: MentionableGesture; score: number; order: number }[] = [];
  index.forEach((entry, order) => {
    const { gesture } = entry;
    if (options.script !== 'all' && gesture.script_id !== options.script) return;
    if (options.category === 'none' && gesture.category_id !== null) return;
    if (isCategoryId(options.category) && gesture.category_id !== options.category) return;
    if (options.exclude.has(gesture.id)) return;
    const score = query ? rank(entry, query) : 1;
    if (score > 0) matches.push({ gesture, score, order });
  });
  matches.sort((a, b) => b.score - a.score || a.order - b.order);
  return {
    results: matches.slice(0, options.limit).map((match) => match.gesture),
    total: matches.length
  };
}

/**
 * The `@query` being typed at the caret, if any. `@` must start a word; the query holds no
 * whitespace (akṣaras and romanizations are single words).
 */
export function findMentionTrigger(
  text: string,
  caret: number
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('@');
  if (start === -1) return null;
  if (start > 0 && !/\s/.test(before[start - 1]!)) return null;
  const query = before.slice(start + 1);
  if (query.length > MAX_QUERY_LENGTH || /\s/.test(query)) return null;
  return { start, query };
}
