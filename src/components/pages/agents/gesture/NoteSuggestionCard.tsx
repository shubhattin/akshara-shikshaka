import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2Icon, NotebookPenIcon, TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import { MAX_AGENT_NOTES_LENGTH, withNote } from '~/agents/gesture_review';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { get_script_from_id } from '~/state/lang_list';
import type { AgentToolPart } from '../chat/message_parts';
import { useRefreshGesture } from '../gesture_hub/use_refresh_gesture';

/**
 * A note the agent suggests keeping for a gesture. Nothing is saved until the admin adds it;
 * later chats focused on the gesture read the saved notes.
 */
export function NoteSuggestionCard({ part }: { part: AgentToolPart<'suggest_gesture_note'> }) {
  const trpc = useTRPC();
  const refreshGesture = useRefreshGesture();
  const ok = part.state === 'output-available' && part.output.ok ? part.output : null;
  const gesture_q = useQuery(
    trpc.agents.get_gesture.queryOptions({ id: ok?.gesture_id ?? 0 }, { enabled: !!ok })
  );
  const save_mut = useMutation(
    trpc.agents.add_agent_note.mutationOptions({
      onSuccess: () => {
        if (ok) refreshGesture(ok.gesture_id);
        toast.success('Note saved to the gesture');
      },
      onError: (error) => {
        toast.error(error.message);
        if (ok) refreshGesture(ok.gesture_id);
      }
    })
  );

  if (part.state === 'output-error' || (part.state === 'output-available' && !part.output.ok)) {
    const error =
      part.state === 'output-error' ? part.errorText : !part.output.ok ? part.output.error : '';
    return (
      <p className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        <TriangleAlertIcon className="size-4 shrink-0" />
        Note not suggested: {error}
      </p>
    );
  }
  if (!ok) return null;

  const notes = gesture_q.data?.agent_notes ?? '';
  const next = withNote(notes, ok.note);
  const saved = !!gesture_q.data && next === notes.trim();
  const tooLong = next.length > MAX_AGENT_NOTES_LENGTH;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <NotebookPenIcon className="size-4 text-amber-600" />
        Note for {ok.text}
        <span className="font-normal text-muted-foreground">
          {get_script_from_id(ok.script_id)} #{ok.gesture_id}
        </span>
      </p>
      <p className="text-sm">{ok.note}</p>
      <div className="flex items-center gap-2">
        {saved ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2Icon className="size-3.5" />
            In the gesture’s notes
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={!gesture_q.data || save_mut.isPending || tooLong}
            onClick={() => save_mut.mutate({ gesture_id: ok.gesture_id, note: ok.note })}
          >
            {save_mut.isPending ? <Spinner className="size-4" /> : null}
            Add to the gesture’s notes
          </Button>
        )}
        {tooLong ? (
          <span className="text-xs text-destructive">
            The notes are full; edit them in the hub.
          </span>
        ) : null}
      </div>
    </div>
  );
}
