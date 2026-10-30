import {
  failureRate,
  gestureFlags,
  type GestureFlag,
  type QueueGesture
} from '~/agents/review_queue';
import { cn } from '~/lib/utils';

const FLAG_META = {
  empty: { label: 'No strokes', style: 'border-border text-muted-foreground' },
  struggle: {
    label: 'Learners struggle',
    style: 'border-orange-500/40 text-orange-700 dark:text-orange-300'
  },
  needs_work: { label: 'Needs work', style: 'border-destructive/40 text-destructive' },
  unreviewed: {
    label: 'Unreviewed',
    style: 'border-amber-500/40 text-amber-700 dark:text-amber-300'
  },
  approved: {
    label: 'Approved',
    style: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
  }
} as const satisfies Record<GestureFlag, { label: string; style: string }>;

/** Every state of a gesture worth noticing, as small outlined tags (details on hover). */
export function GestureFlags({
  gesture,
  practiceDays,
  className
}: {
  gesture: QueueGesture & { review_note: string };
  /** Window the practice numbers cover */
  practiceDays: number;
  className?: string;
}) {
  const title = (flag: GestureFlag) => {
    if (flag === 'struggle') {
      return `${gesture.attempts} attempts in the last ${practiceDays} days, ${Math.round(failureRate(gesture) * 100)}% unfinished`;
    }
    if (flag === 'needs_work' && gesture.review_note) return gesture.review_note;
    return undefined;
  };
  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      {gestureFlags(gesture).map((flag) => (
        <span
          key={flag}
          title={title(flag)}
          className={cn(
            'shrink-0 rounded-md border px-1.5 py-px text-[11px] leading-4 font-medium',
            FLAG_META[flag].style
          )}
        >
          {FLAG_META[flag].label}
        </span>
      ))}
    </span>
  );
}
