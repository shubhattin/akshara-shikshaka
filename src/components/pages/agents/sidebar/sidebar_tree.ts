import { ACTIVE_ITEM_STATUSES, type BatchItemStatus } from '~/agents/batch';
import type { ReviewStatus } from '~/agents/gesture_review';

/** A gesture of the sidebar's Gestures tab, as `agents.sidebar_gestures` returns it. */
export type SidebarGesture = {
  id: number;
  text: string;
  text_key: string;
  script_id: number;
  review_status: ReviewStatus;
  revision: number;
  updated_at: Date | string;
  strokes: number;
  category_id: number | null;
  lesson_order: number | null;
  chats: number;
  latest_activity: Date | string;
  streaming: boolean;
  /** Batches it ran in, newest first */
  batches: {
    batch_id: number;
    status: BatchItemStatus;
    chat_id: string | null;
    batch_title: string;
    batch_created_at: Date | string;
  }[];
};

export type SidebarCategory = { id: number; name: string; order: number };

export const SIDEBAR_GROUP_MODES = ['category', 'batch', 'recent'] as const;
export type SidebarGroupMode = (typeof SIDEBAR_GROUP_MODES)[number];

export const SIDEBAR_GROUP_META = {
  category: { label: 'Category', hint: 'By script and lesson category, in lesson order' },
  batch: { label: 'Batch', hint: 'By the batch each gesture ran in, newest first' },
  recent: { label: 'Recent', hint: 'Most recently active first' }
} as const satisfies Record<SidebarGroupMode, { label: string; hint: string }>;

export const SIDEBAR_STATUSES = [
  'to_review',
  'unreviewed',
  'needs_work',
  'approved',
  'empty'
] as const;
export type SidebarStatus = (typeof SIDEBAR_STATUSES)[number];

export const SIDEBAR_STATUS_META = {
  to_review: { label: 'To review', hint: 'A batch proposal waits for review' },
  unreviewed: { label: 'Unreviewed', hint: 'Saved strokes nobody checked yet' },
  needs_work: { label: 'Needs work', hint: 'An admin flagged it' },
  approved: { label: 'Approved', hint: 'Checked and approved' },
  empty: { label: 'No strokes', hint: 'Nothing saved yet' }
} as const satisfies Record<SidebarStatus, { label: string; hint: string }>;

/** A batch proposal for this gesture waits for review. */
export const hasPendingProposal = (g: Pick<SidebarGesture, 'batches'>) =>
  g.batches.some((batch) => batch.status === 'proposed');

/** A batch run for this gesture still waits or runs. */
const ACTIVE = new Set<BatchItemStatus>(ACTIVE_ITEM_STATUSES);
export const hasActiveBatchRun = (g: Pick<SidebarGesture, 'batches'>) =>
  g.batches.some((batch) => ACTIVE.has(batch.status));

/** Does the gesture show under this status chip? */
export function matchesStatus(g: SidebarGesture, status: SidebarStatus): boolean {
  if (status === 'to_review') return hasPendingProposal(g);
  if (status === 'empty') return g.strokes === 0;
  return g.strokes > 0 && g.review_status === status;
}

/** One row: a gesture, and (grouped by batch) its item's state in that batch. */
export type SidebarEntry = { gesture: SidebarGesture; batchStatus: BatchItemStatus | null };

/** Is this row's proposal waiting? Under a batch, only that batch's own item counts. */
const entryToReview = (e: SidebarEntry) =>
  e.batchStatus !== null ? e.batchStatus === 'proposed' : hasPendingProposal(e.gesture);

/** Does the row show under any of these status chips (none selected: all)? */
function entryMatches(e: SidebarEntry, statuses: readonly SidebarStatus[]) {
  return (
    statuses.length === 0 ||
    statuses.some((s) => (s === 'to_review' ? entryToReview(e) : matchesStatus(e.gesture, s)))
  );
}

export type SidebarGroup = {
  key: string;
  label: string;
  /** A batch group links to its batch page */
  batchId?: number;
  entries: SidebarEntry[];
  /** Entries with a proposal waiting (counted once per gesture, nested groups included) */
  toReview: number;
  /** Nested groups (script → category when every script is shown) */
  children?: SidebarGroup[];
};

export type SidebarFilters = {
  mode: SidebarGroupMode;
  /** Script id, or every script */
  script: number | 'all';
  /** Gestures matching any of these show; none selected shows all */
  statuses: readonly SidebarStatus[];
  /** Lower-cased search text; empty matches all */
  needle?: string;
};

const time = (value: Date | string) => new Date(value).getTime();

/** Lesson order within a category; gestures without a lesson after, by text. */
function byLessonOrder(a: SidebarGesture, b: SidebarGesture) {
  const ao = a.lesson_order ?? Number.POSITIVE_INFINITY;
  const bo = b.lesson_order ?? Number.POSITIVE_INFINITY;
  return ao - bo || a.text.localeCompare(b.text) || a.id - b.id;
}

const entry = (gesture: SidebarGesture, batchStatus: BatchItemStatus | null = null) => ({
  gesture,
  batchStatus
});

function group(
  key: string,
  label: string,
  entries: SidebarEntry[],
  extra: Partial<SidebarGroup> = {}
): SidebarGroup {
  const pending = new Set(entries.filter(entryToReview).map((e) => e.gesture.id));
  return { key, label, entries, toReview: pending.size, ...extra };
}

/** Category groups in category order (Uncategorized last), each in lesson order. */
function categoryGroups(
  gestures: SidebarGesture[],
  categories: readonly SidebarCategory[],
  keyPrefix: string
): SidebarGroup[] {
  const known = new Set(categories.map((c) => c.id));
  const groups = categories
    .map((category) =>
      group(
        `${keyPrefix}cat:${category.id}`,
        category.name,
        gestures
          .filter((g) => g.category_id === category.id)
          .sort(byLessonOrder)
          .map((g) => entry(g))
      )
    )
    .filter((g) => g.entries.length > 0);
  const rest = gestures
    .filter((g) => g.category_id === null || !known.has(g.category_id))
    .sort(byLessonOrder);
  if (rest.length > 0) {
    groups.push(
      group(
        `${keyPrefix}cat:none`,
        'Uncategorized',
        rest.map((g) => entry(g))
      )
    );
  }
  return groups;
}

/** Position of a gesture's category, for ordering gestures across categories. */
function categoryRank(categories: readonly SidebarCategory[]) {
  const rank = new Map(categories.map((c, index) => [c.id, index]));
  return (g: SidebarGesture) =>
    g.category_id === null ? categories.length : (rank.get(g.category_id) ?? categories.length);
}

function batchGroups(
  gestures: SidebarGesture[],
  categories: readonly SidebarCategory[],
  statuses: readonly SidebarStatus[]
): SidebarGroup[] {
  const rank = categoryRank(categories);
  const order = (a: SidebarEntry, b: SidebarEntry) =>
    a.gesture.script_id - b.gesture.script_id ||
    rank(a.gesture) - rank(b.gesture) ||
    byLessonOrder(a.gesture, b.gesture);
  const batches = new Map<number, { title: string; entries: SidebarEntry[] }>();
  const loose: SidebarEntry[] = [];
  for (const gesture of gestures) {
    if (gesture.batches.length === 0) loose.push(entry(gesture));
    for (const item of gesture.batches) {
      // "To review" lists a gesture only under the batch whose proposal waits
      if (!entryMatches(entry(gesture, item.status), statuses)) continue;
      let batch = batches.get(item.batch_id);
      if (!batch) batches.set(item.batch_id, (batch = { title: item.batch_title, entries: [] }));
      batch.entries.push(entry(gesture, item.status));
    }
  }
  const groups = [...batches]
    .sort(([a], [b]) => b - a)
    .map(([id, batch]) =>
      group(
        `batch:${id}`,
        batch.title ? `#${id} ${batch.title}` : `Batch #${id}`,
        batch.entries.sort(order),
        { batchId: id }
      )
    );
  if (loose.length > 0) groups.push(group('batch:none', 'Not in a batch', loose.sort(order)));
  return groups;
}

/**
 * The Gestures tab as groups: by script and category (lesson order, so rows stay put), by
 * batch, or one recency-ordered list. `scriptName` labels script groups.
 */
export function buildSidebarTree(
  all: readonly SidebarGesture[],
  categories: readonly SidebarCategory[],
  filters: SidebarFilters,
  scriptName: (id: number) => string
): SidebarGroup[] {
  const gestures = all.filter(
    (g) =>
      (filters.script === 'all' || g.script_id === filters.script) &&
      (filters.statuses.length === 0 || filters.statuses.some((s) => matchesStatus(g, s))) &&
      matchesSidebarSearch(g, filters.needle ?? '', scriptName(g.script_id))
  );
  if (filters.mode === 'recent') {
    const entries = [...gestures]
      .sort((a, b) => time(b.latest_activity) - time(a.latest_activity) || b.id - a.id)
      .map((g) => entry(g));
    return entries.length > 0 ? [group('recent', 'Recent', entries)] : [];
  }
  if (filters.mode === 'batch') return batchGroups(gestures, categories, filters.statuses);
  if (filters.script !== 'all') return categoryGroups(gestures, categories, '');
  const scripts = [...new Set(gestures.map((g) => g.script_id))].sort((a, b) => a - b);
  return scripts.map((scriptId) => {
    const inScript = gestures.filter((g) => g.script_id === scriptId);
    const children = categoryGroups(inScript, categories, `script:${scriptId}:`);
    return group(
      `script:${scriptId}`,
      scriptName(scriptId),
      children.flatMap((c) => c.entries),
      { children }
    );
  });
}

/** Counts per status chip, among gestures of the chosen script. */
export function statusCounts(all: readonly SidebarGesture[], script: number | 'all') {
  const inScript = all.filter((g) => script === 'all' || g.script_id === script);
  const count = (status: SidebarStatus) => inScript.filter((g) => matchesStatus(g, status)).length;
  return {
    to_review: count('to_review'),
    unreviewed: count('unreviewed'),
    needs_work: count('needs_work'),
    approved: count('approved'),
    empty: count('empty')
  } satisfies Record<SidebarStatus, number>;
}

/** Does a search match this gesture (its text, key, script or batch titles)? */
export function matchesSidebarSearch(g: SidebarGesture, needle: string, scriptName: string) {
  if (!needle) return true;
  return [g.text, g.text_key, scriptName, `#${g.id}`, ...g.batches.map((b) => b.batch_title)]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}
