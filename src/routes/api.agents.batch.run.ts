import { createFileRoute } from '@tanstack/react-router';
import { Effect } from 'effect';
import { runBatchItem } from '~/agents/server/batches';
import { batchItemPayloadSchema, decodeQstashPayload } from '~/effect/qstash';
import { runQstashEffect } from '~/effect/run';
import { verifyQstashRequest } from '~/lib/qstash_verify';

/**
 * QStash delivers one batch item here and waits for the run to finish (up to the function's
 * 800 s), so a crash or timeout counts as a failed delivery and is retried. A bad payload or a
 * missing item answers 489 non-retryable (see runQstashEffect).
 */
export const Route = createFileRoute('/api/agents/batch/run')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const verified = await verifyQstashRequest(request, '/api/agents/batch/run');
        if (!verified.ok) return verified.response;
        const retried = Number(request.headers.get('upstash-retried') ?? '0');
        return runQstashEffect(
          Effect.gen(function* () {
            const { item_id } = yield* decodeQstashPayload(batchItemPayloadSchema, verified.body);
            const result = yield* runBatchItem(item_id, true);
            return `Item ${item_id}: ${result.status} (delivery ${retried + 1})`;
          }),
          { onSuccess: (message) => new Response(message, { status: 200 }) }
        );
      }
    }
  }
});
