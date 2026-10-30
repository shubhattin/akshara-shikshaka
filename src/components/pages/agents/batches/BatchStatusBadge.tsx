import { BATCH_ITEM_STATUS_META, type BatchItemStatus } from '~/agents/batch';
import { cn } from '~/lib/utils';

const STATUS_STYLE = {
  queued: 'border-border text-muted-foreground',
  running: 'border-blue-500/40 text-blue-700 dark:text-blue-400',
  proposed: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  no_proposal: 'border-border text-muted-foreground',
  failed: 'border-destructive/40 text-destructive',
  applied: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
  rejected: 'border-border text-muted-foreground',
  cancelled: 'border-border text-muted-foreground'
} satisfies Record<BatchItemStatus, string>;

/** Fill of each status segment in the stacked progress bar. */
export const STATUS_BAR_FILL = {
  queued: 'bg-muted-foreground/40',
  running: 'bg-blue-500',
  proposed: 'bg-amber-500',
  no_proposal: 'bg-muted-foreground/25',
  failed: 'bg-destructive',
  applied: 'bg-emerald-500',
  rejected: 'bg-muted-foreground/50',
  cancelled: 'bg-muted-foreground/20'
} satisfies Record<BatchItemStatus, string>;

/**
 * A batch item's state as a small outlined tag. A run stuck past the longest function life
 * shows a red "Stuck" tag instead (its run was killed; re-run it).
 */
export function BatchStatusBadge({ status, stuck }: { status: BatchItemStatus; stuck: boolean }) {
  if (stuck) {
    return (
      <span
        title="Running longer than a run may take (about 14 min): it was killed, re-run it"
        className="shrink-0 rounded-md border border-destructive/40 px-1.5 py-px text-[11px] leading-4 font-medium text-destructive"
      >
        Stuck
      </span>
    );
  }
  const meta = BATCH_ITEM_STATUS_META[status];
  return (
    <span
      title={meta.hint}
      className={cn(
        'shrink-0 rounded-md border px-1.5 py-px text-[11px] leading-4 font-medium',
        STATUS_STYLE[status]
      )}
    >
      {meta.label}
    </span>
  );
}
