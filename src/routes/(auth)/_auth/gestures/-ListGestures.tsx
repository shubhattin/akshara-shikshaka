'use client';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useTRPC } from '~/api/client';
import { useCategorySearchParam } from '~/hooks/useCategorySearchParam';
import { Card, CardContent } from '~/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Button } from '~/components/ui/button';
import { FONT_SCRIPTS, LANGUAGES_ADDED } from '~/state/font_list';
import {
  lang_list_obj,
  script_list_obj,
  type lang_list_type,
  type script_list_type
} from '~/state/lang_list';
import Cookie from 'js-cookie';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LESSON_LANG_ID_COOKIE_KEY, SCRIPT_ID_COOKIE_KEY } from '~/state/cookie';
import type { lesson_categories } from '~/db/schema';
import type { InferSelectModel } from 'drizzle-orm';
import { useHydrateAtoms } from 'jotai/react/utils';
import { atom, useAtom, useAtomValue } from 'jotai';
import {
  ChevronsUpDown,
  GripVertical,
  Plus,
  ArrowUpFromLine,
  ArrowDownToLine,
  Minus,
  ArrowRightLeft,
  Undo2,
  Pencil
} from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '~/components/ui/dialog';
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '~/components/ui/accordion';
import { Label } from '~/components/ui/label';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { toast } from 'sonner';
import { TiEdit } from 'react-icons/ti';
import { atomWithStorage } from 'jotai/utils';
import { cn } from '~/lib/utils';
import { buttonVariants } from '~/components/ui/button';
import { GestureCard, GestureCardSkeleton } from './-GestureCard';

type CategoryModel = Pick<InferSelectModel<typeof lesson_categories>, 'id' | 'name' | 'order'>;

type Props = {
  /** `?category=` of the page */
  search_category?: number;
  set_search_category: (category_id: number) => void;
  init_script_id: number;
  /** Gestures are grouped by the lesson categories of this language */
  init_lang_id: number;
  init_gesture_categories: CategoryModel[];
};

const script_id_atom = atom<number>(0);
const lang_id_atom = atom<number>(0);

export default function ListGesturesWrapper(props: Props) {
  useHydrateAtoms([
    [script_id_atom, props.init_script_id],
    [lang_id_atom, props.init_lang_id]
  ]);
  return <ListGestures {...props} />;
}
const selected_category_id_atom = atomWithStorage<number | null>(
  'selected_gesture_lesson_category_id',
  null
);

// oxlint-disable-next-line complexity -- ListGestures orchestrates category selection and dialogs; extract to smaller hooks deferred
function ListGestures({
  init_lang_id,
  init_gesture_categories,
  search_category,
  set_search_category
}: Props) {
  const trpc = useTRPC();
  const [scriptId, setScriptId] = useAtom(script_id_atom);
  const [langId, setLangId] = useAtom(lang_id_atom);
  const [editOpen, setEditOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedCategoryID, setSelectedCategoryID] = useAtom(selected_category_id_atom);
  useCategorySearchParam({
    selected: selectedCategoryID,
    setSelected: setSelectedCategoryID,
    searchCategory: search_category,
    setSearchCategory: set_search_category
  });

  const scriptOptions = FONT_SCRIPTS.map((name) => ({
    name,
    // SAFETY: enum lookup validated - key is from controlled enum list.
    id: script_list_obj[name as script_list_type]
  }));
  const scriptItems = [
    { label: 'Select a Script', value: null },
    ...scriptOptions.map((o) => ({ label: o.name, value: o.id.toString() }))
  ];
  const langOptions = LANGUAGES_ADDED.map((name) => ({
    name,
    // SAFETY: enum lookup validated - key is from controlled enum list.
    id: lang_list_obj[name as lang_list_type]
  }));
  const langItems = [
    { label: 'Select a Language', value: null },
    ...langOptions.map((o) => ({ label: o.name, value: o.id.toString() }))
  ];

  const categories_q = useQuery(
    trpc.text_gestures.categories.get_categories.queryOptions(
      { lang_id: langId },
      {
        enabled: !!langId,
        placeholderData: langId === init_lang_id ? init_gesture_categories : undefined
      }
    )
  );
  const categories = categories_q.data ?? [];

  // keep a valid category selected: the first one when none is stored, or the stored one is gone
  useEffect(() => {
    if (!categories_q.isSuccess || categories_q.isPlaceholderData) return;
    const list = categories_q.data;
    if (selectedCategoryID === 0 || list.some((c) => c.id === selectedCategoryID)) return;
    setSelectedCategoryID(list[0]?.id ?? 0);
  }, [
    categories_q.isSuccess,
    categories_q.isPlaceholderData,
    categories_q.data,
    selectedCategoryID,
    setSelectedCategoryID
  ]);

  const category_gestures_q = useQuery(
    trpc.text_gestures.categories.get_gestures.queryOptions(
      { category_id: selectedCategoryID!, script_id: scriptId, lang_id: langId },
      { enabled: selectedCategoryID !== null }
    )
  );

  const categoryName =
    selectedCategoryID === 0
      ? 'Uncategorized'
      : (categories.find((c) => c.id === selectedCategoryID)?.name ?? 'Category');

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-3 rounded-xl border bg-card/50 p-3">
        <Select
          items={scriptItems}
          value={scriptId?.toString()}
          onValueChange={(val) => {
            if (!val) return;
            setScriptId(Number(val));
            Cookie.set(SCRIPT_ID_COOKIE_KEY, val, { expires: 30 });
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select a Script" />
          </SelectTrigger>
          <SelectContent>
            {scriptOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id.toString()}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={langItems}
          value={langId?.toString()}
          onValueChange={(val) => {
            if (!val) return;
            setLangId(Number(val));
            setSelectedCategoryID(null);
            Cookie.set(LESSON_LANG_ID_COOKIE_KEY, val, { expires: 30 });
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select a Language" />
          </SelectTrigger>
          <SelectContent>
            {langOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id.toString()}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              role="combobox"
              aria-expanded={open}
              className={cn(buttonVariants({ variant: 'outline' }), 'w-50 justify-between')}
            >
              {selectedCategoryID !== null
                ? categories.find((category) => category.id === selectedCategoryID)?.name ||
                  (selectedCategoryID === 0 ? 'Uncategorized' : 'Select category...')
                : 'Select category...'}
              <ChevronsUpDown className="opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-50 p-0">
              <Command>
                <CommandInput placeholder="Search category..." className="h-9" />
                <CommandList>
                  <CommandEmpty>No category found.</CommandEmpty>
                  <CommandGroup>
                    {categories.map((category) => (
                      <CommandItem
                        key={category.id}
                        value={category.name}
                        keywords={[category.id.toString()]}
                        data-checked={selectedCategoryID === category.id ? 'true' : undefined}
                        className="pr-8 hover:bg-accent hover:text-accent-foreground data-[checked=true]:font-medium"
                        onSelect={() => {
                          setSelectedCategoryID(category.id);
                          setOpen(false);
                        }}
                      >
                        {category.name}
                      </CommandItem>
                    ))}
                    <CommandItem
                      value="Uncategorized"
                      keywords={['0']}
                      data-checked={selectedCategoryID === 0 ? 'true' : undefined}
                      className="pr-8 hover:bg-accent hover:text-accent-foreground data-[checked=true]:font-medium"
                      onSelect={() => {
                        setSelectedCategoryID(0);
                        setOpen(false);
                      }}
                    >
                      Uncategorized
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Link
            to="/lessons"
            title="Categories are the lesson categories, managed on the Lessons page"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
          >
            <TiEdit className="size-5" />
          </Link>
        </div>
      </div>

      {selectedCategoryID !== null && category_gestures_q.data ? (
        <EditCategoryGesturesDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          category_id={selectedCategoryID}
          categoryName={categoryName}
          gestures={category_gestures_q.data.gestures}
          // SAFETY: validated at boundary - type assertion is safe based on prior schema check.
          type={category_gestures_q.data.type as 'categorized' | 'uncategorized'}
          categories={categories}
        />
      ) : null}

      {selectedCategoryID === null ? (
        <div className="mx-auto w-full max-w-5xl text-center font-semibold text-muted-foreground">
          Please select a category to view gestures.
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          {category_gestures_q.isLoading ? (
            <div className={GESTURE_GRID_CLASS}>
              {Array.from({ length: 12 }).map((_, i) => (
                <GestureCardSkeleton key={i} />
              ))}
            </div>
          ) : category_gestures_q.data ? (
            <DisplayGesturesSection
              data={category_gestures_q.data}
              actions={
                <Button
                  variant="outline"
                  onClick={() => setEditOpen(true)}
                  className="border-sky-500 text-sky-700 hover:bg-sky-50 hover:text-sky-800 dark:border-sky-400 dark:text-sky-300 dark:hover:bg-sky-950 dark:hover:text-sky-200"
                >
                  <Pencil data-icon="inline-start" />
                  Edit Order
                </Button>
              }
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

type GestureItem = {
  id: number;
  text: string;
  text_key: string;
  order: number | null;
  updated_at: Date;
  stroke_count: number;
};

type PendingMove = GestureItem & { target_category_id: number | null };

function splitGestures(gestures: GestureItem[]) {
  const unordered = gestures.filter((g) => g.order === null);
  const ordered = gestures
    .filter((g) => g.order !== null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { ordered, unordered };
}

function draftSignature(
  ordered: GestureItem[],
  unordered: GestureItem[],
  pendingMoves: PendingMove[]
) {
  return JSON.stringify({
    ordered: ordered.map((g) => ({ id: g.id, order: g.order })),
    unordered: unordered.map((g) => g.id),
    pendingMoves: pendingMoves.map((m) => ({
      id: m.id,
      target_category_id: m.target_category_id
    }))
  });
}

type StrokeFilter = 'all' | 'recorded' | 'empty';

const STROKE_FILTERS: { value: StrokeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'recorded', label: 'Recorded' },
  { value: 'empty', label: 'Empty' }
];

const GESTURE_GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3';

function DisplayGesturesSection({
  data,
  actions
}: {
  data: { type: string; gestures: GestureItem[] };
  actions: React.ReactNode;
}) {
  const [filter, setFilter] = useState<StrokeFilter>('all');
  const total = data.gestures.length;
  const recorded = data.gestures.filter((g) => g.stroke_count > 0).length;
  const matches = (g: GestureItem) =>
    filter === 'all' || (filter === 'recorded') === g.stroke_count > 0;

  const sections =
    data.type === 'uncategorized'
      ? [{ key: 'all', title: null, items: data.gestures }]
      : (() => {
          const { ordered, unordered } = splitGestures(data.gestures);
          return [
            { key: 'unordered', title: 'Unordered', items: unordered },
            { key: 'ordered', title: 'Ordered', items: ordered }
          ].filter((sec) => sec.key === 'ordered' || sec.items.length > 0);
        })();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-card/50 px-4 py-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="font-semibold tabular-nums">
              {recorded}/{total}
            </span>
            <span className="text-muted-foreground">gestures recorded</span>
          </div>
          <div className="h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${total ? (recorded / total) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="flex items-center rounded-lg border bg-background p-0.5" role="group">
          {STROKE_FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? 'secondary' : 'ghost'}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className="h-7"
            >
              {f.label}
              <span className="text-xs text-muted-foreground tabular-nums">
                {f.value === 'all' ? total : f.value === 'recorded' ? recorded : total - recorded}
              </span>
            </Button>
          ))}
        </div>
        {actions}
      </div>

      {sections.map((sec) => {
        const items = sec.items.filter(matches);
        return (
          <section key={sec.key} className="flex flex-col gap-3">
            {sec.title ? (
              <h3
                className={cn(
                  'flex items-center gap-2 text-base font-semibold',
                  sec.key === 'unordered' && 'text-muted-foreground'
                )}
              >
                {sec.title}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {items.length}
                </span>
              </h3>
            ) : null}
            {items.length > 0 ? (
              <div className={GESTURE_GRID_CLASS}>
                {items.map((g) => (
                  <GestureCard key={g.id} item={g} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {sec.items.length === 0 ? 'No gestures.' : 'No gestures match this filter.'}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function EditCategoryGesturesDialog({
  open,
  onOpenChange,
  category_id,
  categoryName,
  gestures,
  type,
  categories
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  category_id: number;
  categoryName: string;
  gestures: GestureItem[];
  type: 'categorized' | 'uncategorized';
  categories: CategoryModel[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const scriptId = useAtomValue(script_id_atom);
  const langId = useAtomValue(lang_id_atom);

  const [ordered, setOrdered] = useState<GestureItem[]>([]);
  const [unordered, setUnordered] = useState<GestureItem[]>([]);
  const [pendingMoves, setPendingMoves] = useState<PendingMove[]>([]);
  const [baselineSig, setBaselineSig] = useState('');
  const [baselineOrdered, setBaselineOrdered] = useState<GestureItem[]>([]);
  const [baselineUnordered, setBaselineUnordered] = useState<GestureItem[]>([]);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (type === 'uncategorized') {
      setOrdered([]);
      setUnordered(gestures.map((g) => ({ ...g })));
      setBaselineOrdered([]);
      setBaselineUnordered(gestures.map((g) => ({ ...g })));
      setPendingMoves([]);
      setBaselineSig(draftSignature([], gestures, []));
    } else {
      const split = splitGestures(gestures);
      const o = split.ordered.map((g) => ({ ...g }));
      const u = split.unordered.map((g) => ({ ...g }));
      setOrdered(o);
      setUnordered(u);
      setBaselineOrdered(o.map((g) => ({ ...g })));
      setBaselineUnordered(u.map((g) => ({ ...g })));
      setPendingMoves([]);
      setBaselineSig(draftSignature(o, u, []));
    }
    setDiscardOpen(false);
    setConfirmSaveOpen(false);
    // Only seed draft when the dialog opens — ignore mid-edit query updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open-only sync
  }, [open]);

  const isDirty = useMemo(
    () => draftSignature(ordered, unordered, pendingMoves) !== baselineSig,
    [ordered, unordered, pendingMoves, baselineSig]
  );

  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of categories) map.set(c.id, c.name);
    map.set(0, 'Uncategorized');
    return map;
  }, [categories]);

  function requestClose() {
    if (saving) return;
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    requestClose();
  }

  function handleUndoAll() {
    setOrdered(baselineOrdered.map((g) => ({ ...g })));
    setUnordered(baselineUnordered.map((g) => ({ ...g })));
    setPendingMoves([]);
  }

  function removeFromLists(id: number) {
    setOrdered((prev) => prev.filter((x) => x.id !== id).map((x, i) => ({ ...x, order: i + 1 })));
    setUnordered((prev) => prev.filter((x) => x.id !== id));
  }

  function handleMoveToCategory(item: GestureItem, target_category_id: number | null) {
    removeFromLists(item.id);
    setPendingMoves((prev) => [
      ...prev.filter((m) => m.id !== item.id),
      { ...item, order: null, target_category_id }
    ]);
  }

  function undoPendingMove(move: PendingMove) {
    setPendingMoves((prev) => prev.filter((m) => m.id !== move.id));
    const { target_category_id: _, ...item } = move;
    setUnordered((prev) => [item, ...prev]);
  }

  const add_to_category_mut = useMutation(
    trpc.text_gestures.categories.add_update_gesture_category.mutationOptions()
  );
  const save_order_mut = useMutation(
    trpc.text_gestures.categories.update_gestures_order.mutationOptions()
  );

  async function runSave() {
    setSaving(true);
    try {
      for (const move of pendingMoves) {
        await add_to_category_mut.mutateAsync({
          category_id: move.target_category_id,
          lang_id: langId,
          gesture_text_key: move.text_key
        });
      }

      if (category_id > 0) {
        const remaining = [...ordered, ...unordered];
        if (remaining.length > 0) {
          const orderChanged =
            draftSignature(ordered, unordered, []) !==
            draftSignature(baselineOrdered, baselineUnordered, []);
          if (orderChanged || pendingMoves.length > 0) {
            await save_order_mut.mutateAsync({
              category_id,
              gestures: remaining.map((g) => ({ id: g.id, order: g.order }))
            });
          }
        }
      }

      const remainingForCache = [...ordered, ...unordered];
      queryClient.setQueryData(
        trpc.text_gestures.categories.get_gestures.queryKey({
          category_id,
          script_id: scriptId,
          lang_id: langId
        }),
        {
          type: category_id === 0 ? 'uncategorized' : 'categorized',
          gestures: remainingForCache
        }
      );

      // a move changes the key's category in every script
      await queryClient.invalidateQueries(trpc.text_gestures.categories.get_gestures.pathFilter());

      toast.success('Changes saved');
      setConfirmSaveOpen(false);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      toast.error('Failed to save changes' + (message ? `: ${message}` : ''));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex h-[min(90vh,720px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl lg:max-w-5xl">
          <DialogHeader className="shrink-0 border-b p-4 pr-12">
            <DialogTitle>Edit {categoryName}</DialogTitle>
            <DialogDescription>
              Reorder, unorder, or move gestures. Changes are draft until you save.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-6">
              {pendingMoves.length > 0 && (
                <PendingMovesPanel
                  moves={pendingMoves}
                  categoryNameById={categoryNameById}
                  onUndo={undoPendingMove}
                />
              )}

              {type === 'uncategorized' ? (
                <DraftUncatGesturesEditor
                  items={unordered}
                  onMove={handleMoveToCategory}
                  excludeCategoryId={0}
                />
              ) : (
                <DraftCategorizedGesturesEditor
                  ordered={ordered}
                  unordered={unordered}
                  setOrdered={setOrdered}
                  setUnordered={setUnordered}
                  category_id={category_id}
                  onMove={handleMoveToCategory}
                />
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 sm:justify-between">
            <Button
              variant="outline"
              onClick={handleUndoAll}
              disabled={!isDirty || saving}
              className="sm:mr-auto"
            >
              <Undo2 data-icon="inline-start" />
              Undo
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="secondary" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => setConfirmSaveOpen(true)} disabled={!isDirty || saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save these changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will apply order and category changes for this list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PendingMovesPanel({
  moves,
  categoryNameById,
  onUndo
}: {
  moves: PendingMove[];
  categoryNameById: Map<number, string>;
  onUndo: (move: PendingMove) => void;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <h3 className="text-sm font-semibold">Leaving this category</h3>
      <ul className="flex flex-col gap-2">
        {moves.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{m.text}</div>
              <div className="text-xs text-muted-foreground">
                → {categoryNameById.get(m.target_category_id ?? 0) ?? 'Uncategorized'}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => onUndo(m)}>
              Undo
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DraftAssignCategoryDialog({
  itemId,
  excludeCategoryId,
  onSelect,
  isMove
}: {
  itemId: number;
  excludeCategoryId?: number;
  onSelect: (target_category_id: number | null) => void;
  isMove?: boolean;
}) {
  const trpc = useTRPC();
  const langId = useAtomValue(lang_id_atom);
  const categories_q = useQuery(
    trpc.text_gestures.categories.get_categories.queryOptions({ lang_id: langId })
  );
  const categories = [
    ...(categories_q.data ? categories_q.data.filter((c) => c.id !== excludeCategoryId) : []),
    ...(excludeCategoryId && excludeCategoryId > 0
      ? [{ id: 0, name: 'Uncategorized', order: 0 }]
      : [])
  ];
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setSelectedCategory(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Category</DialogTitle>
            <DialogDescription>Choose where this gesture should move.</DialogDescription>
          </DialogHeader>
          {categories.length > 0 ? (
            <RadioGroup
              value={selectedCategory?.toString() ?? ''}
              onValueChange={(v) => setSelectedCategory(Number(v))}
              className="flex flex-col gap-2"
            >
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2">
                  <RadioGroupItem
                    id={`draft-cat-gesture-${itemId}-${cat.id}`}
                    value={String(cat.id)}
                  />
                  <Label
                    htmlFor={`draft-cat-gesture-${itemId}-${cat.id}`}
                    className={cn(cat.id === 0 && 'text-muted-foreground')}
                  >
                    {cat.name}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          ) : (
            <div className="text-sm text-muted-foreground">No categories found.</div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedCategory === null) return;
                onSelect(selectedCategory === 0 ? null : selectedCategory);
                setOpen(false);
                setSelectedCategory(null);
              }}
              disabled={selectedCategory === null}
            >
              Add to Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)}>
        {isMove ? <ArrowRightLeft /> : <Plus />}
      </Button>
    </>
  );
}

function DraftUncatGesturesEditor({
  items,
  onMove,
  excludeCategoryId
}: {
  items: GestureItem[];
  onMove: (item: GestureItem, target: number | null) => void;
  excludeCategoryId: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((g) => (
        <Card key={g.id} className="p-0">
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <span className="truncate font-medium">{g.text}</span>
            <DraftAssignCategoryDialog
              itemId={g.id}
              excludeCategoryId={excludeCategoryId}
              onSelect={(target) => onMove(g, target)}
            />
          </CardContent>
        </Card>
      ))}
      {items.length === 0 && (
        <div className="text-sm text-muted-foreground">No gestures in this list.</div>
      )}
    </div>
  );
}

function DraftCategorizedGesturesEditor({
  ordered,
  unordered,
  setOrdered,
  setUnordered,
  category_id,
  onMove
}: {
  ordered: GestureItem[];
  unordered: GestureItem[];
  setOrdered: React.Dispatch<React.SetStateAction<GestureItem[]>>;
  setUnordered: React.Dispatch<React.SetStateAction<GestureItem[]>>;
  category_id: number;
  onMove: (item: GestureItem, target: number | null) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((x) => x.id === Number(active.id));
    const newIndex = ordered.findIndex((x) => x.id === Number(over.id));
    const moved = arrayMove(ordered, oldIndex, newIndex).map((g, idx) => ({
      ...g,
      order: idx + 1
    }));
    setOrdered(moved);
  }

  function sendToTop(item: GestureItem) {
    setUnordered((prev) => prev.filter((x) => x.id !== item.id));
    setOrdered((prev) => [{ ...item, order: 1 }, ...prev.map((x, i) => ({ ...x, order: i + 2 }))]);
  }
  function sendToBottom(item: GestureItem) {
    setUnordered((prev) => prev.filter((x) => x.id !== item.id));
    setOrdered((prev) => [...prev, { ...item, order: prev.length + 1 }]);
  }

  return (
    <div className="flex flex-col gap-6">
      <Accordion defaultValue={['unordered']}>
        <AccordionItem value="unordered">
          <AccordionTrigger className="text-base font-semibold">Unordered</AccordionTrigger>
          <AccordionContent>
            <div className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto pr-1">
              {unordered.map((g) => (
                <Card key={g.id} className="p-0">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <span className="font-medium">{g.text}</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => sendToTop(g)}>
                        <ArrowUpFromLine data-icon="inline-start" /> To Top
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => sendToBottom(g)}>
                        <ArrowDownToLine data-icon="inline-start" /> To Bottom
                      </Button>
                      <DraftAssignCategoryDialog
                        itemId={g.id}
                        excludeCategoryId={category_id}
                        isMove
                        onSelect={(target) => onMove(g, target)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
              {unordered.length === 0 && (
                <div className="text-sm text-muted-foreground">No unordered gestures.</div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Ordered</h3>
        {ordered.length > 0 ? (
          <div className="max-h-[40vh] overflow-y-auto pr-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={ordered.map((g) => String(g.id))}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-2">
                  {ordered.map((g) => (
                    <DraftOrderedGestureCard
                      key={g.id}
                      item={g}
                      category_id={category_id}
                      onUnorder={() => {
                        setOrdered((prev) =>
                          prev.filter((x) => x.id !== g.id).map((x, i) => ({ ...x, order: i + 1 }))
                        );
                        setUnordered((prev) => [{ ...g, order: null }, ...prev]);
                      }}
                      onMove={onMove}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No ordered gestures.</div>
        )}
      </div>
    </div>
  );
}

function DraftOrderedGestureCard({
  item,
  category_id,
  onUnorder,
  onMove
}: {
  item: GestureItem;
  category_id: number;
  onUnorder: () => void;
  onMove: (item: GestureItem, target: number | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(item.id)
  });
  // SAFETY: validated at boundary - type assertion is safe based on prior schema check.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : 1
  } as React.CSSProperties;
  return (
    <li>
      <Card
        ref={setNodeRef}
        style={style}
        className={isDragging ? 'p-0 ring-2 ring-primary' : 'p-0'}
      >
        <CardContent className="flex items-center gap-3 p-2">
          <button
            aria-label="Drag"
            className="inline-flex h-8 w-6 cursor-grab items-center justify-center rounded border bg-background active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical />
          </button>
          <span className="truncate">{item.text}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={onUnorder}>
              <Minus />
            </Button>
            <DraftAssignCategoryDialog
              itemId={item.id}
              excludeCategoryId={category_id}
              isMove
              onSelect={(target) => onMove(item, target)}
            />
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
