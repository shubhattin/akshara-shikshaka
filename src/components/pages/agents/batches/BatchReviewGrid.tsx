import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import type { AppRouter } from '~/api/trpc_router';
import { GesturePreview } from '~/components/gesture/GesturePreview';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Skeleton } from '~/components/ui/skeleton';
import { Spinner } from '~/components/ui/spinner';
import { get_script_from_id } from '~/state/lang_list';
import type { inferRouterOutputs } from '@trpc/server';
import { useGlyphBackground } from '../gesture/use_glyph_background';
import { invalidateBatch } from './batch_invalidate';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ProposalRow = RouterOutputs['agents']['batch_proposals'][number];

/**
 * One proposal waiting for review: the strokes saved now beside the proposed ones (both on
 * the glyph), the agent's summary, and Accept / Apply-as-unreviewed / Reject.
 */
function ReviewCard({
  row,
  batchId,
  selected,
  onToggle
}: {
  row: ProposalRow;
  batchId: number;
  selected: boolean;
  onToggle: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const proposalBackground = useGlyphBackground(row.proposal);
  const currentBackground = useGlyphBackground({
    text: row.current.text,
    font_family: row.current.font_family,
    font_size: row.current.font_size,
    text_center_offset: row.current.text_center_offset
  });
  const savedNow = [...row.current.gestures]
    .sort((a, b) => a.index - b.index)
    .filter((gesture) => gesture.points.length > 0);
  const proposed = [...row.proposal.gestures]
    .sort((a, b) => a.index - b.index)
    .filter((gesture) => gesture.points.length > 0);
  const changedSinceRun =
    row.based_on_revision !== null && row.current.revision !== row.based_on_revision;

  const accept_mut = useMutation(
    trpc.agents.accept_batch_item.mutationOptions({
      onSuccess: (_data, input) => {
        invalidateBatch(queryClient, trpc, batchId);
        toast.success(input.approve ? 'Accepted and approved' : 'Applied as unreviewed');
      },
      onError: (error) => toast.error(error.message)
    })
  );
  const reject_mut = useMutation(
    trpc.agents.reject_batch_item.mutationOptions({
      onSuccess: () => {
        invalidateBatch(queryClient, trpc, batchId);
        toast.success('Rejected');
      },
      onError: (error) => toast.error(error.message)
    })
  );
  const busy = accept_mut.isPending || reject_mut.isPending;

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border/70 p-3">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={(next) => next !== selected && onToggle()}
          aria-label={`Select ${row.current.text}`}
        />
        <span className="w-6 text-center text-lg leading-none">{row.current.text}</span>
        <Link
          to="/admin/agents/gestures/$gestureId"
          params={{ gestureId: String(row.text_gesture_id) }}
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground no-underline hover:text-primary"
        >
          {get_script_from_id(row.current.script_id) ?? row.current.script_id} #
          {row.text_gesture_id} · v{row.current.revision}
        </Link>
        {row.chat_id ? (
          <Link
            to="/admin/agents/$chatId"
            params={{ chatId: row.chat_id }}
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
          >
            chat
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <figure className="flex min-w-0 flex-col gap-1">
          <figcaption className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Saved now · {savedNow.length} strokes
          </figcaption>
          {savedNow.length > 0 ? (
            <GesturePreview gestures={savedNow} backgroundSrc={currentBackground} />
          ) : (
            <p className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
              No strokes yet
            </p>
          )}
        </figure>
        <figure className="flex min-w-0 flex-col gap-1">
          <figcaption className="text-[11px] font-semibold tracking-wide text-primary uppercase">
            Proposal · {proposed.length} strokes
          </figcaption>
          <GesturePreview gestures={proposed} backgroundSrc={proposalBackground} />
        </figure>
      </div>
      <p className="text-sm text-foreground/90">{row.proposal.summary}</p>
      {changedSinceRun ? (
        <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
          <TriangleAlertIcon className="size-3.5 shrink-0 translate-y-px" />
          Saved again since the run (now v{row.current.revision}, run saw v{row.based_on_revision}):
          accepting replaces it — compare in the chat first.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => accept_mut.mutate({ item_id: row.id, approve: true })}
        >
          {accept_mut.isPending ? <Spinner /> : null}
          Accept & approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => accept_mut.mutate({ item_id: row.id, approve: false })}
        >
          Apply as unreviewed
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => reject_mut.mutate({ item_id: row.id })}
        >
          {reject_mut.isPending ? <Spinner /> : null}
          Reject
        </Button>
      </div>
    </li>
  );
}

/**
 * The review grid of a batch: every proposal with what is saved now, a checkbox per card,
 * and "Accept selected" for the bulk. Only mounted on the To-review tab, so the proposals
 * query runs only there.
 */
export function BatchReviewGrid({ batchId }: { batchId: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const proposals_q = useQuery(trpc.agents.batch_proposals.queryOptions({ batch_id: batchId }));
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkPending, setBulkPending] = useState(false);

  const bulk_mut = useMutation(trpc.agents.accept_batch_item.mutationOptions());

  const rows = (proposals_q.data ?? []).filter((row) => row.status === 'proposed');
  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );

  const acceptSelected = async () => {
    setBulkPending(true);
    let ok = 0;
    let failed = 0;
    for (const itemId of selected) {
      try {
        await bulk_mut.mutateAsync({ item_id: itemId, approve: true });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setSelected([]);
    setBulkPending(false);
    invalidateBatch(queryClient, trpc, batchId);
    if (failed === 0) toast.success(`Accepted ${ok} proposals`);
    else toast.error(`Accepted ${ok}, ${failed} failed`);
  };

  if (proposals_q.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nothing to review.</p>;
  }
  const allSelected = rows.every((row) => selected.includes(row.id));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Checkbox
          checked={allSelected}
          onCheckedChange={(next) => setSelected(next === true ? rows.map((row) => row.id) : [])}
          aria-label="Select all proposals"
        />
        <span className="flex-1 text-xs text-muted-foreground">
          {selected.length} of {rows.length} selected
        </span>
        <Button
          size="sm"
          disabled={selected.length === 0 || bulkPending}
          onClick={() => void acceptSelected()}
        >
          {bulkPending ? <Spinner /> : null}
          Accept selected ({selected.length})
        </Button>
      </div>
      <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
        {rows.map((row) => (
          <ReviewCard
            key={row.id}
            row={row}
            batchId={batchId}
            selected={selected.includes(row.id)}
            onToggle={() => toggle(row.id)}
          />
        ))}
      </ul>
    </div>
  );
}
