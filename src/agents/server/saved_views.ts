import { Effect } from 'effect';
import { describeDirection } from '~/agents/gesture_creator/draft_plan';
import { rasterizeGlyph } from '~/agents/gesture_creator/glyph_raster';
import { renderStrokesImage } from '~/agents/gesture_creator/render_images';
import type { SavedViewData } from '~/agents/gesture_creator/schemas';
import { serverCanvasEnv } from '~/agents/gesture_creator/server_canvas.server';
import { savedViewAllowed, type FocusContext } from '~/agents/focus';
import type { AgentUIMessage } from '~/agents/ui_message';
import { get_script_from_id } from '~/state/lang_list';
import { getGestureForAgent } from './gestures';

/**
 * The admin's "show the saved strokes" in a new message of a focused chat, filled in on the
 * server: the saved strokes drawn over the glyph with the admin's rings (as a `data-draft_image`
 * with the view's id, so it is pruned like a draft's image) and a text context. Anything the
 * client sent in the server's fields is dropped.
 */

type Part = AgentUIMessage['parts'][number];

const pt = (p: readonly [number, number] | undefined) =>
  p ? `${Math.round(p[0])},${Math.round(p[1])}` : '—';

const clientFields = ({
  revision: _revision,
  text: _text,
  script_id: _scriptId,
  error: _error,
  context: _context,
  ...view
}: SavedViewData): SavedViewData => view;

function savedViewContext(
  view: SavedViewData,
  strokes: { points: [number, number][] }[],
  focusText: string
) {
  const script = view.script_id === undefined ? '' : (get_script_from_id(view.script_id) ?? '');
  if (view.error) {
    return `<saved_strokes view_id="${view.view_id}" error="${view.error}" />`;
  }
  const lines = [
    `<saved_strokes view_id="${view.view_id}" gesture_id="${view.gesture_id}" purpose="${view.purpose}" version="${view.revision}">`,
    view.purpose === 'critique'
      ? `The strokes saved now for ${view.text} (${script}), shown by the admin to point out what is wrong with them. Trace it yourself from the glyph; never copy these points.`
      : `How ${view.text} is written in ${script} (saved strokes), shown by the admin so ${focusText} follows the same stroke order where the shapes correspond.`,
    `${strokes.length} strokes, in writing order:`,
    ...strokes.map(
      (stroke, i) =>
        `${i + 1}. ${pt(stroke.points[0])} → ${pt(stroke.points.at(-1))}, ${describeDirection(stroke.points)}`
    )
  ];
  if (view.marks.length > 0) {
    lines.push('Areas the admin ringed:');
    for (const mark of view.marks) {
      lines.push(
        `- ${mark.id} at ${pt([mark.x, mark.y])}, radius ${Math.round(mark.r)}: ${mark.note.trim() ? `"${mark.note.trim()}"` : '(no note)'}`
      );
    }
  }
  lines.push('The image shows these strokes (numbered, arrows for direction) with the rings.');
  lines.push('</saved_strokes>');
  return lines.join('\n');
}

/** Fill the message's saved view (one per message); parts are dropped outside focused chats. */
export const resolveSavedView = Effect.fn('agents.resolve_saved_view')(function* (
  message: AgentUIMessage,
  focus: FocusContext | null
) {
  const viewPart = message.parts.find((part) => part.type === 'data-saved_view');
  const rest = message.parts.filter(
    (part) =>
      part.type !== 'data-saved_view' &&
      !(part.type === 'data-draft_image' && viewPart && part.data.edit_id === viewPart.data.view_id)
  );
  if (!viewPart || viewPart.type !== 'data-saved_view' || !focus) {
    return rest.length === message.parts.length ? message : { ...message, parts: rest };
  }
  const view = clientFields(viewPart.data);
  const parts: Part[] = [];
  let filled: SavedViewData;
  let strokes: { points: [number, number][] }[] = [];
  const refused = savedViewAllowed(view, focus.gesture, focus.siblings);
  if (refused) {
    filled = { ...view, error: refused };
  } else {
    const gesture = yield* getGestureForAgent(view.gesture_id);
    const saved = [...gesture.gestures]
      .sort((a, b) => a.index - b.index)
      .filter((g) => g.points.length > 0);
    filled = {
      ...view,
      revision: gesture.revision,
      text: gesture.text,
      script_id: gesture.script_id
    };
    if (saved.length === 0) {
      filled.error = 'This gesture has no saved strokes yet.';
    } else {
      strokes = saved.map((g) => ({ points: g.points }));
      const image = yield* Effect.promise(async () =>
        renderStrokesImage(
          serverCanvasEnv,
          await rasterizeGlyph(gesture, serverCanvasEnv),
          saved.map((g) => ({ points: g.points, width: g.width })),
          { marks: view.marks }
        )
      );
      parts.push({ type: 'data-draft_image', data: { edit_id: view.view_id, url: image } });
    }
  }
  filled.context = savedViewContext(filled, strokes, focus.gesture.text);
  return {
    ...message,
    parts: [{ type: 'data-saved_view' as const, data: filled }, ...parts, ...rest]
  };
});
