import {
  canJoin,
  joinPoints,
  reverseSpec,
  splitPoints,
  waypointsSpec
} from '~/agents/gesture_creator/draft_plan';
import type {
  DraftEditData,
  DraftMark,
  DraftStrokeOrigin,
  StrokeSpec,
  TracedGlyph,
  TraceStrokesInput,
  TraceStrokesOutput
} from '~/agents/gesture_creator/schemas';

/**
 * The draft editor's state: the strokes of a draft as the admin reorders, reverses, splits,
 * joins and deletes them, and the edit message built from it. Each edit keeps the stroke plan
 * (so the server can trace it) and the points (so the editor shows it at once).
 */

type Pt = [number, number];

/** A draft the editor can open: an agent's trace or an earlier edit by the admin. */
export type DraftSource = {
  /** trace_strokes call id or edit id: what the edit is based on */
  id: string;
  gesture_id: number;
  glyph?: TracedGlyph;
  strokes: { spec: StrokeSpec; points: Pt[] }[];
  ok?: boolean;
  coverage?: number;
  issues: string[];
};

export type DraftStroke = {
  /** Stable id for drag and drop and React keys */
  key: string;
  spec: StrokeSpec;
  points: Pt[];
  origin: DraftStrokeOrigin;
};

export function draftFromTrace(
  id: string,
  input: TraceStrokesInput,
  output: TraceStrokesOutput
): DraftSource {
  return {
    id,
    gesture_id: output.gesture_id,
    glyph: output.glyph,
    strokes: output.strokes.map((stroke, index) => ({
      spec: input.strokes[index] ?? { waypoints: stroke.points },
      points: stroke.points
    })),
    ok: output.ok,
    coverage: output.coverage,
    issues: output.issues
  };
}

export function draftFromEdit(edit: DraftEditData): DraftSource {
  const traced = edit.trace?.strokes;
  return {
    id: edit.edit_id,
    gesture_id: edit.gesture_id,
    glyph: edit.trace?.glyph,
    strokes: edit.strokes.map((spec, index) => ({
      spec,
      points: traced?.[index]?.points ?? edit.preview[index] ?? []
    })),
    ok: edit.trace?.ok,
    coverage: edit.trace?.coverage,
    issues: edit.error ? [edit.error] : (edit.trace?.issues ?? [])
  };
}

export const initialStrokes = (source: DraftSource): DraftStroke[] =>
  source.strokes.map((stroke, index) => ({
    key: `s${index + 1}`,
    spec: stroke.spec,
    points: stroke.points,
    origin: { from: [index + 1], reversed: false }
  }));

export const reverseStroke = (stroke: DraftStroke): DraftStroke => ({
  ...stroke,
  spec: reverseSpec(stroke.spec),
  points: [...stroke.points].reverse(),
  origin: { ...stroke.origin, reversed: !stroke.origin.reversed }
});

/** Cut a stroke at its point `index`: two freehand strokes along the same line. */
export function splitStroke(stroke: DraftStroke, index: number): [DraftStroke, DraftStroke] | null {
  const halves = splitPoints(stroke.points, index);
  if (!halves) return null;
  const label = stroke.spec.label;
  return [
    {
      key: `${stroke.key}.1`,
      spec: waypointsSpec(halves[0], label),
      points: halves[0],
      origin: { ...stroke.origin, split_part: 1 }
    },
    {
      key: `${stroke.key}.2`,
      spec: waypointsSpec(halves[1], label),
      points: halves[1],
      origin: { ...stroke.origin, split_part: 2 }
    }
  ];
}

const joinable = (a: DraftStroke | undefined, b: DraftStroke | undefined) =>
  !!a && !!b && !('dot' in a.spec) && !('dot' in b.spec);

/**
 * The two strokes turned so that the first ends where the second starts: as they are, or with
 * one or both reversed. Null when their ends never meet.
 */
function joinOrientation(a: DraftStroke, b: DraftStroke): [DraftStroke, DraftStroke] | null {
  const options: [DraftStroke, DraftStroke][] = [
    [a, b],
    [reverseStroke(a), b],
    [a, reverseStroke(b)],
    [reverseStroke(a), reverseStroke(b)]
  ];
  return options.find(([x, y]) => canJoin(x.points, y.points)) ?? null;
}

export const canJoinStrokes = (a: DraftStroke | undefined, b: DraftStroke | undefined) =>
  joinable(a, b) && joinOrientation(a!, b!) !== null;

/**
 * One stroke: `b` drawn on from where `a` ends, without lifting the pen. Either is reversed
 * first when that is what makes their ends meet.
 */
export function joinStrokes(a: DraftStroke, b: DraftStroke): DraftStroke {
  const [first, second] = joinOrientation(a, b) ?? [a, b];
  const points = joinPoints(first.points, second.points);
  const labels = [first.spec.label, second.spec.label].filter(Boolean);
  const label = [...new Set(labels)].join(' + ').slice(0, 40) || undefined;
  return {
    key: `${a.key}+${b.key}`,
    spec: waypointsSpec(points, label),
    points,
    origin: {
      from: [...first.origin.from, ...second.origin.from],
      reversed: first.origin.reversed || second.origin.reversed
    }
  };
}

/** The strokes exactly as the draft had them. */
export const isUnchanged = (strokes: DraftStroke[], source: DraftSource) =>
  strokes.length === source.strokes.length &&
  strokes.every(
    (s, i) =>
      s.origin.from.length === 1 &&
      s.origin.from[0] === i + 1 &&
      !s.origin.reversed &&
      !s.origin.split_part
  );

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 1-based strokes passing through a marked area. */
export const strokesInMark = (strokes: DraftStroke[], mark: Pick<DraftMark, 'x' | 'y' | 'r'>) =>
  strokes.flatMap((s, i) =>
    s.points.some((p) => dist(p, [mark.x, mark.y]) <= mark.r + 3) ? [i + 1] : []
  );

export const nextMarkId = (marks: DraftMark[]) => {
  const used = new Set(marks.map((m) => m.id));
  for (let c = 65; c <= 90; c++) {
    const id = String.fromCharCode(c);
    if (!used.has(id)) return id;
  }
  return 'Z';
};

/** The edit message part's data (the server fills in the trace and the rest). */
export function buildDraftEdit(
  source: DraftSource,
  strokes: DraftStroke[],
  marks: DraftMark[]
): DraftEditData {
  const kept = new Set(strokes.flatMap((s) => s.origin.from));
  return {
    edit_id: `edit-${crypto.randomUUID()}`,
    gesture_id: source.gesture_id,
    base_id: source.id,
    strokes: strokes.map((s) => s.spec),
    origins: strokes.map((s) => s.origin),
    deleted: source.strokes.flatMap((_, i) => (kept.has(i + 1) ? [] : [i + 1])),
    marks: marks.map((m) => ({ ...m, note: m.note.trim() })),
    preview: strokes.map((s) => s.points)
  };
}
