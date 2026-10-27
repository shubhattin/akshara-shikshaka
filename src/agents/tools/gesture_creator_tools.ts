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
  trace_strokes_input_schema,
  type HarnessImages,
  type InspectGlyphInput,
  type InspectGlyphOutput,
  type ProposeGestureInput,
  type ProposeGestureOutput,
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
  saved:
    'Strokes currently saved for this gesture: numbered at their start, arrows show direction.',
  strokes:
    'Your draft over the faint glyph: numbered at each start dot, arrows show direction; red dashes = glyph parts no stroke covers.',
  order: 'Writing order: one panel per stroke, earlier strokes grey, the current one coloured.'
} as const satisfies Record<string, string>;

type HarnessImageCaptionName = keyof typeof IMAGE_CAPTIONS;

function isCaptionName(name: string): name is HarnessImageCaptionName {
  return name in IMAGE_CAPTIONS;
}

/** Human label for a harness image, falling back to the raw name. */
function captionForImage(name: string): string {
  return isCaptionName(name) ? IMAGE_CAPTIONS[name] : name;
}

function imageParts(
  images: HarnessImages | undefined,
  omitted: boolean | undefined
): ContentPart[] {
  if (omitted || !images) {
    return [{ type: 'text', text: '(Images of this older call are omitted to save context.)' }];
  }
  return Object.entries(images).flatMap(([name, url]): ContentPart[] => {
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
    "Render a gesture's glyph exactly as learners see it and return its skeleton graph: nodes (pen ends, junctions), edges (centreline runs with ids), dots, plus images of the glyph on a grid, the labelled skeleton and the saved strokes. Call this first for a mentioned gesture.",
  inputSchema: inspect_glyph_input_schema,
  // produced by our own harness; stored as-is
  outputSchema: z.custom<InspectGlyphOutput>(),
  toModelOutput: ({ output }) => {
    const { images, images_omitted, ...data } = output;
    return {
      type: 'content',
      value: [{ type: 'text', text: JSON.stringify(data) }, ...imageParts(images, images_omitted)]
    };
  }
});

const traceStrokesTool = tool<TraceStrokesInput, TraceStrokesOutput>({
  description:
    'Draw a draft of the gesture: strokes in writing order, each a walk over the skeleton graph (path), freehand waypoints, or a dot. Returns self-checks (coverage of the glyph, ink, retracing, dots, and scores against the saved strokes if any) and images of the draft and its order. Look at the images, fix and call again until it is right.',
  inputSchema: trace_strokes_input_schema,
  outputSchema: z.custom<TraceStrokesOutput>(),
  toModelOutput: ({ toolCallId, output }) => {
    const { images, images_omitted, strokes, ...data } = output;
    const summary = {
      trace_id: toolCallId,
      ...data,
      strokes: strokes.map(({ points, ...stroke }) => ({ ...stroke, points: points.length }))
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

/**
 * The tools for one request. `history` is the stored conversation: a proposal refers to its trace
 * by call id, which may come from this request or an earlier one.
 */
export function createGestureCreatorTools(history: readonly AgentUIMessage[]) {
  const traces = new Map<string, TraceStrokesOutput>();
  const harness = createGestureHarness({
    env: serverCanvasEnv,
    loadGesture: (id) => appRuntime.runPromise(getGestureForAgent(id)),
    findTrace: (traceId) => traces.get(traceId) ?? findTraceInMessages(history, traceId)
  });
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
    })
  };
}
