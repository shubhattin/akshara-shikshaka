import { Effect } from 'effect';
import { and, asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  agent_batch_items,
  agent_batches,
  agent_chats,
  gesture_text_key_lesson_category_join,
  lesson_categories,
  text_gestures
} from '~/db/schema';
import { dbRunHttp } from '~/effect/database';
import {
  AiProviderError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  QueueError,
  type KnownError
} from '~/effect/errors';
import { enqueueBackground } from '~/effect/background';
import { QStashPublisher } from '~/effect/qstash';
import { resolveAuthUserNames } from '~/lib/auth_users.server';
import { DEFAULT_GESTURE_CATEGORY_LANG_ID, get_script_from_id } from '~/state/lang_list';
import {
  AGENT_FUNCTION_MAX_SECONDS,
  BATCH_RETRIES,
  STALE_RUN_MS,
  type BatchItemStatus,
  type create_batch_input_schema
} from '~/agents/batch';
import { agent_model_id_schema } from '~/agents/models';
import { proposed_gesture_schema, type ProposedGesture } from '~/agents/gesture_creator/schemas';
import type { AgentUIMessage } from '~/agents/ui_message';
import { appRuntime } from '~/effect/runtime';
import { createAgentChat, liveStreaming, loadAgentMessages, requestChatStop } from './chat_store';
import { getGestureForAgent, saveProposal } from './gestures';
import { listSiblingGestures, setGestureReview } from './gesture_review';
import { startAgentTurn } from './run_turn';
import { savedStrokeCount } from './stroke_count';

type Batch = typeof agent_batches.$inferSelect;
type BatchItem = typeof agent_batch_items.$inferSelect;

const batchMissing = () =>
  NotFoundError.make({ resource: 'agent_batch', message: 'Batch not found' });
const itemMissing = () =>
  NotFoundError.make({ resource: 'agent_batch_item', message: 'Batch item not found' });

const findBatch = Effect.fn('batches.find')(function* (batchId: number) {
  const [batch] = yield* dbRunHttp('batches.find', (client) =>
    client.select().from(agent_batches).where(eq(agent_batches.id, batchId)).limit(1)
  );
  if (!batch) return yield* Effect.fail(batchMissing());
  return batch;
});

const findItem = Effect.fn('batches.find_item')(function* (itemId: number) {
  const [item] = yield* dbRunHttp('batches.find_item', (client) =>
    client.select().from(agent_batch_items).where(eq(agent_batch_items.id, itemId)).limit(1)
  );
  if (!item) return yield* Effect.fail(itemMissing());
  return item;
});

const updateItem = (itemId: number, set: Partial<typeof agent_batch_items.$inferInsert>) =>
  dbRunHttp('batches.update_item', (client) =>
    client.update(agent_batch_items).set(set).where(eq(agent_batch_items.id, itemId)).returning()
  );

/**
 * USD the batch has cost so far, counting each other run in flight at the mean cost of the
 * finished ones (a run's cost is only known once it ends). Runs that start together can still
 * overshoot the budget by about one run each.
 */
const batchSpent = Effect.fn('batches.spent')(function* (batchId: number, ownItemId: number) {
  const [row] = yield* dbRunHttp('batches.spent', (client) =>
    client
      .select({
        spent: sql<number>`coalesce(sum(${agent_batch_items.cost}), 0)`.mapWith(Number),
        mean: sql<number>`coalesce(avg(${agent_batch_items.cost}) filter (where ${agent_batch_items.finished_at} is not null and ${agent_batch_items.cost} > 0), 0)`.mapWith(
          Number
        ),
        running:
          sql<number>`count(*) filter (where ${agent_batch_items.status} = 'running' and ${agent_batch_items.id} <> ${ownItemId})`.mapWith(
            Number
          )
      })
      .from(agent_batch_items)
      .where(eq(agent_batch_items.batch_id, batchId))
  );
  return row ? row.spent + row.mean * row.running : 0;
});

// ---------------------------------------------------------------- dispatch

/**
 * Start runs for these items: through QStash in production (one message each, the batch's
 * parallelism enforced by its flow-control key, retried on failure), in-process elsewhere.
 */
const dispatchItems = Effect.fn('batches.dispatch')(function* (batch: Batch, itemIds: number[]) {
  if (itemIds.length === 0) return;
  const qstash = yield* QStashPublisher;
  if (!qstash.enabled) {
    // Local / preview: QStash cannot reach this server. Run here, `parallelism` at a time.
    yield* enqueueBackground(() =>
      import('~/effect/runtime').then(({ appRuntime }) =>
        appRuntime.runPromise(
          Effect.forEach(itemIds, (itemId) => Effect.ignore(runBatchItem(itemId, false)), {
            concurrency: batch.parallelism,
            discard: true
          })
        )
      )
    );
    return;
  }
  const messageIds = yield* qstash.publishBatchItems({
    batchId: batch.id,
    items: itemIds.map((itemId) => ({
      itemId,
      // a fresh id per dispatch: a re-run publishes again, a duplicate delivery is caught by
      // the claim in runBatchItem
      deduplicationId: `akshara-batch-item-${itemId}-${Date.now()}`
    })),
    parallelism: batch.parallelism,
    retries: BATCH_RETRIES,
    timeoutSeconds: AGENT_FUNCTION_MAX_SECONDS
  });
  yield* Effect.forEach(
    itemIds,
    (itemId, index) => updateItem(itemId, { qstash_message_id: messageIds[index] ?? null }),
    { concurrency: 8, discard: true }
  );
});

// ---------------------------------------------------------------- create

export const createBatch = Effect.fn('batches.create')(function* (
  input: z.infer<typeof create_batch_input_schema>,
  userId: string
) {
  const model = agent_model_id_schema.safeParse(input.model);
  if (!model.success) {
    return yield* Effect.fail(BadRequestError.make({ message: 'Unknown model' }));
  }
  // no public URL to deliver to: refuse before anything is stored
  const qstash = yield* QStashPublisher;
  yield* qstash.ready;
  const gestureIds = [...new Set(input.gesture_ids)];
  const gestures = yield* dbRunHttp('batches.create_gestures', (client) =>
    client
      .select({ id: text_gestures.id })
      .from(text_gestures)
      .where(inArray(text_gestures.id, gestureIds))
  );
  if (gestures.length === 0) {
    return yield* Effect.fail(BadRequestError.make({ message: 'None of these gestures exist' }));
  }
  const [batch] = yield* dbRunHttp('batches.insert', (client) =>
    client
      .insert(agent_batches)
      .values({
        title: input.title ?? '',
        user_id: userId,
        model: model.data,
        prompt: input.prompt,
        reference: input.reference,
        auto_apply: input.auto_apply,
        parallelism: input.parallelism,
        budget_usd: input.budget_usd
      })
      .returning()
  );
  const items = yield* dbRunHttp('batches.insert_items', (client) =>
    client
      .insert(agent_batch_items)
      .values(gestures.map((g) => ({ batch_id: batch!.id, text_gesture_id: g.id })))
      .returning()
  );
  // A batch whose messages never went out would sit queued forever: drop it (items cascade).
  yield* dispatchItems(
    batch!,
    items.map((item) => item.id)
  ).pipe(
    Effect.tapError(() =>
      Effect.ignore(
        dbRunHttp('batches.drop_undispatched', (client) =>
          client.delete(agent_batches).where(eq(agent_batches.id, batch!.id)).returning()
        )
      )
    )
  );
  return { batch_id: batch!.id, items: items.length };
});

// ---------------------------------------------------------------- run one item

/**
 * Take the item for a run: queued, or "running" for longer than any function lives (its run was
 * killed). QStash delivers at least once, so a duplicate delivery finds nothing to claim.
 */
const claimItem = Effect.fn('batches.claim')(function* (itemId: number) {
  const staleBefore = new Date(Date.now() - STALE_RUN_MS);
  const [item] = yield* dbRunHttp('batches.claim', (client) =>
    client
      .update(agent_batch_items)
      .set({
        status: 'running',
        attempts: sql`${agent_batch_items.attempts} + 1`,
        started_at: sql`now()`,
        finished_at: null,
        error: null
      })
      .where(
        and(
          eq(agent_batch_items.id, itemId),
          or(
            eq(agent_batch_items.status, 'queued'),
            and(
              eq(agent_batch_items.status, 'running'),
              lt(agent_batch_items.started_at, staleBefore)
            )
          )
        )
      )
      .returning()
  );
  return item ?? null;
});

/**
 * A new message per run: a re-run adds a turn to the chat instead of replacing its history
 * (which may hold messages an admin sent since).
 */
const batchMessageId = (itemId: number) => `batch-item-${itemId}-${Date.now()}`;

/** The run's first message: the batch prompt, and the reference it asks for. */
const firstMessage = Effect.fn('batches.first_message')(function* (
  batch: Batch,
  item: BatchItem,
  gesture: { id: number; text_key: string; strokes: number }
) {
  const parts: AgentUIMessage['parts'] = [{ type: 'text', text: batch.prompt }];
  let viewGestureId: number | null = null;
  let purpose: 'critique' | 'sibling' = 'critique';
  if (batch.reference === 'saved' && gesture.strokes > 0) {
    viewGestureId = gesture.id;
  } else if (batch.reference === 'sibling') {
    const siblings = (yield* listSiblingGestures(gesture)).filter((s) => s.strokes > 0);
    const sibling = siblings.find((s) => s.review_status === 'approved') ?? siblings[0];
    if (sibling) {
      viewGestureId = sibling.id;
      purpose = 'sibling';
    }
  }
  if (viewGestureId !== null) {
    parts.push({
      type: 'data-saved_view',
      data: { view_id: `batch-${item.id}`, gesture_id: viewGestureId, purpose, marks: [] }
    });
  }
  return { id: batchMessageId(item.id), role: 'user' as const, parts };
});

const CANCEL_POLL_MS = 5_000;

const lastProposal = (messages: AgentUIMessage[]) => {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type !== 'tool-propose_gesture' || part.state !== 'output-available') continue;
      if (!part.output.ok) continue;
      const parsed = proposed_gesture_schema.safeParse(part.output.proposal);
      if (parsed.success) return { proposal: parsed.data, toolCallId: part.toolCallId };
    }
  }
  return null;
};

const lastWords = (messages: AgentUIMessage[]) => {
  const reply = [...messages].reverse().find((message) => message.role === 'assistant');
  const text = reply?.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .trim();
  return text ? text.slice(0, 600) : 'The agent ended without a reply.';
};

const chatCost = (messages: AgentUIMessage[]) =>
  messages.reduce((sum, message) => sum + (message.metadata?.cost ?? 0), 0);

/** Errors a later attempt may get past (provider, network, database); not bad input. */
const retryable = (error: KnownError) =>
  !['BadRequestError', 'NotFoundError', 'ConflictError', 'ConfigError'].includes(error._tag);

/** What the batch page shows for a failed run. */
const describeError = (error: KnownError): string => {
  switch (error._tag) {
    case 'NotFoundError':
    case 'BadRequestError':
    case 'ConflictError':
    case 'ConfigError':
      return error.message;
    case 'AiProviderError':
      return error.cause instanceof Error ? error.cause.message : 'The model provider failed';
    case 'UnauthorizedError':
      return error.message ?? 'Unauthorized';
    default:
      return `${error._tag} in ${error.operation}`;
  }
};

/**
 * One gesture's run: a focused chat, one agent turn, and its outcome saved on the item. Fails
 * (so QStash redelivers) only when a retry may help and attempts remain; otherwise the item is
 * marked failed and the run answers done.
 */
export const runBatchItem = Effect.fn('batches.run_item')(function* (
  itemId: number,
  /** QStash will redeliver when this run fails */
  redelivered: boolean
) {
  const item = yield* claimItem(itemId);
  if (!item) {
    const current = yield* findItem(itemId);
    // A redelivery right after a run was killed finds it "running" but not yet stale: answer
    // 500 so QStash tries again later, once it can be claimed. A live duplicate ends the same
    // way: by then the item is finished and this skips.
    if (redelivered && current.status === 'running') {
      return yield* Effect.fail(
        QueueError.make({ operation: 'claim_batch_item', cause: new Error('Still running') })
      );
    }
    return { item_id: itemId, status: 'skipped' as const };
  }
  const batch = yield* findBatch(item.batch_id);

  const finish = (status: BatchItemStatus, set: Partial<typeof agent_batch_items.$inferInsert>) =>
    updateItem(item.id, { status, finished_at: new Date(), ...set }).pipe(
      Effect.as({ item_id: item.id, status })
    );

  if (batch.cancelled_at) return yield* finish('cancelled', { error: 'The batch was cancelled' });
  if (batch.budget_usd !== null && (yield* batchSpent(batch.id, item.id)) >= batch.budget_usd) {
    return yield* finish('cancelled', { error: 'The batch reached its budget' });
  }

  return yield* Effect.gen(function* () {
    const gesture = yield* getGestureForAgent(item.text_gesture_id);
    const [counted] = yield* dbRunHttp('batches.stroke_count', (client) =>
      client
        .select({ strokes: savedStrokeCount })
        .from(text_gestures)
        .where(eq(text_gestures.id, gesture.id))
    );
    const strokes = counted?.strokes ?? 0;
    yield* updateItem(item.id, { based_on_revision: gesture.revision });

    let chatId = item.chat_id;
    if (!chatId) {
      const chat = yield* createAgentChat({
        id: crypto.randomUUID(),
        model: batch.model,
        agent_kind: 'gesture_creator',
        user_id: batch.user_id,
        focus_gesture_id: gesture.id,
        title: `Batch #${batch.id}: ${gesture.text} (${get_script_from_id(gesture.script_id) ?? gesture.script_id})`
      });
      chatId = chat.id;
      yield* updateItem(item.id, { chat_id: chatId });
    }

    const message = yield* firstMessage(batch, item, { ...gesture, strokes });
    const turn = yield* startAgentTurn({
      chatId,
      message,
      model: batch.model,
      withClientStream: false
    });
    // A cancel while the reply streams stops it (cancelBatch's stop may have landed before the
    // reply started, when there was nothing to stop yet).
    const runId = chatId;
    const watchCancel = setInterval(() => {
      void appRuntime
        .runPromise(
          findBatch(batch.id).pipe(
            Effect.flatMap((latest) => (latest.cancelled_at ? requestChatStop(runId) : Effect.void))
          )
        )
        .catch(() => undefined);
    }, CANCEL_POLL_MS);
    const outcome = yield* Effect.promise(() => turn.done).pipe(
      Effect.ensuring(Effect.sync(() => clearInterval(watchCancel)))
    );
    const messages = yield* loadAgentMessages(chatId);
    const cost = chatCost(messages);

    if (outcome.error) {
      yield* updateItem(item.id, { cost });
      return yield* Effect.fail(
        AiProviderError.make({ operation: 'batch_run', cause: new Error(outcome.error) })
      );
    }
    if (outcome.aborted) return yield* finish('cancelled', { cost, error: 'Stopped' });

    const found = lastProposal(messages);
    if (!found) return yield* finish('no_proposal', { cost, error: lastWords(messages) });

    const set = {
      cost,
      proposal: found.proposal,
      tool_call_id: found.toolCallId
    } satisfies Partial<typeof agent_batch_items.$inferInsert>;
    if (batch.auto_apply === 'when_empty' && strokes === 0) {
      const applied = yield* Effect.result(
        saveProposal({
          proposal: found.proposal,
          chatId,
          toolCallId: found.toolCallId,
          userId: batch.user_id,
          replaceExisting: false,
          expectedRevision: gesture.revision
        })
      );
      // saved meanwhile (or the glyph moved): leave it for review instead
      if (applied._tag === 'Success') {
        return yield* finish('applied', { ...set, applied_revision: applied.success.revision });
      }
    }
    return yield* finish('proposed', set);
  }).pipe(
    Effect.catch((error) => {
      const message = describeError(error);
      if (redelivered && retryable(error) && item.attempts <= BATCH_RETRIES) {
        // back in the queue for QStash's next delivery; the error shows until then
        return updateItem(item.id, { status: 'queued', error: message }).pipe(
          Effect.andThen(Effect.fail(error))
        );
      }
      return finish('failed', { error: message });
    })
  );
});

/** QStash gave up on a delivery (retries used up, or the function kept dying). */
export const markItemUndeliverable = Effect.fn('batches.mark_undeliverable')(function* (
  itemId: number,
  reason: string
) {
  yield* dbRunHttp('batches.mark_undeliverable', (client) =>
    client
      .update(agent_batch_items)
      .set({ status: 'failed', error: reason, finished_at: new Date() })
      .where(
        and(
          eq(agent_batch_items.id, itemId),
          or(
            eq(agent_batch_items.status, 'queued'),
            // a live run (a duplicate delivery used up the retries) finishes on its own; a
            // dead one shows as stuck once stale
            and(
              eq(agent_batch_items.status, 'running'),
              lt(agent_batch_items.started_at, new Date(Date.now() - STALE_RUN_MS))
            )
          )
        )
      )
      .returning()
  );
});

// ---------------------------------------------------------------- control

export const cancelBatch = Effect.fn('batches.cancel')(function* (batchId: number) {
  const batch = yield* findBatch(batchId);
  if (batch.cancelled_at) return { cancelled: true as const };
  yield* dbRunHttp('batches.cancel', (client) =>
    client
      .update(agent_batches)
      .set({ cancelled_at: new Date() })
      .where(eq(agent_batches.id, batchId))
      .returning()
  );
  yield* dbRunHttp('batches.cancel_queued', (client) =>
    client
      .update(agent_batch_items)
      .set({ status: 'cancelled', error: 'The batch was cancelled', finished_at: new Date() })
      .where(and(eq(agent_batch_items.batch_id, batchId), eq(agent_batch_items.status, 'queued')))
      .returning()
  );
  const running = yield* dbRunHttp('batches.running_chats', (client) =>
    client
      .select({ chat_id: agent_batch_items.chat_id })
      .from(agent_batch_items)
      .where(and(eq(agent_batch_items.batch_id, batchId), eq(agent_batch_items.status, 'running')))
  );
  yield* Effect.forEach(
    running.flatMap((row) => (row.chat_id ? [row.chat_id] : [])),
    (chatId) => requestChatStop(chatId),
    { concurrency: 8, discard: true }
  );
  const qstash = yield* QStashPublisher;
  // undelivered messages would only find cancelled items; dropping them saves the quota
  if (qstash.enabled) yield* Effect.ignore(qstash.cancelBatch(batchId));
  return { cancelled: true as const };
});

/** Run these items again (failed, without a proposal, cancelled, or stuck) in their chats. */
export const rerunItems = Effect.fn('batches.rerun')(function* (input: {
  batchId: number;
  /** Every re-runnable item of the batch when omitted */
  itemIds?: number[];
}) {
  const batch = yield* findBatch(input.batchId);
  const staleBefore = new Date(Date.now() - STALE_RUN_MS);
  const requeued = yield* dbRunHttp('batches.requeue', (client) =>
    client
      .update(agent_batch_items)
      // a fresh cycle: its own QStash retries
      .set({ status: 'queued', error: null, finished_at: null, attempts: 0 })
      .where(
        and(
          eq(agent_batch_items.batch_id, batch.id),
          input.itemIds ? inArray(agent_batch_items.id, input.itemIds) : undefined,
          or(
            inArray(agent_batch_items.status, ['failed', 'no_proposal', 'cancelled']),
            and(
              eq(agent_batch_items.status, 'running'),
              lt(agent_batch_items.started_at, staleBefore)
            ),
            // queued long ago and never run: its message was lost
            and(
              eq(agent_batch_items.status, 'queued'),
              lt(
                sql`coalesce(${agent_batch_items.started_at}, ${agent_batch_items.created_at})`,
                staleBefore
              )
            )
          )
        )
      )
      .returning()
  );
  if (requeued.length > 0 && batch.cancelled_at) {
    yield* dbRunHttp('batches.uncancel', (client) =>
      client
        .update(agent_batches)
        .set({ cancelled_at: null })
        .where(eq(agent_batches.id, batch.id))
        .returning()
    );
  }
  yield* dispatchItems(
    { ...batch, cancelled_at: null },
    requeued.map((row) => row.id)
  );
  return { requeued: requeued.length };
});

// ---------------------------------------------------------------- review

/**
 * Save the item's proposal to its gesture (as a chat proposal would be) and approve it. Refused
 * when the gesture was saved since the run: the proposal replaced a version that is gone.
 */
export const acceptItem = Effect.fn('batches.accept')(function* (input: {
  itemId: number;
  userId: string;
  /** Also mark the gesture Approved (else it stays Unreviewed) */
  approve: boolean;
}) {
  const item = yield* findItem(input.itemId);
  if (item.status !== 'proposed' || !item.proposal) {
    return yield* Effect.fail(BadRequestError.make({ message: 'Nothing to accept here' }));
  }
  const current = yield* getGestureForAgent(item.text_gesture_id);
  if (item.based_on_revision !== null && current.revision !== item.based_on_revision) {
    return yield* Effect.fail(
      ConflictError.make({
        message: `${current.text} was saved again since this run (now v${current.revision}). Compare it in the chat before applying.`
      })
    );
  }
  const saved = yield* saveProposal({
    proposal: item.proposal,
    chatId: item.chat_id,
    toolCallId: item.tool_call_id,
    userId: input.userId,
    replaceExisting: true,
    expectedRevision: current.revision
  });
  if (input.approve) {
    yield* setGestureReview({ gestureId: current.id, status: 'approved', note: '' });
  }
  yield* updateItem(item.id, {
    status: 'applied',
    applied_revision: saved.revision,
    reviewed_by: input.userId,
    reviewed_at: new Date()
  });
  return { applied: true as const, revision: saved.revision };
});

/** Keep the proposal (in the item and its chat) without saving it. */
export const rejectItem = Effect.fn('batches.reject')(function* (input: {
  itemId: number;
  userId: string;
}) {
  const item = yield* findItem(input.itemId);
  if (item.status !== 'proposed') {
    return yield* Effect.fail(BadRequestError.make({ message: 'Nothing to reject here' }));
  }
  yield* updateItem(item.id, {
    status: 'rejected',
    reviewed_by: input.userId,
    reviewed_at: new Date()
  });
  return { rejected: true as const };
});

// ---------------------------------------------------------------- monitoring

const countsSelect = {
  total: sql<number>`count(*)`.mapWith(Number),
  queued: sql<number>`count(*) filter (where ${agent_batch_items.status} = 'queued')`.mapWith(
    Number
  ),
  running: sql<number>`count(*) filter (where ${agent_batch_items.status} = 'running')`.mapWith(
    Number
  ),
  proposed: sql<number>`count(*) filter (where ${agent_batch_items.status} = 'proposed')`.mapWith(
    Number
  ),
  no_proposal:
    sql<number>`count(*) filter (where ${agent_batch_items.status} = 'no_proposal')`.mapWith(
      Number
    ),
  failed: sql<number>`count(*) filter (where ${agent_batch_items.status} = 'failed')`.mapWith(
    Number
  ),
  applied: sql<number>`count(*) filter (where ${agent_batch_items.status} = 'applied')`.mapWith(
    Number
  ),
  rejected: sql<number>`count(*) filter (where ${agent_batch_items.status} = 'rejected')`.mapWith(
    Number
  ),
  cancelled: sql<number>`count(*) filter (where ${agent_batch_items.status} = 'cancelled')`.mapWith(
    Number
  ),
  cost: sql<number>`coalesce(sum(${agent_batch_items.cost}), 0)`.mapWith(Number),
  /** Mean seconds of the runs that finished */
  avg_seconds: sql<
    number | null
  >`avg(extract(epoch from (${agent_batch_items.finished_at} - ${agent_batch_items.started_at}))) filter (where ${agent_batch_items.finished_at} is not null and ${agent_batch_items.started_at} is not null)`.mapWith(
    (value) => (value === null ? null : Number(value))
  ),
  last_finished_at: sql<Date | null>`max(${agent_batch_items.finished_at})`.mapWith((value) =>
    value === null ? null : new Date(value)
  )
};

const userNames = (ids: string[]) =>
  resolveAuthUserNames(ids).pipe(Effect.orElseSucceed(() => new Map<string, string>()));

/** Every batch, newest first, with its progress. */
export const listBatches = Effect.fn('batches.list')(function* () {
  const rows = yield* dbRunHttp('batches.list', (client) =>
    client
      .select({
        id: agent_batches.id,
        title: agent_batches.title,
        user_id: agent_batches.user_id,
        model: agent_batches.model,
        parallelism: agent_batches.parallelism,
        budget_usd: agent_batches.budget_usd,
        cancelled_at: agent_batches.cancelled_at,
        created_at: agent_batches.created_at,
        ...countsSelect
      })
      .from(agent_batches)
      .leftJoin(agent_batch_items, eq(agent_batch_items.batch_id, agent_batches.id))
      .groupBy(agent_batches.id)
      .orderBy(desc(agent_batches.created_at))
      .limit(100)
  );
  const names = yield* userNames([...new Set(rows.map((row) => row.user_id))]);
  return rows.map((row) => ({ ...row, user_name: names.get(row.user_id) ?? null }));
});

/**
 * A batch with every item's state (no strokes: this is polled while the batch runs). Runs
 * "running" past the longest function life are flagged `stuck`.
 */
export const getBatch = Effect.fn('batches.get')(function* (batchId: number) {
  const batch = yield* findBatch(batchId);
  const [counts] = yield* dbRunHttp('batches.counts', (client) =>
    client
      .select(countsSelect)
      .from(agent_batch_items)
      .where(eq(agent_batch_items.batch_id, batchId))
  );
  const items = yield* dbRunHttp('batches.items', (client) =>
    client
      .select({
        id: agent_batch_items.id,
        text_gesture_id: agent_batch_items.text_gesture_id,
        text: text_gestures.text,
        script_id: text_gestures.script_id,
        status: agent_batch_items.status,
        chat_id: agent_batch_items.chat_id,
        chat_streaming: liveStreaming,
        cost: agent_batch_items.cost,
        error: agent_batch_items.error,
        attempts: agent_batch_items.attempts,
        qstash_message_id: agent_batch_items.qstash_message_id,
        based_on_revision: agent_batch_items.based_on_revision,
        applied_revision: agent_batch_items.applied_revision,
        current_revision: text_gestures.revision,
        review_status: text_gestures.review_status,
        started_at: agent_batch_items.started_at,
        finished_at: agent_batch_items.finished_at,
        reviewed_at: agent_batch_items.reviewed_at,
        category_id: gesture_text_key_lesson_category_join.lesson_category_id,
        category: lesson_categories.name
      })
      .from(agent_batch_items)
      .innerJoin(text_gestures, eq(text_gestures.id, agent_batch_items.text_gesture_id))
      .leftJoin(agent_chats, eq(agent_chats.id, agent_batch_items.chat_id))
      // categories of the default language (null: uncategorized)
      .leftJoin(
        gesture_text_key_lesson_category_join,
        and(
          eq(gesture_text_key_lesson_category_join.gesture_text_key, text_gestures.text_key),
          eq(gesture_text_key_lesson_category_join.lang_id, DEFAULT_GESTURE_CATEGORY_LANG_ID)
        )
      )
      .leftJoin(
        lesson_categories,
        eq(lesson_categories.id, gesture_text_key_lesson_category_join.lesson_category_id)
      )
      .where(eq(agent_batch_items.batch_id, batchId))
      .orderBy(asc(text_gestures.script_id), asc(agent_batch_items.id))
  );
  const names = yield* userNames([batch.user_id]);
  const now = Date.now();
  const c = counts!;
  const remaining = c.queued + c.running;
  return {
    batch: { ...batch, user_name: names.get(batch.user_id) ?? null },
    counts: c,
    /** Rough seconds left: remaining runs / parallelism × mean run time */
    eta_seconds:
      remaining > 0 && c.avg_seconds !== null
        ? Math.round((remaining / batch.parallelism) * c.avg_seconds)
        : null,
    items: items.map((item) => ({
      ...item,
      stuck:
        item.status === 'running' &&
        item.started_at !== null &&
        now - item.started_at.getTime() > STALE_RUN_MS
    }))
  };
});

/** Proposals of a batch with the strokes saved now, for the review grid. */
export const listBatchProposals = Effect.fn('batches.proposals')(function* (input: {
  batchId: number;
  itemIds?: number[];
}) {
  const rows = yield* dbRunHttp('batches.proposals', (client) =>
    client
      .select({
        id: agent_batch_items.id,
        text_gesture_id: agent_batch_items.text_gesture_id,
        status: agent_batch_items.status,
        chat_id: agent_batch_items.chat_id,
        proposal: agent_batch_items.proposal,
        based_on_revision: agent_batch_items.based_on_revision,
        current: {
          text: text_gestures.text,
          script_id: text_gestures.script_id,
          revision: text_gestures.revision,
          review_status: text_gestures.review_status,
          gestures: text_gestures.gestures,
          font_family: text_gestures.font_family,
          font_size: text_gestures.font_size,
          text_center_offset: text_gestures.text_center_offset
        }
      })
      .from(agent_batch_items)
      .innerJoin(text_gestures, eq(text_gestures.id, agent_batch_items.text_gesture_id))
      .where(
        and(
          eq(agent_batch_items.batch_id, input.batchId),
          input.itemIds
            ? inArray(agent_batch_items.id, input.itemIds)
            : sql`${agent_batch_items.proposal} is not null`
        )
      )
      .orderBy(asc(text_gestures.script_id), asc(agent_batch_items.id))
      .limit(500)
  );
  return rows.flatMap((row) =>
    row.proposal ? [{ ...row, proposal: row.proposal satisfies ProposedGesture }] : []
  );
});
