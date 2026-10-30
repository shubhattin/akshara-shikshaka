import { describe, expect, it } from 'vitest';
import { buildReviewQueue, queueBucket, type QueueGesture } from './review_queue';

const g = (over: Partial<QueueGesture> & { id: number }): QueueGesture => ({
  strokes: 3,
  review_status: 'approved',
  attempts: 0,
  completed: 0,
  ...over
});

describe('queueBucket', () => {
  it('puts gestures without strokes first', () => {
    expect(queueBucket(g({ id: 1, strokes: 0, review_status: 'needs_work' }))).toBe('empty');
  });
  it('flags learner struggles only with enough attempts', () => {
    expect(queueBucket(g({ id: 1, attempts: 10, completed: 5 }))).toBe('struggle');
    expect(queueBucket(g({ id: 1, attempts: 3, completed: 0 }))).toBeNull();
  });
  it('lists review states', () => {
    expect(queueBucket(g({ id: 1, review_status: 'needs_work' }))).toBe('needs_work');
    expect(queueBucket(g({ id: 1, review_status: 'unreviewed' }))).toBe('unreviewed');
    expect(queueBucket(g({ id: 1 }))).toBeNull();
  });
});

describe('buildReviewQueue', () => {
  it('sorts struggles by unfinished rate', () => {
    const queue = buildReviewQueue([
      g({ id: 1, attempts: 10, completed: 6 }),
      g({ id: 2, attempts: 10, completed: 2 })
    ]);
    expect(queue.find((b) => b.bucket === 'struggle')!.gestures.map((x) => x.id)).toEqual([2, 1]);
  });
});
