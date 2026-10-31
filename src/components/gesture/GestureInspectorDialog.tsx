import { useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  HashIcon,
  ImageIcon,
  PlayIcon,
  SquareIcon
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { cn } from '~/lib/utils';
import { getGestureDuration } from '~/tools/stroke_data/animation';
import type { Gesture } from '~/tools/stroke_data/types';
import { GestureSvg } from './GestureSvg';
import { orderedStrokes, useStrokePlayer } from './use_stroke_player';

/** One gesture shown in the inspector; two panes compare side by side. */
export type InspectPane = {
  label: string;
  gestures: Gesture[];
  backgroundSrc?: string;
  /** Highlight this pane's label (e.g. the proposal) */
  accent?: boolean;
};

const SPEEDS = [0.5, 1, 1.5, 2] as const;

/** What the toolbar drives in every pane at once. */
type PaneHandle = { play: () => Promise<void>; stop: () => void };

type View = {
  speed: number;
  /** Stepping through strokes: the stroke shown last (null: all strokes) */
  step: number | null;
  numbers: boolean;
  glyph: boolean;
  ghost: boolean;
};

function Toggle({
  pressed,
  onPressedChange,
  label,
  children
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? 'secondary' : 'ghost'}
      aria-pressed={pressed}
      title={label}
      onClick={() => onPressedChange(!pressed)}
      className={cn(!pressed && 'text-muted-foreground')}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

function Pane({
  ref,
  pane,
  view,
  onPickStroke,
  large
}: {
  ref: Ref<PaneHandle>;
  pane: InspectPane;
  view: View;
  onPickStroke: (index: number) => void;
  /** Single pane: the canvas takes most of the dialog */
  large: boolean;
}) {
  const ordered = useMemo(() => orderedStrokes(pane.gestures), [pane.gestures]);
  const { playback, play, stop } = useStrokePlayer(ordered, view.speed);
  useImperativeHandle(ref, () => ({ play: () => play(), stop }));

  const highlighted = playback ? playback.done : view.step;

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption
        className={cn(
          'text-xs font-semibold tracking-wide uppercase',
          pane.accent ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        {pane.label} · {ordered.length} strokes
      </figcaption>
      {ordered.length === 0 ? (
        <p className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          No strokes
        </p>
      ) : (
        <GestureSvg
          ordered={ordered}
          playback={playback}
          step={view.step}
          ghost={view.ghost}
          showStrokeOrder={view.numbers}
          backgroundSrc={view.glyph ? pane.backgroundSrc : undefined}
          className={cn('mx-auto', large ? 'max-w-[min(68vh,640px)]' : 'max-w-[min(56vh,520px)]')}
        />
      )}
      {ordered.length > 0 ? (
        <ol className="flex flex-wrap gap-1">
          {ordered.map((stroke, index) => (
            <li key={stroke.index}>
              <button
                type="button"
                onClick={() => onPickStroke(index)}
                title={`${Math.round(getGestureDuration(stroke))} ms · ${stroke.points.length} points · ${stroke.anim_fn}`}
                className={cn(
                  'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs tabular-nums transition-colors',
                  highlighted === index
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:bg-muted'
                )}
              >
                <span
                  className="size-2.5 rounded-full border border-black/10"
                  style={{ backgroundColor: stroke.color }}
                />
                {index + 1}
                <span className="text-[10px] opacity-70">
                  {(getGestureDuration(stroke) / 1000).toFixed(1)}s
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </figure>
  );
}

/**
 * A large view of one gesture (or two side by side): replay at any speed, step through strokes,
 * toggle the stroke numbers, the glyph and the strokes still to come. Opened from the small
 * previews across the admin pages.
 */
export function GestureInspectorDialog({
  open,
  onOpenChange,
  title,
  description,
  panes
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  panes: InspectPane[];
}) {
  const [view, setView] = useState<View>({
    speed: 1,
    step: null,
    numbers: true,
    glyph: true,
    ghost: false
  });
  const [playing, setPlaying] = useState(false);
  const paneRefs = useRef<(PaneHandle | null)[]>([]);
  /** Bumped by every play / stop, so an older replay finishing does not end a newer one. */
  const runId = useRef(0);
  const maxStrokes = Math.max(0, ...panes.map((pane) => pane.gestures.length));
  const hasGlyph = panes.some((pane) => pane.backgroundSrc);

  const panesNow = () => paneRefs.current.slice(0, panes.length).filter((p) => p !== null);
  const playAll = async () => {
    const id = ++runId.current;
    setPlaying(true);
    await Promise.all(panesNow().map((pane) => pane.play()));
    if (runId.current === id) setPlaying(false);
  };
  const stopAll = () => {
    runId.current++;
    for (const pane of panesNow()) pane.stop();
    setPlaying(false);
  };
  const update = (next: Partial<View>) => setView((current) => ({ ...current, ...next }));
  const pickStroke = (index: number) => {
    if (playing) stopAll();
    update({ step: index });
  };
  const stepBy = (delta: number) => {
    if (playing) stopAll();
    const from = view.step ?? (delta > 0 ? -1 : maxStrokes);
    const next = from + delta;
    update({ step: next < 0 || next >= maxStrokes ? null : next });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stopAll();
        onOpenChange(next);
      }}
    >
      <DialogContent
        className={cn(
          'max-h-[94vh] overflow-y-auto',
          panes.length > 1 ? 'sm:max-w-6xl' : 'sm:max-w-4xl'
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-1.5">
          <Button
            size="sm"
            onClick={() => {
              update({ step: null });
              if (playing) stopAll();
              else void playAll();
            }}
            disabled={maxStrokes === 0}
          >
            {playing ? <SquareIcon className="fill-current" /> : <PlayIcon />}
            {playing ? 'Stop' : panes.length > 1 ? 'Play both' : 'Play'}
          </Button>
          <div className="flex items-center rounded-md border border-border/60" role="group">
            {SPEEDS.map((speed) => (
              <Button
                key={speed}
                size="xs"
                variant={view.speed === speed ? 'secondary' : 'ghost'}
                aria-pressed={view.speed === speed}
                onClick={() => update({ speed })}
                className="tabular-nums"
              >
                {speed}×
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Previous stroke"
              title="Previous stroke"
              onClick={() => stepBy(-1)}
              disabled={maxStrokes === 0}
            >
              <ChevronLeftIcon />
            </Button>
            <span className="min-w-16 text-center text-xs text-muted-foreground tabular-nums">
              {view.step === null ? 'All strokes' : `Stroke ${view.step + 1}/${maxStrokes}`}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Next stroke"
              title="Next stroke"
              onClick={() => stepBy(1)}
              disabled={maxStrokes === 0}
            >
              <ChevronRightIcon />
            </Button>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-0.5">
            <Toggle
              pressed={view.numbers}
              onPressedChange={(numbers) => update({ numbers })}
              label="Numbers"
            >
              <HashIcon />
            </Toggle>
            {hasGlyph ? (
              <Toggle
                pressed={view.glyph}
                onPressedChange={(glyph) => update({ glyph })}
                label="Glyph"
              >
                <ImageIcon />
              </Toggle>
            ) : null}
            <Toggle
              pressed={view.ghost}
              onPressedChange={(ghost) => update({ ghost })}
              label="Upcoming"
            >
              <EyeIcon />
            </Toggle>
          </div>
        </div>
        <div className={cn('grid gap-4', panes.length > 1 && 'md:grid-cols-2')}>
          {panes.map((pane, index) => (
            <Pane
              key={index}
              ref={(handle) => {
                paneRefs.current[index] = handle;
              }}
              pane={pane}
              view={view}
              onPickStroke={pickStroke}
              large={panes.length === 1}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
