import { describe, expect, test } from 'vitest';
import { nextToDrain, type QueuedMessage } from './use_message_queue';

const queue: QueuedMessage[] = [
  { id: 'a', message: { text: 'first', refs: [] } },
  { id: 'b', message: { text: 'second', refs: [] } }
];
const base = { wasIdle: false, idle: true, status: 'ready', paused: false, queue };

describe('nextToDrain', () => {
  test('sends the first queued message when a reply ends', () => {
    expect(nextToDrain(base)?.id).toBe('a');
  });

  test('waits while the agent is still working', () => {
    expect(nextToDrain({ ...base, idle: false })).toBeNull();
  });

  test('only fires on the busy → idle edge', () => {
    expect(nextToDrain({ ...base, wasIdle: true })).toBeNull();
  });

  test('holds the queue after Stop or a failed reply', () => {
    expect(nextToDrain({ ...base, paused: true })).toBeNull();
    expect(nextToDrain({ ...base, status: 'error' })).toBeNull();
  });

  test('nothing to send on an empty queue', () => {
    expect(nextToDrain({ ...base, queue: [] })).toBeNull();
  });
});
