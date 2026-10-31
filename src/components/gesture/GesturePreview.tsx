import { useMemo, useState, type ReactNode } from 'react';
import { Maximize2Icon, PlayIcon, SquareIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import type { Gesture } from '~/tools/stroke_data/types';
import { GestureInspectorDialog, type InspectPane } from './GestureInspectorDialog';
import { GestureSvg } from './GestureSvg';
import { orderedStrokes, useStrokePlayer } from './use_stroke_player';

/** How the inspector opened from a preview is titled, and what it shows. */
export type InspectOptions = {
  title?: ReactNode;
  description?: ReactNode;
  /** Label of this preview's pane */
  label?: string;
  /** Show these panes instead (e.g. saved vs proposal, compared side by side) */
  panes?: InspectPane[];
};

/**
 * A gesture's strokes on the 400×400 gesture canvas, scaled to fit. Static by default (every
 * stroke drawn, numbered in writing order).
 *
 * - `full` (default): ▶ replays the strokes with their own timing, as in practice; ⤢ (on hover)
 *   opens the inspector.
 * - `thumb`: for small previews — no buttons on top; a click opens the inspector.
 *
 * `inspect={false}` turns the inspector off.
 */
export function GesturePreview({
  gestures,
  className,
  showStrokeOrder = true,
  backgroundSrc,
  size = 'full',
  inspect = {},
  onInspect
}: {
  gestures: Gesture[];
  className?: string;
  showStrokeOrder?: boolean;
  /** Image drawn under the strokes on the full canvas (e.g. the glyph being traced) */
  backgroundSrc?: string;
  size?: 'full' | 'thumb';
  inspect?: InspectOptions | false;
  /**
   * Open the inspector elsewhere instead (e.g. from a popover that would close and take the
   * dialog with it)
   */
  onInspect?: () => void;
}) {
  const ordered = useMemo(() => orderedStrokes(gestures), [gestures]);
  const { playback, play, stop } = useStrokePlayer(ordered);
  const [inspecting, setInspecting] = useState(false);
  const canInspect = inspect !== false && ordered.length > 0;

  const openInspector = () => {
    stop();
    if (onInspect) onInspect();
    else setInspecting(true);
  };

  const svg = (
    <GestureSvg
      ordered={ordered}
      playback={playback}
      showStrokeOrder={showStrokeOrder}
      backgroundSrc={backgroundSrc}
    />
  );

  return (
    <div className={cn('group/gesture relative', className)}>
      {size === 'thumb' && canInspect ? (
        <button
          type="button"
          onClick={openInspector}
          aria-label="Inspect gesture"
          title="Inspect gesture"
          className="block w-full cursor-zoom-in rounded-lg transition-shadow hover:ring-2 hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          {svg}
        </button>
      ) : (
        svg
      )}
      {size === 'full' && ordered.length > 0 ? (
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          aria-label={playback ? 'Stop' : 'Play strokes'}
          className="absolute right-1.5 bottom-1.5 shadow-sm"
          onClick={() => (playback ? stop() : void play())}
        >
          {playback ? <SquareIcon className="fill-current" /> : <PlayIcon />}
        </Button>
      ) : null}
      {size === 'full' && canInspect ? (
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          aria-label="Inspect gesture"
          title="Inspect gesture"
          className="absolute top-1.5 right-1.5 opacity-0 shadow-sm transition-opacity group-hover/gesture:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          onClick={openInspector}
        >
          <Maximize2Icon />
        </Button>
      ) : null}
      {inspecting && inspect !== false ? (
        <GestureInspectorDialog
          open
          onOpenChange={setInspecting}
          title={inspect.title ?? 'Inspect gesture'}
          description={inspect.description}
          panes={inspect.panes ?? [{ label: inspect.label ?? 'Strokes', gestures, backgroundSrc }]}
        />
      ) : null}
    </div>
  );
}
