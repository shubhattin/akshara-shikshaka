import { useRef, useState, type PointerEvent } from 'react';
import { nearestPoint, strokeColor } from '~/agents/gesture_creator/draft_plan';
import type { DraftMark } from '~/agents/gesture_creator/schemas';
import { cn } from '~/lib/utils';
import { CANVAS_DIMS } from '~/tools/stroke_data/types';
import type { DraftStroke } from './draft_state';

/**
 * The draft over its glyph, on the 400×400 gesture canvas: each stroke in its colour with its
 * number at the start and arrows along it, plus the areas the admin marked. In split mode a
 * click cuts the nearest stroke there; in mark mode a drag rings an area.
 */

type Pt = [number, number];

export type DraftTool = 'look' | 'split' | 'mark';

type SplitTarget = { stroke: number; point: number; distance: number; at: Pt };

/** Strokes fully drawn so far and how far along the current one, while playing. */
export type DraftPlayback = { index: number; length: number };

/** How close (canvas units) a click must be to a stroke to split it. */
const SPLIT_REACH = 14;
const MIN_MARK_R = 10;
const MAX_MARK_R = 200;
const DEFAULT_MARK_R = 22;
/** How close (canvas units) to a ring's edge or handle a press resizes it instead of moving it. */
const EDGE_GRAB = 7;
const HANDLE_GRAB = 11;

/** A ring being moved (by its centre) or resized (by its edge). */
type MarkDrag = { id: string; mode: 'move' | 'resize'; offset: Pt };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A ring's new centre or radius as the pointer drags it to `p`. */
function draggedArea(mark: Pick<DraftMark, 'x' | 'y' | 'r'>, drag: MarkDrag, p: Pt) {
  if (drag.mode === 'move') {
    return {
      x: Math.round(clamp(p[0] - drag.offset[0], 0, CANVAS_DIMS.width)),
      y: Math.round(clamp(p[1] - drag.offset[1], 0, CANVAS_DIMS.height)),
      r: mark.r
    };
  }
  return {
    x: mark.x,
    y: mark.y,
    r: Math.round(clamp(dist([mark.x, mark.y], p), MIN_MARK_R, MAX_MARK_R))
  };
}

/** The canvas cursor: a ring under the pointer wins over the tool's own. */
function cursorClass(
  tool: DraftTool,
  splitHere: boolean,
  ringMode: MarkDrag['mode'] | null,
  dragging: boolean
) {
  if (ringMode === 'move') return dragging ? 'cursor-grabbing' : 'cursor-grab';
  if (ringMode === 'resize') return 'cursor-nwse-resize';
  if (tool === 'mark') return 'cursor-crosshair';
  if (tool === 'split') return splitHere ? 'cursor-pointer' : 'cursor-default';
  return undefined;
}

/** Cursor and touch handling of the canvas; a read-only one (a sent edit) takes no input. */
function interactionClass(
  tool: DraftTool,
  splitHere: boolean,
  ringMode: MarkDrag['mode'] | null,
  dragging: boolean,
  readOnly: boolean
) {
  if (readOnly) return 'pointer-events-none';
  return cn(tool !== 'look' && 'touch-none', cursorClass(tool, splitHere, ringMode, dragging));
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const pointsAttr = (pts: readonly Pt[]) => pts.map(([x, y]) => `${x},${y}`).join(' ');

/** The first `length` units of a polyline. */
function partial(pts: readonly Pt[], length: number): Pt[] {
  const out: Pt[] = pts.length ? [pts[0]!] : [];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1]!, pts[i]!);
    if (run + seg >= length) {
      const t = seg ? (length - run) / seg : 0;
      const a = pts[i - 1]!;
      const b = pts[i]!;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      return out;
    }
    run += seg;
    out.push(pts[i]!);
  }
  return out;
}

/** Arrowheads every `every` units along a stroke, and one at its end. */
function arrowsAlong(pts: readonly Pt[], every = 70): { at: Pt; angle: number }[] {
  const out: { at: Pt; angle: number }[] = [];
  const angleAt = (i: number) => {
    const a = pts[Math.max(0, i - 3)]!;
    const b = pts[i]!;
    return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  };
  let run = 0;
  for (let i = 1; i < pts.length - 6; i++) {
    run += dist(pts[i - 1]!, pts[i]!);
    if (run >= every) {
      out.push({ at: pts[i]!, angle: angleAt(i) });
      run = 0;
    }
  }
  if (pts.length >= 2) out.push({ at: pts.at(-1)!, angle: angleAt(pts.length - 1) });
  return out;
}

function StrokeMarks({
  stroke,
  index,
  dim,
  bold,
  points
}: {
  stroke: DraftStroke;
  index: number;
  dim: boolean;
  bold: boolean;
  points: Pt[];
}) {
  const color = strokeColor(index);
  const start = stroke.points[0];
  const isDot = 'dot' in stroke.spec;
  return (
    <g opacity={dim ? 0.25 : 1}>
      {isDot && start ? (
        <circle cx={start[0]} cy={start[1]} r={7} fill={color} fillOpacity={0.35} />
      ) : (
        <>
          <polyline
            points={pointsAttr(points)}
            fill="none"
            stroke={color}
            strokeOpacity={0.22}
            strokeWidth={bold ? 16 : 12}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={pointsAttr(points)}
            fill="none"
            stroke={color}
            strokeWidth={bold ? 3.5 : 2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.length === stroke.points.length
            ? arrowsAlong(points).map(({ at, angle }, k) => (
                <path
                  key={k}
                  d="M 6 0 L -5 -5 L -5 5 Z"
                  transform={`translate(${at[0]} ${at[1]}) rotate(${angle})`}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={1}
                />
              ))
            : null}
        </>
      )}
      {start ? (
        <g>
          <circle cx={start[0]} cy={start[1]} r={9} fill={color} stroke="#fff" strokeWidth={1.5} />
          <text
            x={start[0]}
            y={start[1]}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={700}
            fill="#fff"
          >
            {index + 1}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/** Where the resize handle sits on a ring: its lower right edge. */
const handleOf = (mark: Pick<DraftMark, 'x' | 'y' | 'r'>): Pt => [
  mark.x + mark.r * Math.SQRT1_2,
  mark.y + mark.r * Math.SQRT1_2
];

function MarkRing({
  mark,
  pending = false,
  active = false,
  still = false
}: {
  mark: Pick<DraftMark, 'x' | 'y' | 'r' | 'id'>;
  pending?: boolean;
  /** Not draggable: let touches scroll the page */
  still?: boolean;
  /** Being dragged or under the pointer */
  active?: boolean;
}) {
  const tag: Pt = [mark.x + mark.r * 0.72 + 4, mark.y - mark.r * 0.72 - 4];
  const handle = handleOf(mark);
  return (
    <g pointerEvents={pending ? 'none' : undefined}>
      {/* touch-none: dragging a ring on a phone moves it instead of scrolling the chat */}
      <circle
        cx={mark.x}
        cy={mark.y}
        r={mark.r}
        className={still ? undefined : 'touch-none'}
        fill={active ? 'rgba(220,38,38,0.16)' : 'rgba(220,38,38,0.08)'}
        stroke="#dc2626"
        strokeWidth={active ? 2.5 : 2}
        strokeDasharray="6 4"
      />
      {pending ? null : (
        <g>
          <circle
            cx={handle[0]}
            cy={handle[1]}
            r={5}
            className={still ? undefined : 'touch-none'}
            fill="#fff"
            stroke="#dc2626"
            strokeWidth={2}
          />
          <rect
            x={tag[0] - 8}
            y={tag[1] - 8}
            width={16}
            height={16}
            rx={4}
            fill="#dc2626"
            pointerEvents="none"
          />
          <text
            x={tag[0]}
            y={tag[1]}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fontWeight={700}
            fill="#fff"
            pointerEvents="none"
          >
            {mark.id}
          </text>
        </g>
      )}
    </g>
  );
}

export function DraftCanvas({
  strokes,
  marks,
  background,
  highlight,
  tool,
  playback,
  onHover,
  onSplit,
  onMark,
  onMarkChange,
  readOnly = false,
  className
}: {
  strokes: DraftStroke[];
  marks: DraftMark[];
  background?: string;
  /** Index of the stroke to bring forward (hovered row) */
  highlight: number | null;
  tool: DraftTool;
  playback: DraftPlayback | null;
  onHover: (index: number | null) => void;
  onSplit: (strokeIndex: number, pointIndex: number) => void;
  onMark: (area: { x: number; y: number; r: number }) => void;
  /** A ring was moved or resized */
  onMarkChange: (id: string, area: { x: number; y: number; r: number }) => void;
  /** Just show it: no hovering, splitting or marking (a sent edit) */
  readOnly?: boolean;
  className?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [pointer, setPointer] = useState<Pt | null>(null);
  const [ring, setRing] = useState<{ x: number; y: number; r: number } | null>(null);
  const [drag, setDrag] = useState<MarkDrag | null>(null);

  const toCanvas = (event: PointerEvent): Pt => {
    const rect = svg.current!.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / rect.width) * CANVAS_DIMS.width,
      ((event.clientY - rect.top) / rect.height) * CANVAS_DIMS.height
    ];
  };

  /** The stroke point nearest the pointer, if it is close enough to split there. */
  const splitTarget = (p: Pt | null): SplitTarget | null => {
    if (!p) return null;
    let best: SplitTarget | null = null;
    for (const [index, stroke] of strokes.entries()) {
      if ('dot' in stroke.spec) continue;
      const near = nearestPoint(stroke.points, p);
      if (near.distance <= SPLIT_REACH && (!best || near.distance < best.distance)) {
        best = {
          stroke: index,
          point: near.index,
          distance: near.distance,
          at: stroke.points[near.index]!
        };
      }
    }
    return best;
  };

  /** The stroke under the pointer, to highlight its row. */
  const hoverTarget = (p: Pt): number | null => {
    let best: { index: number; distance: number } | null = null;
    for (const [index, stroke] of strokes.entries()) {
      const { distance } = nearestPoint(stroke.points, p);
      if (distance <= SPLIT_REACH && (!best || distance < best.distance))
        best = { index, distance };
    }
    return best?.index ?? null;
  };

  /** The ring under a point (the top one first), and whether the press would resize it. */
  const markAt = (p: Pt): { mark: DraftMark; mode: MarkDrag['mode'] } | null => {
    for (const mark of [...marks].reverse()) {
      if (dist(p, handleOf(mark)) <= HANDLE_GRAB) return { mark, mode: 'resize' };
      const d = dist(p, [mark.x, mark.y]);
      if (Math.abs(d - mark.r) <= EDGE_GRAB) return { mark, mode: 'resize' };
      if (d < mark.r) return { mark, mode: 'move' };
    }
    return null;
  };

  const target = tool === 'split' ? splitTarget(pointer) : null;
  const hovered = tool !== 'split' && !drag && !ring && pointer ? markAt(pointer) : null;
  const activeMark = drag?.id ?? hovered?.mark.id ?? null;
  const ringMode = drag?.mode ?? hovered?.mode ?? null;

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const p = toCanvas(event);
    const grabbed = tool !== 'split' ? markAt(p) : null;
    if (grabbed) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({
        id: grabbed.mark.id,
        mode: grabbed.mode,
        offset: [p[0] - grabbed.mark.x, p[1] - grabbed.mark.y]
      });
      return;
    }
    if (tool === 'mark') {
      event.currentTarget.setPointerCapture(event.pointerId);
      setRing({ x: p[0], y: p[1], r: 0 });
    } else if (tool === 'split') {
      const hit = splitTarget(p);
      if (hit) onSplit(hit.stroke, hit.point);
    }
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const p = toCanvas(event);
    setPointer(p);
    if (drag) {
      const mark = marks.find((m) => m.id === drag.id);
      if (mark) onMarkChange(mark.id, draggedArea(mark, drag, p));
    } else if (ring) setRing({ ...ring, r: dist([ring.x, ring.y], p) });
    else if (tool === 'look') onHover(hoverTarget(p));
  };

  const onPointerUp = () => {
    if (drag) {
      setDrag(null);
      return;
    }
    if (!ring) return;
    const r = ring.r < MIN_MARK_R ? DEFAULT_MARK_R : Math.min(ring.r, MAX_MARK_R);
    onMark({ x: Math.round(ring.x), y: Math.round(ring.y), r: Math.round(r) });
    setRing(null);
  };

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${CANVAS_DIMS.width} ${CANVAS_DIMS.height}`}
      className={cn(
        'aspect-square w-full rounded-lg border border-border/70 bg-white select-none',
        interactionClass(tool, !!target, ringMode, !!drag, readOnly),
        className
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => {
        setPointer(null);
        if (tool === 'look') onHover(null);
      }}
    >
      {background ? (
        <image
          href={background}
          x={0}
          y={0}
          width={CANVAS_DIMS.width}
          height={CANVAS_DIMS.height}
        />
      ) : null}
      {strokes.map((stroke, index) => {
        if (playback && index > playback.index) return null;
        const points =
          playback && index === playback.index
            ? partial(stroke.points, playback.length)
            : stroke.points;
        return (
          <StrokeMarks
            key={stroke.key}
            stroke={stroke}
            index={index}
            points={points}
            dim={!playback && highlight !== null && highlight !== index}
            bold={!playback && highlight === index}
          />
        );
      })}
      {marks.map((mark) => (
        <MarkRing key={mark.id} mark={mark} active={activeMark === mark.id} still={readOnly} />
      ))}
      {ring && ring.r > 2 ? <MarkRing mark={{ ...ring, id: '' }} pending /> : null}
      {target ? (
        <g pointerEvents="none">
          <circle
            cx={target.at[0]}
            cy={target.at[1]}
            r={7}
            fill="#fff"
            stroke="#111"
            strokeWidth={2}
          />
          <line
            x1={target.at[0] - 4}
            y1={target.at[1] - 4}
            x2={target.at[0] + 4}
            y2={target.at[1] + 4}
            stroke="#111"
            strokeWidth={2}
          />
        </g>
      ) : null}
    </svg>
  );
}
