import { Link } from '@tanstack/react-router';
import { AlertCircleIcon, ArrowUpRight, PenLineIcon } from 'lucide-react';
import { GesturePreview } from '~/components/gesture/GesturePreview';
import { useGesturePreviewById, useInViewOnce } from '~/components/gesture/useGesturePreviewById';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';

export type GestureCardItem = {
  id: number;
  text: string;
  order: number | null;
  lesson_id: number | null;
  updated_at: Date | string;
  stroke_count: number;
};

/**
 * A gesture in the admin list: its strokes drawn (loaded once the card scrolls into view, with a
 * play button), or an empty box when nothing is recorded yet.
 */
export function GestureCard({ item }: { item: GestureCardItem }) {
  const hasStrokes = item.stroke_count > 0;
  const [ref, inView] = useInViewOnce<HTMLDivElement>();
  const preview_q = useGesturePreviewById(item.id, item.updated_at, inView && hasStrokes);

  return (
    <div
      ref={ref}
      className={cn(
        'group/card flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-all',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
        !hasStrokes && 'border-dashed'
      )}
    >
      <div className="relative p-2 pb-0">
        {!hasStrokes ? (
          <Link
            to="/gestures/edit/$id"
            params={{ id: String(item.id) }}
            className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
          >
            <span className="text-4xl leading-none font-semibold opacity-40">{item.text}</span>
            <span className="mt-2 flex items-center gap-1 text-[11px] font-medium">
              <PenLineIcon className="size-3" />
              Record strokes
            </span>
          </Link>
        ) : preview_q.data ? (
          <GesturePreview
            gestures={preview_q.data.gestures}
            showStrokeOrder={false}
            inspect={{ title: `${item.text} — saved strokes`, label: 'Saved' }}
          />
        ) : preview_q.isError ? (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-destructive/40 text-xs text-destructive">
            <AlertCircleIcon className="size-4" />
            Failed to load
          </div>
        ) : (
          <Skeleton className="aspect-square w-full rounded-lg" />
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1 px-2.5 py-2">
        <Link
          to="/gestures/edit/$id"
          params={{ id: String(item.id) }}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          {item.order !== null ? (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-muted px-1 text-[11px] font-semibold text-muted-foreground tabular-nums">
              {item.order}
            </span>
          ) : null}
          <span className="truncate text-lg leading-tight font-semibold group-hover/card:text-primary">
            {item.text}
          </span>
          <span
            className={cn(
              'ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
              hasStrokes
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            )}
            title={`${item.stroke_count} stroke${item.stroke_count === 1 ? '' : 's'}`}
          >
            {hasStrokes ? `${item.stroke_count} str` : 'empty'}
          </span>
        </Link>
        {item.lesson_id !== null ? (
          <Link
            to="/lessons/edit/$id"
            params={{ id: String(item.lesson_id) }}
            target="_blank"
            rel="noopener noreferrer"
            title="Open lesson in a new tab"
            aria-label="Open lesson in a new tab"
            className="flex shrink-0 items-center gap-0.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <ArrowUpRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function GestureCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-2">
      <Skeleton className="aspect-square w-full rounded-lg" />
      <Skeleton className="h-5 w-2/3" />
    </div>
  );
}
