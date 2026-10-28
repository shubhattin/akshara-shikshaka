import type { AgentUIMessage } from '~/agents/ui_message';
import { get_script_from_id } from '~/state/lang_list';
import type { Gesture } from '~/tools/stroke_data/types';
import { DEFAULTS } from '~/components/pages/gesture_add_edit/gesture_add_edit_state';
import { evaluateDraft } from './evaluate';
import type { CanvasEnv } from './canvas_env';
import { inkClearance, inkLookup, rasterizeGlyph } from './glyph_raster';
import {
  renderCloseups,
  renderGlyphImage,
  renderOrderStrip,
  renderSkeletonImage,
  renderStrokesImage,
  type CloseupArea
} from './render_images';
import {
  type DraftMark,
  type DraftMarkInfo,
  type HarnessImages,
  type InspectGlyphInput,
  type InspectGlyphOutput,
  type ProposeGestureInput,
  type ProposeGestureOutput,
  type StrokeSpec,
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
  clearance: (p: Pt) => number;
};

export class HarnessCancelledError extends Error {
  constructor() {
    super('Cancelled by the admin');
  }
}

/**
 * The finished trace with this id among stored messages: a `trace_strokes` call, or an admin's
 * draft edit (traced by the server when it arrived).
 */
export function findTraceInMessages(
  messages: readonly AgentUIMessage[],
  traceId: string
): TraceStrokesOutput | undefined {
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === 'tool-trace_strokes' &&
        part.toolCallId === traceId &&
        part.state === 'output-available'
      ) {
        return part.output;
      }
      if (part.type === 'data-draft_edit' && part.data.edit_id === traceId && part.data.trace) {
        return part.data.trace;
      }
    }
  }
  return undefined;
}

const glyphKey = (g: TracedGlyph) =>
  `${g.font_family}|${g.font_size}|${g.text_center_offset.join(',')}`;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Where an area the admin marked falls on the skeleton and on the edited strokes. */
function placeMark(mark: DraftMark, graph: SkeletonGraph, strokes: Pt[][]): DraftMarkInfo {
  const at: Pt = [mark.x, mark.y];
  const inside = (p: Pt, slack = 0) => dist(p, at) <= mark.r + slack;
  return {
    ...mark,
    strokes: strokes.flatMap((points, index) =>
      points.some((p) => inside(p, 3)) ? [index + 1] : []
    ),
    nodes: graph.nodes.filter((n) => inside([n.x, n.y], 2)).map((n) => n.id),
    edges: graph.edges.flatMap((edge) => {
      const share = edge.points.filter((p) => inside(p)).length / edge.points.length;
      return share > 0 ? [{ id: edge.id, inside: Math.round(share * 100) / 100 }] : [];
    })
  };
}

export type TracedEdit =
  | { ok: true; trace: TraceStrokesOutput; mark_info: DraftMarkInfo[]; image: string }
  | { ok: false; error: string };

/** Small places worth a closer look in every draft: knots and crossings. */
function closeupAreas(graph: SkeletonGraph): CloseupArea[] {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const knots = graph.knots.map((k) => ({
    label: k.id,
    x: k.x,
    y: k.y,
    r: k.r + graph.strokeWidth
  }));
  const crossings = graph.straight.flatMap((s): CloseupArea[] => {
    if (!s.via) return [];
    const [a, b] = s.nodes.map((id) => nodes.get(id)!);
    return [
      {
        label: `${a!.id}–${b!.id}`,
        x: (a!.x + b!.x) / 2,
        y: (a!.y + b!.y) / 2,
        r: 2 * graph.strokeWidth
      }
    ];
  });
  return [...knots, ...crossings].slice(0, 6);
}

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
        return {
          gesture,
          mask,
          graph: buildSkeletonGraph(mask),
          onInk: inkLookup(mask, 2),
          clearance: inkClearance(mask)
        };
      })();
      session.catch(() => sessions.delete(key));
      sessions.set(key, session);
    }
    // always hand back the freshest gesture row (saved strokes may have changed)
    return { ...(await session), gesture };
  };

  async function inspect(
    input: InspectGlyphInput,
    signal: AbortSignal
  ): Promise<InspectGlyphOutput> {
    const { gesture, mask, graph } = await openSession(input.gesture_id);
    if (signal.aborted) throw new HarnessCancelledError();
    // The strokes saved for the gesture are never shown: the agent works from the glyph alone.
    const images: HarnessImages = {
      glyph: renderGlyphImage(env, mask),
      skeleton: renderSkeletonImage(env, mask, graph)
    };
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
      knots: graph.knots,
      straight_through: graph.straight,
      images
    };
  }

  /** Build and check a plan's strokes; the images are left to the caller. */
  async function traceCore(input: TraceStrokesInput, signal: AbortSignal) {
    const { gesture, mask, graph, onInk, clearance } = await openSession(input.gesture_id);
    if (signal.aborted) throw new HarnessCancelledError();
    const onStrictInk = inkLookup(mask, 0.5);
    const built = input.strokes.map((spec, index) => {
      try {
        return buildStroke(spec, graph, onStrictInk, clearance);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Stroke ${index + 1}: ${message}`);
      }
    });
    const strokes = built.map((s) => s.points);
    const evaluation = evaluateDraft({ graph, strokes, onInk });
    const width = DEFAULTS.GESTURE_BRUSH_WIDTH;
    const drawn = strokes.map((points) => ({ points, width }));
    const output: TraceStrokesOutput = {
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
        const label = input.strokes[index]!.label;
        if (label) stroke.label = label;
        return stroke;
      }),
      coverage: evaluation.coverage,
      uncovered: evaluation.uncovered,
      retraced: evaluation.retraced,
      missed_dots: evaluation.missed_dots,
      issues: evaluation.issues,
      images: {}
    };
    return { output, mask, graph, drawn, gaps: evaluation.gaps };
  }

  async function trace(input: TraceStrokesInput, signal: AbortSignal): Promise<TraceStrokesOutput> {
    const { output, mask, graph, drawn, gaps } = await traceCore(input, signal);
    output.images = {
      strokes: renderStrokesImage(env, mask, drawn, { uncovered: gaps }),
      order: renderOrderStrip(env, mask, drawn, graph.box)
    };
    const areas = closeupAreas(graph);
    if (areas.length > 0) output.images.closeups = renderCloseups(env, mask, drawn, areas);
    return output;
  }

  /**
   * The admin's edit of a draft: trace the edited plan on the glyph the draft was traced on,
   * place the marked areas on the skeleton, and draw the strokes with the marks for the model.
   * A plan that no longer fits comes back as an error for the agent to read.
   */
  async function traceEdit(
    input: {
      gesture_id: number;
      base: TraceStrokesOutput;
      strokes: StrokeSpec[];
      marks: DraftMark[];
    },
    signal: AbortSignal
  ): Promise<TracedEdit> {
    const gesture = await deps.loadGesture(input.gesture_id);
    if (glyphKey(glyphOf(gesture)) !== glyphKey(input.base.glyph)) {
      return {
        ok: false,
        error: 'The glyph font, size or position changed since the draft was traced.'
      };
    }
    try {
      const { output, mask, graph, drawn, gaps } = await traceCore(
        { gesture_id: input.gesture_id, strokes: input.strokes },
        signal
      );
      const strokes = output.strokes.map((s) => s.points);
      return {
        ok: true,
        trace: output,
        mark_info: input.marks.map((mark) => placeMark(mark, graph, strokes)),
        image: renderStrokesImage(env, mask, drawn, { uncovered: gaps, marks: input.marks })
      };
    } catch (error) {
      if (error instanceof HarnessCancelledError) throw error;
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
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
    traceEdit: checked(traceEdit),
    propose: checked((input: ProposeGestureInput) => propose(input))
  };
}

export type GestureHarness = ReturnType<typeof createGestureHarness>;
