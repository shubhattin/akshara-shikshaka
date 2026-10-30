import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRightIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import {
  buildReviewQueue,
  failureRate,
  QUEUE_BUCKET_META,
  QUEUE_BUCKETS,
  type QueueBucket
} from '~/agents/review_queue';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Skeleton } from '~/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { get_script_from_id } from '~/state/lang_list';
import { MobileHistoryButton } from '../sidebar/AgentsSidebar';
import { StartBatchDialog } from '../batches/StartBatchDialog';
import { ReviewBadge } from './ReviewBadge';

type ScriptFilter = number | 'all';

/**
 * Gestures that need attention: no strokes, hard for learners, flagged, or not reviewed since
 * their last change. "Fix" opens the gesture's newest focused chat, or starts one.
 */
export function ReviewQueue() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queue_q = useQuery(trpc.agents.review_queue.queryOptions());
  const [bucket, setBucket] = useState<QueueBucket>('empty');
  const [script, setScript] = useState<ScriptFilter>('all');
  /** Gestures picked for a batch run (the dialog reads them when it opens). */
  const [selected, setSelected] = useState<number[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const all = useMemo(() => queue_q.data?.gestures ?? [], [queue_q.data]);
  const scripts = useMemo(
    () => [...new Set(all.map((g) => g.script_id))].sort((a, b) => a - b),
    [all]
  );
  const queue = useMemo(
    () => buildReviewQueue(script === 'all' ? all : all.filter((g) => g.script_id === script)),
    [all, script]
  );
  const rows = queue.find((entry) => entry.bucket === bucket)?.gestures ?? [];

  const fix = (gesture: (typeof rows)[number]) =>
    gesture.latest_chat_id
      ? void navigate({ to: '/admin/agents/$chatId', params: { chatId: gesture.latest_chat_id } })
      : void navigate({ to: '/admin/agents', search: { focus: gesture.id } });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        <MobileHistoryButton />
        <h1 className="flex-1 text-sm font-semibold">Review queue</h1>
        <select
          aria-label="Script"
          value={String(script)}
          onChange={(event) =>
            setScript(event.target.value === 'all' ? 'all' : Number(event.target.value))
          }
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="all">All scripts</option>
          {scripts.map((id) => (
            <option key={id} value={id}>
              {get_script_from_id(id) ?? id}
            </option>
          ))}
        </select>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4">
          <Tabs
            value={bucket}
            onValueChange={(value) =>
              setBucket(QUEUE_BUCKETS.find((bucket) => bucket === value) ?? 'empty')
            }
          >
            <TabsList className="flex-wrap">
              {queue.map((entry) => (
                <TabsTrigger key={entry.bucket} value={entry.bucket}>
                  {QUEUE_BUCKET_META[entry.bucket].label}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {entry.gestures.length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground">
            {QUEUE_BUCKET_META[bucket].hint}
            {bucket === 'struggle' && queue_q.data
              ? ` (last ${queue_q.data.practice_window_days} days).`
              : '.'}
          </p>
          {queue_q.isPending ? (
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={rows.every((gesture) => selected.includes(gesture.id))}
                  onCheckedChange={(next) =>
                    setSelected((current) =>
                      next === true
                        ? [...new Set([...current, ...rows.map((gesture) => gesture.id)])]
                        : current.filter((id) => !rows.some((gesture) => gesture.id === id))
                    )
                  }
                  aria-label="Select all in this tab"
                />
                <span className="flex-1 text-xs text-muted-foreground">
                  {selected.length} selected
                </span>
                <Button
                  size="sm"
                  disabled={selected.length === 0}
                  onClick={() => setDialogOpen(true)}
                >
                  Run agents ({selected.length})
                </Button>
              </div>
              <ul className="flex flex-col gap-1">
                {rows.map((gesture) => (
                  <li
                    key={gesture.id}
                    className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
                  >
                    <Checkbox
                      checked={selected.includes(gesture.id)}
                      onCheckedChange={(next) =>
                        setSelected((current) =>
                          next === true
                            ? [...current, gesture.id]
                            : current.filter((id) => id !== gesture.id)
                        )
                      }
                      aria-label={`Select gesture ${gesture.text} #${gesture.id}`}
                    />
                    <span className="w-8 text-center text-xl leading-none">{gesture.text}</span>
                    <Link
                      to="/admin/agents/gestures/$gestureId"
                      params={{ gestureId: String(gesture.id) }}
                      className="flex min-w-0 flex-1 flex-col no-underline"
                    >
                      <span className="truncate text-sm font-medium text-foreground">
                        {get_script_from_id(gesture.script_id) ?? gesture.script_id}{' '}
                        <span className="font-normal text-muted-foreground">#{gesture.id}</span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {gesture.strokes} strokes · v{gesture.revision}
                        {gesture.attempts > 0
                          ? ` · ${gesture.attempts} attempts, ${Math.round(failureRate(gesture) * 100)}% unfinished`
                          : ''}
                        {gesture.focused_chats > 0
                          ? ` · ${gesture.focused_chats} focused chats`
                          : ''}
                        {gesture.review_status === 'needs_work' && gesture.review_note
                          ? ` · “${gesture.review_note}”`
                          : ''}
                      </span>
                    </Link>
                    <ReviewBadge status={gesture.review_status} strokes={gesture.strokes} />
                    <Button size="sm" variant="outline" onClick={() => fix(gesture)}>
                      {gesture.latest_chat_id ? 'Continue' : 'Fix'}
                      <ArrowRightIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {dialogOpen ? (
            <StartBatchDialog
              gestureIds={selected}
              open={dialogOpen}
              onOpenChange={setDialogOpen}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
