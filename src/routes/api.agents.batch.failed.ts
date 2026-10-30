import { createFileRoute } from '@tanstack/react-router';
import { Effect } from 'effect';
import { markItemUndeliverable } from '~/agents/server/batches';
import {
  batchItemPayloadSchema,
  decodeQstashPayload,
  failureCallbackSchema
} from '~/effect/qstash';
import { BadRequestError } from '~/effect/errors';
import { runQstashEffect } from '~/effect/run';
import { verifyQstashRequest } from '~/lib/qstash_verify';

const decodeBase64 = (value: string | undefined) => {
  if (!value) return '';
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return '';
  }
};

/**
 * QStash's failure callback: a batch item's delivery used up its retries (the run kept failing
 * or its function kept dying). The item is marked failed with the last response.
 */
export const Route = createFileRoute('/api/agents/batch/failed')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const verified = await verifyQstashRequest(request, '/api/agents/batch/failed');
        if (!verified.ok) return verified.response;
        return runQstashEffect(
          Effect.gen(function* () {
            const failure = yield* decodeQstashPayload(failureCallbackSchema, verified.body);
            // the original message's body: which item it was for
            const { item_id } = yield* Effect.try({
              try: () => JSON.parse(decodeBase64(failure.sourceBody)),
              catch: () => BadRequestError.make({ message: 'Unreadable source message' })
            }).pipe(
              Effect.flatMap((source) => decodeQstashPayload(batchItemPayloadSchema, source))
            );
            const last = decodeBase64(failure.body).slice(0, 300);
            yield* markItemUndeliverable(
              item_id,
              `Gave up after retries (last answer ${failure.status ?? '?'}${last ? `: ${last}` : ''})`
            );
            return `Item ${item_id} marked failed`;
          }),
          { onSuccess: (message) => new Response(message, { status: 200 }) }
        );
      }
    }
  }
});
