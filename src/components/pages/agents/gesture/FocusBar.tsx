import { useMemo, useState, type ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronDownIcon, Columns2Icon, CrosshairIcon, ExternalLinkIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import type { ProposedGesture } from '~/agents/gesture_creator/schemas';
import type { AgentUIMessage } from '~/agents/ui_message';
import {
  GestureInspectorDialog,
  type InspectPane
} from '~/components/gesture/GestureInspectorDialog';
import { GesturePreview, type InspectOptions } from '~/components/gesture/GesturePreview';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { get_script_from_id } from '~/state/lang_list';
import type { Gesture } from '~/tools/stroke_data/types';
import { ReviewBadge } from '../gesture_hub/ReviewBadge';
import { ApplyGestureDialog } from './ApplyGestureDialog';
import { useGlyphBackground } from './use_glyph_background';

type ChatProposal = { toolCallId: string; proposal: ProposedGesture };

/** Every successful proposal of the chat, oldest first. */
export function chatProposals(messages: AgentUIMessage[]): ChatProposal[] {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === 'tool-propose_gesture' && part.state === 'output-available' && part.output.ok
        ? [{ toolCallId: part.toolCallId, proposal: part.output.proposal }]
        : []
    )
  );
}

const savedStrokes = (gestures: Gesture[]) =>
  [...gestures].sort((a, b) => a.index - b.index).filter((g) => g.points.length > 0);

/** Which saved version each proposal of a gesture became, by tool call id. */
export function useAppliedRevisions(gestureId: number) {
  const trpc = useTRPC();
  const revisions_q = useQuery(trpc.agents.list_revisions.queryOptions({ gesture_id: gestureId }));
  return useMemo(() => {
    const byCall = new Map<string, number>();
    for (const revision of revisions_q.data ?? []) {
      if (revision.tool_call_id && !byCall.has(revision.tool_call_id)) {
        byCall.set(revision.tool_call_id, revision.revision_no);
      }
    }
    return byCall;
  }, [revisions_q.data]);
}

function CompareDialog({
  open,
  onOpenChange,
  saved,
  proposal,
  background,
  revision
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saved: Gesture[];
  proposal: ProposedGesture | null;
  background?: string;
  /** Undefined while the gesture loads */
  revision: number | undefined;
}) {
  const inspect: InspectOptions = {
    title: 'Saved version vs latest proposal',
    panes: [
      { label: `Saved · v${revision ?? '…'}`, gestures: saved, backgroundSrc: background },
      ...(proposal
        ? [
            {
              label: 'Latest proposal',
              gestures: proposal.gestures,
              backgroundSrc: background,
              accent: true
            }
          ]
        : [])
    ]
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Saved version vs latest proposal</DialogTitle>
          <DialogDescription>
            Press ▶ on either to play it with its timing, or ⤢ to inspect both side by side.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <figure className="flex flex-col gap-1.5">
            <figcaption className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Saved · v{revision ?? '…'} · {saved.length} strokes
            </figcaption>
            {saved.length > 0 ? (
              <GesturePreview gestures={saved} backgroundSrc={background} inspect={inspect} />
            ) : (
              <p className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                No strokes saved yet
              </p>
            )}
          </figure>
          <figure className="flex flex-col gap-1.5">
            <figcaption className="text-xs font-semibold tracking-wide text-primary uppercase">
              Latest proposal{proposal ? ` · ${proposal.gestures.length} strokes` : ''}
            </figcaption>
            {proposal ? (
              <GesturePreview
                gestures={proposal.gestures}
                backgroundSrc={background}
                inspect={inspect}
              />
            ) : (
              <p className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                No proposal in this chat yet
              </p>
            )}
          </figure>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProposalRow({
  item,
  number,
  appliedAs,
  background,
  onApply,
  onInspect
}: {
  item: ChatProposal;
  number: number;
  appliedAs: number | undefined;
  background?: string;
  onApply: () => void;
  onInspect: () => void;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-muted/50">
      <GesturePreview
        gestures={item.proposal.gestures}
        backgroundSrc={background}
        showStrokeOrder={false}
        size="thumb"
        onInspect={onInspect}
        className="w-14 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-semibold">
          Proposal {number} · {item.proposal.gestures.length} strokes
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">{item.proposal.summary}</span>
      </div>
      {appliedAs !== undefined ? (
        <span className="shrink-0 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          v{appliedAs}
        </span>
      ) : null}
      <Button size="xs" variant="outline" onClick={onApply}>
        {appliedAs !== undefined ? 'Review' : 'Apply'}
      </Button>
    </li>
  );
}

type FocusGestureRow = {
  text: string;
  script_id: number;
  revision: number;
  review_status: ComponentProps<typeof ReviewBadge>['status'];
};

/** The focused gesture: its saved strokes, script, version and review state. */
function FocusLabel({
  gestureId,
  gesture,
  saved,
  background
}: {
  gestureId: number;
  gesture: FocusGestureRow | undefined;
  saved: Gesture[];
  background?: string;
}) {
  const details = gesture
    ? [
        `${get_script_from_id(gesture.script_id) ?? gesture.script_id} #${gestureId}`,
        `v${gesture.revision}`,
        saved.length === 0 ? 'no strokes yet' : null
      ]
        .filter(Boolean)
        .join(' · ')
    : `#${gestureId}`;
  return (
    <>
      <CrosshairIcon className="size-3.5 shrink-0 text-primary" aria-hidden />
      {saved.length > 0 ? (
        <GesturePreview
          gestures={saved}
          backgroundSrc={background}
          showStrokeOrder={false}
          size="thumb"
          inspect={{
            title: `${gesture?.text ?? ''} — saved${gesture ? ` v${gesture.revision}` : ''}`,
            label: 'Saved'
          }}
          className="w-9 shrink-0"
        />
      ) : null}
      <span className="flex min-w-0 items-baseline gap-1.5 text-sm">
        <span className="text-lg leading-none font-semibold">{gesture?.text ?? '…'}</span>
        <span className="truncate text-xs text-muted-foreground">{details}</span>
      </span>
      <ReviewBadge status={gesture?.review_status ?? null} strokes={saved.length} />
    </>
  );
}

/** Links to the gesture's hub, and (on the agents page) its editor. */
function FocusLinks({ gestureId, compact }: { gestureId: number; compact: boolean }) {
  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        nativeButton={false}
        render={
          <Link
            to="/admin/agents/gestures/$gestureId"
            params={{ gestureId: String(gestureId) }}
            target={compact ? '_blank' : undefined}
          />
        }
      >
        Hub
      </Button>
      {compact ? null : (
        <Button
          variant="ghost"
          size="xs"
          nativeButton={false}
          render={
            <a href={`/gestures/edit/${gestureId}?agent=list`} target="_blank" rel="noreferrer" />
          }
        >
          Editor
          <ExternalLinkIcon />
        </Button>
      )}
    </>
  );
}

/**
 * The strip under a focused chat's header: the gesture it works on with its saved version and
 * review state, every proposal of the chat (apply any of them), a saved-vs-latest comparison,
 * and links to the gesture's hub and editor.
 */
export function FocusBar({
  gestureId,
  messages,
  compact
}: {
  gestureId: number;
  messages: AgentUIMessage[];
  /** In the editor's panel: no editor link, tighter layout */
  compact: boolean;
}) {
  const trpc = useTRPC();
  const gesture_q = useQuery(trpc.agents.get_gesture.queryOptions({ id: gestureId }));
  const gesture = gesture_q.data;
  const background = useGlyphBackground(gesture ?? null);
  const proposals = useMemo(() => chatProposals(messages), [messages]);
  const applied = useAppliedRevisions(gestureId);
  const [comparing, setComparing] = useState(false);
  const [applying, setApplying] = useState<ChatProposal | null>(null);
  /** A proposal of the popover opened in the inspector (beside the saved version) */
  const [inspecting, setInspecting] = useState<{ item: ChatProposal; number: number } | null>(null);
  const saved = gesture ? savedStrokes(gesture.gestures) : [];
  const latest = proposals.at(-1) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/70 bg-muted/20 px-3 py-1.5">
      <FocusLabel gestureId={gestureId} gesture={gesture} saved={saved} background={background} />

      <div className="ml-auto flex items-center gap-1">
        <Popover>
          <PopoverTrigger
            render={<Button variant="ghost" size="xs" disabled={proposals.length === 0} />}
          >
            {proposals.length} {proposals.length === 1 ? 'proposal' : 'proposals'}
            <ChevronDownIcon />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-1.5">
            <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
              {proposals
                .map((item, index) => ({ item, number: index + 1 }))
                .reverse()
                .map(({ item, number }) => (
                  <ProposalRow
                    key={item.toolCallId}
                    item={item}
                    number={number}
                    appliedAs={applied.get(item.toolCallId)}
                    background={background}
                    onApply={() => setApplying(item)}
                    onInspect={() => setInspecting({ item, number })}
                  />
                ))}
            </ul>
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setComparing(true)}
          title="Compare the saved version with the latest proposal"
        >
          <Columns2Icon />
          {compact ? null : 'Compare'}
        </Button>
        <FocusLinks gestureId={gestureId} compact={compact} />
      </div>

      <CompareDialog
        open={comparing}
        onOpenChange={setComparing}
        saved={saved}
        proposal={latest?.proposal ?? null}
        background={background}
        revision={gesture?.revision}
      />
      {inspecting ? (
        <GestureInspectorDialog
          open
          onOpenChange={(open) => !open && setInspecting(null)}
          title={`${gesture?.text ?? ''} — proposal ${inspecting.number}`}
          description={inspecting.item.proposal.summary}
          panes={[
            ...(saved.length > 0
              ? [
                  {
                    label: `Saved · v${gesture?.revision ?? '…'}`,
                    gestures: saved,
                    backgroundSrc: background
                  } satisfies InspectPane
                ]
              : []),
            {
              label: `Proposal ${inspecting.number}`,
              gestures: inspecting.item.proposal.gestures,
              backgroundSrc: background,
              accent: true
            }
          ]}
        />
      ) : null}
      {applying ? (
        <ApplyGestureDialog
          open
          onOpenChange={(open) => !open && setApplying(null)}
          proposal={applying.proposal}
          toolCallId={applying.toolCallId}
          background={background}
        />
      ) : null}
    </div>
  );
}
