import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog';

const CAPTIONS = {
  glyph: 'Glyph',
  skeleton: 'Skeleton graph',
  // only in chats from before the agent stopped seeing saved strokes
  saved: 'Saved strokes',
  strokes: 'Draft',
  order: 'Writing order',
  closeups: 'Knots & crossings'
} as const satisfies Record<string, string>;

type HarnessCaptionName = keyof typeof CAPTIONS;

function isCaptionName(name: string): name is HarnessCaptionName {
  return name in CAPTIONS;
}

/** Human label for a harness thumbnail, falling back to the raw name. */
function captionFor(name: string): string {
  return isCaptionName(name) ? CAPTIONS[name] : name;
}

/** Thumbnails of what the agent looked at; click one to see it full size. */
export function HarnessImages({ images }: { images: Record<string, string> }) {
  const [open, setOpen] = useState<string | null>(null);
  const entries = Object.entries(images);
  if (entries.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {entries.map(([name, src]) => (
          <button
            key={name}
            type="button"
            onClick={() => setOpen(name)}
            className="group flex flex-col items-start gap-1 rounded-lg border border-border/70 bg-white p-1 transition-colors hover:border-foreground/30"
          >
            <img
              src={src}
              alt={captionFor(name)}
              className={
                name === 'order' ? 'h-28 w-auto max-w-72 object-contain' : 'size-28 object-contain'
              }
            />
            <span className="px-1 text-[11px] font-medium text-neutral-600">
              {captionFor(name)}
            </span>
          </button>
        ))}
      </div>
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="max-h-[92dvh] gap-2 overflow-auto p-3 sm:max-w-3xl">
          <DialogTitle className="text-sm">{open ? captionFor(open) : ''}</DialogTitle>
          {open && images[open] ? (
            <img src={images[open]} alt={captionFor(open)} className="w-full rounded-md bg-white" />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
