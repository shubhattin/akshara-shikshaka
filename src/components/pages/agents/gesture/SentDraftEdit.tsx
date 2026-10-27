import { useState } from 'react';
import { PencilIcon, PencilRulerIcon, TriangleAlertIcon } from 'lucide-react';
import { draftEditSummary } from '~/agents/gesture_creator/draft_edit_context';
import type { DraftEditData } from '~/agents/gesture_creator/schemas';
import { Button } from '~/components/ui/button';
import { DraftCanvas } from './DraftCanvas';
import { DraftEditor, useDraftGlyph } from './DraftEditor';
import { draftFromEdit, initialStrokes, strokesInMark } from './draft_state';

/**
 * An edit the admin sent, as it was sent: the edited strokes with the rings drawn on them, each
 * ring's note, and what changed. While it is the chat's newest draft it can be edited again.
 */

const noop = () => {};

export function SentDraftEdit({ edit, latest }: { edit: DraftEditData; latest: boolean }) {
  const [editing, setEditing] = useState(false);
  const source = draftFromEdit(edit);
  const strokes = initialStrokes(source);
  const { gesture, background } = useDraftGlyph(source);

  return (
    <div className="flex w-full flex-col items-end gap-2">
      <div className="flex w-full max-w-xl gap-3 rounded-xl border border-border/70 bg-muted/40 p-2.5">
        <DraftCanvas
          readOnly
          className="w-32 shrink-0 sm:w-40"
          strokes={strokes}
          marks={edit.marks}
          background={background}
          highlight={null}
          tool="look"
          playback={null}
          onHover={noop}
          onSplit={noop}
          onMark={noop}
          onMarkChange={noop}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <PencilRulerIcon className="size-4 shrink-0 text-primary" />
            Edited the draft
            {gesture ? <span className="text-base">{gesture.text}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">{draftEditSummary(edit)}</p>
          {edit.marks.length > 0 ? (
            <ul className="flex flex-col gap-1" aria-label="Marked areas">
              {edit.marks.map((mark) => {
                const touched = strokesInMark(strokes, mark);
                return (
                  <li key={mark.id} className="flex items-start gap-1.5 text-xs">
                    <span className="grid size-4 shrink-0 place-items-center rounded bg-red-600 text-[10px] font-bold text-white">
                      {mark.id}
                    </span>
                    <span className="min-w-0 break-words">
                      {mark.note || <span className="text-muted-foreground">(no note)</span>}
                      {touched.length ? (
                        <span className="text-muted-foreground">
                          {' '}
                          · stroke {touched.join(', ')}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {edit.error ? (
            <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
              {edit.error}
            </p>
          ) : null}
          {latest && !editing ? (
            <Button
              size="xs"
              variant="outline"
              className="mt-auto self-start"
              onClick={() => setEditing(true)}
            >
              <PencilIcon />
              Edit again
            </Button>
          ) : null}
        </div>
      </div>
      {latest && editing ? (
        <div className="w-full">
          <DraftEditor key={edit.edit_id} source={source} title="Edit your draft again" />
        </div>
      ) : null}
    </div>
  );
}
