import { tool } from 'ai';
import { z } from 'zod';
import { createGestureHarness, findTraceInMessages } from '~/agents/gesture_creator/harness';
import { serverCanvasEnv } from '~/agents/gesture_creator/server_canvas.server';
import { getGestureForAgent } from '~/agents/server/gestures';
import type { AgentUIMessage } from '~/agents/ui_message';
import { appRuntime } from '~/effect/runtime';
import {
  inspect_glyph_input_schema,
  propose_gesture_input_schema,
  suggest_gesture_note_input_schema,
  trace_strokes_input_schema,
  type HarnessImages,
  type InspectGlyphInput,
  type InspectGlyphOutput,
  type ProposeGestureInput,
  type ProposeGestureOutput,
  type SuggestGestureNoteInput,
  type SuggestGestureNoteOutput,
  type TraceStrokesInput,
  type TraceStrokesOutput
} from '~/agents/gesture_creator/schemas';

/**
 * The Gesture Creator tools, run on the server against the glyph rendered like the editor.
 * `toModelOutput` turns the stored images into image parts and drops stroke points.
 */

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image-data'; data: string; mediaType: string };

const IMAGE_CAPTIONS = {
  glyph: 'The glyph on the 400×400 canvas with a coordinate grid (labels every 50).',
  skeleton:
    'Skeleton graph over the faint glyph: coloured, labelled edges (E…), black nodes (N…), dots ringed (D…).',
  strokes:
    'Your draft over the faint glyph: numbered at each start dot, arrows show direction; red dashes = glyph parts no stroke covers.',
  order: 'Writing order: one panel per stroke, earlier strokes grey, the current one coloured.',
  closeups:
    'Close-ups of the knots (K…) and crossings (N…–N…) with your strokes: check each loop is closed, turns the right way and crosses straight through.'
} as const satisfies Record<string, string>;

type HarnessImageCaptionName = keyof typeof IMAGE_CAPTIONS;

function isCaptionName(name: string): name is HarnessImageCaptionName {
  return name in IMAGE_CAPTIONS;
}

/** Human label for a harness image, falling back to the raw name. */
function captionForImage(name: string): string {
  return isCaptionName(name) ? IMAGE_CAPTIONS[name] : name;
}

/**
 * What older stored outputs carried about the strokes saved for the gesture (an image, a count,
 * scores against them). The agent works from the glyph alone, so it never sees them.
 */
const SAVED_IMAGE = 'saved';
const isSavedNote = (issue: string) => issue.startsWith('Note: ') && issue.includes('saved');

function imageParts(
  images: HarnessImages | undefined,
  omitted: boolean | undefined
): ContentPart[] {
  if (omitted || !images) {
    return [{ type: 'text', text: '(Images of this older call are omitted to save context.)' }];
  }
  return Object.entries(images).flatMap(([name, url]): ContentPart[] => {
    if (name === SAVED_IMAGE) return [];
    const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(url);
    if (!match) return [];
    return [
      { type: 'text', text: captionForImage(name) },
      { type: 'image-data', mediaType: match[1]!, data: match[2]! }
    ];
  });
}

const inspectGlyphTool = tool<InspectGlyphInput, InspectGlyphOutput>({
  description:
    'Render a gesture\'s glyph exactly as learners see it and return its skeleton graph: nodes (pen ends, junctions), edges (centreline runs with ids), dots, knots (K…: round blobs of ink — filled-in loops, starting curls, ball ends), straight_through (edge ends that run straight into each other at junctions and crossings, "E5@N4" = edge E5 where it meets N4), plus images of the glyph on a grid and the labelled skeleton. Call this first for a mentioned gesture.',
  inputSchema: inspect_glyph_input_schema,
  // produced by our own harness; stored as-is
  outputSchema: z.custom<InspectGlyphOutput>(),
  toModelOutput: ({ output }) => {
    // SAFETY: older stored outputs may still carry `existing_strokes`; it is dropped unseen.
    const {
      images,
      images_omitted,
      existing_strokes: _saved,
      ...data
    } = output as InspectGlyphOutput & {
      existing_strokes?: number;
    };
    return {
      type: 'content',
      value: [{ type: 'text', text: JSON.stringify(data) }, ...imageParts(images, images_omitted)]
    };
  }
});

const traceStrokesTool = tool<TraceStrokesInput, TraceStrokesOutput>({
  description:
    'Draw a draft of the gesture: strokes in writing order, each a walk over the skeleton graph (path, optionally with knot loops "K1"), freehand waypoints, or a dot. Returns self-checks (coverage of the glyph, ink, retracing, dots) and images of the draft, its order and close-ups of knots and crossings. Look at the images, fix and call again until it is right.',
  inputSchema: trace_strokes_input_schema,
  outputSchema: z.custom<TraceStrokesOutput>(),
  toModelOutput: ({ toolCallId, output }) => {
    const { images, images_omitted, strokes, ...data } = output;
    const summary = {
      trace_id: toolCallId,
      ...data,
      // numbered from 1, as in the images and the admin's draft editor
      issues: data.issues.filter((issue) => !isSavedNote(issue)),
      strokes: strokes.map((traced) => {
        // SAFETY: older stored outputs may still carry `reference` (scores against saved strokes).
        const {
          points,
          index,
          reference: _reference,
          ...stroke
        } = traced as typeof traced & {
          reference?: unknown;
        };
        return { stroke: index + 1, ...stroke, points: points.length };
      })
    };
    return {
      type: 'content',
      value: [
        { type: 'text', text: JSON.stringify(summary) },
        ...imageParts(images, images_omitted)
      ]
    };
  }
});

const proposeGestureTool = tool<ProposeGestureInput, ProposeGestureOutput>({
  description:
    'Propose a finished trace to the admin with its animation pace and easing. It appears as a card with an Apply button (preview, practice, replace confirmation); nothing is saved until the admin applies it.',
  inputSchema: propose_gesture_input_schema,
  outputSchema: z.custom<ProposeGestureOutput>(),
  toModelOutput: ({ output }) => ({
    type: 'text',
    value: output.ok
      ? `Proposed ${output.proposal.gestures.length} strokes for ${output.proposal.text} (#${output.proposal.gesture_id}). The admin can now preview, practise and apply it.`
      : `Proposal failed: ${output.error}`
  })
});

/** A focused chat's tools work on its gesture only. */
function assertFocus(focusId: number | null, id: number) {
  if (focusId !== null && id !== focusId) {
    throw new Error(
      `This chat is focused on gesture #${focusId}; it cannot work on #${id}. Ask the admin to start a free chat for that gesture.`
    );
  }
}

/** The harness on the server, reading gestures from the database. */
export const createServerGestureHarness = (
  findTrace: (traceId: string) => TraceStrokesOutput | undefined,
  focusId: number | null = null
) =>
  createGestureHarness({
    env: serverCanvasEnv,
    loadGesture: (id) => {
      assertFocus(focusId, id);
      return appRuntime.runPromise(getGestureForAgent(id));
    },
    findTrace
  });

const suggestGestureNoteTool = tool<SuggestGestureNoteInput, SuggestGestureNoteOutput>({
  description:
    'Suggest a short lasting note for a gesture (how to draw it: an order, a direction, a part that is easy to miss). It appears as a card the admin can save to the gesture; later chats focused on it read the saved notes. Nothing is saved until the admin accepts.',
  inputSchema: suggest_gesture_note_input_schema,
  outputSchema: z.custom<SuggestGestureNoteOutput>(),
  toModelOutput: ({ output }) => ({
    type: 'text',
    value: output.ok
      ? `Suggested the note for ${output.text} (#${output.gesture_id}); the admin decides whether to save it.`
      : `Note not suggested: ${output.error}`
  })
});

/**
 * The tools for one request. `history` returns the conversation so far: a proposal refers to its
 * trace by id, which may come from this request, an earlier one, or an admin's draft edit in the
 * new message.
 */
export function createGestureCreatorTools(
  history: () => readonly AgentUIMessage[],
  /** A focused chat's gesture (null in free chats) */
  focusId: number | null = null
) {
  const traces = new Map<string, TraceStrokesOutput>();
  const harness = createServerGestureHarness(
    (traceId) => traces.get(traceId) ?? findTraceInMessages(history(), traceId),
    focusId
  );
  const signalOf = (signal: AbortSignal | undefined) => signal ?? new AbortController().signal;
  return {
    inspect_glyph: tool<InspectGlyphInput, InspectGlyphOutput>({
      ...inspectGlyphTool,
      execute: (input, { abortSignal }) => harness.inspect(input, signalOf(abortSignal))
    }),
    trace_strokes: tool<TraceStrokesInput, TraceStrokesOutput>({
      ...traceStrokesTool,
      execute: async (input, { toolCallId, abortSignal }) => {
        const output = await harness.trace(input, signalOf(abortSignal));
        traces.set(toolCallId, output);
        return output;
      }
    }),
    propose_gesture: tool<ProposeGestureInput, ProposeGestureOutput>({
      ...proposeGestureTool,
      execute: (input, { abortSignal }) => harness.propose(input, signalOf(abortSignal))
    }),
    suggest_gesture_note: tool<SuggestGestureNoteInput, SuggestGestureNoteOutput>({
      ...suggestGestureNoteTool,
      execute: async (input): Promise<SuggestGestureNoteOutput> => {
        if (focusId !== null && input.gesture_id !== focusId) {
          return { ok: false, error: `This chat is focused on gesture #${focusId}.` };
        }
        const gesture = await appRuntime
          .runPromise(getGestureForAgent(input.gesture_id))
          .catch(() => null);
        if (!gesture) return { ok: false, error: `No gesture #${input.gesture_id}.` };
        return {
          ok: true,
          gesture_id: gesture.id,
          text: gesture.text,
          script_id: gesture.script_id,
          note: input.note.trim()
        };
      }
    })
  };
}
