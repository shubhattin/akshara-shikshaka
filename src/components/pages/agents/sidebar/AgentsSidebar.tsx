import { useState } from 'react';
import { AgentKindIcon } from '../AgentKindIcon';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon
} from 'lucide-react';
import { useTRPC } from '~/api/client';
import { Button } from '~/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '~/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/components/ui/input-group';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';
import { DeleteChatDialog, RenameChatDialog } from './ChatActionsDialogs';
import { groupChatsByDate } from './chat_groups';

type ChatRef = { id: string; title: string };

function ChatHistory({ onNavigate }: { onNavigate?: () => void }) {
  const trpc = useTRPC();
  const params = useParams({ strict: false });
  const chats_q = useQuery(
    trpc.agents.list_chats.queryOptions(undefined, {
      // While any chat streams in the background, keep the list fresh.
      refetchInterval: (query) => (query.state.data?.some((chat) => chat.streaming) ? 3000 : false)
    })
  );
  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState<ChatRef | null>(null);
  const [deleting, setDeleting] = useState<ChatRef | null>(null);

  const needle = search.trim().toLowerCase();
  const chats = (chats_q.data ?? []).filter(
    (chat) => !needle || (chat.title || 'new chat').toLowerCase().includes(needle)
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 px-3 pb-2">
        <Button
          render={<Link to="/admin" />}
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="-ml-1 justify-start text-muted-foreground"
        >
          <ArrowLeftIcon />
          Back to admin
        </Button>
        <Button
          render={<Link to="/admin/agents" onClick={onNavigate} />}
          nativeButton={false}
          variant="outline"
          className="justify-start"
        >
          <PlusIcon />
          New chat
        </Button>
        <InputGroup className="h-8">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search chats"
            aria-label="Search chats"
          />
        </InputGroup>
      </div>

      <nav aria-label="Chat history" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {chats_q.isPending ? (
          <div className="flex flex-col gap-1.5 px-1">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : chats.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {chats_q.data?.length ? 'No chats match.' : 'No chats yet.'}
          </p>
        ) : (
          groupChatsByDate(chats).map((group) => (
            <section key={group.label} className="mb-3">
              <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.label}</h2>
              <ul className="flex flex-col gap-0.5">
                {group.chats.map((chat) => {
                  const active = params.chatId === chat.id;
                  return (
                    <li key={chat.id} className="group/chat relative">
                      <Link
                        to="/admin/agents/$chatId"
                        params={{ chatId: chat.id }}
                        onClick={onNavigate}
                        className={cn(
                          'flex items-center gap-2 rounded-lg py-1.5 pr-8 pl-2 text-sm no-underline transition-colors',
                          active
                            ? 'bg-muted font-medium text-foreground'
                            : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground'
                        )}
                      >
                        <AgentKindIcon kind={chat.agent_kind} />
                        <span className="min-w-0 flex-1 truncate">{chat.title || 'New chat'}</span>
                        {chat.streaming ? (
                          <span
                            title="Replying in the background"
                            className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
                          />
                        ) : null}
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Actions for ${chat.title || 'chat'}`}
                              className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/chat:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
                            />
                          }
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem onClick={() => setRenaming(chat)}>
                            <PencilIcon />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(chat)}>
                            <Trash2Icon />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </nav>

      {renaming ? (
        <RenameChatDialog key={renaming.id} chat={renaming} onClose={() => setRenaming(null)} />
      ) : null}
      <DeleteChatDialog chat={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

/** Chat history beside the conversation (md and up). */
export function AgentsSidebar() {
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-border/70 bg-muted/20 pt-3 md:flex">
      <ChatHistory />
    </aside>
  );
}

/** Opens the chat history in a drawer on small screens. */
export function MobileHistoryButton() {
  const [open, setOpen] = useState(false);
  return (
    <Drawer direction="left" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Chat history" className="md:hidden">
          <PanelLeftIcon />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="pt-3">
        <DrawerTitle className="px-4 pb-2 text-sm font-semibold">Chats</DrawerTitle>
        <ChatHistory onNavigate={() => setOpen(false)} />
      </DrawerContent>
    </Drawer>
  );
}
