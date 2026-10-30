import { CheckCircle2Icon, CrosshairIcon, MessagesSquareIcon } from 'lucide-react';
import { cn } from '~/lib/utils';
import { timeAgo } from './time';

export type GestureChatRow = {
  id: string;
  title: string;
  updated_at: Date | string;
  streaming: boolean;
  focused: boolean;
  applied_at: Date | string | null;
  user_name: string | null;
};

/**
 * The chats about one gesture: those focused on it first, then free chats that mentioned or
 * proposed it. `renderLink` wraps each row (a route link, or the editor panel's opener).
 */
export function GestureChats({
  chats,
  activeChatId,
  renderLink
}: {
  chats: GestureChatRow[];
  activeChatId?: string | null;
  renderLink: (
    chat: GestureChatRow,
    content: React.ReactNode,
    className: string
  ) => React.ReactNode;
}) {
  if (chats.length === 0) {
    return <p className="text-sm text-muted-foreground">No chats about this gesture yet.</p>;
  }
  const sections = [
    { label: 'Focused on it', rows: chats.filter((chat) => chat.focused) },
    { label: 'Mentioned in', rows: chats.filter((chat) => !chat.focused) }
  ].filter((section) => section.rows.length > 0);
  return (
    <div className="flex flex-col gap-3">
      {sections.map((section) => (
        <section key={section.label} className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-muted-foreground">{section.label}</h3>
          <ul className="flex flex-col gap-0.5">
            {section.rows.map((chat) => (
              <li key={chat.id}>
                {renderLink(
                  chat,
                  <>
                    {chat.focused ? (
                      <CrosshairIcon className="size-3.5 shrink-0 text-primary" />
                    ) : (
                      <MessagesSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{chat.title || 'New chat'}</span>
                    {chat.streaming ? (
                      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
                    ) : null}
                    {chat.applied_at ? (
                      <CheckCircle2Icon
                        className="size-3.5 shrink-0 text-emerald-600"
                        aria-label="A proposal from it was applied"
                      />
                    ) : null}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {chat.user_name ? `${chat.user_name} · ` : ''}
                      {timeAgo(chat.updated_at)}
                    </span>
                  </>,
                  cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm no-underline transition-colors',
                    chat.id === activeChatId
                      ? 'bg-muted font-medium'
                      : 'text-foreground/85 hover:bg-muted/60 hover:text-foreground'
                  )
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
