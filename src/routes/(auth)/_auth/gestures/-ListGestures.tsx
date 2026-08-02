'use client';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useTRPC } from '~/api/client';
import { Card, CardContent } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { FONT_SCRIPTS } from '~/state/font_list';
import { script_list_obj, type script_list_type } from '~/state/lang_list';
import Cookie from 'js-cookie';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SCRIPT_ID_COOKIE_KEY } from '~/state/cookie';
import type { gesture_categories } from '~/db/schema';
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

type Props = {
  init_script_id: number;
  init_gesture_categories: Pick<
    InferSelectModel<typeof gesture_categories>,
    'id' | 'name' | 'order'
  >[];
};

const script_id_atom = atom<number>(0);

export default function ListGesturesWrapper(props: Props) {
  useHydrateAtoms([[script_id_atom, props.init_script_id]]);
  return <ListGestures {...props} />;
}
const selected_category_id_atom = atomWithStorage<number | null>(
  'selected_gesture_category_id',
  null
);

function ListGestures({ init_gesture_categories }: Props) {
  const trpc = useTRPC();
  const [scriptId, setScriptId] = useAtom(script_id_atom);
  const [manageOpen, setManageOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedCategoryID, setSelectedCategoryID] = useAtom(selected_category_id_atom);

  const scriptOptions = FONT_SCRIPTS.map((name) => ({
    name,
    id: script_list_obj[name as script_list_type]
  }));
  const scriptItems = [
    { label: 'Select a Script', value: null },
    ...scriptOptions.map((o) => ({ label: o.name, value: o.id.toString() }))
  ];

  const categories_q = useQuery(
    trpc.text_gestures.categories.get_categories.queryOptions(void 0, {
      enabled: !!scriptId,
      placeholderData: init_gesture_categories
    })
  );
  const categories = categories_q.data ?? [];

  const category_gestures_q = useQuery(
    trpc.text_gestures.categories.get_gestures.queryOptions(
      { category_id: selectedCategoryID!, script_id: scriptId },
      { enabled: selectedCategoryID !== null }
    )
  );

  const categoryName =
    selectedCategoryID === 0
      ? 'Uncategorized'
      : (categories.find((c) => c.id === selectedCategoryID)?.name ?? 'Category');

  return (
    <div className="flex flex-col gap-6">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-3">
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
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
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
                        setSelectedCategoryID(
                          selectedCategoryID === category.id ? null : category.id
                        );
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
                      setSelectedCategoryID(selectedCategoryID === 0 ? null : 0);
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
        <Button variant="ghost" size="icon" onClick={() => setManageOpen(true)}>
          <TiEdit className="size-5" />
        </Button>
      </div>

      {scriptId ? (
        <ManageCategoriesDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
          scriptId={scriptId}
          categories={categories}
          isLoading={!!categories_q.isLoading}
        />
      ) : null}

      {selectedCategoryID !== null && category_gestures_q.data ? (
        <EditCategoryGesturesDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          category_id={selectedCategoryID}
          categoryName={categoryName}
          gestures={category_gestures_q.data.gestures}
          type={category_gestures_q.data.type as 'categorized' | 'uncategorized'}
          categories={categories}
        />
      ) : null}

      {selectedCategoryID === null ? (
        <div className="mx-auto w-full max-w-5xl text-center font-semibold text-muted-foreground">
          Please select a category to view gestures.
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setEditOpen(true)}
              disabled={category_gestures_q.isLoading || !category_gestures_q.data}
              className="border-green-600 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950 dark:hover:text-green-300"
            >
              <Pencil data-icon="inline-start" />
              Edit Order
            </Button>
          </div>
          {category_gestures_q.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-md border p-3">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-5 w-1/5" />
                </div>
              ))}
            </div>
          ) : category_gestures_q.data ? (
            <DisplayGesturesSection data={category_gestures_q.data} />
          ) : null}
        </div>
      )}
    </div>
  );
}

type CategoryModel = Pick<InferSelectModel<typeof gesture_categories>, 'id' | 'name' | 'order'>;

function ManageCategoriesDialog({
  open,
  onOpenChange,
  scriptId,
  categories,
  isLoading
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scriptId: number;
  categories: CategoryModel[];
  isLoading: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [categoryList, setCategoryList] = useState<CategoryModel[]>(categories);

  useEffect(() => {
    setCategoryList(categories);
  }, [categories]);

  const add_category_mut = useMutation(
    trpc.text_gestures.categories.add_category.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.text_gestures.categories.get_categories.pathFilter());
        setAddOpen(false);
        toast.success('Category added');
      },
      onError: (err) => {
        toast.error('Failed to add category' + (err?.message ? `: ${err.message}` : ''));
      }
    })
  );

  const delete_category_mut = useMutation(
    trpc.text_gestures.categories.delete_category.mutationOptions({
      onSuccess: async () => {
        setDeleteId(null);
        queryClient.invalidateQueries(trpc.text_gestures.categories.get_categories.queryFilter());
        queryClient.invalidateQueries(
          trpc.text_gestures.categories.get_gestures.queryFilter({
            category_id: 0
          })
        );
        queryClient.invalidateQueries(
          trpc.text_gestures.categories.get_gestures.queryFilter({
            category_id: deleteId!
          })
        );
        toast.success('Category deleted');
      },
      onError: (err) => {
        toast.error('Failed to delete category' + (err?.message ? `: ${err.message}` : ''));
      }
    })
  );

  const update_category_list_mut = useMutation(
    trpc.text_gestures.categories.update_list.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.text_gestures.categories.get_categories.pathFilter());
        toast.success('Categories saved');
      },
      onError: (err) => {
        toast.error('Failed to save categories' + (err?.message ? `: ${err.message}` : ''));
      }
    })
  );

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categoryList.findIndex((c) => c.id === Number(active.id));
    const newIndex = categoryList.findIndex((c) => c.id === Number(over.id));
    const moved = arrayMove(categoryList, oldIndex, newIndex).map((c, idx) => ({
      ...c,
      order: idx + 1
    }));
    setCategoryList(moved);
  }

  async function handleSave() {
    await update_category_list_mut.mutateAsync({ categories: categoryList });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage Gesture Categories</DialogTitle>
        </DialogHeader>

        <div className="mb-3 flex items-center justify-between">
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus data-icon="inline-start" /> Add Category
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-md border p-2">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-8 w-6" />
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 w-8" />
                </div>
              ))}
            </div>
          ) : categoryList.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={categoryList.map((c) => String(c.id))}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-2">
                  {categoryList.map((c) => (
                    <DraggableCategoryRow
                      key={c.id}
                      item={c}
                      onChangeName={(name) =>
                        setCategoryList((prev) =>
                          prev.map((x) => (x.id === c.id ? { ...x, name } : x))
                        )
                      }
                      onDelete={() => setDeleteId(c.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">No categories yet.</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || categoryList.length === 0}>
            Save
          </Button>
        </DialogFooter>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Category</DialogTitle>
            </DialogHeader>
            <AddCategoryForm
              onSubmit={(name) => add_category_mut.mutate({ name })}
              isSubmitting={add_category_mut.isPending}
            />
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Category</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this category?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (deleteId !== null) {
                    await delete_category_mut.mutateAsync({
                      category_id: deleteId
                    });
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function AddCategoryForm({
  onSubmit,
  isSubmitting
}: {
  onSubmit: (name: string) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState('');
  return (
    <div className="flex flex-col gap-4">
      <Input placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setName('')} disabled={isSubmitting}>
          Clear
        </Button>
        <Button onClick={() => onSubmit(name.trim())} disabled={!name.trim() || isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </div>
  );
}

function DraggableCategoryRow({
  item,
  onChangeName,
  onDelete
}: {
  item: CategoryModel;
  onChangeName: (name: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(item.id)
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1
  } as React.CSSProperties;

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2">
      <button
        className="inline-flex h-8 w-6 items-center justify-center rounded border bg-background"
        {...attributes}
        {...listeners}
        aria-label="Drag"
      >
        <GripVertical />
      </button>
      <Input value={item.name} onChange={(e) => onChangeName(e.target.value)} className="flex-1" />
      <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive">
        <Minus />
      </Button>
    </li>
  );
}

type GestureItem = { id: number; text: string; text_key: string; order: number | null };

type PendingMove = {
  id: number;
  text: string;
  text_key: string;
  target_category_id: number | null;
};

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

function DisplayGesturesSection({ data }: { data: { type: string; gestures: GestureItem[] } }) {
  if (data.type === 'uncategorized') {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {data.gestures.map((g) => (
          <Card key={g.id} className="p-0">
            <CardContent className="p-3">
              <Link
                to="/gestures/edit/$id"
                params={{ id: String(g.id) }}
                className="block truncate font-medium hover:underline"
              >
                {g.text}
              </Link>
            </CardContent>
          </Card>
        ))}
        {data.gestures.length === 0 && (
          <div className="col-span-full text-sm text-muted-foreground">No gestures.</div>
        )}
      </div>
    );
  }

  const { ordered, unordered } = splitGestures(data.gestures);

  return (
    <div className="flex flex-col gap-8">
      {unordered.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-muted-foreground">Unordered</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {unordered.map((g) => (
              <Card key={g.id} className="p-0">
                <CardContent className="p-3">
                  <Link
                    to="/gestures/edit/$id"
                    params={{ id: String(g.id) }}
                    className="block truncate font-medium hover:underline"
                  >
                    {g.text}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Ordered</h3>
        {ordered.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ordered.map((g) => (
              <Card key={g.id} className="p-0">
                <CardContent className="flex items-center gap-3 p-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                    {g.order}
                  </span>
                  <Link
                    to="/gestures/edit/$id"
                    params={{ id: String(g.id) }}
                    className="truncate font-medium hover:underline"
                  >
                    {g.text}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No ordered gestures.</div>
        )}
      </section>
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
      {
        id: item.id,
        text: item.text,
        text_key: item.text_key,
        target_category_id
      }
    ]);
  }

  function undoPendingMove(move: PendingMove) {
    setPendingMoves((prev) => prev.filter((m) => m.id !== move.id));
    setUnordered((prev) => [
      { id: move.id, text: move.text, text_key: move.text_key, order: null },
      ...prev
    ]);
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
          prev_category_id: category_id > 0 ? category_id : undefined,
          gesture_id: move.id,
          script_id: scriptId,
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

      const targetIds = new Set<number>([category_id]);
      for (const move of pendingMoves) {
        targetIds.add(move.target_category_id ?? 0);
      }

      const remainingForCache = [...ordered, ...unordered];
      queryClient.setQueryData(
        trpc.text_gestures.categories.get_gestures.queryKey({
          category_id,
          script_id: scriptId
        }),
        {
          type: category_id === 0 ? 'uncategorized' : 'categorized',
          gestures: remainingForCache
        }
      );

      await Promise.all(
        [...targetIds].map((id) =>
          queryClient.invalidateQueries(
            trpc.text_gestures.categories.get_gestures.queryFilter({ category_id: id })
          )
        )
      );

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
  const categories_q = useQuery(trpc.text_gestures.categories.get_categories.queryOptions());
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
