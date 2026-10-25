/**
 * Gesture previews in agent replies. The agent writes only ids, in a fenced block:
 *
 * ```gesture
 * 12, 15
 * ```
 *
 * The chat renders each id as a canvas preview that loads its strokes from the database, so stroke
 * data never enters the stored conversation or the model's context.
 */
export const GESTURE_EMBED_LANGUAGE = 'gesture';

/** Most previews one block renders; the rest are listed as plain ids. */
export const MAX_GESTURE_EMBED_IDS = 24;

/** Positive integer ids in the block, in order, without duplicates. */
export function parseGestureEmbedIds(source: string): number[] {
  const ids: number[] = [];
  for (const token of source.split(/[\s,]+/)) {
    const id = Number(token.replace(/^#/, ''));
    if (Number.isSafeInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
