import { Context, Effect, Layer } from 'effect';
import { waitUntil } from '@vercel/functions';

/**
 * Background work that preserves Vercel `waitUntil` semantics.
 * Callers should pass already-running Promises (typically from `runtime.runPromise`).
 * Failures are logged by the caller or swallowed inside the provided promise.
 */
export class BackgroundWork extends Context.Service<
  BackgroundWork,
  {
    readonly enqueue: (work: Promise<unknown>) => Effect.Effect<void>;
  }
>()('BackgroundWork') {
  static readonly Live = Layer.succeed(BackgroundWork)({
    enqueue: (work) =>
      Effect.sync(() => {
        waitUntil(
          work.catch((error) => {
            console.error('[background] work failed', error);
          })
        );
      })
  });

  /** Runs the promise inline for tests. */
  static readonly Test = Layer.succeed(BackgroundWork)({
    enqueue: (work) =>
      Effect.promise(() =>
        work.catch((error) => {
          console.error('[background] work failed', error);
        })
      )
  });
}

export const enqueueBackground = (work: Promise<unknown>) =>
  Effect.gen(function* () {
    const background = yield* BackgroundWork;
    yield* background.enqueue(work);
  });
