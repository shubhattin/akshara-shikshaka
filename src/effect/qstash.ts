import { Context, Effect, Layer, Redacted, Schema } from 'effect';
import { Client } from '@upstash/qstash';
import { AppConfig } from './config';
import { BadRequestError, ConfigError, QueueError } from './errors';

/** Routes QStash delivers to; all under `/api/agents/**` so they get the long function timeout. */
export type QstashPath = '/api/agents/batch/run' | '/api/agents/batch/failed';

/** Destination URL a message is published to — also the signed `sub` the receiver must match. */
export const qstashTargetUrl = (siteUrl: string, path: QstashPath) => `${siteUrl}${path}`;

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0));

export const batchItemPayloadSchema = Schema.Struct({ item_id: PositiveInt });
export type BatchItemPayload = typeof batchItemPayloadSchema.Type;

/**
 * What QStash posts to a failure callback once a message has used up its retries: the original
 * message's body (base64) and the last response from the destination.
 */
export const failureCallbackSchema = Schema.Struct({
  sourceBody: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Number),
  body: Schema.optional(Schema.String),
  sourceMessageId: Schema.optional(Schema.String)
});

/** Every message of one batch shares this key: the batch's parallelism and its cancel filter. */
export const batchFlowControlKey = (batchId: number) => `akshara-agent-batch-${batchId}`;

/** Label shown in the Upstash console logs, to filter one batch's deliveries. */
export const batchLabel = (batchId: number) => `akshara-batch-${batchId}`;

const tryQueue = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => QueueError.make({ operation, cause })
  }).pipe(Effect.annotateLogs({ category: 'qstash', operation }));

export class QStashPublisher extends Context.Service<
  QStashPublisher,
  {
    /** False outside production: batches then run in-process (QStash cannot reach localhost). */
    readonly enabled: boolean;
    /**
     * One message per batch item, delivered at most `parallelism` at a time, retried on 5xx and
     * reported to the failure callback once retries run out. Returns the QStash message id per
     * item (same order).
     */
    readonly publishBatchItems: (input: {
      batchId: number;
      items: { itemId: number; deduplicationId: string }[];
      parallelism: number;
      retries: number;
      timeoutSeconds: number;
    }) => Effect.Effect<string[], QueueError | ConfigError>;
    /** Drop a batch's messages not delivered yet (running ones finish or see the cancel). */
    readonly cancelBatch: (batchId: number) => Effect.Effect<number, QueueError>;
  }
>()('QStashPublisher') {
  static readonly Live = Layer.effect(QStashPublisher)(
    Effect.gen(function* () {
      const config = yield* AppConfig;
      // the account's region (QSTASH_URL) when set, the SDK's default otherwise
      const client = new Client({
        token: Redacted.value(config.qstashToken),
        baseUrl: config.qstashUrl
      });
      const enabled = config.isQstashEnabled;

      const siteUrl = () =>
        config.siteUrl
          ? Effect.succeed(config.siteUrl)
          : Effect.fail(
              ConfigError.make({
                message: 'VITE_BASE_URL is not set: QStash has no public URL to deliver to'
              })
            );

      return {
        enabled,
        publishBatchItems: ({ batchId, items, parallelism, retries, timeoutSeconds }) =>
          Effect.gen(function* () {
            if (items.length === 0) return [];
            const site = yield* siteUrl();
            const responses = yield* tryQueue('publish_batch_items', () =>
              client.batchJSON(
                items.map(({ itemId, deduplicationId }) => ({
                  url: qstashTargetUrl(site, '/api/agents/batch/run'),
                  body: { item_id: itemId } satisfies BatchItemPayload,
                  deduplicationId,
                  retries,
                  timeout: timeoutSeconds,
                  failureCallback: qstashTargetUrl(site, '/api/agents/batch/failed'),
                  flowControl: { key: batchFlowControlKey(batchId), parallelism },
                  label: batchLabel(batchId)
                }))
              )
            );
            console.log(`[qstash] published ${items.length} items of batch ${batchId}`);
            return responses.map((response) => response.messageId);
          }),
        cancelBatch: (batchId) =>
          tryQueue('cancel_batch', async () => {
            const { cancelled } = await client.messages.cancel({
              filter: { flowControlKey: batchFlowControlKey(batchId) }
            });
            return cancelled;
          })
      };
    })
  );
}

export const decodeQstashPayload = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  // SAFETY: this function is the QStash I/O boundary — its whole job is decoding the
  // untrusted wire payload with the caller-supplied schema, so `input` is inherently unknown.
  // oxlint-disable-next-line anti-slop/no-unknown-parameters
  input: unknown
): Effect.Effect<S['Type'], BadRequestError> =>
  Effect.try({
    try: () => Schema.decodeUnknownSync(schema)(input),
    catch: () => BadRequestError.make({ message: 'Invalid QStash payload' })
  });
