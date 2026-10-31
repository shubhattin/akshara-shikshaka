import { useMemo, useReducer, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redo2Icon, RotateCcwIcon, Undo2Icon, WandSparklesIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTRPC } from '~/api/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
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
import { Spinner } from '~/components/ui/spinner';
import { useStoredValue } from '~/hooks/use_stored_value';
import { cn } from '~/lib/utils';
import type { FontFamily } from '~/state/font_families';
import { fontLabel, fontsForScript } from '~/state/font_scripts';
import { get_script_from_id } from '~/state/lang_list';
import { FilterSelect } from '../agents/gesture_hub/FilterSelect';
import { FontCard, FONT_VIEW_META, FONT_VIEWS, type FontCardRow, type FontView } from './FontCard';
import {
  applyRule,
  effectiveSetting,
  FONT_SCOPE_META,
  FONT_SCOPES,
  fontUsage,
  historyReducer,
  initialHistory,
  ruleTargets,
  setEdit,
  type FontRow,
  type FontScope,
  type FontSetting,
  type History,
  type HistoryAction,
  type ReplaceRule
} from './font_edits';

const CARD_SIZES = {
  S: 'grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]',
  M: 'grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))]',
  L: 'grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]'
} as const;
type CardSize = keyof typeof CARD_SIZES;
const CARD_SIZE_KEY = 'font_tools_card_size';
const parseCardSize = (value: string | null): CardSize =>
  value === 'S' || value === 'L' ? value : 'M';

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center rounded-md border border-border/60 p-0.5"
    >
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="xs"
          variant={value === option.value ? 'secondary' : 'ghost'}
          aria-pressed={value === option.value}
          title={option.hint}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

/** The replace tool: one font for another (or any), optionally a size, in a scope. */
function ReplaceBar({
  fonts,
  usage,
  rule,
  setRule,
  targets,
  selectedCount,
  onApply
}: {
  fonts: FontFamily[];
  usage: { font: FontFamily; count: number }[];
  rule: ReplaceRule;
  setRule: (next: Partial<ReplaceRule>) => void;
  targets: number;
  selectedCount: number;
  onApply: () => void;
}) {
  const countOf = (font: FontFamily) => usage.find((u) => u.font === font)?.count ?? 0;
  const [sizeText, setSizeText] = useState(rule.size === null ? '' : String(rule.size));
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-2">
      <WandSparklesIcon className="size-4 text-primary" aria-hidden />
      <span className="text-xs font-medium">Replace</span>
      <FilterSelect
        label="Replace this font"
        value={rule.from}
        options={[
          { value: 'any', label: 'Any font' },
          ...fonts.map((font) => ({ value: font, label: fontLabel(font), count: countOf(font) }))
        ]}
        onChange={(value) =>
          setRule({ from: value === 'any' ? 'any' : (fonts.find((f) => f === value) ?? 'any') })
        }
        className="min-w-44"
      />
      <span className="text-xs text-muted-foreground">with</span>
      <FilterSelect
        label="With this font"
        value={rule.to}
        options={fonts.map((font) => ({ value: font, label: fontLabel(font) }))}
        onChange={(value) => {
          const font = fonts.find((f) => f === value);
          if (font) setRule({ to: font });
        }}
        className="min-w-44"
      />
      <span className="text-xs text-muted-foreground">size</span>
      <Input
        type="number"
        min={1}
        max={100}
        value={sizeText}
        placeholder="keep"
        aria-label="New font size (empty keeps each size)"
        onChange={(event) => {
          const text = event.currentTarget.value;
          setSizeText(text);
          const size = Number(text);
          setRule({
            size: text.trim() === '' || !Number.isInteger(size) || size < 1 ? null : size
          });
        }}
        className="h-8 w-18"
      />
      <span className="text-xs text-muted-foreground">in</span>
      <Segmented<FontScope>
        label="Which gestures"
        value={rule.scope}
        options={FONT_SCOPES.map((scope) => ({
          value: scope,
          label:
            scope === 'selected'
              ? `${FONT_SCOPE_META.selected.label} (${selectedCount})`
              : FONT_SCOPE_META[scope].label,
          hint: FONT_SCOPE_META[scope].hint
        }))}
        onChange={(scope) => setRule({ scope })}
      />
      <Button size="sm" className="ml-auto" disabled={targets === 0} onClick={onApply}>
        Apply to {targets}
      </Button>
    </div>
  );
}

/** Undo / redo / reset, what is pending, and cancel / save. */
function FontToolsFooter({
  history,
  dispatch,
  changes,
  recordedChanges,
  saving,
  onCancel,
  onSave
}: {
  history: History;
  dispatch: (action: HistoryAction) => void;
  changes: number;
  recordedChanges: number;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <DialogFooter className="m-0 shrink-0 flex-row flex-wrap items-center gap-2 border-t p-3 sm:justify-between">
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={history.past.length === 0}
          onClick={() => dispatch({ type: 'undo' })}
          title="Undo (Ctrl+Z)"
        >
          <Undo2Icon />
          Undo
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={history.future.length === 0}
          onClick={() => dispatch({ type: 'redo' })}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2Icon />
          Redo
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={changes === 0}
          onClick={() => dispatch({ type: 'reset' })}
          title="Drop every pending change (undoable)"
        >
          <RotateCcwIcon />
          Reset
        </Button>
        <span className="ml-2 text-xs text-muted-foreground">
          {changes > 0
            ? `${changes} change${changes === 1 ? '' : 's'}${recordedChanges > 0 ? ` · ${recordedChanges} with strokes` : ''}`
            : 'No changes'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={changes === 0 || saving} onClick={onSave}>
          {saving ? <Spinner /> : null}
          Save {changes > 0 ? changes : ''}
        </Button>
      </div>
    </DialogFooter>
  );
}

type FontListRow = FontCardRow & FontRow & { revision: number };

/**
 * Inspect and change the glyph fonts of every gesture of one script in one lesson category:
 * replace one font with another (everywhere, only where nothing is recorded yet, …), or set each
 * gesture's own font and size; every change previews on the card, with undo / redo, until saved.
 */
export function FontToolsDialog({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  scriptId,
  langId
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 0: uncategorized */
  categoryId: number;
  categoryName: string;
  scriptId: number;
  langId: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const list_q = useQuery(
    trpc.text_gestures.fonts.list.queryOptions(
      { category_id: categoryId, script_id: scriptId, lang_id: langId },
      { enabled: open, refetchOnWindowFocus: false }
    )
  );
  const fonts = useMemo(() => fontsForScript(scriptId), [scriptId]);
  const [history, dispatch] = useReducer(historyReducer, undefined, initialHistory);
  const edits = history.present;
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [view, setView] = useState<FontView>('after');
  const [showStrokes, setShowStrokes] = useState(true);
  const [changedOnly, setChangedOnly] = useState(false);
  const [storedSize, storeSize] = useStoredValue(CARD_SIZE_KEY);
  const cardSize = parseCardSize(storedSize);
  const [rule, setRuleState] = useState<ReplaceRule>({
    from: 'any',
    to: fonts.find((f) => f !== fonts[0]) ?? fonts[0]!,
    size: null,
    scope: 'empty'
  });
  const setRule = (next: Partial<ReplaceRule>) => setRuleState((r) => ({ ...r, ...next }));
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const rows: FontListRow[] = useMemo(
    () =>
      (list_q.data ?? []).map((row) => {
        const saved: FontSetting = { font_family: row.font_family, font_size: row.font_size };
        return {
          id: row.id,
          text: row.text,
          order: row.order,
          gestures: row.gestures,
          strokes: row.gestures.filter((g) => g.points.length > 0).length,
          text_center_offset: row.text_center_offset,
          revision: row.revision,
          saved,
          ...saved
        };
      }),
    [list_q.data]
  );
  // edits of gestures no longer listed do not count
  const changes = rows.filter((row) => edits.has(row.id));
  const recordedChanges = changes.filter((row) => row.strokes > 0).length;
  const usage = fontUsage(rows, edits);
  const targets = ruleTargets(rows, edits, rule, selected);
  const shown = changedOnly ? changes : rows;
  const dirty = changes.length > 0;

  const save_mut = useMutation(
    trpc.text_gestures.fonts.apply.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Changed the font of ${result.saved.length} gestures`);
        void queryClient.invalidateQueries(trpc.text_gestures.fonts.list.pathFilter());
        void queryClient.invalidateQueries(trpc.text_gestures.categories.get_gestures.pathFilter());
        dispatch({ type: 'reset' });
        setConfirmSave(false);
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(error.message);
        setConfirmSave(false);
        // fresh revisions: the kept edits can be saved again
        void list_q.refetch();
      }
    })
  );

  const save = () =>
    save_mut.mutate({
      changes: changes.map((row) => {
        const setting = effectiveSetting(row, edits);
        return {
          id: row.id,
          expected_revision: row.revision,
          font_family: setting.font_family,
          font_size: setting.font_size
        };
      })
    });

  const requestClose = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (dirty) setConfirmDiscard(true);
    else onOpenChange(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
    } else if (key === 'y') {
      event.preventDefault();
      dispatch({ type: 'redo' });
    }
  };

  const toggleSelected = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = shown.length > 0 && shown.every((row) => selected.has(row.id));

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent
          onKeyDown={onKeyDown}
          className="flex h-[94vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1600px)]"
        >
          <DialogHeader className="shrink-0 gap-2 border-b p-4 pr-12">
            <DialogTitle>
              Fonts — {get_script_from_id(scriptId) ?? scriptId} · {categoryName}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {rows.length} gestures
              </span>
            </DialogTitle>
            <DialogDescription>
              Changes preview on each card and are saved only when you press Save. Gestures with
              strokes were traced on their current glyph: check the overlay, they go back to
              Unreviewed.
            </DialogDescription>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">In use:</span>
              {usage.map(({ font, count }) => (
                <button
                  key={font}
                  type="button"
                  onClick={() => setRule({ from: font })}
                  title="Replace this font"
                  className={cn(
                    'rounded-full border px-2 py-0.5 transition-colors hover:bg-muted',
                    rule.from === font ? 'border-primary/60 bg-primary/10' : 'border-border/70'
                  )}
                >
                  {fontLabel(font)} <span className="tabular-nums opacity-70">{count}</span>
                </button>
              ))}
            </div>
          </DialogHeader>

          <div className="flex shrink-0 flex-col gap-2 border-b px-4 py-2.5">
            <ReplaceBar
              fonts={fonts}
              usage={usage}
              rule={rule}
              setRule={setRule}
              targets={targets.length}
              selectedCount={selected.size}
              onApply={() =>
                dispatch({ type: 'set', edits: applyRule(rows, edits, rule, selected) })
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={allSelected}
                  indeterminate={selected.size > 0 && !allSelected}
                  disabled={shown.length === 0}
                  onCheckedChange={(next) =>
                    setSelected(next === true ? new Set(shown.map((row) => row.id)) : new Set())
                  }
                  aria-label="Select every gesture shown"
                />
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </label>
              <Segmented<FontView>
                label="Glyph shown"
                value={view}
                options={FONT_VIEWS.map((v) => ({
                  value: v,
                  label: FONT_VIEW_META[v].label,
                  hint: FONT_VIEW_META[v].hint
                }))}
                onChange={setView}
              />
              <Button
                size="xs"
                variant={showStrokes ? 'secondary' : 'ghost'}
                aria-pressed={showStrokes}
                onClick={() => setShowStrokes(!showStrokes)}
              >
                Strokes
              </Button>
              <Button
                size="xs"
                variant={changedOnly ? 'secondary' : 'ghost'}
                aria-pressed={changedOnly}
                onClick={() => setChangedOnly(!changedOnly)}
              >
                Changed only ({changes.length})
              </Button>
              <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                Card size
                <Segmented<CardSize>
                  label="Card size"
                  value={cardSize}
                  options={(['S', 'M', 'L'] as const).map((s) => ({ value: s, label: s }))}
                  onChange={storeSize}
                />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {list_q.isPending ? (
              <div className={cn('grid gap-3', CARD_SIZES[cardSize])}>
                {Array.from({ length: 12 }, (_, i) => (
                  <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {changedOnly ? 'Nothing changed yet.' : 'No gestures in this category.'}
              </p>
            ) : (
              <ul className={cn('grid list-none gap-3 p-0', CARD_SIZES[cardSize])}>
                {shown.map((row) => (
                  <FontCard
                    key={row.id}
                    row={row}
                    setting={effectiveSetting(row, edits)}
                    fonts={fonts}
                    view={view}
                    showStrokes={showStrokes}
                    selected={selected.has(row.id)}
                    onToggleSelected={() => toggleSelected(row.id)}
                    onChange={(next) => dispatch({ type: 'set', edits: setEdit(edits, row, next) })}
                  />
                ))}
              </ul>
            )}
          </div>

          <FontToolsFooter
            history={history}
            dispatch={dispatch}
            changes={changes.length}
            recordedChanges={recordedChanges}
            saving={save_mut.isPending}
            onCancel={() => requestClose(false)}
            onSave={() => setConfirmSave(true)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmSave} onOpenChange={setConfirmSave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Change the font of {changes.length} gesture{changes.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each is saved as a new version (restorable from its history).
              {recordedChanges > 0
                ? ` ${recordedChanges} have strokes: they go back to Unreviewed so their alignment gets checked.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={save_mut.isPending}>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={save} disabled={save_mut.isPending}>
              {save_mut.isPending ? 'Saving…' : 'Save'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard {changes.length} font changes?</AlertDialogTitle>
            <AlertDialogDescription>Nothing has been saved yet.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                dispatch({ type: 'reset' });
                setConfirmDiscard(false);
                onOpenChange(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
