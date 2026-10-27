import { get_script_from_id } from '~/state/lang_list';
import type { Gesture } from '~/tools/stroke_data/types';
import { DEFAULTS } from '~/components/pages/gesture_add_edit/gesture_add_edit_state';
import { evaluateDraft } from './evaluate';
import type { CanvasEnv } from './canvas_env';
import { inkLookup, rasterizeGlyph } from './glyph_raster';
import {
  renderGlyphImage,
  renderOrderStrip,
  renderSkeletonImage,
  renderStrokesImage
} from './render_images';
import {
  type HarnessImages,
  type InspectGlyphInput,
  type InspectGlyphOutput,
  type ProposeGestureInput,
  type ProposeGestureOutput,
  type TraceStrokesInput,
  type TraceStrokesOutput,
  type TracedGlyph,
  type TracedStroke
} from './schemas';
import { buildSkeletonGraph, type GlyphMask, type SkeletonGraph } from './skeleton';
import { buildStroke, pathLength } from './strokes';

/**
 * The Gesture Creator's tools. They run on the server (see `server/gesture_harness.ts`), with the
 * glyph rendered in the same font and placement as the editor, so the model traces exactly what
 * learners will see.
 */

export type HarnessGesture = {
  id: number;
  uuid: string;
  text: string;
  script_id: number;
  font_family: string;
  font_size: number;
  text_center_offset: [number, number];
  gestures: Gesture[];
};

type Pt = [number, number];

type Session = {
  gesture: HarnessGesture;
  mask: GlyphMask;
  graph: SkeletonGraph;
  onInk: (p: Pt) => boolean;
};

export class HarnessCancelledError extends Error {
  constructor() {
    super('Cancelled by the admin');
  }
}

/** A part of a stored message the harness reads back (the trace a proposal refers to). */
type ToolPartLike = { type: string; toolCallId?: string; state?: string; output?: unknown };

/** The finished `trace_strokes` output with this call id among stored message parts. */
export function findTraceInMessages(
  messages: readonly { parts: readonly ToolPartLike[] }[],
  traceId: string
): TraceStrokesOutput | undefined {
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === 'tool-trace_strokes' &&
        part.toolCallId === traceId &&
        part.state === 'output-available'
      ) {
        // SAFETY: output of a trace_strokes part this harness produced earlier in the chat.
        return part.output as TraceStrokesOutput;
      }
    }
  }
  return undefined;
}

const glyphKey = (g: TracedGlyph) =>
  `${g.font_family}|${g.font_size}|${g.text_center_offset.join(',')}`;

const glyphOf = (gesture: HarnessGesture): TracedGlyph => ({
  font_family: gesture.font_family,
  font_size: gesture.font_size,
  text_center_offset: [...gesture.text_center_offset]
});

export function createGestureHarness(deps: {
  env: CanvasEnv;
  loadGesture: (id: number) => Promise<HarnessGesture>;
  /** An earlier trace of this chat by its tool call id (what a proposal refers to). */
  findTrace: (traceId: string) => TraceStrokesOutput | undefined;
}) {
  const { env } = deps;
  /** Rendered glyph + skeleton per gesture and glyph settings (stable node/edge ids across calls). */
  const sessions = new Map<string, Promise<Session>>();

  const openSession = async (id: number): Promise<Session> => {
    const gesture = await deps.loadGesture(id);
    const key = `${id}|${glyphKey(glyphOf(gesture))}`;
    let session = sessions.get(key);
    if (!session) {
      session = (async () => {
        const mask = await rasterizeGlyph(gesture, env);
        return { gesture, mask, graph: buildSkeletonGraph(mask), onInk: inkLookup(mask, 2) };
      })();
      session.catch(() => sessions.delete(key));
      sessions.set(key, session);
    }
    // always hand back the freshest gesture row (saved strokes may have changed)
    return { ...(await session), gesture };
  };

  const savedStrokes = (gesture: HarnessGesture) =>
    [...gesture.gestures].sort((a, b) => a.index - b.index).map((g) => g.points);

  async function inspect(
    input: InspectGlyphInput,
    signal: AbortSignal
  ): Promise<InspectGlyphOutput> {
    const { gesture, mask, graph } = await openSession(input.gesture_id);
    if (signal.aborted) throw new HarnessCancelledError();
    const saved = savedStrokes(gesture).filter((s) => s.length > 0);
    const images: HarnessImages = {
      glyph: renderGlyphImage(env, mask),
      skeleton: renderSkeletonImage(env, mask, graph)
    };
    if (input.show_existing !== false && saved.length > 0) {
      images.saved = renderStrokesImage(
        env,
        mask,
        saved.map((points, index) => ({
          points,
          width: gesture.gestures[index]?.width ?? DEFAULTS.GESTURE_BRUSH_WIDTH
        }))
      );
    }
    return {
      gesture_id: gesture.id,
      text: gesture.text,
      script: get_script_from_id(gesture.script_id) ?? String(gesture.script_id),
      ...glyphOf(gesture),
      glyph_box: graph.box,
      stroke_width: graph.strokeWidth,
      nodes: graph.nodes.map(({ id, x, y, kind }) => ({ id, x, y, kind })),
      edges: graph.edges.map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        closed: e.closed,
        length: e.length,
        width: e.width,
        start: e.points[0]!,
        mid: e.points[Math.floor(e.points.length / 2)]!,
        end: e.points.at(-1)!
      })),
      dots: graph.dots,
      existing_strokes: saved.length,
      images
    };
  }

  async function trace(input: TraceStrokesInput, signal: AbortSignal): Promise<TraceStrokesOutput> {
    const { gesture, mask, graph, onInk } = await openSession(input.gesture_id);
    if (signal.aborted) throw new HarnessCancelledError();
    const onStrictInk = inkLookup(mask, 0.5);
    const built = input.strokes.map((spec, index) => {
      try {
        return buildStroke(spec, graph, onStrictInk);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Stroke ${index + 1}: ${message}`);
      }
    });
    const strokes = built.map((s) => s.points);
    const evaluation = evaluateDraft({ graph, strokes, onInk, saved: savedStrokes(gesture) });
    const width = DEFAULTS.GESTURE_BRUSH_WIDTH;
    const drawn = strokes.map((points) => ({ points, width }));
    return {
      gesture_id: gesture.id,
      glyph: glyphOf(gesture),
      ok: evaluation.ok,
      strokes: strokes.map((points, index): TracedStroke => {
        const stroke: TracedStroke = {
          index,
          points,
          length: Math.round(pathLength(points)),
          start: points[0]!,
          end: points.at(-1)!,
          off_ink: evaluation.perStroke[index]!.off_ink
        };
        const reference = evaluation.perStroke[index]!.reference;
        if (reference) {
          stroke.reference = reference;
        }
        return stroke;
      }),
      coverage: evaluation.coverage,
      uncovered: evaluation.uncovered,
      retraced: evaluation.retraced,
      missed_dots: evaluation.missed_dots,
      issues: evaluation.issues,
      images: {
        strokes: renderStrokesImage(env, mask, drawn, { uncovered: evaluation.gaps }),
        order: renderOrderStrip(env, mask, drawn, graph.box)
      }
    };
  }

  async function propose(input: ProposeGestureInput): Promise<ProposeGestureOutput> {
    const traced = deps.findTrace(input.trace_id);
    if (!traced) {
      return {
        ok: false,
        error: `No finished trace_strokes call with id ${input.trace_id} in this chat`
      };
    }
    const gesture = await deps.loadGesture(traced.gesture_id);
    if (glyphKey(glyphOf(gesture)) !== glyphKey(traced.glyph)) {
      return {
        ok: false,
        error:
          'The glyph font, size or position changed since that trace. Inspect the glyph again and retrace.'
      };
    }
    const width = input.width ?? DEFAULTS.GESTURE_BRUSH_WIDTH;
    const gestures: Gesture[] = traced.strokes.map((stroke, index) => ({
      index,
      width,
      color: DEFAULTS.GESTURE_BRUSH_COLOR,
      duration: input.pace_ms,
      anim_fn: input.anim_fn,
      simulate_pressure: DEFAULTS.GESTURE_SIMULATE_PRESSURE,
      points: stroke.points
    }));
    return {
      ok: true,
      proposal: {
        gesture_id: gesture.id,
        uuid: gesture.uuid,
        text: gesture.text,
        script_id: gesture.script_id,
        ...glyphOf(gesture),
        gestures,
        summary: input.summary
      }
    };
  }

  const checked =
    <I, O>(run: (input: I, signal: AbortSignal) => Promise<O>) =>
    (input: I, signal: AbortSignal) => {
      if (signal.aborted) throw new HarnessCancelledError();
      return run(input, signal);
    };

  return {
    inspect: checked(inspect),
    trace: checked(trace),
    propose: checked((input: ProposeGestureInput) => propose(input))
  };
}

export type GestureHarness = ReturnType<typeof createGestureHarness>;
