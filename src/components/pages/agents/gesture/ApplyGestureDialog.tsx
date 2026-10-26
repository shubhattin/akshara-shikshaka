import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import type { ProposedGesture } from '~/agents/gesture_creator/schemas';
import { GesturePreview } from '~/components/gesture/GesturePreview';
import Practice from '~/components/pages/practice/Practice';
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
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Label } from '~/components/ui/label';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { Skeleton } from '~/components/ui/skeleton';
import { Spinner } from '~/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { get_script_from_id } from '~/state/lang_list';
import { useAgentChatContext } from '../chat/agent_chat_context';

/**
 * Review a proposal before saving it: large previews (next to the saved strokes, if any), a
 * practice run exactly like /learn (nothing recorded), and an explicit replace confirmation.
 */
export function ApplyGestureDialog({
  open,
  onOpenChange,
  proposal,
  toolCallId,
  background
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: ProposedGesture;
  toolCallId: string;
  background?: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { chatId } = useAgentChatContext();
  const [replace, setReplace] = useState<'no' | 'yes'>('no');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tab, setTab] = useState<'preview' | 'practice'>('preview');

  const current_q = useQuery(
    trpc.agents.get_gesture.queryOptions({ id: proposal.gesture_id }, { staleTime: 0, enabled: open })
  );
  const current = current_q.data;
  const saved = current ? [...current.gestures].sort((a, b) => a.index - b.index).filter((g) => g.points.length > 0) : [];
  const hasSaved = saved.length > 0;
  const glyphChanged =
    !!current &&
    (current.font_family !== proposal.font_family ||
      current.font_size !== proposal.font_size ||
      current.text_center_offset[0] !== proposal.text_center_offset[0] ||
      current.text_center_offset[1] !== proposal.text_center_offset[1]);
  const canApply = !!current && !glyphChanged && (!hasSaved || replace === 'yes');

  const apply_mut = useMutation(
    trpc.agents.apply_gesture.mutationOptions({
      onSuccess: () => {
        toast.success(`Saved the gesture for ${proposal.text}`);
        void queryClient.invalidateQueries({ queryKey: trpc.agents.get_gesture.queryKey({ id: proposal.gesture_id }) });
        setConfirmOpen(false);
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message);
        setConfirmOpen(false);
      }
    })
  );

  const script = get_script_from_id(proposal.script_id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[94dvh] flex-col gap-3 overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Apply gesture: <span className="text-lg">{proposal.text}</span>
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {script} · #{proposal.gesture_id}
              </span>
            </DialogTitle>
            <DialogDescription>{proposal.summary}</DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(value) => setTab(value === 'practice' ? 'practice' : 'preview')}>
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="practice">Practice</TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="pt-3">
              {current_q.isPending ? (
                <Skeleton className="mx-auto aspect-square w-full max-w-sm" />
              ) : hasSaved ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <figure className="flex flex-col gap-1.5">
                    <figcaption className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      Saved now · {saved.length} strokes
                    </figcaption>
                    <GesturePreview gestures={saved} backgroundSrc={background} />
                  </figure>
                  <figure className="flex flex-col gap-1.5">
                    <figcaption className="text-xs font-semibold tracking-wide text-primary uppercase">
                      Proposed · {proposal.gestures.length} strokes
                    </figcaption>
                    <GesturePreview gestures={proposal.gestures} backgroundSrc={background} />
                  </figure>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-md">
                  <GesturePreview gestures={proposal.gestures} backgroundSrc={background} />
                </div>
              )}
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Press ▶ on a preview to play it with its timing.
              </p>
            </TabsContent>

            <TabsContent value="practice" className="flex justify-center pt-3">
              {tab === 'practice' && current ? (
                // A fresh store per open: practice state never leaks into /learn or another dialog.
                <JotaiProvider>
                  <Practice
                    sandbox
                    play_gesture_on_mount
                    text_data={{
                      id: proposal.gesture_id,
                      uuid: proposal.uuid,
                      text: proposal.text,
                      script_id: proposal.script_id,
                      gestures: proposal.gestures
                    }}
                  />
                </JotaiProvider>
              ) : null}
            </TabsContent>
          </Tabs>

          {glyphChanged ? (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              The glyph’s font, size or position changed since this was drawn, so the strokes may no longer line
              up. Ask the agent to inspect and trace it again.
            </p>
          ) : null}

          {hasSaved && !glyphChanged ? (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="flex items-start gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                This gesture already has {saved.length} saved strokes. Applying replaces them with the proposal.
              </p>
              <RadioGroup
                value={replace}
                onValueChange={(value) => setReplace(value === 'yes' ? 'yes' : 'no')}
                aria-label="Replace the saved strokes?"
                className="gap-2 pl-6"
              >
                <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
                  <RadioGroupItem value="no" />
                  No, keep the saved strokes
                </Label>
                <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
                  <RadioGroupItem value="yes" />
                  Yes, replace them with the proposal
                </Label>
              </RadioGroup>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={!canApply || apply_mut.isPending}>
              {hasSaved ? 'Replace and apply' : 'Apply gesture'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={(next) => !apply_mut.isPending && setConfirmOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasSaved ? `Replace the saved strokes of ${proposal.text}?` : `Save this gesture for ${proposal.text}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hasSaved
                ? `The ${saved.length} saved strokes are overwritten by the ${proposal.gestures.length} proposed ones. Learners see the new strokes right away. To undo, apply an older proposal or re-record in the editor.`
                : `The ${proposal.gestures.length} proposed strokes are saved to this gesture and learners see them right away.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apply_mut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={hasSaved ? 'destructive' : 'default'}
              disabled={apply_mut.isPending}
              onClick={(event) => {
                // keep the alert open until the save lands
                event.preventDefault();
                apply_mut.mutate({ chat_id: chatId, tool_call_id: toolCallId, replace_existing: hasSaved && replace === 'yes' });
              }}
            >
              {apply_mut.isPending ? <Spinner className="size-4" /> : null}
              {hasSaved ? 'Replace' : 'Save'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
