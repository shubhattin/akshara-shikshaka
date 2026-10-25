import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { AlertCircleIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import { Skeleton } from '~/components/ui/skeleton';
import { get_script_from_id } from '~/state/lang_list';
import { GesturePreview } from './GesturePreview';

/**
 * Gesture previews by id: strokes are loaded from the database here, so callers (e.g. agent
 * replies) only ever store the ids.
 */
export function GesturePreviewList({ ids }: { ids: number[] }) {
  const trpc = useTRPC();
  const previews_q = useQuery(
    trpc.text_gestures.get_gesture_previews.queryOptions(
      { ids },
      { enabled: ids.length > 0, staleTime: 5 * 60_000 }
    )
  );

  if (ids.length === 0) return null;

  if (previews_q.isPending) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
        {ids.map((id) => (
          <Skeleton key={id} className="aspect-square w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (previews_q.isError) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-destructive">
        <AlertCircleIcon className="size-3.5" />
        Could not load gestures: {previews_q.error.message}
      </p>
    );
  }

  const byId = new Map(previews_q.data.map((row) => [row.id, row]));
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
      {ids.map((id) => {
        const row = byId.get(id);
        if (!row) {
          return (
            <div
              key={id}
              className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border text-center text-xs text-muted-foreground"
            >
              Gesture #{id} not found
            </div>
          );
        }
        return (
          <figure key={id} className="m-0 flex min-w-0 flex-col gap-1.5">
            <GesturePreview gestures={row.gestures} />
            <figcaption className="flex min-w-0 items-baseline gap-1.5 text-xs">
              <Link
                to="/gestures/edit/$id"
                params={{ id: String(row.id) }}
                className="truncate text-base font-semibold text-foreground no-underline hover:underline"
              >
                {row.text}
              </Link>
              <span className="truncate text-muted-foreground">
                {get_script_from_id(row.script_id)} · {row.gestures.length} stroke
                {row.gestures.length === 1 ? '' : 's'} · #{row.id}
              </span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
