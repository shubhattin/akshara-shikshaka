import { BATCH_ITEM_STATUSES, BATCH_ITEM_STATUS_META, type BatchItemStatus } from '~/agents/batch';
import { cn } from '~/lib/utils';
import { STATUS_BAR_FILL } from './BatchStatusBadge';

export type BatchCounts = Record<BatchItemStatus, number> & { total: number };

/** Stacked bar of every item state, with a per-state count row below it. */
export function BatchProgress({ counts }: { counts: BatchCounts }) {
  const total = Math.max(1, counts.total);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${counts.total} items: ${BATCH_ITEM_STATUSES.map((status) => `${counts[status]} ${BATCH_ITEM_STATUS_META[status].label}`).join(', ')}`}
      >
        {BATCH_ITEM_STATUSES.map((status) =>
          counts[status] > 0 ? (
            <span
              key={status}
              title={`${BATCH_ITEM_STATUS_META[status].label}: ${counts[status]}`}
              style={{ width: `${(counts[status] / total) * 100}%` }}
              className={cn('h-full', STATUS_BAR_FILL[status])}
            />
          ) : null
        )}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {BATCH_ITEM_STATUSES.map((status) =>
          counts[status] > 0 ? (
            <span key={status} title={BATCH_ITEM_STATUS_META[status].hint}>
              <span className="font-medium text-foreground">{counts[status]}</span>{' '}
              {BATCH_ITEM_STATUS_META[status].label.toLowerCase()}
            </span>
          ) : null
        )}
      </p>
    </div>
  );
}
