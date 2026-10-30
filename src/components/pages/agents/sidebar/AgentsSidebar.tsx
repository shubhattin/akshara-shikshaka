import { useState } from 'react';
import { AgentKindIcon } from '../AgentKindIcon';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  ListChecksIcon,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import type { AgentKind } from '~/agents/agent_kinds';
import { useStoredValue } from '~/hooks/use_stored_value';
import { cn } from '~/lib/utils';
import { get_script_from_id } from '~/state/lang_list';
import { ReviewBadge } from '../gesture_hub/ReviewBadge';
import { DeleteChatDialog, RenameChatDialog } from './ChatActionsDialogs';
import { groupChatsByDate } from './chat_groups';
import {
  freeChats,
  groupChatsByGesture,
  type FocusedGestureGroup,
  type SidebarChat
} from './gesture_groups';

type ChatRef = { id: string; title: string };

type ListedChat = SidebarChat & { agent_kind: AgentKind };

type SidebarTab = 'gestures' | 'chats';

const TAB_KEY = 'agents_sidebar_tab';

/** One chat in the sidebar: its link, a pulse while it replies, and rename / delete. */
function ChatRow({
  chat,
  active,
  onNavigate,
  onRename,
  onDelete,
  showKind = true
}: {
  chat: ListedChat;
  active: boolean;
  onNavigate?: () => void;
  onRename: (chat: ChatRef) => void;
  onDelete: (chat: ChatRef) => void;
  showKind?: boolean;
}) {
  return (
    <li className="group/chat relative">
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
        {showKind ? <AgentKindIcon kind={chat.agent_kind} /> : null}
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
          <DropdownMenuItem onClick={() => onRename(chat)}>
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onDelete(chat)}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** One gesture of the Gestures tab: its chats fold under it; the name opens its hub. */
function GestureGroupRow({
  group,
  activeChatId,
  activeGestureId,
  rowProps
}: {
  group: FocusedGestureGroup<ListedChat>;
  activeChatId: string | undefined;
  activeGestureId: number | null;
  rowProps: Pick<Parameters<typeof ChatRow>[0], 'onNavigate' | 'onRename' | 'onDelete'>;
}) {
  const containsActive = group.chats.some((chat) => chat.id === activeChatId);
  const [open, setOpen] = useState(containsActive);
  if (containsActive && !open) setOpen(true);
  const hubActive = activeGestureId === group.gesture_id;
  return (
    <li>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          className={cn(
            'flex items-center gap-1 rounded-lg pr-1 transition-colors',
            hubActive ? 'bg-muted' : 'hover:bg-muted/60'
          )}
        >
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={open ? 'Hide chats' : 'Show chats'}
                className="text-muted-foreground"
              />
            }
          >
            <ChevronRightIcon className={cn('transition-transform', open && 'rotate-90')} />
          </CollapsibleTrigger>
          <Link
            to="/admin/agents/gestures/$gestureId"
            params={{ gestureId: String(group.gesture_id) }}
            onClick={rowProps.onNavigate}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-sm text-foreground no-underline"
          >
            <span className="text-base leading-none font-semibold">{group.text}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {get_script_from_id(group.script_id) ?? group.script_id} · {group.chats.length}{' '}
              {group.chats.length === 1 ? 'chat' : 'chats'}
            </span>
            {group.streaming ? (
              <span
                title="A chat is replying"
                className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
              />
            ) : null}
            <ReviewBadge status={group.review_status} strokes={group.strokes} />
          </Link>
        </div>
        <CollapsibleContent>
          <ul className="ml-3 flex flex-col gap-0.5 border-l border-border/70 py-0.5 pl-1.5">
            {group.chats.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                active={chat.id === activeChatId}
                showKind={false}
                {...rowProps}
              />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function matchesSearch(chat: ListedChat, needle: string) {
  if (!needle) return true;
  const script =
    chat.focus_script_id === null ? '' : (get_script_from_id(chat.focus_script_id) ?? '');
  return [chat.title || 'new chat', chat.focus_text ?? '', chat.focus_text_key ?? '', script]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

const parseTab = (stored: string | null): SidebarTab | null =>
  stored === 'gestures' || stored === 'chats' ? stored : null;

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

  const all: ListedChat[] = chats_q.data ?? [];
  const activeChat = all.find((chat) => chat.id === params.chatId);
  const activeGestureId = params.gestureId ? Number(params.gestureId) : null;
  const [storedTab, storeTab] = useStoredValue(TAB_KEY);
  const pickedTab = parseTab(storedTab);
  // An open focused chat or gesture hub shows the Gestures tab until another one is picked.
  const tab: SidebarTab =
    pickedTab ??
    (activeChat?.focus_gesture_id != null || activeGestureId !== null ? 'gestures' : 'chats');
  const pickTab = (next: SidebarTab) => storeTab(next);

  const needle = search.trim().toLowerCase();
  const chats = all.filter((chat) => matchesSearch(chat, needle));
  // While searching, the Chats tab finds focused chats too.
  const free = needle ? chats : freeChats(chats);
  const byGesture = groupChatsByGesture(chats);
  const rowProps = { onNavigate, onRename: setRenaming, onDelete: setDeleting };

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
        <div className="flex gap-1.5">
          <Button
            render={<Link to="/admin/agents" onClick={onNavigate} />}
            nativeButton={false}
            variant="outline"
            className="flex-1 justify-start"
          >
            <PlusIcon />
            New chat
          </Button>
          <Button
            render={<Link to="/admin/agents/queue" onClick={onNavigate} />}
            nativeButton={false}
            variant="outline"
            size="icon"
            aria-label="Review queue"
            title="Review queue"
          >
            <ListChecksIcon />
          </Button>
        </div>
        <InputGroup className="h-8">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search chats and gestures"
            aria-label="Search chats and gestures"
          />
        </InputGroup>
        <Tabs
          value={tab}
          onValueChange={(value) => pickTab(value === 'chats' ? 'chats' : 'gestures')}
        >
          <TabsList className="w-full">
            <TabsTrigger value="gestures">Gestures</TabsTrigger>
            <TabsTrigger value="chats">Chats</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <nav aria-label="Chat history" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {chats_q.isPending ? (
          <div className="flex flex-col gap-1.5 px-1">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : tab === 'gestures' ? (
          byGesture.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {needle
                ? 'No gestures match.'
                : 'No focused chats yet. Start one from New chat → Focus on one gesture.'}
            </p>
          ) : (
            byGesture.map((akshara) => (
              <section key={akshara.text_key} className="mb-2">
                <ul className="flex flex-col gap-0.5">
                  {akshara.gestures.map((group) => (
                    <GestureGroupRow
                      key={group.gesture_id}
                      group={group}
                      activeChatId={params.chatId}
                      activeGestureId={activeGestureId}
                      rowProps={rowProps}
                    />
                  ))}
                </ul>
              </section>
            ))
          )
        ) : free.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {needle ? 'No chats match.' : 'No chats yet.'}
          </p>
        ) : (
          groupChatsByDate(free).map((group) => (
            <section key={group.label} className="mb-3">
              <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.label}</h2>
              <ul className="flex flex-col gap-0.5">
                {group.chats.map((chat) => (
                  <ChatRow
                    key={chat.id}
                    chat={chat}
                    active={params.chatId === chat.id}
                    {...rowProps}
                  />
                ))}
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
