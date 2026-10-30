import { REVIEW_STATUS_META, type ReviewStatus } from '~/agents/gesture_review';
import { cn } from '~/lib/utils';

const STATUS_STYLE = {
  unreviewed: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  needs_work: 'border-destructive/40 text-destructive',
  approved: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
} as const satisfies Record<ReviewStatus, string>;

/** A gesture's review state as a small outlined tag; none while it has no strokes to review. */
export function ReviewBadge({
  status,
  strokes,
  className
}: {
  status: ReviewStatus | null;
  /** Saved strokes: a gesture without any has nothing to review */
  strokes: number;
  className?: string;
}) {
  if (!status || strokes === 0) return null;
  return (
    <span
      className={cn(
        'shrink-0 rounded-md border px-1.5 py-px text-[11px] leading-4 font-medium',
        STATUS_STYLE[status],
        className
      )}
    >
      {REVIEW_STATUS_META[status].label}
    </span>
  );
}
