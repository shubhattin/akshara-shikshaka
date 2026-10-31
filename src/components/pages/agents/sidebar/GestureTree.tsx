import { useMemo, useState } from 'react';
import { PreviewCard } from '@base-ui/react/preview-card';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon, ExternalLinkIcon } from 'lucide-react';
import { z } from 'zod';
import { GestureInspectByIdDialog, LazyGestureThumb } from '~/components/gesture/LazyGestureThumb';
import { Button } from '~/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { useStoredValue } from '~/hooks/use_stored_value';
import { cn } from '~/lib/utils';
import { get_script_from_id } from '~/state/lang_list';
import { BatchStatusBadge } from '../batches/BatchStatusBadge';
import { FilterSelect, type FilterOption } from '../gesture_hub/FilterSelect';
import { ReviewBadge } from '../gesture_hub/ReviewBadge';
import {
  buildSidebarTree,
  hasPendingProposal,
  SIDEBAR_GROUP_META,
  SIDEBAR_GROUP_MODES,
  SIDEBAR_STATUS_META,
  SIDEBAR_STATUSES,
  statusCounts,
  type SidebarCategory,
  type SidebarEntry,
  type SidebarFilters,
  type SidebarGesture,
  type SidebarGroup
} from './sidebar_tree';

const FILTERS_KEY = 'agents_sidebar_gesture_filters';
const COLLAPSED_KEY = 'agents_sidebar_collapsed_groups';

const filters_schema = z.object({
  mode: z.enum(SIDEBAR_GROUP_MODES).catch('category'),
  script: z.union([z.literal('all'), z.int()]).catch('all'),
  statuses: z.array(z.enum(SIDEBAR_STATUSES)).catch([])
});
const DEFAULT_FILTERS: z.infer<typeof filters_schema> = {
  mode: 'category',
  script: 'all',
  statuses: []
};

function parseStored<T>(stored: string | null, schema: z.ZodType<T>, fallback: T): T {
  if (!stored) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

const scriptName = (id: number) => get_script_from_id(id) ?? `Script ${id}`;

/** A chat under a gesture row (its link and the rename / delete menu come from the sidebar). */
export type RenderChat = (chat: { id: string }) => React.ReactNode;

export type TreeChat = { id: string; focus_gesture_id: number | null };

/** The gesture glyph: hover for its saved strokes (click them to inspect). */
function GlyphPreview({ gesture }: { gesture: SidebarGesture }) {
  const [inspecting, setInspecting] = useState(false);
  return (
    <>
      <PreviewCard.Root>
        <PreviewCard.Trigger
          render={<span />}
          delay={350}
          className="w-6 shrink-0 text-center text-base leading-none font-semibold"
        >
          {gesture.text}
        </PreviewCard.Trigger>
        <PreviewCard.Portal>
          <PreviewCard.Positioner side="right" sideOffset={10} className="isolate z-50">
            <PreviewCard.Popup className="flex w-56 flex-col gap-1.5 rounded-lg bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden">
              <LazyGestureThumb
                id={gesture.id}
                text={gesture.text}
                strokes={gesture.strokes}
                version={gesture.updated_at}
                size="full"
                onInspect={() => setInspecting(true)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {scriptName(gesture.script_id)} #{gesture.id} · v{gesture.revision} ·{' '}
                {gesture.strokes} strokes
              </p>
            </PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      </PreviewCard.Root>
      {inspecting ? (
        <GestureInspectByIdDialog
          id={gesture.id}
          text={gesture.text}
          version={gesture.updated_at}
          onClose={() => setInspecting(false)}
        />
      ) : null}
    </>
  );
}

/** One gesture: glyph (hover preview), state, chats folded under it; the name opens its hub. */
function GestureRow({
  entry,
  chats,
  activeChatId,
  activeGestureId,
  showScript,
  renderChat,
  onNavigate
}: {
  entry: SidebarEntry;
  chats: TreeChat[];
  activeChatId: string | undefined;
  activeGestureId: number | null;
  showScript: boolean;
  renderChat: RenderChat;
  onNavigate?: () => void;
}) {
  const { gesture, batchStatus } = entry;
  const containsActive = chats.some((chat) => chat.id === activeChatId);
  const [open, setOpen] = useState(containsActive);
  // opening another chat unfolds its gesture once; folding it by hand afterwards sticks
  const [seenChat, setSeenChat] = useState(activeChatId);
  if (seenChat !== activeChatId) {
    setSeenChat(activeChatId);
    if (containsActive && !open) setOpen(true);
  }
  const hubActive = activeGestureId === gesture.id;
  const pending = hasPendingProposal(gesture);

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
          <GlyphPreview gesture={gesture} />
          <Link
            to="/admin/agents/gestures/$gestureId"
            params={{ gestureId: String(gesture.id) }}
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-sm text-foreground no-underline"
          >
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {showScript ? `${scriptName(gesture.script_id)} · ` : ''}
              {chats.length} {chats.length === 1 ? 'chat' : 'chats'}
            </span>
            {gesture.streaming ? (
              <span
                title="A chat is replying"
                className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
              />
            ) : null}
            {pending && !batchStatus ? (
              <span
                title="A batch proposal waits for review"
                className="size-1.5 shrink-0 rounded-full bg-amber-500"
              />
            ) : null}
            {batchStatus ? (
              <BatchStatusBadge status={batchStatus} stuck={false} />
            ) : (
              <ReviewBadge status={gesture.review_status} strokes={gesture.strokes} />
            )}
          </Link>
        </div>
        <CollapsibleContent>
          <ul className="ml-3 flex flex-col gap-0.5 border-l border-border/70 py-0.5 pl-1.5">
            {chats.length === 0 ? (
              <li className="px-2 py-1 text-xs text-muted-foreground">No chats</li>
            ) : (
              chats.map((chat) => renderChat(chat))
            )}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function GroupSection({
  group,
  depth,
  collapsed,
  toggle,
  activeGestureId,
  activeChatId,
  rowProps
}: {
  group: SidebarGroup;
  depth: number;
  collapsed: ReadonlySet<string>;
  toggle: (key: string, open: boolean) => void;
  activeGestureId: number | null;
  activeChatId: string | undefined;
  rowProps: Omit<
    Parameters<typeof GestureRow>[0],
    'entry' | 'chats' | 'activeChatId' | 'activeGestureId'
  > & { chatsOf: (gestureId: number) => TreeChat[] };
}) {
  const containsActive = group.entries.some(
    (e) =>
      e.gesture.id === activeGestureId ||
      rowProps.chatsOf(e.gesture.id).some((chat) => chat.id === activeChatId)
  );
  // navigating to a gesture or chat inside unfolds the group once; folding it by hand sticks
  const activeKey = `${activeGestureId}|${activeChatId}`;
  const [seenActive, setSeenActive] = useState(activeKey);
  const [forced, setForced] = useState(containsActive);
  if (seenActive !== activeKey) {
    setSeenActive(activeKey);
    setForced(containsActive);
  }
  const open = forced || !collapsed.has(group.key);
  const onOpenChange = (next: boolean) => {
    if (!next) setForced(false);
    toggle(group.key, next);
  };
  const { chatsOf, ...gestureRowProps } = rowProps;
  return (
    <section className={cn(depth === 0 ? 'mb-1.5' : 'mb-1 ml-2')}>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="group/header flex items-center gap-1 pr-1">
          <CollapsibleTrigger
            className={cn(
              'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-semibold transition-colors hover:bg-muted/60',
              depth === 0 ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            <ChevronRightIcon
              className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
            />
            <span className="min-w-0 flex-1 truncate">{group.label}</span>
            {group.toReview > 0 ? (
              <span
                title={`${group.toReview} with a proposal to review`}
                className="rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-700 tabular-nums dark:text-amber-300"
              >
                {group.toReview}
              </span>
            ) : null}
            <span className="font-normal text-muted-foreground tabular-nums">
              {new Set(group.entries.map((e) => e.gesture.id)).size}
            </span>
          </CollapsibleTrigger>
          {group.batchId !== undefined ? (
            <Button
              variant="ghost"
              size="icon-xs"
              nativeButton={false}
              aria-label="Open batch"
              title="Open batch"
              className="text-muted-foreground"
              render={
                <Link
                  to="/admin/agents/batches/$batchId"
                  params={{ batchId: String(group.batchId) }}
                  onClick={rowProps.onNavigate}
                />
              }
            >
              <ExternalLinkIcon />
            </Button>
          ) : null}
        </div>
        <CollapsibleContent>
          {group.children ? (
            group.children.map((child) => (
              <GroupSection
                key={child.key}
                group={child}
                depth={depth + 1}
                collapsed={collapsed}
                toggle={toggle}
                activeGestureId={activeGestureId}
                activeChatId={activeChatId}
                rowProps={rowProps}
              />
            ))
          ) : (
            <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto overscroll-contain">
              {group.entries.map((entry) => (
                <GestureRow
                  key={`${group.key}-${entry.gesture.id}`}
                  entry={entry}
                  chats={chatsOf(entry.gesture.id)}
                  activeChatId={activeChatId}
                  activeGestureId={activeGestureId}
                  {...gestureRowProps}
                />
              ))}
            </ul>
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

/**
 * The sidebar's Gestures tab: gestures with focused chats, grouped by script and lesson
 * category (in lesson order), by batch, or by recent activity; filtered by script and review
 * state. Filters and folded groups are remembered.
 */
export function GestureTree({
  gestures,
  categories,
  chats,
  needle,
  activeChatId,
  activeGestureId,
  renderChat,
  onNavigate
}: {
  gestures: SidebarGesture[];
  categories: SidebarCategory[];
  chats: TreeChat[];
  needle: string;
  activeChatId: string | undefined;
  activeGestureId: number | null;
  renderChat: RenderChat;
  onNavigate?: () => void;
}) {
  const [storedFilters, storeFilters] = useStoredValue(FILTERS_KEY);
  const filters = parseStored(storedFilters, filters_schema, DEFAULT_FILTERS);
  const setFilters = (next: Partial<SidebarFilters>) =>
    storeFilters(JSON.stringify({ ...filters, ...next }));
  const [storedCollapsed, storeCollapsed] = useStoredValue(COLLAPSED_KEY);
  const collapsed = new Set(parseStored(storedCollapsed, z.array(z.string()), []));
  const toggle = (key: string, open: boolean) => {
    const next = new Set(collapsed);
    if (open) next.delete(key);
    else next.add(key);
    storeCollapsed(JSON.stringify([...next]));
  };

  const chatsByGesture = useMemo(() => {
    const map = new Map<number, TreeChat[]>();
    for (const chat of chats) {
      if (chat.focus_gesture_id === null) continue;
      map.set(chat.focus_gesture_id, [...(map.get(chat.focus_gesture_id) ?? []), chat]);
    }
    return map;
  }, [chats]);

  const tree = buildSidebarTree(gestures, categories, { ...filters, needle }, scriptName);
  const counts = statusCounts(gestures, filters.script);
  const scriptOptions: FilterOption[] = [
    { value: 'all', label: 'All scripts', count: gestures.length },
    ...[...new Set(gestures.map((g) => g.script_id))]
      .sort((a, b) => a - b)
      .map((id) => ({
        value: String(id),
        label: scriptName(id),
        count: gestures.filter((g) => g.script_id === id).length
      }))
  ];
  const toggleStatus = (status: (typeof SIDEBAR_STATUSES)[number]) =>
    setFilters({
      statuses: filters.statuses.includes(status)
        ? filters.statuses.filter((s) => s !== status)
        : [...filters.statuses, status]
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5 px-1">
        <div className="flex items-center gap-1.5">
          <FilterSelect
            label="Script"
            value={String(filters.script)}
            options={scriptOptions}
            onChange={(value) => setFilters({ script: value === 'all' ? 'all' : Number(value) })}
            className="min-w-0 flex-1"
          />
          <Tabs
            value={filters.mode}
            onValueChange={(value) =>
              setFilters({ mode: SIDEBAR_GROUP_MODES.find((m) => m === value) ?? 'category' })
            }
          >
            <TabsList className="h-8">
              {SIDEBAR_GROUP_MODES.map((mode) => (
                <TabsTrigger
                  key={mode}
                  value={mode}
                  title={SIDEBAR_GROUP_META[mode].hint}
                  className="px-1.5 text-xs"
                >
                  {SIDEBAR_GROUP_META[mode].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by state">
          {SIDEBAR_STATUSES.map((status) => {
            const on = filters.statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                aria-pressed={on}
                title={SIDEBAR_STATUS_META[status].hint}
                onClick={() => toggleStatus(status)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  on
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-border/70 text-muted-foreground hover:bg-muted/60'
                )}
              >
                {SIDEBAR_STATUS_META[status].label}
                <span className="ml-1 tabular-nums opacity-70">{counts[status]}</span>
              </button>
            );
          })}
        </div>
      </div>
      {tree.length === 0 ? (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {gestures.length === 0
            ? 'No focused chats yet. Start one from New chat → Focus on one gesture.'
            : 'No gestures match.'}
        </p>
      ) : (
        <div>
          {tree.map((group) => (
            <GroupSection
              key={group.key}
              group={group}
              depth={0}
              collapsed={collapsed}
              toggle={toggle}
              activeGestureId={activeGestureId}
              activeChatId={activeChatId}
              rowProps={{
                chatsOf: (id) => chatsByGesture.get(id) ?? [],
                showScript: filters.script === 'all' && filters.mode !== 'category',
                renderChat,
                onNavigate
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
