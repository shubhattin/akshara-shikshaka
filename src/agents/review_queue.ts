import type { ReviewStatus } from './gesture_review';

export type QueueGesture = {
  id: number;
  strokes: number;
  review_status: ReviewStatus;
  attempts: number;
  completed: number;
};

export const QUEUE_BUCKETS = ['empty', 'needs_work', 'unreviewed'] as const;
export type QueueBucket = (typeof QUEUE_BUCKETS)[number];

export const QUEUE_BUCKET_META = {
  empty: { label: 'No strokes', hint: 'Nothing saved yet' },
  needs_work: { label: 'Needs work', hint: 'An admin flagged it' },
  unreviewed: { label: 'Unreviewed', hint: 'Applied or restored; nobody checked it yet' }
} as const satisfies Record<QueueBucket, { label: string; hint: string }>;

/** Attempts needed before an unfinished rate counts. */
export const MIN_STRUGGLE_ATTEMPTS = 8;
/** Share of unfinished attempts that marks a gesture as hard for learners. */
export const STRUGGLE_RATE = 0.35;

export const failureRate = (g: Pick<QueueGesture, 'attempts' | 'completed'>) =>
  g.attempts === 0 ? 0 : 1 - g.completed / g.attempts;

/** The one bucket a gesture is listed under (most urgent first), or null when it is fine. */
export function queueBucket(g: QueueGesture): QueueBucket | null {
  if (g.strokes === 0) return 'empty';
  if (g.review_status === 'needs_work') return 'needs_work';
  if (g.review_status === 'unreviewed') return 'unreviewed';
  return null;
}

/** The queue: gestures that need attention, grouped by bucket, most-practised first. */
export function buildReviewQueue<T extends QueueGesture>(gestures: T[]) {
  const buckets = new Map<QueueBucket, T[]>(QUEUE_BUCKETS.map((bucket) => [bucket, []]));
  for (const gesture of gestures) {
    const bucket = queueBucket(gesture);
    if (bucket) buckets.get(bucket)!.push(gesture);
  }
  for (const items of buckets.values()) {
    items.sort((a, b) => b.attempts - a.attempts || a.id - b.id);
  }
  return QUEUE_BUCKETS.map((bucket) => ({ bucket, gestures: buckets.get(bucket)! }));
}

/** Tabs of the queue page: every gesture, then the buckets. */
export const QUEUE_TABS = ['all', ...QUEUE_BUCKETS] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

export const QUEUE_TAB_META = {
  all: { label: 'All', hint: 'Every gesture, with what needs attention marked on each' },
  ...QUEUE_BUCKET_META
} as const satisfies Record<QueueTab, { label: string; hint: string }>;

/** Is this gesture hard for learners (enough recent attempts, many unfinished)? */
export const isStruggling = (g: Pick<QueueGesture, 'attempts' | 'completed'>) =>
  g.attempts >= MIN_STRUGGLE_ATTEMPTS && failureRate(g) >= STRUGGLE_RATE;

export const GESTURE_FLAGS = ['empty', 'struggle', 'needs_work', 'unreviewed', 'approved'] as const;
export type GestureFlag = (typeof GESTURE_FLAGS)[number];

/**
 * Every state worth marking on a gesture's row, most urgent first (its bucket lists only the
 * first). Review states mean nothing without strokes.
 */
export function gestureFlags(g: QueueGesture): GestureFlag[] {
  if (g.strokes === 0) return isStruggling(g) ? ['empty', 'struggle'] : ['empty'];
  const flags: GestureFlag[] = [];
  if (isStruggling(g)) flags.push('struggle');
  flags.push(g.review_status);
  return flags;
}

/** `all`, one lesson category's id, or `none` for gestures in no category. */
export type CategoryFilter = 'all' | 'none' | number;

export const matchesCategory = (categoryId: number | null, filter: CategoryFilter) =>
  filter === 'all' || (filter === 'none' ? categoryId === null : categoryId === filter);
