import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckIcon, NotebookPenIcon, WrenchIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import { MAX_AGENT_NOTES_LENGTH, type ReviewStatus } from '~/agents/gesture_review';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { Textarea } from '~/components/ui/textarea';
import { ReviewBadge } from './ReviewBadge';
import { useRefreshGesture } from './use_refresh_gesture';

/** Approve the saved strokes, or mark them as needing work with a note. */
export function ReviewControls({
  gestureId,
  status,
  note,
  strokes
}: {
  gestureId: number;
  status: ReviewStatus;
  note: string;
  /** Saved strokes: nothing to review without any */
  strokes: number;
}) {
  const trpc = useTRPC();
  const refreshGesture = useRefreshGesture();
  const [draft, setDraft] = useState(note);
  const [editing, setEditing] = useState(false);
  const review_mut = useMutation(
    trpc.agents.set_review.mutationOptions({
      onSuccess: () => {
        refreshGesture(gestureId);
        setEditing(false);
      },
      onError: (error) => toast.error(error.message)
    })
  );
  const set = (next: ReviewStatus, nextNote = '') =>
    review_mut.mutate({ gesture_id: gestureId, status: next, note: nextNote });

  if (strokes === 0) {
    return <p className="text-sm text-muted-foreground">Nothing to review until it has strokes.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ReviewBadge status={status} strokes={strokes} />
        {status === 'needs_work' && note ? (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">“{note}”</span>
        ) : (
          <span className="flex-1" />
        )}
        {review_mut.isPending ? <Spinner className="size-4" /> : null}
        <Button
          size="xs"
          variant={status === 'approved' ? 'secondary' : 'outline'}
          disabled={review_mut.isPending || status === 'approved'}
          onClick={() => set('approved')}
        >
          <CheckIcon />
          Approve
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={review_mut.isPending}
          onClick={() => {
            setDraft(status === 'needs_work' ? note : '');
            setEditing(true);
          }}
        >
          <WrenchIcon />
          Needs work
        </Button>
      </div>
      {editing ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            set('needs_work', draft.trim());
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            placeholder="What needs fixing?"
            className="h-8 text-sm"
            autoFocus
          />
          <Button size="sm" type="submit" disabled={review_mut.isPending}>
            Save
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** The notes the Gesture Creator reads in chats focused on this gesture. */
export function AgentNotesEditor({ gestureId, notes }: { gestureId: number; notes: string }) {
  const trpc = useTRPC();
  const refreshGesture = useRefreshGesture();
  const [draft, setDraft] = useState(notes);
  /** The saved notes the draft started from: saving checks they did not change meanwhile. */
  const [base, setBase] = useState(notes);
  // Notes saved elsewhere (a chat's suggestion) replace an unchanged draft; an edited draft keeps
  // its base, so saving it is a conflict instead of overwriting them.
  if (notes !== base && draft === base) {
    setBase(notes);
    setDraft(notes);
  }
  const notes_mut = useMutation(
    trpc.agents.set_agent_notes.mutationOptions({
      onSuccess: (_data, saved) => {
        // what was saved is the new base
        setBase(saved.notes.trim());
        setDraft(saved.notes.trim());
        refreshGesture(gestureId);
        toast.success('Notes saved');
      },
      onError: (error) => {
        toast.error(error.message);
        refreshGesture(gestureId);
      }
    })
  );
  const dirty = draft.trim() !== notes.trim();

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <NotebookPenIcon className="size-3.5" />
        The Gesture Creator follows these in chats focused on this gesture.
      </p>
      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={MAX_AGENT_NOTES_LENGTH}
        rows={4}
        placeholder="- Headline is drawn last&#10;- The loop turns clockwise"
        className="text-sm"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-muted-foreground">
          {draft.length}/{MAX_AGENT_NOTES_LENGTH}
        </span>
        {dirty ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setDraft(notes);
              setBase(notes);
            }}
          >
            Discard
          </Button>
        ) : null}
        <Button
          size="xs"
          disabled={!dirty || notes_mut.isPending}
          onClick={() =>
            notes_mut.mutate({ gesture_id: gestureId, notes: draft, previous_notes: base })
          }
        >
          {notes_mut.isPending ? <Spinner className="size-3.5" /> : null}
          Save notes
        </Button>
      </div>
    </div>
  );
}
