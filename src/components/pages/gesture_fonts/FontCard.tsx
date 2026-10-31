import { useMemo, useState } from 'react';
import { Maximize2Icon, RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';
import { GestureInspectorDialog } from '~/components/gesture/GestureInspectorDialog';
import { GestureSvg } from '~/components/gesture/GestureSvg';
import { orderedStrokes } from '~/components/gesture/use_stroke_player';
import { useInViewOnce } from '~/components/gesture/useGesturePreviewById';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import type { FontFamily } from '~/state/font_families';
import { fontLabel } from '~/state/font_scripts';
import type { Gesture } from '~/tools/stroke_data/types';
import { FilterSelect } from '../agents/gesture_hub/FilterSelect';
import type { FontSetting } from './font_edits';
import { useGlyphImage, type GlyphColor } from './use_glyph_image';

export const FONT_VIEWS = ['after', 'before', 'overlay'] as const;
export type FontView = (typeof FONT_VIEWS)[number];

export const FONT_VIEW_META = {
  after: { label: 'After', hint: 'The glyph in its new font' },
  before: { label: 'Before', hint: 'The glyph as saved now' },
  overlay: { label: 'Overlay', hint: 'New glyph, with the saved one outlined in red over it' }
} as const satisfies Record<FontView, { label: string; hint: string }>;

const INK: GlyphColor = [30, 41, 59, 255];
/** Under strokes the glyph is a light guide, as in the editor. */
const GUIDE: GlyphColor = [205, 205, 205, 255];
const BEFORE_RED: GlyphColor = [225, 29, 72, 110];

export type FontCardRow = {
  id: number;
  text: string;
  order: number | null;
  gestures: Gesture[];
  strokes: number;
  text_center_offset: [number, number];
  saved: FontSetting;
};

/**
 * One gesture in the font tools: its glyph in the pending font (or as saved, or both), its
 * strokes on top, and its own font and size controls.
 */
export function FontCard({
  row,
  setting,
  fonts,
  view,
  showStrokes,
  selected,
  onToggleSelected,
  onChange
}: {
  row: FontCardRow;
  setting: FontSetting;
  fonts: FontFamily[];
  view: FontView;
  showStrokes: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onChange: (next: FontSetting) => void;
}) {
  const [ref, inView] = useInViewOnce<HTMLLIElement>('400px');
  const [inspecting, setInspecting] = useState(false);
  const changed =
    setting.font_family !== row.saved.font_family || setting.font_size !== row.saved.font_size;
  const strokesShown = showStrokes && row.strokes > 0;
  const glyph = (s: FontSetting) => ({
    text: row.text,
    font_family: s.font_family,
    font_size: s.font_size,
    text_center_offset: row.text_center_offset
  });
  const shown = view === 'before' ? row.saved : setting;
  const main = useGlyphImage(glyph(shown), strokesShown ? GUIDE : INK, inView);
  const before = useGlyphImage(glyph(row.saved), BEFORE_RED, inView && view === 'overlay');
  const ordered = useMemo(() => orderedStrokes(row.gestures), [row.gestures]);

  return (
    <li
      ref={ref}
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-2 transition-colors',
        changed ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border/70',
        selected && 'bg-primary/5'
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border/60 bg-white">
        {main ? <img src={main} alt="" className="absolute inset-0 size-full" /> : null}
        {view === 'overlay' && before ? (
          <img src={before} alt="" className="absolute inset-0 size-full" />
        ) : null}
        {strokesShown ? (
          <GestureSvg
            ordered={ordered}
            showStrokeOrder={false}
            className="absolute inset-0 rounded-none border-0 bg-transparent"
          />
        ) : null}
        <div className="absolute top-1.5 left-1.5 rounded bg-background/80 p-0.5">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelected}
            aria-label={`Select ${row.text}`}
          />
        </div>
        {row.strokes > 0 ? (
          <Button
            type="button"
            size="icon-xs"
            variant="secondary"
            aria-label="Inspect strokes"
            title="Inspect strokes"
            className="absolute top-1.5 right-1.5 shadow-sm"
            onClick={() => setInspecting(true)}
          >
            <Maximize2Icon />
          </Button>
        ) : null}
        {changed && row.strokes > 0 ? (
          <span
            title="Its strokes were traced on the saved glyph: check they still sit on the new one. It will be marked Unreviewed."
            className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white"
          >
            <TriangleAlertIcon className="size-3" />
            Has strokes
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        {row.order !== null ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1 text-[11px] font-semibold text-muted-foreground tabular-nums">
            {row.order}
          </span>
        ) : null}
        <span className="truncate text-base leading-none font-semibold">{row.text}</span>
        <span
          className={cn(
            'ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
            row.strokes > 0
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          )}
        >
          {row.strokes > 0 ? `${row.strokes} str` : 'empty'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <FilterSelect
          label={`Font of ${row.text}`}
          value={setting.font_family}
          options={fonts.map((font) => ({ value: font, label: fontLabel(font) }))}
          onChange={(value) => {
            const font = fonts.find((f) => f === value);
            if (font) onChange({ ...setting, font_family: font });
          }}
          className="h-7 min-w-0 flex-1 text-xs"
        />
        <SizeInput
          // a new value from outside (undo, a rule) resets the draft
          key={setting.font_size}
          size={setting.font_size}
          label={`Font size of ${row.text}`}
          onCommit={(font_size) => onChange({ ...setting, font_size })}
        />
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Back to the saved font"
          title="Back to the saved font"
          disabled={!changed}
          onClick={() => onChange(row.saved)}
        >
          <RotateCcwIcon />
        </Button>
      </div>
      {changed ? (
        <p className="truncate text-[11px] text-muted-foreground" title="Saved → pending">
          {fontLabel(row.saved.font_family)} {row.saved.font_size} →{' '}
          <span className="text-foreground">
            {fontLabel(setting.font_family)} {setting.font_size}
          </span>
        </p>
      ) : null}
      {inspecting ? (
        <FontInspector row={row} setting={setting} onClose={() => setInspecting(false)} />
      ) : null}
    </li>
  );
}

/** A size field that changes the setting once (on Enter or leaving it), so it is one undo step. */
function SizeInput({
  size,
  label,
  onCommit
}: {
  size: number;
  label: string;
  onCommit: (size: number) => void;
}) {
  const [draft, setDraft] = useState(String(size));
  const commit = () => {
    const next = Number(draft);
    if (Number.isInteger(next) && next >= 1 && next <= 100 && next !== size) onCommit(next);
    else setDraft(String(size));
  };
  return (
    <Input
      type="number"
      min={1}
      max={100}
      value={draft}
      aria-label={label}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
      className="h-7 w-14 px-1.5 text-xs"
    />
  );
}

/** The strokes over the saved glyph and over the new one, side by side. */
function FontInspector({
  row,
  setting,
  onClose
}: {
  row: FontCardRow;
  setting: FontSetting;
  onClose: () => void;
}) {
  const glyph = (s: FontSetting) => ({
    text: row.text,
    font_family: s.font_family,
    font_size: s.font_size,
    text_center_offset: row.text_center_offset
  });
  const saved = useGlyphImage(glyph(row.saved), GUIDE);
  const pending = useGlyphImage(glyph(setting), GUIDE);
  return (
    <GestureInspectorDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${row.text} — strokes on the saved and the new glyph`}
      panes={[
        {
          label: `Saved · ${fontLabel(row.saved.font_family)} ${row.saved.font_size}`,
          gestures: row.gestures,
          backgroundSrc: saved
        },
        {
          label: `New · ${fontLabel(setting.font_family)} ${setting.font_size}`,
          gestures: row.gestures,
          backgroundSrc: pending,
          accent: true
        }
      ]}
    />
  );
}
