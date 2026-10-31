import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTRPC } from '~/api/client';
import { agent_model_id_schema, AGENT_MODELS } from '~/agents/models';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import { MobileHistoryButton } from '../sidebar/AgentsSidebar';
import { timeAgo } from '../gesture_hub/time';
import { BatchProgress } from './BatchProgress';
import { formatUsd } from './batch_format';

/** Label of a stored model, or the raw id when it no longer exists. */
function modelLabel(model: string): string {
  const parsed = agent_model_id_schema.safeParse(model);
  return parsed.success ? AGENT_MODELS[parsed.data].label : model;
}

/** Every batch, newest first, with its progress. Polls while any batch still runs. */
export function BatchList() {
  const trpc = useTRPC();
  const batches_q = useQuery(
    trpc.agents.list_batches.queryOptions(undefined, {
      refetchInterval: (query) =>
        query.state.data?.some((batch) => batch.queued + batch.running > 0) ? 5000 : false
    })
  );
  const batches = batches_q.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        <MobileHistoryButton />
        <h1 className="flex-1 text-sm font-semibold">Batches</h1>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link to="/admin/agents/queue" />}
        >
          Pick gestures
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4">
          {batches_q.isPending ? (
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : batches.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No batches yet. Select gestures in the review queue and run the agents on them.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {batches.map((batch) => {
                const active = batch.queued + batch.running > 0;
                const done = batch.applied + batch.rejected + batch.superseded;
                return (
                  <li key={batch.id}>
                    <Link
                      to="/admin/agents/batches/$batchId"
                      params={{ batchId: String(batch.id) }}
                      className="flex flex-col gap-2 rounded-lg border border-border/60 px-3 py-2 no-underline hover:border-border"
                    >
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {batch.title || `Batch #${batch.id}`}
                        </span>
                        <span
                          className={
                            batch.cancelled_at
                              ? 'rounded-md border border-border px-1.5 py-px text-[11px] leading-4 font-medium text-muted-foreground'
                              : active
                                ? 'rounded-md border border-blue-500/40 px-1.5 py-px text-[11px] leading-4 font-medium text-blue-700 dark:text-blue-400'
                                : 'rounded-md border border-emerald-500/40 px-1.5 py-px text-[11px] leading-4 font-medium text-emerald-700 dark:text-emerald-400'
                          }
                        >
                          {batch.cancelled_at ? 'Cancelled' : active ? 'Running' : 'Done'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {batch.user_name ?? 'Admin'} · {timeAgo(batch.created_at)} ·{' '}
                          {modelLabel(batch.model)}
                        </span>
                      </span>
                      <BatchProgress counts={batch} />
                      <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span>
                          {batch.proposed} to review · {batch.failed} failed · {done}/{batch.total}{' '}
                          done
                        </span>
                        <span className="ml-auto">{formatUsd(batch.cost)} spent</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
