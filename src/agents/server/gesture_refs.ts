import { Effect } from 'effect';
import { and, eq, inArray } from 'drizzle-orm';
import {
  lesson_categories,
  gesture_text_key_lesson_category_join,
  text_gestures
} from '~/db/schema';
import { dbRunHttp } from '~/effect/database';
import { DEFAULT_GESTURE_CATEGORY_LANG_ID, get_script_from_id } from '~/state/lang_list';
import type { Gesture } from '~/tools/stroke_data/types';
import type { AgentKind } from '~/agents/agent_kinds';
import { mentionToken } from '~/agents/gesture_refs';
import { STYLE_GUIDE_TAG, styleGuideBlock } from '~/agents/prompts/style_guides';
import type { AgentUIMessage, GestureRefData } from '~/agents/ui_message';

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

const pointText = (p: Gesture['points'][number] | undefined) =>
  p ? `${Math.round(p[0])},${Math.round(p[1])}` : '—';

const SAVED_STROKES_LINE = /^saved strokes/;

/**
 * One mentioned gesture for the model: metadata and, for the general agent, a summary of its
 * saved strokes (never raw points). The Gesture Creator gets no saved strokes: it draws from the
 * glyph alone, so a draft is never a copy of what is saved.
 */
export function renderReferencedGesture(
  row: RefGestureRow,
  options: { savedStrokes: boolean; styleGuide: boolean }
): string {
  const script = get_script_from_id(row.script_id);
  const lines = [
    `<referenced_gesture id="${row.id}" mention="${mentionToken(row)}">`,
    `text: ${row.text}`,
    `script: ${script ?? row.script_id} (script_id ${row.script_id})`,
    `category: ${row.category ?? '(none)'}`,
    `glyph: font ${row.font_family}, size ${row.font_size}, offset ${row.text_center_offset.join(',')}`
  ];
  if (options.savedStrokes) {
    const strokes = [...row.gestures]
      .sort((a, b) => a.index - b.index)
      .filter((g) => g.points.length > 0);
    lines.push(
      strokes.length > 0
        ? `saved strokes (${strokes.length}), canvas 400×400, y down:`
        : 'saved strokes: none yet'
    );
    strokes.forEach((g, k) => {
      lines.push(
        `  ${k + 1}. ${pointText(g.points[0])} → ${pointText(g.points.at(-1))}, length ${strokeLength(g.points)}, pace ${g.duration}ms/200px, ${g.anim_fn}, width ${g.width}`
      );
    });
  }
  lines.push('</referenced_gesture>');
  if (options.styleGuide && script) lines.push(styleGuideBlock(script));
  return lines.join('\n');
}

/** Scripts whose style guide an earlier message of the chat already carries. */
export function guidedScripts(messages: readonly AgentUIMessage[]): Set<number> {
  const out = new Set<number>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'data-gesture_ref' && part.data.context?.includes(`<${STYLE_GUIDE_TAG}`)) {
        out.add(part.data.script_id);
      }
    }
  }
  return out;
}

/** Drop the saved-stroke summary from mentions stored before the Gesture Creator stopped seeing it. */
function hideSavedStrokes(context: string): string {
  const lines = context.split('\n');
  const from = lines.findIndex((line) => SAVED_STROKES_LINE.test(line));
  if (from === -1) return context;
  const to = lines.findIndex((line, i) => i > from && line.startsWith('</referenced_gesture>'));
  return [...lines.slice(0, from), ...lines.slice(to === -1 ? lines.length : to)].join('\n');
}

/** The Gesture Creator's view of a chat: mentions without saved strokes. */
export function withoutSavedStrokes(messages: AgentUIMessage[]): AgentUIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) =>
      part.type === 'data-gesture_ref' && part.data.context
        ? { ...part, data: { ...part.data, context: hideSavedStrokes(part.data.context) } }
        : part
    )
  }));
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
        category: lesson_categories.name
      })
      .from(text_gestures)
      // agents see the categories of the default language
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
      .where(inArray(text_gestures.id, ids))
  );
  return rows;
});

/**
 * Fill each `@` mention with its gesture rendered for the model. Mentions of gestures that no
 * longer exist are dropped. In the Gesture Creator the first mention of each script also carries
 * that script's style guide.
 */
export const resolveGestureRefs = Effect.fn('agents.resolve_gesture_refs')(function* (
  refs: GestureRefData[],
  kind: AgentKind,
  /** The chat so far: a script's style guide is sent with its first mention only */
  earlier: readonly AgentUIMessage[]
) {
  if (refs.length === 0) return [];
  const creator = kind === 'gesture_creator';
  const guided = guidedScripts(earlier);
  const rows = yield* loadRefGestures([...new Set(refs.map((ref) => ref.id))]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return refs.flatMap((ref): GestureRefData[] => {
    const row = byId.get(ref.id);
    if (!row) return [];
    const styleGuide = creator && !guided.has(row.script_id);
    if (styleGuide) guided.add(row.script_id);
    return [
      {
        id: row.id,
        text: row.text,
        script_id: row.script_id,
        context: renderReferencedGesture(row, { savedStrokes: !creator, styleGuide })
      }
    ];
  });
});
