import { describeDirection } from './draft_plan';
import type {
  DraftEditData,
  DraftMarkInfo,
  DraftStrokeOrigin,
  TraceStrokesOutput
} from './schemas';

/**
 * An admin's draft edit as the model reads it: what changed, stroke by stroke, the traced
 * result with its checks, and the marked areas placed on the skeleton.
 */

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pt = (p: readonly [number, number]) => `${Math.round(p[0])},${Math.round(p[1])}`;

const baseName = (base: TraceStrokesOutput | undefined, n: number) => {
  const label = base?.strokes[n - 1]?.label;
  return label ? `${n} "${label}"` : String(n);
};

function originText(origin: DraftStrokeOrigin, base: TraceStrokesOutput | undefined): string {
  const names = origin.from.map((n) => baseName(base, n));
  const parts = [
    origin.from.length > 1 ? `joined from strokes ${names.join(' + ')}` : `was stroke ${names[0]}`
  ];
  if (origin.split_part) parts.push(`${origin.split_part === 1 ? 'first' : 'second'} half`);
  if (origin.reversed) parts.push('REVERSED');
  return parts.join(', ');
}

function markText(mark: DraftMarkInfo, edit: DraftEditData): string {
  const strokes = mark.strokes.map((n) => {
    const label = edit.strokes[n - 1]?.label;
    return label ? `${n} (${label})` : String(n);
  });
  const where = [
    strokes.length ? `strokes ${strokes.join(', ')}` : 'no stroke',
    mark.nodes.length ? `nodes ${mark.nodes.join(', ')}` : null,
    mark.edges.length
      ? `edges ${mark.edges.map((e) => `${e.id} (${pct(e.inside)} inside)`).join(', ')}`
      : null
  ].filter(Boolean);
  const note = mark.note.trim() ? `"${mark.note.trim()}"` : '(no note)';
  return `- ${mark.id} at ${pt([mark.x, mark.y])}, radius ${Math.round(mark.r)}: ${note} — ${where.join('; ')}`;
}

export function draftEditContext(edit: DraftEditData, base: TraceStrokesOutput | undefined) {
  const lines = [
    `<admin_draft_edit edit_id="${edit.edit_id}" gesture_id="${edit.gesture_id}" based_on="${edit.base_id}">`,
    'The admin edited the draft in the draft editor. The edited strokes, in their new writing order:'
  ];
  const trace = edit.trace;
  edit.strokes.forEach((spec, index) => {
    const origin = edit.origins[index];
    const points = trace?.strokes[index]?.points ?? edit.preview[index] ?? [];
    const label = spec.label ? `"${spec.label}"` : '(no label)';
    const how = points.length ? describeDirection(points) : '';
    lines.push(
      `${index + 1}. ${label}, ${how}${origin ? ` — ${originText(origin, base)}` : ''}: ${JSON.stringify(spec)}`
    );
  });
  if (edit.deleted.length) {
    lines.push(`Deleted: stroke ${edit.deleted.map((n) => baseName(base, n)).join(', ')}.`);
  }
  if (edit.error) {
    lines.push(`Tracing the edited plan failed: ${edit.error}`);
  } else if (trace) {
    lines.push(
      `Traced as trace_id "${edit.edit_id}": ok ${trace.ok}, coverage ${pct(trace.coverage)}, retraced ${pct(trace.retraced)}${trace.missed_dots.length ? `, missed dots ${trace.missed_dots.join(', ')}` : ''}.`
    );
    if (trace.issues.length) lines.push(`Issues: ${trace.issues.join(' | ')}`);
  }
  if (edit.mark_info?.length) {
    lines.push(
      'Areas the admin marked on the glyph (red rings in the image):',
      ...edit.mark_info.map((mark) => markText(mark, edit))
    );
  }
  lines.push('</admin_draft_edit>');
  return lines.join('\n');
}

/** A one-line summary of an edit for the chat (queued rows, titles). */
export function draftEditSummary(edit: Pick<DraftEditData, 'origins' | 'deleted' | 'marks'>) {
  // position of each stroke in the base draft (halves of a split one after the other)
  const ranks = edit.origins.map((o) => o.from[0]! + (o.split_part === 2 ? 0.5 : 0));
  const moved = ranks.some((rank, i) => i > 0 && rank < ranks[i - 1]!);
  const reversed = edit.origins.filter((o) => o.reversed).length;
  const split = edit.origins.filter((o) => o.split_part === 1).length;
  const joined = edit.origins.filter((o) => o.from.length > 1).length;
  const bits = [
    moved ? 'reordered' : null,
    reversed ? `${reversed} reversed` : null,
    split ? `${split} split` : null,
    joined ? `${joined} joined` : null,
    edit.deleted.length ? `${edit.deleted.length} deleted` : null,
    edit.marks.length ? `${edit.marks.length} marked area${edit.marks.length > 1 ? 's' : ''}` : null
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'no changes';
}
