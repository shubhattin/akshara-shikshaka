import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';

/**
 * Reads a copy of the reply stream to the end (so the reply keeps generating when the tab goes)
 * and hands the in-progress assistant message to `save` after each finished step. A page opened
 * mid-reply polls the chat, so it sees the reply grow step by step instead of waiting for the end.
 *
 * Saves run one at a time. `settle()` stops further snapshots and resolves once the queued ones
 * are written, so the final save (in the stream's onFinish) can't be overwritten by a late one.
 */
export function trackReplyProgress<M extends UIMessage>(
  stream: ReadableStream<UIMessageChunk>,
  save: (message: M) => Promise<void>
) {
  let stepEnded = false;
  let settled = false;
  let queue = Promise.resolve();

  const marked = stream.pipeThrough(
    new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (chunk.type === 'finish-step') stepEnded = true;
        controller.enqueue(chunk);
      }
    })
  );

  const done = (async () => {
    for await (const message of readUIMessageStream<M>({ stream: marked })) {
      if (!stepEnded || settled) continue;
      stepEnded = false;
      const snapshot = structuredClone(message);
      queue = queue.then(() => save(snapshot)).catch(() => undefined);
    }
  })();

  return {
    /** Resolves when the copy has been read to the end. */
    done,
    settle() {
      settled = true;
      return queue;
    }
  };
}
