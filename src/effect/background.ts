import { Context, Effect, Layer } from 'effect';
import { waitUntil } from '@vercel/functions';
import { reportSwallowedFailure } from './posthog_error';

/**
 * Background work that preserves Vercel `waitUntil` semantics.
 * Pass a lazy thunk so work is not started until enqueue runs.
 */
export class BackgroundWork extends Context.Service<
  BackgroundWork,
  {
    // oxlint-disable-next-line anti-slop/no-unknown-returns -- background work is generic promise boundary; unknown models arbitrary async result handled via catch
    readonly enqueue: (work: () => Promise<unknown>) => Effect.Effect<void>;
  }
>()('BackgroundWork') {
  static readonly Live = Layer.succeed(BackgroundWork)({
    enqueue: (work) =>
      Effect.sync(() => {
        waitUntil(
          Promise.resolve()
            .then(work)
            .catch(async (cause: unknown) => {
              console.error('[background] work failed', cause);
              await reportSwallowedFailure(cause, 'background');
            })
        );
      })
  });

  /** Runs the work inline for tests. */
  static readonly Test = Layer.succeed(BackgroundWork)({
    enqueue: (work) =>
      Effect.promise(() =>
        Promise.resolve()
          .then(work)
          .catch(async (cause: unknown) => {
            console.error('[background] work failed', cause);
            await reportSwallowedFailure(cause, 'background');
          })
      )
  });
}

// oxlint-disable-next-line anti-slop/no-unknown-returns -- background work thunk is generic; unknown preserves arbitrary promise result before catch
export const enqueueBackground = (work: () => Promise<unknown>) =>
  Effect.gen(function* () {
    const background = yield* BackgroundWork;
    yield* background.enqueue(work);
  });
