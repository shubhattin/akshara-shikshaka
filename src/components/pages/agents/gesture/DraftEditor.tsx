import { useEffect, useRef, useState } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRightIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  GripVerticalIcon,
  Link2Icon,
  MousePointer2Icon,
  PlayIcon,
  RotateCcwIcon,
  ScissorsIcon,
  SendIcon,
  SquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon
} from 'lucide-react';
import { useTRPC } from '~/api/client';
import { describeDirection, strokeColor } from '~/agents/gesture_creator/draft_plan';
import { MAX_DRAFT_MARKS, type DraftMark } from '~/agents/gesture_creator/schemas';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/lib/utils';
import { GESTURE_GAP_DURATION } from '~/tools/stroke_data/types';
import { useAgentChatContext } from '../chat/agent_chat_context';
import { DraftCanvas, type DraftPlayback, type DraftTool } from './DraftCanvas';
import {
  buildDraftEdit,
  canJoinStrokes,
  initialStrokes,
  isUnchanged,
  joinStrokes,
  nextMarkId,
  reverseStroke,
  splitStroke,
  strokesInMark,
  type DraftSource,
  type DraftStroke
} from './draft_state';
import { useGlyphBackground } from './use_glyph_background';

/**
 * The latest draft of a Gesture Creator chat, editable: drag strokes into another order,
 * reverse, split, join or delete them, ring areas of the glyph with a note, then send the edit
 * to the agent. The server traces the edited plan, so the agent can propose it as it is.
 */

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The draft's gesture (for its akṣara) and its glyph as traced, as a light background. */
export function useDraftGlyph(source: Pick<DraftSource, 'gesture_id' | 'glyph'>) {
  const trpc = useTRPC();
  const gesture = useQuery(trpc.agents.get_gesture.queryOptions({ id: source.gesture_id })).data;
  const background = useGlyphBackground(
    gesture
      ? {
          text: gesture.text,
          font_family: source.glyph?.font_family ?? gesture.font_family,
          font_size: source.glyph?.font_size ?? gesture.font_size,
          text_center_offset: source.glyph?.text_center_offset ?? gesture.text_center_offset
        }
      : null
  );
  return { gesture, background };
}

/** Playback pace: ms per 200 canvas units, as the default gesture pace. */
const PLAY_MS_PER_200 = 600;

function usePlayback(strokes: DraftStroke[]) {
  const [playback, setPlayback] = useState<DraftPlayback | null>(null);
  const frame = useRef<number | null>(null);

  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setPlayback(null);
  };

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    []
  );

  const play = () => {
    stop();
    const lengths = strokes.map((s) => {
      let total = 0;
      for (let i = 1; i < s.points.length; i++) {
        total += Math.hypot(
          s.points[i]![0] - s.points[i - 1]![0],
          s.points[i]![1] - s.points[i - 1]![1]
        );
      }
      return Math.max(total, 1);
    });
    const speed = 200 / PLAY_MS_PER_200;
    let index = 0;
    let startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const length = lengths[index]!;
      const drawn = elapsed * speed;
      if (drawn < length) {
        setPlayback({ index, length: drawn });
      } else if (elapsed < length / speed + GESTURE_GAP_DURATION) {
        setPlayback({ index, length });
      } else if (index + 1 < strokes.length) {
        index++;
        startedAt = now;
        setPlayback({ index, length: 0 });
      } else {
        frame.current = null;
        setPlayback(null);
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  return { playback, play, stop };
}

function originBadges(stroke: DraftStroke, index: number) {
  const { origin } = stroke;
  const badges: string[] = [];
  if (origin.from.length > 1) badges.push(`joined ${origin.from.join('+')}`);
  else if (origin.from[0] !== index + 1) badges.push(`was ${origin.from[0]}`);
  if (origin.split_part) badges.push(`split ${origin.split_part}/2`);
  if (origin.reversed) badges.push('reversed');
  return badges;
}

function StrokeRow({
  stroke,
  index,
  highlighted,
  disabled,
  canJoinNext,
  onHover,
  onReverse,
  onJoinNext,
  onDelete
}: {
  stroke: DraftStroke;
  index: number;
  highlighted: boolean;
  disabled: boolean;
  canJoinNext: boolean;
  onHover: (index: number | null) => void;
  onReverse: () => void;
  onJoinNext: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stroke.key,
    disabled
  });
  const isDot = 'dot' in stroke.spec;
  const badges = originBadges(stroke, index);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onPointerEnter={() => onHover(index)}
      onPointerLeave={() => onHover(null)}
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-background px-1.5 py-1.5 text-sm transition-colors',
        highlighted ? 'border-foreground/30' : 'border-border/70',
        isDragging && 'relative z-10 shadow-lg'
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`Drag stroke ${index + 1} to reorder`}
        className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing disabled:cursor-not-allowed"
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <span
        className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
        style={{ background: strokeColor(index) }}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate font-medium">{stroke.spec.label ?? `Stroke ${index + 1}`}</p>
        <p className="truncate text-xs text-muted-foreground">
          {describeDirection(stroke.points)}
          {badges.map((badge) => (
            <span
              key={badge}
              className="ml-1.5 rounded border border-amber-500/40 px-1 text-[10px] text-amber-700 dark:text-amber-400"
            >
              {badge}
            </span>
          ))}
        </p>
      </div>
      <Button
        size="icon-xs"
        variant="ghost"
        title="Reverse the direction"
        aria-label={`Reverse stroke ${index + 1}`}
        disabled={disabled || isDot}
        onClick={onReverse}
      >
        <ArrowLeftRightIcon />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        title={
          canJoinNext
            ? 'Join with the next stroke into one (reverses one of them if their ends only meet that way)'
            : 'Join with the next stroke: their ends are too far apart'
        }
        aria-label={`Join stroke ${index + 1} with the next`}
        disabled={disabled || !canJoinNext}
        onClick={onJoinNext}
      >
        <Link2Icon />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        title="Delete this stroke"
        aria-label={`Delete stroke ${index + 1}`}
        disabled={disabled}
        onClick={onDelete}
      >
        <Trash2Icon />
      </Button>
    </li>
  );
}

function MarkRow({
  mark,
  strokes,
  disabled,
  onNote,
  onRemove
}: {
  mark: DraftMark;
  strokes: number[];
  disabled: boolean;
  onNote: (note: string) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2">
      <span className="grid size-5 shrink-0 place-items-center rounded bg-red-600 text-[11px] font-bold text-white">
        {mark.id}
      </span>
      <Input
        value={mark.note}
        disabled={disabled}
        maxLength={300}
        onChange={(event) => onNote(event.target.value)}
        placeholder={
          strokes.length
            ? `What’s wrong here? (stroke ${strokes.join(', ')})`
            : 'What’s wrong here?'
        }
        className="h-7 text-sm"
        autoFocus
      />
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`Remove mark ${mark.id}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </li>
  );
}

const TOOLS: { tool: DraftTool; label: string; icon: React.ReactNode; hint: string }[] = [
  {
    tool: 'look',
    label: 'Look',
    icon: <MousePointer2Icon />,
    hint: 'Hover a stroke to find its row. Drag a ring to move it, its edge to resize it.'
  },
  {
    tool: 'split',
    label: 'Split',
    icon: <ScissorsIcon />,
    hint: 'Click a stroke where the pen should lift.'
  },
  {
    tool: 'mark',
    label: 'Mark area',
    icon: <CircleDashedIcon />,
    hint: 'Drag to ring an area the agent got wrong, then say what is wrong. Drag a ring to move it.'
  }
];

function CanvasToolbar({
  tool,
  onTool,
  playing,
  onPlay,
  disabled
}: {
  tool: DraftTool;
  onTool: (tool: DraftTool) => void;
  playing: boolean;
  onPlay: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {TOOLS.map((t) => (
        <Button
          key={t.tool}
          size="xs"
          variant={tool === t.tool ? 'secondary' : 'ghost'}
          aria-pressed={tool === t.tool}
          disabled={disabled && t.tool !== 'look'}
          onClick={() => onTool(t.tool)}
        >
          {t.icon}
          {t.label}
        </Button>
      ))}
      <Button size="xs" variant="ghost" onClick={onPlay}>
        {playing ? <SquareIcon /> : <PlayIcon />}
        {playing ? 'Stop' : 'Play'}
      </Button>
    </div>
  );
}

function DraftStatus({ source }: { source: DraftSource }) {
  if (source.coverage === undefined) return null;
  return (
    <span
      className="flex items-center gap-1 text-xs text-muted-foreground"
      title={source.issues.join('\n') || 'No issues found by the self-checks'}
    >
      {source.ok ? (
        <CheckCircle2Icon className="size-3.5 text-emerald-600" />
      ) : (
        <TriangleAlertIcon className="size-3.5 text-amber-600" />
      )}
      covers {pct(source.coverage)}
      {source.issues.length
        ? ` · ${source.issues.length} note${source.issues.length > 1 ? 's' : ''}`
        : ''}
    </span>
  );
}

function footerHint(state: {
  replying: boolean;
  dirty: boolean;
  unchanged: boolean;
  notes: boolean;
}) {
  if (state.replying) return 'Available when the agent finishes.';
  if (!state.dirty) return 'Drag rows to reorder; ⇄ reverses a stroke.';
  if (!state.notes) return 'The agent will propose your version.';
  return state.unchanged
    ? 'The agent will fix what you marked.'
    : 'The agent keeps your changes and fixes what you marked.';
}

export function DraftEditor({ source, title }: { source: DraftSource; title: string }) {
  const { replying, sendDraftEdit } = useAgentChatContext();
  const [strokes, setStrokes] = useState(() => initialStrokes(source));
  const [marks, setMarks] = useState<DraftMark[]>([]);
  const [note, setNote] = useState('');
  const [tool, setTool] = useState<DraftTool>('look');
  const [highlight, setHighlight] = useState<number | null>(null);
  const { playback, play, stop } = usePlayback(strokes);

  const { gesture, background } = useDraftGlyph(source);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const unchanged = isUnchanged(strokes, source);
  const dirty = !unchanged || marks.length > 0 || note.trim().length > 0;
  const playing = !!playback;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setStrokes((prev) => {
      const from = prev.findIndex((s) => s.key === active.id);
      const to = prev.findIndex((s) => s.key === over.id);
      return from === -1 || to === -1 ? prev : arrayMove(prev, from, to);
    });
  };

  const update = (index: number, replace: DraftStroke[], count = 1) =>
    setStrokes((prev) => [...prev.slice(0, index), ...replace, ...prev.slice(index + count)]);

  const onSplit = (index: number, point: number) => {
    const halves = splitStroke(strokes[index]!, point);
    if (halves && strokes.length < 12) update(index, halves);
    setTool('look');
  };

  const onMark = (area: { x: number; y: number; r: number }) => {
    if (marks.length >= MAX_DRAFT_MARKS) return;
    setMarks((prev) => [...prev, { ...area, id: nextMarkId(prev), note: '' }]);
    setTool('look');
  };

  const reset = () => {
    stop();
    setStrokes(initialStrokes(source));
    setMarks([]);
    setNote('');
  };

  const send = () => {
    if (!dirty || replying || strokes.length === 0) return;
    stop();
    sendDraftEdit(buildDraftEdit(source, strokes, marks), note.trim());
  };

  const hint = TOOLS.find((t) => t.tool === tool)!.hint;

  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-card p-3"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">
          {title}
          {gesture ? <span className="ml-1.5 text-base">{gesture.text}</span> : null}
        </h3>
        <DraftStatus source={source} />
      </header>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-72">
          <CanvasToolbar
            tool={tool}
            onTool={setTool}
            playing={!!playback}
            onPlay={() => (playback ? stop() : play())}
            disabled={playing}
          />
          <DraftCanvas
            strokes={strokes}
            marks={marks}
            background={background}
            highlight={highlight}
            tool={tool}
            playback={playback}
            onHover={setHighlight}
            onSplit={onSplit}
            onMark={onMark}
            onMarkChange={(id, area) =>
              setMarks((prev) => prev.map((m) => (m.id === id ? { ...m, ...area } : m)))
            }
          />
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={strokes.map((s) => s.key)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="flex flex-col gap-1.5" aria-label="Strokes in writing order">
                {strokes.map((stroke, index) => (
                  <StrokeRow
                    key={stroke.key}
                    stroke={stroke}
                    index={index}
                    highlighted={highlight === index}
                    disabled={playing}
                    canJoinNext={canJoinStrokes(stroke, strokes[index + 1])}
                    onHover={setHighlight}
                    onReverse={() => update(index, [reverseStroke(stroke)])}
                    onJoinNext={() => update(index, [joinStrokes(stroke, strokes[index + 1]!)], 2)}
                    onDelete={() => update(index, [])}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          {strokes.length === 0 ? (
            <p className="text-xs text-destructive">
              Every stroke is deleted. Reset to start over.
            </p>
          ) : null}
          {marks.length > 0 ? (
            <ul className="flex flex-col gap-1.5" aria-label="Marked areas">
              {marks.map((mark) => (
                <MarkRow
                  key={mark.id}
                  mark={mark}
                  strokes={strokesInMark(strokes, mark)}
                  disabled={playing}
                  onNote={(value) =>
                    setMarks((prev) =>
                      prev.map((m) => (m.id === mark.id ? { ...m, note: value } : m))
                    )
                  }
                  onRemove={() => setMarks((prev) => prev.filter((m) => m.id !== mark.id))}
                />
              ))}
            </ul>
          ) : null}
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything else for the agent? (optional)"
            className="min-h-14 text-sm"
            maxLength={1000}
          />
          <div className="mt-auto flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={send} disabled={!dirty || replying || strokes.length === 0}>
              <SendIcon />
              Send to agent
            </Button>
            {dirty ? (
              <Button size="sm" variant="ghost" onClick={reset}>
                <RotateCcwIcon />
                Reset
              </Button>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {footerHint({ replying, dirty, unchanged, notes: marks.length > 0 || !!note.trim() })}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
