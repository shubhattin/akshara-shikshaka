import type { CustomRendererProps } from 'streamdown';
import { HandIcon } from 'lucide-react';
import { MAX_GESTURE_EMBED_IDS, parseGestureEmbedIds } from '~/agents/gesture_embed';
import { GesturePreviewList } from '~/components/gesture/GesturePreviewList';

/** A ```gesture fence in an agent reply: ids only, drawn from the database. */
export function GestureEmbedBlock({ code, isIncomplete }: CustomRendererProps) {
  if (isIncomplete) {
    return (
      <p className="my-3 flex items-center gap-2 text-xs text-muted-foreground">
        <HandIcon className="size-3.5 animate-pulse" />
        Preparing gesture preview…
      </p>
    );
  }
  const ids = parseGestureEmbedIds(code);
  const shown = ids.slice(0, MAX_GESTURE_EMBED_IDS);
  const rest = ids.slice(MAX_GESTURE_EMBED_IDS);
  return (
    <div className="my-3 flex flex-col gap-2">
      <GesturePreviewList ids={shown} />
      {rest.length > 0 ? (
        <p className="text-xs text-muted-foreground">Not shown: #{rest.join(', #')}</p>
      ) : null}
    </div>
  );
}
