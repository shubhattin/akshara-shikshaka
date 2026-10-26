import { get_script_from_id } from '~/state/lang_list';
import type { Gesture } from '~/tools/stroke_data/types';
import { DEFAULTS } from '~/components/pages/gesture_add_edit/gesture_add_edit_state';
import { evaluateDraft } from './evaluate';
import { inkLookup, rasterizeGlyph } from './glyph_raster';
import {
  renderGlyphImage,
  renderOrderStrip,
  renderSkeletonImage,
  renderStrokesImage
} from './render_images';
import {
  inspect_glyph_input_schema,
  propose_gesture_input_schema,
  trace_strokes_input_schema,
  type GestureCreatorToolName,
  type InspectGlyphOutput,
  type ProposeGestureOutput,
  type TraceStrokesOutput,
  type TracedGlyph
} from './schemas';
import { buildSkeletonGraph, type GlyphMask, type SkeletonGraph } from './skeleton';
import { buildStroke, pathLength } from './strokes';

/**
 * The Gesture Creator's tools, run in the admin's browser: the glyph is rendered with the same
 * font and placement as the editor, so the model traces exactly what learners will see.
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

/** A part of an earlier message the harness reads back (the trace a proposal refers to). */
type ToolPartLike = { type: string; toolCallId?: string; state?: string; output?: unknown };
type MessageLike = { parts: readonly ToolPartLike[] };

export class HarnessCancelledError extends Error {
  constructor() {
    super('Cancelled by the admin');
  }
}

const glyphKey = (g: TracedGlyph) => `${g.font_family}|${g.font_size}|${g.text_center_offset.join(',')}`;

const glyphOf = (gesture: HarnessGesture): TracedGlyph => ({
  font_family: gesture.font_family,
  font_size: gesture.font_size,
  text_center_offset: [...gesture.text_center_offset]
});

export function createGestureHarness(deps: { loadGesture: (id: number) => Promise<HarnessGesture> }) {
  /** Rendered glyph + skeleton per gesture and glyph settings (stable node/edge ids across calls). */
  const sessions = new Map<string, Promise<Session>>();

  const openSession = async (id: number): Promise<Session> => {
    const gesture = await deps.loadGesture(id);
    const key = `${id}|${glyphKey(glyphOf(gesture))}`;
    let session = sessions.get(key);
    if (!session) {
      session = (async () => {
        const mask = await rasterizeGlyph(gesture);
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

  async function inspect(raw: unknown, signal: AbortSignal): Promise<InspectGlyphOutput> {
    const input = inspect_glyph_input_schema.parse(raw);
    const { gesture, mask, graph } = await openSession(input.gesture_id);
    if (signal.aborted) throw new HarnessCancelledError();
    const saved = savedStrokes(gesture).filter((s) => s.length > 0);
    const images: Record<string, string> = {
      glyph: renderGlyphImage(mask),
      skeleton: renderSkeletonImage(mask, graph)
    };
    if (input.show_existing !== false && saved.length > 0) {
      images.saved = renderStrokesImage(
        mask,
        saved.map((points, index) => ({ points, width: gesture.gestures[index]?.width ?? DEFAULTS.GESTURE_BRUSH_WIDTH }))
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

  async function trace(raw: unknown, signal: AbortSignal): Promise<TraceStrokesOutput> {
    const input = trace_strokes_input_schema.parse(raw);
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
      strokes: strokes.map((points, index) => ({
        index,
        points,
        length: Math.round(pathLength(points)),
        start: points[0]!,
        end: points.at(-1)!,
        off_ink: evaluation.perStroke[index]!.off_ink,
        ...(evaluation.perStroke[index]!.reference ? { reference: evaluation.perStroke[index]!.reference } : {})
      })),
      coverage: evaluation.coverage,
      uncovered: evaluation.uncovered,
      retraced: evaluation.retraced,
      missed_dots: evaluation.missed_dots,
      issues: evaluation.issues,
      images: {
        strokes: renderStrokesImage(mask, drawn, { uncovered: evaluation.gaps }),
        order: renderOrderStrip(mask, drawn, graph.box)
      }
    };
  }

  async function propose(
    raw: unknown,
    messages: readonly MessageLike[]
  ): Promise<ProposeGestureOutput> {
    const input = propose_gesture_input_schema.parse(raw);
    let traced: TraceStrokesOutput | undefined;
    for (const message of messages) {
      for (const part of message.parts) {
        if (
          part.type === 'tool-trace_strokes' &&
          part.toolCallId === input.trace_id &&
          part.state === 'output-available'
        ) {
          // SAFETY: output of a trace_strokes part this harness produced earlier in the chat.
          traced = part.output as TraceStrokesOutput;
        }
      }
    }
    if (!traced) {
      return { ok: false, error: `No finished trace_strokes call with id ${input.trace_id} in this chat` };
    }
    const gesture = await deps.loadGesture(traced.gesture_id);
    if (glyphKey(glyphOf(gesture)) !== glyphKey(traced.glyph)) {
      return {
        ok: false,
        error: 'The glyph font, size or position changed since that trace. Inspect the glyph again and retrace.'
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

  return {
    async run(
      tool: GestureCreatorToolName,
      input: unknown,
      ctx: { messages: readonly MessageLike[]; signal: AbortSignal }
    ): Promise<unknown> {
      if (ctx.signal.aborted) throw new HarnessCancelledError();
      switch (tool) {
        case 'inspect_glyph':
          return inspect(input, ctx.signal);
        case 'trace_strokes':
          return trace(input, ctx.signal);
        case 'propose_gesture':
          return propose(input, ctx.messages);
      }
    },
    /** Glyph render for previews (the apply dialog draws strokes over it). */
    async glyphMask(id: number) {
      return (await openSession(id)).mask;
    }
  };
}

export type GestureHarness = ReturnType<typeof createGestureHarness>;
