import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { nanoid } from 'nanoid';
import { EyeIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import {
  MAX_DRAFT_MARKS,
  type DraftMark,
  type SavedViewData
} from '~/agents/gesture_creator/schemas';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Skeleton } from '~/components/ui/skeleton';
import { Textarea } from '~/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { cn } from '~/lib/utils';
import { get_script_from_id } from '~/state/lang_list';
import type { Gesture } from '~/tools/stroke_data/types';
import type { AgentUIMessage } from '~/agents/ui_message';
import { useAgentChatContext } from '../chat/agent_chat_context';
import { DraftCanvas } from './DraftCanvas';
import { nextMarkId, strokesInMark, type DraftStroke } from './draft_state';
import { useGlyphBackground } from './use_glyph_background';

const noop = () => {};

/** Saved strokes as read-only draft strokes, so the draft canvas can draw and ring them. */
function savedAsDraft(gestures: Gesture[]): DraftStroke[] {
  return [...gestures]
    .sort((a, b) => a.index - b.index)
    .filter((g) => g.points.length > 0)
    .map((g, i) => {
      const points = g.points;
      return {
        key: `saved-${i}`,
        spec: { waypoints: [points[0]!, points.at(-1)!] },
        points,
        origin: { from: [i + 1], reversed: false }
      };
    });
}

type Source = { gesture_id: number; purpose: SavedViewData['purpose'] };

function SourcePicker({
  focusId,
  value,
  onChange
}: {
  focusId: number;
  value: Source;
  onChange: (source: Source) => void;
}) {
  const trpc = useTRPC();
  const hub_q = useQuery(trpc.agents.gesture_hub.queryOptions({ gesture_id: focusId }));
  const options: (Source & { label: string; disabled: boolean })[] = [
    {
      gesture_id: focusId,
      purpose: 'critique',
      label: `This gesture — point out what’s wrong`,
      disabled: false
    },
    ...(hub_q.data?.siblings ?? []).map((s) => ({
      gesture_id: s.id,
      purpose: 'sibling' as const,
      label: `${s.text} in ${get_script_from_id(s.script_id) ?? s.script_id} — follow its order${s.strokes > 0 ? '' : ' (no strokes)'}`,
      disabled: s.strokes === 0
    }))
  ];
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Which saved strokes">
      {options.map((option) => {
        const selected = option.gesture_id === value.gesture_id;
        return (
          <button
            key={option.gesture_id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            onClick={() => onChange({ gesture_id: option.gesture_id, purpose: option.purpose })}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50',
              selected
                ? 'border-primary bg-primary/10 font-medium text-foreground'
                : 'border-border hover:bg-muted/50'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Show the agent saved strokes in a focused chat: this gesture's (ring what is wrong) or a
 * sibling script's (to follow its order). The agent otherwise never sees saved strokes.
 */
function SavedViewDialog({
  open,
  onOpenChange,
  focusId
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusId: number;
}) {
  const trpc = useTRPC();
  const { sendSavedView, replying } = useAgentChatContext();
  const [source, setSource] = useState<Source>({ gesture_id: focusId, purpose: 'critique' });
  const [marks, setMarks] = useState<DraftMark[]>([]);
  const [note, setNote] = useState('');
  const gesture_q = useQuery(trpc.agents.get_gesture.queryOptions({ id: source.gesture_id }));
  const gesture = gesture_q.data;
  const background = useGlyphBackground(gesture ?? null);
  const strokes = gesture ? savedAsDraft(gesture.gestures) : [];
  const critique = source.purpose === 'critique';

  const pickSource = (next: Source) => {
    setSource(next);
    setMarks([]);
  };
  const send = () => {
    sendSavedView(
      { view_id: nanoid(12), gesture_id: source.gesture_id, purpose: source.purpose, marks },
      note.trim()
    );
    onOpenChange(false);
    setMarks([]);
    setNote('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94dvh] flex-col gap-3 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Show the agent saved strokes</DialogTitle>
          <DialogDescription>
            The agent never sees saved strokes on its own. Share this gesture’s (and ring what is
            wrong) or another script’s version of the same akṣara (to match its order). It still
            traces from the glyph itself.
          </DialogDescription>
        </DialogHeader>
        <SourcePicker focusId={focusId} value={source} onChange={pickSource} />
        <div className="grid gap-3 sm:grid-cols-[1fr_15rem]">
          {gesture_q.isPending ? (
            <Skeleton className="aspect-square w-full" />
          ) : strokes.length === 0 ? (
            <p className="flex aspect-square items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
              <TriangleAlertIcon className="size-4" />
              No strokes saved yet
            </p>
          ) : (
            <DraftCanvas
              strokes={strokes}
              marks={marks}
              background={background}
              highlight={null}
              tool={marks.length >= MAX_DRAFT_MARKS ? 'look' : 'mark'}
              playback={null}
              onHover={noop}
              onSplit={noop}
              onMark={(area) =>
                setMarks((prev) => [...prev, { id: nextMarkId(prev), ...area, note: '' }])
              }
              onMarkChange={(id, area) =>
                setMarks((prev) => prev.map((m) => (m.id === id ? { ...m, ...area } : m)))
              }
              className="w-full rounded-lg border border-border/70"
            />
          )}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {critique
                ? 'Drag on the glyph to ring a problem area, then say what is wrong there.'
                : 'Ring parts whose order or direction matters most (optional).'}
            </p>
            <ul className="flex flex-col gap-1.5">
              {marks.map((mark) => {
                const through = strokesInMark(strokes, mark);
                return (
                  <li key={mark.id} className="flex items-center gap-2">
                    <span className="grid size-5 shrink-0 place-items-center rounded bg-red-600 text-[11px] font-bold text-white">
                      {mark.id}
                    </span>
                    <Input
                      value={mark.note}
                      maxLength={300}
                      onChange={(event) => {
                        const value = event.target.value;
                        setMarks((prev) =>
                          prev.map((m) => (m.id === mark.id ? { ...m, note: value } : m))
                        );
                      }}
                      placeholder={through.length ? `Note (stroke ${through.join(', ')})` : 'Note'}
                      className="h-7 text-sm"
                      autoFocus
                    />
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Remove mark ${mark.id}`}
                      onClick={() => setMarks((prev) => prev.filter((m) => m.id !== mark.id))}
                    >
                      <XIcon />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                critique ? 'What should change overall?' : 'Anything to keep in mind? (optional)'
              }
              rows={3}
              className="mt-auto text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={send} disabled={replying || strokes.length === 0}>
            Send to the agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The composer's "show saved strokes" button in a focused chat. */
export function SavedViewButton({ gestureId, disabled }: { gestureId: number; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-full text-muted-foreground"
              aria-label="Show the agent saved strokes"
              disabled={disabled}
              onClick={() => setOpen(true)}
            />
          }
        >
          <EyeIcon />
        </TooltipTrigger>
        <TooltipContent>Show saved strokes: critique, or a sibling script’s order</TooltipContent>
      </Tooltip>
      {open ? <SavedViewDialog open onOpenChange={setOpen} focusId={gestureId} /> : null}
    </>
  );
}

type SavedViewPart = Extract<AgentUIMessage['parts'][number], { type: 'data-saved_view' }>;

/** Saved strokes the admin showed the agent, as the server drew them for it. */
export function SentSavedView({ part, message }: { part: SavedViewPart; message: AgentUIMessage }) {
  const view = part.data;
  const image = message.parts.find(
    (p) => p.type === 'data-draft_image' && p.data.edit_id === view.view_id
  );
  const url = image?.type === 'data-draft_image' ? image.data.url : '';
  const script = view.script_id === undefined ? '' : (get_script_from_id(view.script_id) ?? '');
  return (
    <div className="flex w-full max-w-xl gap-3 rounded-xl border border-border/70 bg-muted/40 p-2.5">
      {url ? (
        <img
          src={url}
          alt="Saved strokes shown to the agent"
          className="w-32 shrink-0 rounded-md bg-white sm:w-40"
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
        <p className="flex items-center gap-1.5 font-medium">
          <EyeIcon className="size-4 text-muted-foreground" />
          {view.purpose === 'critique' ? 'Shared the saved strokes' : 'Shared a sibling’s strokes'}
          {view.text ? (
            <span className="font-normal text-muted-foreground">
              {view.text} {script} · v{view.revision}
            </span>
          ) : null}
        </p>
        {view.error ? (
          <p className="flex items-center gap-1.5 text-destructive">
            <TriangleAlertIcon className="size-4" />
            {view.error}
          </p>
        ) : null}
        {view.marks.length > 0 ? (
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {view.marks.map((mark) => (
              <li key={mark.id}>
                <span className="font-bold text-red-600">{mark.id}</span>{' '}
                {mark.note.trim() || '(no note)'}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
