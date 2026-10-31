import { useGlyphBackground } from '~/components/pages/agents/gesture/use_glyph_background';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';
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
  size = 'thumb'
}: {
  id: number;
  text: string;
  strokes: number;
  /** The gesture's `updated_at`: a newer one refetches */
  version: Date | string;
  className?: string;
  size?: 'thumb' | 'full';
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
        />
      ) : (
        <Skeleton className="aspect-square w-full rounded-lg" />
      )}
    </div>
  );
}
