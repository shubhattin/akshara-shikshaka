import { XIcon } from 'lucide-react';
import type { GestureRefData } from '~/agents/ui_message';
import { cn } from '~/lib/utils';
import { get_script_from_id } from '~/state/lang_list';

const CHIP =
  'inline-flex h-7 max-w-60 items-center gap-1.5 rounded-lg border border-border/80 bg-muted/50 pl-2 text-xs font-medium text-foreground';

/**
 * Mentioned gestures as compact chips: removable in the composer, links to the gesture editor in
 * a sent message.
 */
export function GestureRefChips({
  refs,
  onRemove,
  className
}: {
  refs: GestureRefData[];
  onRemove?: (ref: GestureRefData) => void;
  className?: string;
}) {
  if (refs.length === 0) return null;
  return (
    <ul aria-label="Mentioned gestures" className={cn('flex flex-wrap gap-1.5', className)}>
      {refs.map((ref) => {
        const script = get_script_from_id(ref.script_id) ?? '';
        const label = `${ref.text} · ${script} · #${ref.id}`;
        const body = (
          <>
            <span className="text-sm leading-none">{ref.text}</span>
            <span className="truncate text-muted-foreground">
              {script} #{ref.id}
            </span>
          </>
        );
        return (
          <li key={ref.id} className="min-w-0">
            {onRemove ? (
              <span className={cn(CHIP, 'pr-0.5')} title={label}>
                {body}
                <button
                  type="button"
                  aria-label={`Remove ${ref.text}`}
                  onClick={() => onRemove(ref)}
                  className="ml-0.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            ) : (
              <a
                href={`/gestures/edit/${ref.id}`}
                target="_blank"
                rel="noreferrer"
                title={`${label} — open in the editor`}
                className={cn(CHIP, 'pr-2 transition-colors hover:border-foreground/25')}
              >
                {body}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
