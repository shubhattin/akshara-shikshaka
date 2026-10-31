import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { HistoryIcon, RotateCcwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import { REVISION_SOURCE_META } from '~/agents/gesture_review';
import { GesturePreview, type InspectOptions } from '~/components/gesture/GesturePreview';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Skeleton } from '~/components/ui/skeleton';
import { Spinner } from '~/components/ui/spinner';
import type { Gesture } from '~/tools/stroke_data/types';
import { useGlyphBackground } from '../gesture/use_glyph_background';
import { timeAgo } from './time';
import { useRefreshGesture } from './use_refresh_gesture';

const saved = (gestures: Gesture[]) =>
  [...gestures].sort((a, b) => a.index - b.index).filter((g) => g.points.length > 0);

type Revision = {
  id: number;
  revision_no: number;
  gestures: Gesture[];
  font_family: string;
  font_size: number;
  text_center_offset: [number, number];
  source: keyof typeof REVISION_SOURCE_META;
  chat_id: string | null;
  chat_title: string | null;
  reverted_from: number | null;
  user_name: string | null;
  created_at: Date | string;
};

function glyphChanged(a: Revision, b: Revision) {
  return (
    a.font_family !== b.font_family ||
    a.font_size !== b.font_size ||
    a.text_center_offset[0] !== b.text_center_offset[0] ||
    a.text_center_offset[1] !== b.text_center_offset[1]
  );
}

/**
 * Every saved version of a gesture, newest first: who saved it and how (the editor, a chat's
 * proposal, a restore), a side-by-side with the current version, and Restore (saved as a new
 * version, so nothing is ever lost).
 */
export function GestureHistory({
  gestureId,
  text,
  /** Open chats in a new tab (the editor's panel) instead of navigating */
  externalLinks = false,
  onRestored
}: {
  gestureId: number;
  text: string;
  externalLinks?: boolean;
  onRestored?: (gestureId: number) => void;
}) {
  const trpc = useTRPC();
  const refreshGesture = useRefreshGesture();
  const revisions_q = useQuery(trpc.agents.list_revisions.queryOptions({ gesture_id: gestureId }));
  const [comparing, setComparing] = useState<Revision | null>(null);
  const [restoring, setRestoring] = useState<Revision | null>(null);
  const revisions: Revision[] = revisions_q.data ?? [];
  const current = revisions[0];
  const background = useGlyphBackground(current ? { text, ...current } : null);
  const compareBackground = useGlyphBackground(comparing ? { text, ...comparing } : null);
  const compareInspect: InspectOptions | false =
    comparing && current
      ? {
          title: `v${comparing.revision_no} vs current (v${current.revision_no})`,
          panes: [
            {
              label: `v${comparing.revision_no}`,
              gestures: saved(comparing.gestures),
              backgroundSrc: compareBackground
            },
            {
              label: `Current · v${current.revision_no}`,
              gestures: saved(current.gestures),
              backgroundSrc: background,
              accent: true
            }
          ]
        }
      : false;

  const revert_mut = useMutation(
    trpc.agents.revert_revision.mutationOptions({
      onSuccess: () => {
        toast.success(`Restored v${restoring?.revision_no}`);
        refreshGesture(gestureId);
        onRestored?.(gestureId);
        setRestoring(null);
      },
      onError: (error) => {
        toast.error(error.message);
        refreshGesture(gestureId);
        setRestoring(null);
      }
    })
  );

  if (revisions_q.isPending) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (revisions.length === 0) {
    return <p className="text-sm text-muted-foreground">No saved versions yet.</p>;
  }

  return (
    <>
      <ol className="flex flex-col gap-1">
        {revisions.map((revision, index) => {
          const strokes = saved(revision.gestures);
          const isCurrent = index === 0;
          return (
            <li
              key={revision.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 p-2"
            >
              <GesturePreview
                gestures={strokes}
                backgroundSrc={isCurrent ? background : undefined}
                showStrokeOrder={false}
                size="thumb"
                inspect={{
                  title: `v${revision.revision_no}${isCurrent ? ' (current)' : ''}`,
                  label: `v${revision.revision_no}`
                }}
                className="w-14 shrink-0"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                <p className="flex flex-wrap items-center gap-x-2 font-medium">
                  v{revision.revision_no}
                  {isCurrent ? (
                    <span className="rounded bg-primary/10 px-1.5 text-[11px] text-primary">
                      Current
                    </span>
                  ) : null}
                  <span className="text-xs font-normal text-muted-foreground">
                    {REVISION_SOURCE_META[revision.source].label}
                    {revision.source === 'revert' && revision.reverted_from
                      ? ` (v${revisions.find((r) => r.id === revision.reverted_from)?.revision_no ?? '?'})`
                      : ''}
                    {' · '}
                    {strokes.length} strokes
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {revision.user_name ??
                    (revision.source === 'initial' ? 'Before history' : 'Admin')}{' '}
                  · {timeAgo(revision.created_at)}
                  {revision.chat_id ? (
                    <>
                      {' · '}
                      <Link
                        to="/admin/agents/$chatId"
                        params={{ chatId: revision.chat_id }}
                        target={externalLinks ? '_blank' : undefined}
                        className="underline decoration-dotted underline-offset-2 hover:text-primary"
                      >
                        {revision.chat_title || 'chat'}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
              {isCurrent ? null : (
                <div className="flex shrink-0 gap-1">
                  <Button size="xs" variant="ghost" onClick={() => setComparing(revision)}>
                    Compare
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => setRestoring(revision)}>
                    <RotateCcwIcon />
                    Restore
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <Dialog open={!!comparing} onOpenChange={(open) => !open && setComparing(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HistoryIcon className="size-4" />v{comparing?.revision_no} vs current (v
              {current?.revision_no})
            </DialogTitle>
            <DialogDescription>
              {comparing && current && glyphChanged(comparing, current)
                ? 'The glyph’s font, size or position differs between the two.'
                : 'Press ▶ on either to play it, or ⤢ to inspect both side by side.'}
            </DialogDescription>
          </DialogHeader>
          {comparing && current ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <figure className="flex flex-col gap-1.5">
                <figcaption className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  v{comparing.revision_no}
                </figcaption>
                <GesturePreview
                  gestures={saved(comparing.gestures)}
                  backgroundSrc={compareBackground}
                  inspect={compareInspect}
                />
              </figure>
              <figure className="flex flex-col gap-1.5">
                <figcaption className="text-xs font-semibold tracking-wide text-primary uppercase">
                  Current · v{current.revision_no}
                </figcaption>
                <GesturePreview
                  gestures={saved(current.gestures)}
                  backgroundSrc={background}
                  inspect={compareInspect}
                />
              </figure>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!restoring}
        onOpenChange={(open) => !open && !revert_mut.isPending && setRestoring(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore v{restoring?.revision_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its strokes and glyph settings are saved as a new version (v
              {(current?.revision_no ?? 0) + 1}); learners see them right away. The current version
              stays in the history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revert_mut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={revert_mut.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!restoring || !current) return;
                revert_mut.mutate({
                  gesture_id: gestureId,
                  revision_id: restoring.id,
                  expected_revision: current.revision_no
                });
              }}
            >
              {revert_mut.isPending ? <Spinner className="size-4" /> : null}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
