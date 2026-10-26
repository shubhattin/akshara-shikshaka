import { Effect } from 'effect';
import { eq, inArray } from 'drizzle-orm';
import { gesture_categories, gesture_text_key_category_join, text_gestures } from '~/db/schema';
import { dbRunHttp } from '~/effect/database';
import { get_script_from_id } from '~/state/lang_list';
import type { Gesture } from '~/tools/stroke_data/types';
import { mentionToken } from '~/agents/gesture_refs';
import type { GestureRefData } from '~/agents/ui_message';

type RefGestureRow = {
  id: number;
  text: string;
  script_id: number;
  font_family: string;
  font_size: number;
  text_center_offset: [number, number];
  gestures: Gesture[];
  category: string | null;
};

const strokeLength = (points: Gesture['points']) => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  }
  return Math.round(total);
};

const pointText = (p: Gesture['points'][number] | undefined) => (p ? `${Math.round(p[0])},${Math.round(p[1])}` : '—');

/** One mentioned gesture for the model: metadata and a stroke summary, never raw points. */
export function renderReferencedGesture(row: RefGestureRow): string {
  const strokes = [...row.gestures].sort((a, b) => a.index - b.index).filter((g) => g.points.length > 0);
  const lines = [
    `<referenced_gesture id="${row.id}" mention="${mentionToken(row)}">`,
    `text: ${row.text}`,
    `script: ${get_script_from_id(row.script_id) ?? row.script_id} (script_id ${row.script_id})`,
    `category: ${row.category ?? '(none)'}`,
    `glyph: font ${row.font_family}, size ${row.font_size}, offset ${row.text_center_offset.join(',')}`,
    strokes.length > 0
      ? `saved strokes (${strokes.length}), canvas 400×400, y down:`
      : 'saved strokes: none yet'
  ];
  strokes.forEach((g, k) => {
    lines.push(
      `  ${k + 1}. ${pointText(g.points[0])} → ${pointText(g.points.at(-1))}, length ${strokeLength(g.points)}, pace ${g.duration}ms/200px, ${g.anim_fn}, width ${g.width}`
    );
  });
  lines.push('</referenced_gesture>');
  return lines.join('\n');
}

const loadRefGestures = Effect.fn('agents.load_ref_gestures')(function* (ids: number[]) {
  const rows = yield* dbRunHttp('agents.ref_gestures', (client) =>
    client
      .select({
        id: text_gestures.id,
        text: text_gestures.text,
        script_id: text_gestures.script_id,
        font_family: text_gestures.font_family,
        font_size: text_gestures.font_size,
        text_center_offset: text_gestures.text_center_offset,
        gestures: text_gestures.gestures,
        category: gesture_categories.name
      })
      .from(text_gestures)
      .leftJoin(
        gesture_text_key_category_join,
        eq(gesture_text_key_category_join.gesture_text_key, text_gestures.text_key)
      )
      .leftJoin(gesture_categories, eq(gesture_categories.id, gesture_text_key_category_join.category_id))
      .where(inArray(text_gestures.id, ids))
  );
  return rows;
});

/**
 * Fill each `@` mention with its gesture rendered for the model. Mentions of gestures that no
 * longer exist are dropped.
 */
export const resolveGestureRefs = Effect.fn('agents.resolve_gesture_refs')(function* (
  refs: GestureRefData[]
) {
  if (refs.length === 0) return [];
  const rows = yield* loadRefGestures([...new Set(refs.map((ref) => ref.id))]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return refs.flatMap((ref): GestureRefData[] => {
    const row = byId.get(ref.id);
    if (!row) return [];
    return [
      {
        id: row.id,
        text: row.text,
        script_id: row.script_id,
        context: renderReferencedGesture(row)
      }
    ];
  });
});
