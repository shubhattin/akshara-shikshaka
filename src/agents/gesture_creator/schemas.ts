import { z } from 'zod';
import { AnimationsFunctionsEnumSchema, GestureSchema } from '~/tools/stroke_data/types';
import type { SkeletonKnot as GlyphKnotInfo, StraightThrough } from './glyph_features';

export type { GlyphKnotInfo, StraightThrough };

/**
 * Tool contracts of the Gesture Creator. The tools run on the server; the chat UI renders their
 * outputs, so this file stays free of runtime code from either side.
 */

export const GESTURE_CREATOR_TOOL_NAMES = [
  'inspect_glyph',
  'trace_strokes',
  'propose_gesture'
] as const;
export type GestureCreatorToolName = (typeof GESTURE_CREATOR_TOOL_NAMES)[number];

export const isGestureCreatorToolName = (name: string): name is GestureCreatorToolName =>
  // SAFETY: GESTURE_CREATOR_TOOL_NAMES is the const tuple of valid tool names, so a successful
  // includes check narrows the string to a member of that tuple.
  (GESTURE_CREATOR_TOOL_NAMES as readonly string[]).includes(name);

const point_schema = z.tuple([z.number(), z.number()]);

const stroke_label_schema = z
  .string()
  .max(40)
  .optional()
  .describe(
    'The part of the akṣara this stroke draws, 1–3 plain words shown to the admin, e.g. "Vertical bar", "Loop", "Headline". No direction, no ids.'
  );

// ---------------------------------------------------------------- inspect_glyph

export const inspect_glyph_input_schema = z.object({
  gesture_id: z.int().positive().describe('text_gestures id of the mentioned gesture')
});
export type InspectGlyphInput = z.infer<typeof inspect_glyph_input_schema>;

export type SkeletonNodeInfo = {
  id: string;
  x: number;
  y: number;
  /** end = a pen can start/stop here; junction = 3+ edges meet; loop = anchor of a closed loop */
  kind: 'end' | 'junction' | 'loop';
};

export type SkeletonEdgeInfo = {
  id: string;
  from: string;
  to: string;
  /** Closed loop (from === to): its direction is chosen with `:cw` / `:ccw` */
  closed: boolean;
  length: number;
  /** Stroke width of the glyph along this edge */
  width: number;
  start: [number, number];
  mid: [number, number];
  end: [number, number];
};

export type GlyphDotInfo = { id: string; x: number; y: number; r: number };

/** Images as PNG data URLs; dropped from older outputs before they reach the model again. */
export type HarnessImages = Record<string, string>;

export type InspectGlyphOutput = {
  gesture_id: number;
  text: string;
  script: string;
  font_family: string;
  font_size: number;
  text_center_offset: [number, number];
  /** Bounding box of the glyph ink on the 400×400 canvas: [x0, y0, x1, y1] */
  glyph_box: [number, number, number, number];
  stroke_width: number;
  nodes: SkeletonNodeInfo[];
  edges: SkeletonEdgeInfo[];
  dots: GlyphDotInfo[];
  /** Round blobs of ink thicker than the strokes into them (filled-in loops, curls, ball ends); absent in older chats */
  knots?: GlyphKnotInfo[];
  /** Edge ends that run straight into each other at junctions and crossings; absent in older chats */
  straight_through?: StraightThrough[];
  images: HarnessImages;
  images_omitted?: boolean;
};

// ---------------------------------------------------------------- trace_strokes

export const stroke_spec_schema = z.union([
  z
    .object({
      path: z
        .array(z.string())
        .min(1)
        .describe(
          'Node, edge, node, edge, … e.g. ["N2","E2","N4","E1","N6"]. Loop edges take a direction: "E4:cw" / "E4:ccw" (as seen on screen). Lift the pen mid-edge with "E2|to=240,120" (stop near that point) or start mid-edge with "E2|from=240,120". Add a knot anywhere in the path ("K1", "K1:ccw") to draw a small closed loop inside it where the stroke passes.'
        ),
      label: stroke_label_schema
    })
    .strict(),
  z
    .object({
      waypoints: z
        .array(point_schema)
        .min(2)
        .describe(
          'Freehand: canvas points along the centre of the glyph stroke, in drawing order, ~10–25 px apart; a smooth curve is fitted through them.'
        ),
      label: stroke_label_schema
    })
    .strict(),
  z
    .object({
      dot: point_schema.describe('A dot (bindu, nukta…): its centre'),
      label: stroke_label_schema
    })
    .strict()
]);
export type StrokeSpec = z.infer<typeof stroke_spec_schema>;

export const trace_strokes_input_schema = z.object({
  gesture_id: z.int().positive(),
  strokes: z.array(stroke_spec_schema).min(1).max(12).describe('Strokes in writing order'),
  note: z.string().max(300).optional().describe('What changed from the previous attempt')
});
export type TraceStrokesInput = z.infer<typeof trace_strokes_input_schema>;

export type TracedStroke = {
  index: number;
  /** The plan's name for the part this stroke draws */
  label?: string;
  points: [number, number][];
  length: number;
  start: [number, number];
  end: [number, number];
  /** Share of points outside the glyph ink */
  off_ink: number;
};

/** The glyph settings a draft was traced against; a proposal is refused if they changed since. */
export type TracedGlyph = {
  font_family: string;
  font_size: number;
  text_center_offset: [number, number];
};

export type TraceStrokesOutput = {
  gesture_id: number;
  glyph: TracedGlyph;
  /** No blocking issue found (coverage, ink, retracing, dots). Still review the images. */
  ok: boolean;
  strokes: TracedStroke[];
  /** Share of the glyph skeleton covered by some stroke */
  coverage: number;
  uncovered: { edge: string; fraction: number; from: [number, number]; to: [number, number] }[];
  /** Share of the skeleton drawn twice (outside junctions) */
  retraced: number;
  missed_dots: string[];
  issues: string[];
  images: HarnessImages;
  images_omitted?: boolean;
};

// ---------------------------------------------------------------- propose_gesture

export const GESTURE_PACE_RANGE = { min: 100, max: 1500 } as const;
export const GESTURE_WIDTH_RANGE = { min: 6, max: 15 } as const;

export const propose_gesture_input_schema = z.object({
  trace_id: z
    .string()
    .min(1)
    .describe(
      'toolCallId of the trace_strokes call whose strokes to propose (usually the last one)'
    ),
  pace_ms: z
    .int()
    .min(GESTURE_PACE_RANGE.min)
    .max(GESTURE_PACE_RANGE.max)
    .describe(
      'Animation pace: ms to draw a 200 px stroke (longer strokes take longer). Default 600.'
    ),
  anim_fn: AnimationsFunctionsEnumSchema.describe('Easing of each stroke. Default "linear".'),
  width: z
    .int()
    .min(GESTURE_WIDTH_RANGE.min)
    .max(GESTURE_WIDTH_RANGE.max)
    .optional()
    .describe('Brush width, default 12'),
  summary: z.string().min(1).max(600).describe('Stroke order in words, shown to the admin')
});
export type ProposeGestureInput = z.infer<typeof propose_gesture_input_schema>;

export const proposed_gesture_schema = z.object({
  gesture_id: z.int().positive(),
  uuid: z.uuid(),
  text: z.string(),
  script_id: z.int(),
  font_family: z.string(),
  font_size: z.number(),
  text_center_offset: point_schema,
  gestures: z.array(GestureSchema).min(1),
  summary: z.string()
});
export type ProposedGesture = z.infer<typeof proposed_gesture_schema>;

export type ProposeGestureOutput =
  | { ok: true; proposal: ProposedGesture }
  | { ok: false; error: string };

// ---------------------------------------------------------------- admin draft edits

/**
 * The admin's edit of a draft in the draft editor: the strokes reordered, reversed, split,
 * joined or deleted, plus areas marked on the glyph with notes. Sent as a `data-draft_edit` part
 * of a user message; the server traces the edited plan when the message arrives (`trace`,
 * `context`), so the agent can propose it like one of its own traces.
 */

export const MAX_DRAFT_MARKS = 6;

export const draft_mark_schema = z.object({
  /** "A", "B", … as drawn on the glyph */
  id: z.string().min(1).max(2),
  x: z.number().min(0).max(400),
  y: z.number().min(0).max(400),
  r: z.number().min(4).max(200),
  note: z.string().max(300)
});
export type DraftMark = z.infer<typeof draft_mark_schema>;

/** How an edited stroke came about, for the summary the agent reads. */
export const draft_stroke_origin_schema = z.object({
  /** 1-based numbers of the strokes of the base draft it is made of (two when joined) */
  from: z.array(z.int().positive()).min(1).max(12),
  reversed: z.boolean(),
  /** One half of a stroke the admin split: 1 = first, 2 = second */
  split_part: z.union([z.literal(1), z.literal(2)]).optional()
});
export type DraftStrokeOrigin = z.infer<typeof draft_stroke_origin_schema>;

export type DraftMarkInfo = DraftMark & {
  /** 1-based strokes of the edited plan passing through the area */
  strokes: number[];
  nodes: string[];
  /** Skeleton edges inside the area and the share of each that lies inside */
  edges: { id: string; inside: number }[];
};

export const draft_edit_schema = z.object({
  /** Id of this edit; its trace is proposed with `propose_gesture({ trace_id: edit_id })` */
  edit_id: z.string().min(1).max(64),
  gesture_id: z.int().positive(),
  /** The draft edited: a trace_strokes call id, or an earlier edit's id */
  base_id: z.string().min(1).max(200),
  strokes: z.array(stroke_spec_schema).min(1).max(12),
  origins: z.array(draft_stroke_origin_schema).min(1).max(12),
  /** 1-based strokes of the base draft the admin deleted */
  deleted: z.array(z.int().positive()).max(12),
  marks: z.array(draft_mark_schema).max(MAX_DRAFT_MARKS),
  /** Points of the edited strokes as the admin saw them (display only, never proposed) */
  preview: z.array(z.array(point_schema)).max(12),
  // Filled by the server when the message arrives; anything the client sends here is replaced.
  trace: z.custom<TraceStrokesOutput>().optional(),
  mark_info: z.custom<DraftMarkInfo[]>().optional(),
  error: z.string().optional(),
  context: z.string().optional()
});
export type DraftEditData = z.infer<typeof draft_edit_schema>;

/** The draft with the admin's marks drawn on it, for the model (filled by the server). */
export const draft_image_schema = z.object({
  edit_id: z.string().min(1).max(64),
  /** PNG data URL; emptied in older messages to save context */
  url: z.string()
});
export type DraftImageData = z.infer<typeof draft_image_schema>;

// ---------------------------------------------------------------- saved strokes, on request

/**
 * The admin shows the agent the strokes saved for the focused gesture (to critique them) or for
 * a sibling script's version (to match its stroke order). The agent otherwise never sees saved
 * strokes; this part is the explicit exception. Sent as a `data-saved_view` part of a user
 * message; the server fills the context and adds the image as a `data-draft_image` part with
 * `edit_id = view_id`.
 */
export const saved_view_schema = z.object({
  view_id: z.string().min(1).max(64),
  gesture_id: z.int().positive(),
  /** Why the admin shares it: what is wrong with it, or the order to match */
  purpose: z.enum(['critique', 'sibling']),
  marks: z.array(draft_mark_schema).max(MAX_DRAFT_MARKS),
  // Filled by the server when the message arrives; anything the client sends here is replaced.
  revision: z.int().optional(),
  text: z.string().optional(),
  script_id: z.int().optional(),
  error: z.string().optional(),
  context: z.string().optional()
});
export type SavedViewData = z.infer<typeof saved_view_schema>;

// ---------------------------------------------------------------- per-gesture notes

export const suggest_gesture_note_input_schema = z.object({
  gesture_id: z.int().positive().describe('text_gestures id of the gesture the note is about'),
  note: z
    .string()
    .min(1)
    .max(600)
    .describe(
      'One short, lasting fact about drawing this gesture that a later chat should know (stroke order, a part that is easy to miss, a convention the admin confirmed). Not a summary of this chat.'
    )
});
export type SuggestGestureNoteInput = z.infer<typeof suggest_gesture_note_input_schema>;

export type SuggestGestureNoteOutput =
  | { ok: true; gesture_id: number; text: string; script_id: number; note: string }
  | { ok: false; error: string };
