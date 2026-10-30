import { z } from 'zod';

/**
 * Where a gesture stands in review. Strokes applied from a chat or restored from history start
 * as `unreviewed`; an admin marks them `approved` or `needs_work` (with a note).
 */
export const REVIEW_STATUSES = ['unreviewed', 'needs_work', 'approved'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const review_status_schema = z.enum(REVIEW_STATUSES);

export const REVIEW_STATUS_META = {
  unreviewed: { label: 'Unreviewed' },
  needs_work: { label: 'Needs work' },
  approved: { label: 'Approved' }
} as const satisfies Record<ReviewStatus, { label: string }>;

/** How a saved version of a gesture came to be. */
export const REVISION_SOURCES = ['initial', 'manual', 'agent', 'revert'] as const;
export type RevisionSource = (typeof REVISION_SOURCES)[number];

export const REVISION_SOURCE_META = {
  initial: { label: 'Initial' },
  manual: { label: 'Saved in editor' },
  agent: { label: 'Applied from a chat' },
  revert: { label: 'Restored' }
} as const satisfies Record<RevisionSource, { label: string }>;

/** Longest per-gesture note the Gesture Creator reads. */
export const MAX_AGENT_NOTES_LENGTH = 2000;

/** The notes with one more `- ` line, unless they already hold it. */
export function withNote(notes: string, note: string) {
  const current = notes.trim();
  const line = note.trim();
  if (current.split('\n').some((existing) => existing.replace(/^-\s*/, '').trim() === line)) {
    return current;
  }
  return current ? `${current}\n- ${line}` : `- ${line}`;
}
