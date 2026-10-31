import { useGlyphBackground } from '~/components/pages/agents/gesture/use_glyph_background';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';
import { GestureInspectorDialog } from './GestureInspectorDialog';
import { GesturePreview } from './GesturePreview';
import { useGesturePreviewById, useInViewOnce } from './useGesturePreviewById';

/**
 * A gesture's saved strokes as a small thumbnail over its glyph, loaded once it scrolls into
 * view; a click opens the inspector. Gestures without strokes show their text instead.
 */
export function LazyGestureThumb({
  id,
  text,
  strokes,
  version,
  className,
  size = 'thumb',
  onInspect
}: {
  id: number;
  text: string;
  strokes: number;
  /** The gesture's `updated_at`: a newer one refetches */
  version: Date | string;
  className?: string;
  size?: 'thumb' | 'full';
  /** Open the inspector elsewhere (see `GesturePreview`) */
  onInspect?: () => void;
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const preview_q = useGesturePreviewById(id, version, inView && strokes > 0);
  const row = preview_q.data ?? null;
  const background = useGlyphBackground(row);

  return (
    <div ref={ref} className={cn('shrink-0', className)}>
      {strokes === 0 ? (
        <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed text-lg leading-none text-muted-foreground">
          {text}
        </div>
      ) : row ? (
        <GesturePreview
          gestures={row.gestures}
          backgroundSrc={background}
          showStrokeOrder={size === 'full'}
          size={size}
          inspect={{ title: `${text} — saved strokes`, label: 'Saved' }}
          onInspect={onInspect}
        />
      ) : (
        <Skeleton className="aspect-square w-full rounded-lg" />
      )}
    </div>
  );
}

/** The inspector for a gesture known by id (its saved strokes, loaded or from the cache). */
export function GestureInspectByIdDialog({
  id,
  text,
  version,
  onClose
}: {
  id: number;
  text: string;
  version: Date | string;
  onClose: () => void;
}) {
  const preview_q = useGesturePreviewById(id, version, true);
  const row = preview_q.data ?? null;
  const background = useGlyphBackground(row);
  return (
    <GestureInspectorDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${text} — saved strokes`}
      panes={[{ label: 'Saved', gestures: row?.gestures ?? [], backgroundSrc: background }]}
    />
  );
}
