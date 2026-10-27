import { useEffect, useRef, useState } from 'react';
import type { ComposerMessage } from './ChatComposer';

export type QueuedMessage = { id: string; message: ComposerMessage };

/** First queued message to send when the agent goes idle, if the queue may drain. */
export function nextToDrain(args: {
  wasIdle: boolean;
  idle: boolean;
  status: string;
  paused: boolean;
  queue: readonly QueuedMessage[];
}): QueuedMessage | null {
  // only on the busy → idle edge, so a paused queue doesn't fire on its own later
  if (args.wasIdle || !args.idle || args.status !== 'ready' || args.paused) return null;
  return args.queue[0] ?? null;
}

/**
 * Messages sent while the agent replies wait here and go out one by one as each reply ends.
 * Stop / Cancel or a failed reply pause the queue; the next message the admin sends resumes it.
 * Lives with the chat view (one per chat), never persisted.
 */
export function useMessageQueue({
  idle,
  status,
  send
}: {
  idle: boolean;
  status: string;
  send: (message: ComposerMessage) => void;
}) {
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const [paused, setPaused] = useState(false);
  const wasIdle = useRef(idle);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  useEffect(() => {
    const next = nextToDrain({ wasIdle: wasIdle.current, idle, status, paused, queue });
    wasIdle.current = idle;
    if (!next) return;
    setQueue((prev) => prev.filter((item) => item.id !== next.id));
    sendRef.current(next.message);
  }, [idle, status, paused, queue]);

  const take = (id: string) => {
    const item = queue.find((entry) => entry.id === id);
    setQueue((prev) => prev.filter((entry) => entry.id !== id));
    return item?.message ?? null;
  };

  return {
    queue,
    paused,
    enqueue: (message: ComposerMessage) =>
      setQueue((prev) => [...prev, { id: crypto.randomUUID(), message }]),
    /** Remove an item, returning its message (Edit / Send now). */
    take,
    remove: (id: string) => void take(id),
    /** The admin stopped the reply: hold the queue until they send again. */
    pause: () => setPaused(true),
    resume: () => setPaused(false)
  };
}
