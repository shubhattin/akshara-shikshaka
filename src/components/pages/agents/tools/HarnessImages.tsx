import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog';

const CAPTIONS: Record<string, string> = {
  glyph: 'Glyph',
  skeleton: 'Skeleton graph',
  saved: 'Saved strokes',
  strokes: 'Draft',
  order: 'Writing order'
};

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
              alt={CAPTIONS[name] ?? name}
              className={name === 'order' ? 'h-28 w-auto max-w-72 object-contain' : 'size-28 object-contain'}
            />
            <span className="px-1 text-[11px] font-medium text-neutral-600">{CAPTIONS[name] ?? name}</span>
          </button>
        ))}
      </div>
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="max-h-[92dvh] gap-2 overflow-auto p-3 sm:max-w-3xl">
          <DialogTitle className="text-sm">{open ? (CAPTIONS[open] ?? open) : ''}</DialogTitle>
          {open && images[open] ? (
            <img src={images[open]} alt={CAPTIONS[open] ?? open} className="w-full rounded-md bg-white" />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
