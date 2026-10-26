import { z } from 'zod';
import { AnimationsFunctionsEnumSchema, GestureSchema } from '~/tools/stroke_data/types';

/**
 * Tool contracts of the Gesture Creator. The tools run in the admin's browser (they need the
 * glyph rendered on a canvas): the server only declares them, the chat page executes each call
 * and sends the output back. Shared by both sides, so this file stays free of browser code.
 */

export const GESTURE_CREATOR_TOOL_NAMES = ['inspect_glyph', 'trace_strokes', 'propose_gesture'] as const;
export type GestureCreatorToolName = (typeof GESTURE_CREATOR_TOOL_NAMES)[number];

export const isGestureCreatorToolName = (name: string): name is GestureCreatorToolName =>
  (GESTURE_CREATOR_TOOL_NAMES as readonly string[]).includes(name);

const point_schema = z.tuple([z.number(), z.number()]);

// ---------------------------------------------------------------- inspect_glyph

export const inspect_glyph_input_schema = z.object({
  gesture_id: z.int().positive().describe('text_gestures id of the mentioned gesture'),
  show_existing: z
    .boolean()
    .optional()
    .describe('Also render the strokes currently saved for this gesture (if any). Default true.')
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
  existing_strokes: number;
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
          'Node, edge, node, edge, … e.g. ["N2","E2","N4","E1","N6"]. Loop edges take a direction: "E4:cw" / "E4:ccw" (as seen on screen). Lift the pen mid-edge with "E2|to=240,120" (stop near that point) or start mid-edge with "E2|from=240,120".'
        )
    })
    .strict(),
  z
    .object({
      waypoints: z
        .array(point_schema)
        .min(2)
        .describe(
          'Freehand: canvas points along the centre of the glyph stroke, in drawing order, ~10–25 px apart; a smooth curve is fitted through them.'
        )
    })
    .strict(),
  z.object({ dot: point_schema.describe('A dot (bindu, nukta…): its centre') }).strict()
]);
export type StrokeSpec = z.infer<typeof stroke_spec_schema>;

export const trace_strokes_input_schema = z.object({
  gesture_id: z.int().positive(),
  strokes: z.array(stroke_spec_schema).min(1).max(12).describe('Strokes in writing order'),
  note: z.string().max(300).optional().describe('What changed from the previous attempt')
});
export type TraceStrokesInput = z.infer<typeof trace_strokes_input_schema>;

export type ReferenceCheck = {
  /** This stroke scored against the saved stroke with the same index (as if a learner drew it) */
  against_saved: { passed: boolean; score: number; issue: string | null; matched_stroke?: number };
  /** The saved stroke scored with this draft as the practice reference */
  saved_against_draft: { passed: boolean; score: number; issue: string | null };
};

export type TracedStroke = {
  index: number;
  points: [number, number][];
  length: number;
  start: [number, number];
  end: [number, number];
  /** Share of points outside the glyph ink */
  off_ink: number;
  reference?: ReferenceCheck;
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
  /** No blocking issue found (coverage, ink, reference). Still review the images. */
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
    .describe('toolCallId of the trace_strokes call whose strokes to propose (usually the last one)'),
  pace_ms: z
    .int()
    .min(GESTURE_PACE_RANGE.min)
    .max(GESTURE_PACE_RANGE.max)
    .describe('Animation pace: ms to draw a 200 px stroke (longer strokes take longer). Default 600.'),
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

export type ProposeGestureOutput = { ok: true; proposal: ProposedGesture } | { ok: false; error: string };
