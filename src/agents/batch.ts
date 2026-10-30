import { z } from 'zod';

/**
 * Agent batches: one Gesture Creator run per gesture, each in its own focused chat, queued
 * through QStash. A run only drafts: its proposal waits on the batch page until an admin
 * accepts it (applied like a chat proposal) or rejects it — unless the batch auto-applies to
 * gestures that have no strokes yet.
 */

export const BATCH_ITEM_STATUSES = [
  'queued',
  'running',
  'proposed',
  'no_proposal',
  'failed',
  'applied',
  'rejected',
  'cancelled'
] as const;
export type BatchItemStatus = (typeof BATCH_ITEM_STATUSES)[number];

export const BATCH_ITEM_STATUS_META = {
  queued: { label: 'Queued', hint: 'Waiting for a free slot' },
  running: { label: 'Running', hint: 'The agent is working on it' },
  proposed: { label: 'To review', hint: 'A proposal waits for review' },
  no_proposal: { label: 'No proposal', hint: 'The agent finished without proposing strokes' },
  failed: { label: 'Failed', hint: 'The run failed after its retries' },
  applied: { label: 'Applied', hint: 'The proposal was saved to the gesture' },
  rejected: { label: 'Rejected', hint: 'Reviewed and not applied (kept in the chat)' },
  cancelled: { label: 'Cancelled', hint: 'The batch was cancelled or hit its budget first' }
} as const satisfies Record<BatchItemStatus, { label: string; hint: string }>;

/** Still waiting for, or inside, a run. */
export const ACTIVE_ITEM_STATUSES = ['queued', 'running'] as const satisfies BatchItemStatus[];

/** What the agent is shown besides the glyph. */
export const BATCH_REFERENCES = ['none', 'saved', 'sibling'] as const;
export type BatchReference = (typeof BATCH_REFERENCES)[number];
export const batch_reference_schema = z.enum(BATCH_REFERENCES);

export const BATCH_REFERENCE_META = {
  none: { label: 'Glyph only', hint: 'The agent traces from the glyph alone' },
  saved: {
    label: 'Current strokes',
    hint: 'Shows the saved strokes to critique (gestures without strokes get the glyph only)'
  },
  sibling: {
    label: 'Sibling script',
    hint: 'Shows the same akṣara in another script (approved first) so the order matches'
  }
} as const satisfies Record<BatchReference, { label: string; hint: string }>;

/**
 * `when_empty`: a proposal for a gesture without strokes is saved right away (as Unreviewed),
 * nothing to lose. Proposals for gestures that have strokes always wait for review.
 */
export const BATCH_AUTO_APPLY = ['never', 'when_empty'] as const;
export type BatchAutoApply = (typeof BATCH_AUTO_APPLY)[number];
export const batch_auto_apply_schema = z.enum(BATCH_AUTO_APPLY);

/**
 * Agents running at once per batch. Each run is one long OpenRouter tool loop plus canvas
 * tracing on the server; 4 keeps a few hundred gestures to a couple of hours without
 * provider rate limits or Fluid instances crowding up. QStash's free plan caps parallelism at 10
 * (shared with krida), so 8 is the most we allow.
 */
export const BATCH_PARALLELISM = { default: 4, min: 1, max: 8 } as const;

export const MAX_BATCH_GESTURES = 500;

/** QStash redeliveries after a failed run (each also counts as a message). */
export const BATCH_RETRIES = 2;

/** Function `maxDuration` for `/api/agents/**` (vite.config.ts) — and QStash's HTTP timeout. */
export const AGENT_FUNCTION_MAX_SECONDS = 800;

/**
 * A run older than this is dead (its function was killed at its max duration); it may be
 * claimed again. Also when a chat's `streaming` flag counts as left over.
 */
export const STALE_RUN_MS = (AGENT_FUNCTION_MAX_SECONDS + 60) * 1000;

export const DEFAULT_BATCH_PROMPT =
  'Trace this gesture from its glyph and propose the strokes in the standard writing order. Follow the notes kept for it.';

export const create_batch_input_schema = z.object({
  gesture_ids: z.array(z.int().positive()).min(1).max(MAX_BATCH_GESTURES),
  model: z.string(),
  prompt: z.string().trim().min(1).max(2000),
  reference: batch_reference_schema,
  auto_apply: batch_auto_apply_schema,
  parallelism: z.int().min(BATCH_PARALLELISM.min).max(BATCH_PARALLELISM.max),
  /** Stop starting runs once the batch has cost this much (USD); null = no cap */
  budget_usd: z.number().positive().max(500).nullable(),
  title: z.string().trim().max(120).optional()
});
