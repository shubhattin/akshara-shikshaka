import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2Icon, ExternalLinkIcon, PenToolIcon, TriangleAlertIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import type { ProposedGesture } from '~/agents/gesture_creator/schemas';
import { GesturePreview } from '~/components/gesture/GesturePreview';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { get_script_from_id } from '~/state/lang_list';
import type { Gesture } from '~/tools/stroke_data/types';
import { useAgentChatContext } from '../chat/agent_chat_context';
import type { AgentToolPart } from '../chat/message_parts';
import { ApplyGestureDialog } from './ApplyGestureDialog';
import { useAppliedRevisions } from './FocusBar';
import { useGlyphBackground } from './use_glyph_background';

/** Same strokes (points and timing) as what is saved now? Then the proposal was applied. */
const sameStrokes = (a: Gesture[], b: Gesture[]) =>
  a.length === b.length &&
  a.every(
    (g, i) =>
      g.duration === b[i]!.duration &&
      g.anim_fn === b[i]!.anim_fn &&
      g.points.length === b[i]!.points.length &&
      g.points.every((p, k) => p[0] === b[i]!.points[k]![0] && p[1] === b[i]!.points[k]![1])
  );

/** A Gesture Creator proposal: preview, stroke order summary, and the Apply button. */
export function GestureProposalCard({
  part,
  streaming
}: {
  part: AgentToolPart<'propose_gesture'>;
  streaming: boolean;
}) {
  if (part.state === 'output-error') {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <TriangleAlertIcon className="size-4 shrink-0" />
        Proposal failed: {part.errorText}
      </p>
    );
  }
  if (part.state !== 'output-available') {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm text-muted-foreground">
        {streaming ? <Spinner className="size-4" /> : <TriangleAlertIcon className="size-4" />}
        {streaming ? 'Preparing the proposal…' : 'Proposal interrupted'}
      </p>
    );
  }
  if (!part.output.ok) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <TriangleAlertIcon className="size-4 shrink-0" />
        Proposal failed: {part.output.error}
      </p>
    );
  }
  return <ProposalBody proposal={part.output.proposal} toolCallId={part.toolCallId} />;
}

function ProposalBody({ proposal, toolCallId }: { proposal: ProposedGesture; toolCallId: string }) {
  const trpc = useTRPC();
  const { replying } = useAgentChatContext();
  const [open, setOpen] = useState(false);
  const background = useGlyphBackground(proposal);
  const current_q = useQuery(trpc.agents.get_gesture.queryOptions({ id: proposal.gesture_id }));
  const savedNow = current_q.data ? sameStrokes(current_q.data.gestures, proposal.gestures) : false;
  const appliedAs = useAppliedRevisions(proposal.gesture_id).get(toolCallId);
  const applied = savedNow || appliedAs !== undefined;
  const first = proposal.gestures[0];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-card p-3 sm:flex-row">
      <GesturePreview
        gestures={proposal.gestures}
        backgroundSrc={background}
        inspect={{ title: `Proposed gesture for ${proposal.text}`, label: 'Proposal' }}
        className="w-full shrink-0 sm:w-44"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <PenToolIcon className="size-4 text-primary" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            Proposed gesture for <span className="text-base">{proposal.text}</span>{' '}
            <a
              href={`/gestures/edit/${proposal.gesture_id}`}
              target="_blank"
              rel="noreferrer"
              title="Open this gesture in the editor"
              className="ml-1 font-normal text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
            >
              {get_script_from_id(proposal.script_id)} #{proposal.gesture_id}
              <ExternalLinkIcon className="mb-0.5 ml-0.5 inline size-3" />
            </a>
          </p>
          {applied ? (
            <span className="flex items-center gap-1 rounded-md border border-emerald-500/40 px-1.5 py-px text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2Icon className="size-3" />
              {appliedAs !== undefined ? `Applied as v${appliedAs}` : 'Applied'}
              {appliedAs !== undefined && !savedNow ? ' (since replaced)' : ''}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-foreground/90">{proposal.summary}</p>
        <p className="text-xs text-muted-foreground">
          {proposal.gestures.length} strokes
          {first
            ? ` · pace ${first.duration} ms per 200 px · ${first.anim_fn} · width ${first.width}`
            : ''}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setOpen(true)} disabled={replying}>
            {applied ? 'Review / apply again' : 'Apply gesture'}
          </Button>
          {replying ? (
            <span className="text-xs text-muted-foreground">
              Available when the agent finishes.
            </span>
          ) : null}
        </div>
      </div>
      {open ? (
        <ApplyGestureDialog
          open={open}
          onOpenChange={setOpen}
          proposal={proposal}
          toolCallId={toolCallId}
          background={background}
        />
      ) : null}
    </div>
  );
}
