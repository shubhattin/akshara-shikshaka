import type { ReactNode } from 'react';
import { CornerDownLeftIcon, PencilIcon, XIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import type { QueuedMessage } from './use_message_queue';

function QueueAction({
  label,
  onClick,
  children
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label={label}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Messages waiting for the current reply to end: edit, send now (interrupting) or drop each. */
export function QueuedMessages({
  queue,
  paused,
  onEdit,
  onSendNow,
  onRemove
}: {
  queue: readonly QueuedMessage[];
  paused: boolean;
  onEdit: (id: string) => void;
  onSendNow: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (queue.length === 0) return null;
  return (
    <section
      aria-label="Queued messages"
      className="flex flex-col gap-0.5 rounded-xl border border-border/70 bg-muted/30 p-1.5"
    >
      <p className="px-1.5 pb-0.5 text-[11px] font-medium text-muted-foreground">
        {paused
          ? 'Queue paused — send a message or use Send now to continue'
          : 'Queued · sends when the reply ends'}
      </p>
      <ol className="flex flex-col gap-0.5">
        {queue.map(({ id, message }) => {
          const mentions = message.refs.map((ref) => ref.text).join(' ');
          return (
            <li
              key={id}
              className="group flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm hover:bg-muted/60"
            >
              <span className="min-w-0 flex-1 truncate" title={message.text}>
                {mentions ? <span className="mr-1.5 text-muted-foreground">{mentions}</span> : null}
                {message.text}
              </span>
              <QueueAction label="Edit" onClick={() => onEdit(id)}>
                <PencilIcon />
              </QueueAction>
              <QueueAction label="Send now (stops the current reply)" onClick={() => onSendNow(id)}>
                <CornerDownLeftIcon />
              </QueueAction>
              <QueueAction label="Remove" onClick={() => onRemove(id)}>
                <XIcon />
              </QueueAction>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
