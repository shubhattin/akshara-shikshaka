import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CopyIcon, RotateCcwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import type { AppRouter } from '~/api/trpc_router';
import { BATCH_ITEM_STATUSES, BATCH_ITEM_STATUS_META, type BatchItemStatus } from '~/agents/batch';
import { agent_model_id_schema, AGENT_MODELS } from '~/agents/models';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { Spinner } from '~/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { get_script_from_id } from '~/state/lang_list';
import type { inferRouterOutputs } from '@trpc/server';
import { MobileHistoryButton } from '../sidebar/AgentsSidebar';
import { timeAgo } from '../gesture_hub/time';
import { BatchProgress } from './BatchProgress';
import { BatchReviewGrid } from './BatchReviewGrid';
import { BatchStatusBadge } from './BatchStatusBadge';
import { formatDuration, formatEta, formatUsd, runSeconds } from './batch_format';
import { invalidateBatch } from './batch_invalidate';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type BatchDetail = RouterOutputs['agents']['get_batch'];
type BatchItem = BatchDetail['items'][number];

type ItemFilter = 'all' | BatchItemStatus;

/** Label of a stored model, or the raw id when it no longer exists. */
function modelLabel(model: string): string {
  const parsed = agent_model_id_schema.safeParse(model);
  return parsed.success ? AGENT_MODELS[parsed.data].label : model;
}

/** One item of the batch: its state, run stats, and links to its chat and gesture hub. */
function BatchItemRow({
  item,
  rerunPending,
  onRerun
}: {
  item: BatchItem;
  rerunPending: boolean;
  onRerun: () => void;
}) {
  const seconds = runSeconds(item.started_at, item.finished_at);
  const duration = formatDuration(seconds);
  const rerunnable =
    item.status === 'failed' ||
    item.status === 'no_proposal' ||
    item.status === 'cancelled' ||
    item.stuck;
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
      <span className="w-8 text-center text-xl leading-none">{item.text}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <Link
            to="/admin/agents/gestures/$gestureId"
            params={{ gestureId: String(item.text_gesture_id) }}
            className="font-medium text-foreground no-underline hover:text-primary"
          >
            {get_script_from_id(item.script_id) ?? item.script_id} #{item.text_gesture_id}
          </Link>
          <BatchStatusBadge status={item.status} stuck={item.stuck} />
          <span className="text-xs text-muted-foreground">
            {item.attempts} {item.attempts === 1 ? 'attempt' : 'attempts'}
            {duration ? ` · ${duration}` : ''} · {formatUsd(item.cost)}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-x-2 truncate text-xs text-muted-foreground">
          {item.chat_id ? (
            <Link
              to="/admin/agents/$chatId"
              params={{ chatId: item.chat_id }}
              className="underline decoration-dotted underline-offset-2 hover:text-primary"
            >
              chat{item.chat_streaming ? ' (replying)' : ''}
            </Link>
          ) : (
            <span>no chat yet</span>
          )}
          {item.qstash_message_id ? (
            <button
              type="button"
              title={`Copy QStash message id ${item.qstash_message_id}`}
              aria-label={`Copy QStash message id for ${item.text}`}
              className="inline-flex max-w-40 cursor-pointer items-center gap-1 truncate rounded px-0.5 font-mono text-[11px] hover:bg-muted"
              onClick={() => {
                void navigator.clipboard
                  .writeText(item.qstash_message_id ?? '')
                  .then(() => toast.success('Message id copied'))
                  .catch(() => toast.error('Copy failed'));
              }}
            >
              <CopyIcon className="size-3 shrink-0" />
              <span className="truncate">{item.qstash_message_id}</span>
            </button>
          ) : null}
        </p>
        {item.error ? (
          <p className="truncate text-xs text-destructive" title={item.error}>
            {item.error}
          </p>
        ) : null}
      </div>
      {rerunnable ? (
        <Button size="sm" variant="outline" disabled={rerunPending} onClick={onRerun}>
          {rerunPending ? <Spinner className="size-3.5" /> : <RotateCcwIcon />}
          Re-run
        </Button>
      ) : null}
    </li>
  );
}

/** The monitoring page of one batch: progress, per-item states, and the review grid. */
export function BatchPage({ batchId }: { batchId: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ItemFilter>('all');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const batch_q = useQuery(
    trpc.agents.get_batch.queryOptions(
      { batch_id: batchId },
      {
        retry: false,
        refetchInterval: (query) => {
          const counts = query.state.data?.counts;
          return counts && counts.queued + counts.running > 0 ? 4000 : false;
        }
      }
    )
  );

  const cancel_mut = useMutation(
    trpc.agents.cancel_batch.mutationOptions({
      onSuccess: () => {
        invalidateBatch(queryClient, trpc, batchId);
        setConfirmCancel(false);
        toast.success('Batch cancelled');
      },
      onError: (error) => toast.error(error.message)
    })
  );
  const rerun_mut = useMutation(
    trpc.agents.rerun_batch_items.mutationOptions({
      onSuccess: (result) => {
        invalidateBatch(queryClient, trpc, batchId);
        toast.success(`Requeued ${result.requeued} runs`);
      },
      onError: (error) => toast.error(error.message)
    })
  );

  if (batch_q.isError) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {batch_q.error.message}
      </div>
    );
  }
  if (!batch_q.data) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const { batch, counts, eta_seconds, items } = batch_q.data;
  const active = counts.queued + counts.running > 0;
  const done = counts.total - counts.queued - counts.running;
  const stuckCount = items.filter((item) => item.stuck).length;
  const rerunnable = counts.failed + counts.no_proposal + counts.cancelled + stuckCount;
  const avg = formatDuration(counts.avg_seconds);
  const eta = formatEta(eta_seconds);
  const rows = filter === 'all' ? items : items.filter((item) => item.status === filter);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        <MobileHistoryButton />
        <h1 className="flex-1 truncate text-sm font-semibold">
          {batch.title || `Batch #${batch.id}`}
        </h1>
        {rerunnable > 0 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={rerun_mut.isPending}
            onClick={() => rerun_mut.mutate({ batch_id: batchId })}
          >
            {rerun_mut.isPending ? <Spinner className="size-3.5" /> : <RotateCcwIcon />}
            Re-run failed
          </Button>
        ) : null}
        {active ? (
          <Button size="sm" variant="destructive" onClick={() => setConfirmCancel(true)}>
            Cancel
          </Button>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4">
          <section className="flex flex-col gap-2 rounded-xl border border-border/70 p-3">
            <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>
                {modelLabel(batch.model)} · {batch.parallelism} at once
              </span>
              <span>
                {formatUsd(counts.cost)} spent
                {batch.budget_usd === null ? '' : ` of ${formatUsd(batch.budget_usd)} budget`}
              </span>
              <span>
                {batch.user_name ?? 'Admin'} · {timeAgo(batch.created_at)}
              </span>
            </p>
            <BatchProgress counts={counts} />
            <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{done}</span>/{counts.total} done
              </span>
              {avg ? <span>avg run {avg}</span> : null}
              {eta ? <span>ETA {eta}</span> : null}
              {counts.last_finished_at ? (
                <span>last finished {timeAgo(counts.last_finished_at)}</span>
              ) : null}
            </p>
          </section>
          <Tabs
            value={filter}
            onValueChange={(value) =>
              setFilter(
                value === 'all' ? 'all' : (BATCH_ITEM_STATUSES.find((s) => s === value) ?? 'all')
              )
            }
          >
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">
                All
                <span className="ml-1 text-xs text-muted-foreground">{items.length}</span>
              </TabsTrigger>
              {BATCH_ITEM_STATUSES.map((status) => (
                <TabsTrigger key={status} value={status}>
                  {BATCH_ITEM_STATUS_META[status].label}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {items.filter((item) => item.status === status).length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {filter === 'proposed' ? <BatchReviewGrid batchId={batchId} /> : null}
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((item) => (
                <BatchItemRow
                  key={item.id}
                  item={item}
                  rerunPending={rerun_mut.isPending}
                  onRerun={() => rerun_mut.mutate({ batch_id: batchId, item_ids: [item.id] })}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this batch?</AlertDialogTitle>
            <AlertDialogDescription>
              Queued runs are dropped and running ones are stopped. Items already finished keep
              their state.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancel_mut.isPending}>Keep running</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={cancel_mut.isPending}
              onClick={() => cancel_mut.mutate({ batch_id: batchId })}
            >
              {cancel_mut.isPending ? <Spinner className="size-4" /> : null}
              Cancel batch
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
