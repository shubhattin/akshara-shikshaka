import { sql } from 'drizzle-orm';
import { text_gestures } from '~/db/schema';

/**
 * Strokes a gesture really has: entries with at least one point. Matches the UI, which skips
 * empty strokes, so "no strokes" means the same in badges, the queue and the pickers.
 */
export const savedStrokeCount = sql<number>`(
  select count(*)::int from jsonb_array_elements(${text_gestures.gestures}) as stroke
  where jsonb_array_length(coalesce(stroke -> 'points', '[]'::jsonb)) > 0
)`.mapWith(Number);
