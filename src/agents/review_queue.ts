import type { ReviewStatus } from './gesture_review';

export type QueueGesture = {
  id: number;
  strokes: number;
  review_status: ReviewStatus;
  attempts: number;
  completed: number;
};

export const QUEUE_BUCKETS = ['empty', 'struggle', 'needs_work', 'unreviewed'] as const;
export type QueueBucket = (typeof QUEUE_BUCKETS)[number];

export const QUEUE_BUCKET_META = {
  empty: { label: 'No strokes', hint: 'Nothing saved yet' },
  struggle: {
    label: 'Learners struggle',
    hint: 'Many recent practice attempts are not finished'
  },
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
  if (g.attempts >= MIN_STRUGGLE_ATTEMPTS && failureRate(g) >= STRUGGLE_RATE) return 'struggle';
  if (g.review_status === 'needs_work') return 'needs_work';
  if (g.review_status === 'unreviewed') return 'unreviewed';
  return null;
}

/**
 * The queue: gestures that need attention, grouped by bucket. Learners' struggles sort by
 * unfinished rate, the rest by how much practice they get (most-used first).
 */
export function buildReviewQueue<T extends QueueGesture>(gestures: T[]) {
  const buckets = new Map<QueueBucket, T[]>(QUEUE_BUCKETS.map((bucket) => [bucket, []]));
  for (const gesture of gestures) {
    const bucket = queueBucket(gesture);
    if (bucket) buckets.get(bucket)!.push(gesture);
  }
  for (const [bucket, items] of buckets) {
    items.sort((a, b) =>
      bucket === 'struggle'
        ? failureRate(b) - failureRate(a) || b.attempts - a.attempts
        : b.attempts - a.attempts || a.id - b.id
    );
  }
  return QUEUE_BUCKETS.map((bucket) => ({ bucket, gestures: buckets.get(bucket)! }));
}
