import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import type { ProposedGesture } from '~/agents/gesture_creator/schemas';
import { GesturePreview, type InspectOptions } from '~/components/gesture/GesturePreview';
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
import { useRefreshGesture } from '../gesture_hub/use_refresh_gesture';

import type { Gesture } from '~/tools/stroke_data/types';

type GestureBaseline = {
  revision: number;
  gestures: Gesture[];
  font_family: string;
  font_size: number;
  text_center_offset: [number, number];
};

function savedStrokesOf(current: GestureBaseline | undefined): Gesture[] {
  return current
    ? [...current.gestures].sort((a, b) => a.index - b.index).filter((g) => g.points.length > 0)
    : [];
}

function didGlyphChange(current: GestureBaseline | undefined, proposal: ProposedGesture) {
  return (
    !!current &&
    (current.font_family !== proposal.font_family ||
      current.font_size !== proposal.font_size ||
      current.text_center_offset[0] !== proposal.text_center_offset[0] ||
      current.text_center_offset[1] !== proposal.text_center_offset[1])
  );
}

function canApplyGesture(
  current: GestureBaseline | undefined,
  glyphChanged: boolean,
  hasSaved: boolean,
  replace: 'no' | 'yes'
) {
  return !!current && !glyphChanged && (!hasSaved || replace === 'yes');
}

function nextTab(value: string): 'preview' | 'practice' {
  return value === 'practice' ? 'practice' : 'preview';
}

function nextReplace(value: string): 'no' | 'yes' {
  return value === 'yes' ? 'yes' : 'no';
}

function PreviewPane({
  isPending,
  hasSaved,
  saved,
  proposal,
  background
}: {
  isPending: boolean;
  hasSaved: boolean;
  saved: Gesture[];
  proposal: ProposedGesture;
  background?: string;
}) {
  const compare: InspectOptions = {
    title: `${proposal.text} — saved vs proposed`,
    panes: [
      { label: 'Saved now', gestures: saved, backgroundSrc: background },
      { label: 'Proposed', gestures: proposal.gestures, backgroundSrc: background, accent: true }
    ]
  };
  return (
    <>
      {isPending ? (
        <Skeleton className="mx-auto aspect-square w-full max-w-sm" />
      ) : hasSaved ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <figure className="flex flex-col gap-1.5">
            <figcaption className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Saved now · {saved.length} strokes
            </figcaption>
            <GesturePreview gestures={saved} backgroundSrc={background} inspect={compare} />
          </figure>
          <figure className="flex flex-col gap-1.5">
            <figcaption className="text-xs font-semibold tracking-wide text-primary uppercase">
              Proposed · {proposal.gestures.length} strokes
            </figcaption>
            <GesturePreview
              gestures={proposal.gestures}
              backgroundSrc={background}
              inspect={compare}
            />
          </figure>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-md">
          <GesturePreview gestures={proposal.gestures} backgroundSrc={background} />
        </div>
      )}
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Press ▶ on a preview to play it with its timing, or ⤢ to inspect it.
      </p>
    </>
  );
}

function PracticePane({
  tab,
  current,
  proposal
}: {
  tab: 'preview' | 'practice';
  current: GestureBaseline | undefined;
  proposal: ProposedGesture;
}) {
  return (
    <>
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
    </>
  );
}

function GlyphChangedNotice({ glyphChanged }: { glyphChanged: boolean }) {
  return (
    <>
      {glyphChanged ? (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          The glyph’s font, size or position changed since this was drawn, so the strokes may no
          longer line up. Ask the agent to inspect and trace it again.
        </p>
      ) : null}
    </>
  );
}

function ReplaceNotice({
  hasSaved,
  glyphChanged,
  savedCount,
  replace,
  onReplaceChange
}: {
  hasSaved: boolean;
  glyphChanged: boolean;
  savedCount: number;
  replace: 'no' | 'yes';
  onReplaceChange: (value: 'no' | 'yes') => void;
}) {
  return (
    <>
      {hasSaved && !glyphChanged ? (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="flex items-start gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            This gesture already has {savedCount} saved strokes. Applying replaces them with the
            proposal.
          </p>
          <RadioGroup
            value={replace}
            onValueChange={(value) => onReplaceChange(nextReplace(value))}
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
    </>
  );
}

function ApplyFooter({
  canApply,
  isPending,
  hasSaved,
  onClose,
  onConfirm
}: {
  canApply: boolean;
  isPending: boolean;
  hasSaved: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogFooter>
      <Button variant="outline" onClick={onClose}>
        Close
      </Button>
      <Button onClick={onConfirm} disabled={!canApply || isPending}>
        {hasSaved ? 'Replace and apply' : 'Apply gesture'}
      </Button>
    </DialogFooter>
  );
}

function confirmTitle(hasSaved: boolean, text: string) {
  return hasSaved ? `Replace the saved strokes of ${text}?` : `Save this gesture for ${text}?`;
}

function confirmDescription(hasSaved: boolean, savedCount: number, proposedCount: number) {
  return hasSaved
    ? `The ${savedCount} saved strokes are overwritten by the ${proposedCount} proposed ones. Learners see the new strokes right away. The current version stays in the history, so you can restore it later.`
    : `The ${proposedCount} proposed strokes are saved to this gesture and learners see them right away.`;
}

function confirmVariant(hasSaved: boolean): 'destructive' | 'default' {
  return hasSaved ? 'destructive' : 'default';
}

function ConfirmDialog({
  confirmOpen,
  isPending,
  hasSaved,
  proposal,
  savedCount,
  chatId,
  toolCallId,
  replace,
  onOpenChange,
  mutate
}: {
  confirmOpen: boolean;
  isPending: boolean;
  hasSaved: boolean;
  proposal: ProposedGesture;
  savedCount: number;
  chatId: string;
  toolCallId: string;
  replace: 'no' | 'yes';
  onOpenChange: (open: boolean) => void;
  mutate: (args: { chat_id: string; tool_call_id: string; replace_existing: boolean }) => void;
}) {
  return (
    <AlertDialog open={confirmOpen} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmTitle(hasSaved, proposal.text)}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmDescription(hasSaved, savedCount, proposal.gestures.length)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant(hasSaved)}
            disabled={isPending}
            onClick={(event) => {
              // keep the alert open until the save lands
              event.preventDefault();
              mutate({
                chat_id: chatId,
                tool_call_id: toolCallId,
                replace_existing: hasSaved && replace === 'yes'
              });
            }}
          >
            {isPending ? <Spinner className="size-4" /> : null}
            {hasSaved ? 'Replace' : 'Save'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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
  const { chatId, onGestureSaved } = useAgentChatContext();
  const refreshGesture = useRefreshGesture();
  const [replace, setReplace] = useState<'no' | 'yes'>('no');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tab, setTab] = useState<'preview' | 'practice'>('preview');

  const current_q = useQuery(
    trpc.agents.get_gesture.queryOptions(
      { id: proposal.gesture_id },
      { staleTime: 0, enabled: open }
    )
  );
  const current = current_q.data;
  const saved = savedStrokesOf(current);
  const hasSaved = saved.length > 0;
  const glyphChanged = didGlyphChange(current, proposal);
  const canApply = canApplyGesture(current, glyphChanged, hasSaved, replace);

  const apply_mut = useMutation(
    trpc.agents.apply_gesture.mutationOptions({
      onSuccess: () => {
        toast.success(`Saved the gesture for ${proposal.text}`);
        refreshGesture(proposal.gesture_id);
        onGestureSaved?.(proposal.gesture_id);
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

          <Tabs value={tab} onValueChange={(value) => setTab(nextTab(value))}>
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="practice">Practice</TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="pt-3">
              <PreviewPane
                isPending={current_q.isPending}
                hasSaved={hasSaved}
                saved={saved}
                proposal={proposal}
                background={background}
              />
            </TabsContent>

            <TabsContent value="practice" className="flex justify-center pt-3">
              <PracticePane tab={tab} current={current} proposal={proposal} />
            </TabsContent>
          </Tabs>

          <GlyphChangedNotice glyphChanged={glyphChanged} />

          <ReplaceNotice
            hasSaved={hasSaved}
            glyphChanged={glyphChanged}
            savedCount={saved.length}
            replace={replace}
            onReplaceChange={setReplace}
          />

          <ApplyFooter
            canApply={canApply}
            isPending={apply_mut.isPending}
            hasSaved={hasSaved}
            onClose={() => onOpenChange(false)}
            onConfirm={() => setConfirmOpen(true)}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmOpen={confirmOpen}
        isPending={apply_mut.isPending}
        hasSaved={hasSaved}
        proposal={proposal}
        savedCount={saved.length}
        chatId={chatId}
        toolCallId={toolCallId}
        replace={replace}
        onOpenChange={setConfirmOpen}
        mutate={(args) => {
          // the version the admin compared with: a save meanwhile is refused, not overwritten
          if (current) apply_mut.mutate({ ...args, expected_revision: current.revision });
        }}
      />
    </>
  );
}
