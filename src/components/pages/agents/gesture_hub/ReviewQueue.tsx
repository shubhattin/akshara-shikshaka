import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRightIcon, BotIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import {
  buildReviewQueue,
  matchesCategory,
  QUEUE_TAB_META,
  QUEUE_TABS,
  type CategoryFilter,
  type QueueTab
} from '~/agents/review_queue';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Skeleton } from '~/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { get_script_from_id, script_list_obj } from '~/state/lang_list';
import { MobileHistoryButton } from '../sidebar/AgentsSidebar';
import { StartBatchDialog } from '../batches/StartBatchDialog';
import { FilterSelect, type FilterOption } from './FilterSelect';
import { GestureFlags } from './GestureFlags';

type ScriptFilter = number | 'all';

export type QueueSearch = {
  tab?: QueueTab;
  script?: ScriptFilter;
  category?: CategoryFilter;
};

const DEFAULT_SCRIPT = script_list_obj.Devanagari;

const categoryValue = (filter: CategoryFilter) => String(filter);
const parseCategory = (value: string): CategoryFilter =>
  value === 'all' || value === 'none' ? value : Number(value);

/**
 * Every gesture by script and lesson category, with what needs attention marked on each: no
 * strokes, hard for learners, flagged, or not reviewed since their last change. Tick gestures to
 * run the Gesture Creator on them as a batch; "Fix" opens the gesture's newest focused chat, or
 * starts one.
 */
export function ReviewQueue({
  search,
  setSearch
}: {
  search: QueueSearch;
  setSearch: (next: QueueSearch) => void;
}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queue_q = useQuery(trpc.agents.review_queue.queryOptions());
  const tab = search.tab ?? 'all';
  const script = search.script ?? DEFAULT_SCRIPT;
  const category = search.category ?? 'all';
  /** Gestures picked for a batch run (the dialog reads them when it opens). */
  const [picked, setPicked] = useState<number[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const data = queue_q.data;
  const all = useMemo(() => data?.gestures ?? [], [data]);
  const practiceDays = data?.practice_window_days ?? 30;

  const inScript = useMemo(
    () => (script === 'all' ? all : all.filter((g) => g.script_id === script)),
    [all, script]
  );
  const filtered = useMemo(
    () => inScript.filter((g) => matchesCategory(g.category_id, category)),
    [inScript, category]
  );
  const buckets = useMemo(() => buildReviewQueue(filtered), [filtered]);
  const rows = useMemo(
    () =>
      tab === 'all'
        ? [...filtered].sort((a, b) => a.script_id - b.script_id || a.id - b.id)
        : (buckets.find((entry) => entry.bucket === tab)?.gestures ?? []),
    [tab, filtered, buckets]
  );
  const tabCount = (t: QueueTab) =>
    t === 'all'
      ? filtered.length
      : (buckets.find((entry) => entry.bucket === t)?.gestures.length ?? 0);

  // only what is on screen stays picked when the filters change
  const visible = new Set(rows.map((g) => g.id));
  const selected = picked.filter((id) => visible.has(id));
  const allSelected = rows.length > 0 && selected.length === rows.length;

  const scriptOptions: FilterOption[] = [
    { value: 'all', label: 'All scripts', count: all.length },
    ...[...new Set(all.map((g) => g.script_id))]
      .sort((a, b) => a - b)
      .map((id) => ({
        value: String(id),
        label: get_script_from_id(id) ?? String(id),
        count: all.filter((g) => g.script_id === id).length
      }))
  ];
  const categoryOptions: FilterOption[] = [
    { value: 'all', label: 'All categories', count: inScript.length },
    ...(data?.categories ?? []).map((c) => ({
      value: String(c.id),
      label: c.name,
      count: inScript.filter((g) => g.category_id === c.id).length
    })),
    {
      value: 'none',
      label: 'Uncategorized',
      count: inScript.filter((g) => g.category_id === null).length
    }
  ];

  const fix = (gesture: (typeof rows)[number]) =>
    gesture.latest_chat_id
      ? void navigate({ to: '/admin/agents/$chatId', params: { chatId: gesture.latest_chat_id } })
      : void navigate({ to: '/admin/agents', search: { focus: gesture.id } });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        <MobileHistoryButton />
        <h1 className="flex-1 text-sm font-semibold">Review queue</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-2.5 px-4 pt-3 pb-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                label="Script"
                value={String(script)}
                options={scriptOptions}
                onChange={(value) => setSearch({ script: value === 'all' ? 'all' : Number(value) })}
              />
              <FilterSelect
                label="Category"
                value={categoryValue(category)}
                options={categoryOptions}
                onChange={(value) => setSearch({ category: parseCategory(value) })}
                className="min-w-44"
              />
            </div>
            <Tabs
              value={tab}
              onValueChange={(value) =>
                setSearch({ tab: QUEUE_TABS.find((t) => t === value) ?? 'all' })
              }
            >
              <TabsList className="h-auto flex-wrap">
                {QUEUE_TABS.map((t) => (
                  <TabsTrigger key={t} value={t} title={QUEUE_TAB_META[t].hint}>
                    {QUEUE_TAB_META[t].label}
                    <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                      {tabCount(t)}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground">
              {QUEUE_TAB_META[tab].hint}
              {tab === 'struggle' ? ` (last ${practiceDays} days).` : '.'}
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allSelected}
                indeterminate={selected.length > 0 && !allSelected}
                disabled={rows.length === 0}
                onCheckedChange={(next) => setPicked(next === true ? rows.map((g) => g.id) : [])}
                aria-label="Select every gesture listed"
              />
              <span className="flex-1 text-xs text-muted-foreground">
                {selected.length > 0
                  ? `${selected.length} of ${rows.length} selected`
                  : `${rows.length} gestures`}
              </span>
              <Button
                size="sm"
                disabled={selected.length === 0}
                onClick={() => setDialogOpen(true)}
              >
                <BotIcon />
                Run agents{selected.length > 0 ? ` (${selected.length})` : ''}
              </Button>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-4xl px-4 py-3">
          {queue_q.isPending ? (
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-13 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {filtered.length === 0
                ? 'No gestures match these filters.'
                : 'Nothing needs attention here.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((gesture) => (
                <li
                  key={gesture.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted/40"
                >
                  <Checkbox
                    checked={selected.includes(gesture.id)}
                    onCheckedChange={(next) =>
                      setPicked((current) =>
                        next === true
                          ? [...current, gesture.id]
                          : current.filter((id) => id !== gesture.id)
                      )
                    }
                    aria-label={`Select ${gesture.text} #${gesture.id}`}
                  />
                  <span className="w-9 text-center text-xl leading-none">{gesture.text}</span>
                  <Link
                    to="/admin/agents/gestures/$gestureId"
                    params={{ gestureId: String(gesture.id) }}
                    className="flex min-w-0 flex-1 flex-col gap-1 no-underline"
                  >
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-foreground">
                        {get_script_from_id(gesture.script_id) ?? gesture.script_id}{' '}
                        <span className="font-normal text-muted-foreground">#{gesture.id}</span>
                      </span>
                      <GestureFlags gesture={gesture} practiceDays={practiceDays} />
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {gesture.strokes} strokes · v{gesture.revision}
                      {gesture.attempts > 0 ? ` · ${gesture.attempts} attempts` : ''}
                      {gesture.focused_chats > 0
                        ? ` · ${gesture.focused_chats} focused chat${gesture.focused_chats === 1 ? '' : 's'}`
                        : ''}
                    </span>
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => fix(gesture)}>
                    {gesture.latest_chat_id ? 'Continue' : 'Fix'}
                    <ArrowRightIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {dialogOpen ? (
          <StartBatchDialog gestureIds={selected} open={dialogOpen} onOpenChange={setDialogOpen} />
        ) : null}
      </div>
    </div>
  );
}
