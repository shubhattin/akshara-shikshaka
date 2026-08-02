'use client';
import { useEffect, useMemo, useState } from 'react';
import { useTRPC } from '~/api/client';
import { Skeleton } from '~/components/ui/skeleton';
import { ArrowRightLeft, ChevronsUpDown, CircleHelp, Pencil, Undo2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { lang_list_obj, type lang_list_type } from '~/state/lang_list';
import Cookie from 'js-cookie';
import { useQuery } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LESSON_LANG_ID_COOKIE_KEY } from '~/state/cookie';
import type { lesson_categories } from '~/db/schema';
import type { InferSelectModel } from 'drizzle-orm';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from '@/components/ui/popover';
import { cn } from '~/lib/utils';
import { TiEdit } from 'react-icons/ti';
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
import { GripVertical, Plus, Trash2, ArrowUpFromLine, ArrowDownToLine, Minus } from 'lucide-react';
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
import { Link } from '@tanstack/react-router';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '~/components/ui/accordion';
import { Label } from '~/components/ui/label';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { Card, CardContent } from '~/components/ui/card';
import { atomWithStorage, useHydrateAtoms } from 'jotai/utils';
import { atom, useAtom, useAtomValue } from 'jotai';
import { toast } from 'sonner';
import { LANGUAGES_ADDED } from '~/state/font_list';
import { buttonVariants } from '~/components/ui/button';

type Props = {
  init_lang_id: number;
  init_lesson_categories: Pick<
    InferSelectModel<typeof lesson_categories>,
    'id' | 'name' | 'order'
  >[];
};

const lang_id_atom = atom(0);

export default function ListLessonsWrapper(props: Props) {
  useHydrateAtoms([[lang_id_atom, props.init_lang_id]]);

  return <ListLessons {...props} />;
}

const selected_category_id_atom = atomWithStorage<number | null>(
  'selected_lesson_category_id',
  null
);

function ListLessons({ init_lesson_categories }: Props) {
  const trpc = useTRPC();
  const [langId, setLangId] = useAtom(lang_id_atom);
  const [manageOpen, setManageOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const langOptions = LANGUAGES_ADDED.map((name) => ({
    name,
    id: lang_list_obj[name as lang_list_type]
  }));
  const langItems = [
    { label: 'Select a Language', value: null },
    ...langOptions.map((o) => ({ label: o.name, value: o.id.toString() }))
  ];

  const [open, setOpen] = useState(false);
  const [selectedCategoryID, setSelectedCategoryID] = useAtom(selected_category_id_atom);

  const categories_q = useQuery(
    trpc.text_lessons.categories.get_categories.queryOptions(
      { lang_id: langId! },
      { enabled: !!langId, placeholderData: init_lesson_categories }
    )
  );

  const categories = categories_q.data ?? [];

  const category_lessons_q = useQuery(
    trpc.text_lessons.categories.get_text_lessons.queryOptions(
      { category_id: selectedCategoryID!, lang_id: langId },
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
          items={langItems}
          value={langId?.toString()}
          onValueChange={(val) => {
            if (!val) return;
            setLangId(Number(val));
            setSelectedCategoryID(0);
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
      {langId ? (
        <ManageCategoriesDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
          langId={langId}
          categories={categories}
          isLoading={!!categories_q.isLoading}
        />
      ) : null}

      {selectedCategoryID !== null && category_lessons_q.data ? (
        <EditCategoryLessonsDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          category_id={selectedCategoryID}
          categoryName={categoryName}
          lessons={category_lessons_q.data.lessons}
          type={category_lessons_q.data.type as 'categorized' | 'uncategorized'}
          categories={categories}
        />
      ) : null}

      {selectedCategoryID === null ? (
        <div className="mx-auto w-full max-w-5xl text-center font-semibold text-muted-foreground">
          Please select a category to view lessons.
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => setEditOpen(true)}
              disabled={category_lessons_q.isLoading || !category_lessons_q.data}
              className="border-green-600 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950 dark:hover:text-green-300"
            >
              <Pencil data-icon="inline-start" />
              Edit Order
            </Button>
          </div>
          {category_lessons_q.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-md border p-3">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-5 w-1/5" />
                </div>
              ))}
            </div>
          ) : category_lessons_q.data ? (
            <DisplayLessonsSection data={category_lessons_q.data} />
          ) : null}
        </div>
      )}
    </div>
  );
}

type CategoryModel = Pick<InferSelectModel<typeof lesson_categories>, 'id' | 'name' | 'order'>;

function ManageCategoriesDialog({
  open,
  onOpenChange,
  langId,
  categories,
  isLoading
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  langId: number;
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
    trpc.text_lessons.categories.add_category.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.text_lessons.categories.get_categories.pathFilter());
        setAddOpen(false);
        toast.success('Category added');
      },
      onError: (err) => {
        toast.error('Failed to add category' + (err?.message ? `: ${err.message}` : ''));
      }
    })
  );

  const delete_category_mut = useMutation(
    trpc.text_lessons.categories.delete_category.mutationOptions({
      onSuccess: async () => {
        setDeleteId(null);
        queryClient.invalidateQueries(trpc.text_lessons.categories.get_categories.queryFilter());
        queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_text_lessons.queryFilter({
            category_id: 0
          })
        );
        queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_text_lessons.queryFilter({
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
    trpc.text_lessons.categories.update_category_list.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(trpc.text_lessons.categories.get_categories.pathFilter());
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
    await update_category_list_mut.mutateAsync({ categories: categoryList, lang_id: langId });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
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
              onSubmit={(name) => add_category_mut.mutate({ lang_id: langId, name })}
              isSubmitting={add_category_mut.isPending}
            />
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Category</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this category? Lessons within this category will
                become uncategorized.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (deleteId !== null) {
                    await delete_category_mut.mutateAsync({
                      category_id: deleteId,
                      lang_id: langId
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
        <Trash2 />
      </Button>
    </li>
  );
}

type LessonItem = { id: number; text: string; order: number | null };

type PendingMove = {
  id: number;
  text: string;
  target_category_id: number | null;
};

function splitLessons(lessons: LessonItem[]) {
  const unordered = lessons.filter((l) => l.order === null);
  const ordered = lessons
    .filter((l) => l.order !== null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { ordered, unordered };
}

function draftSignature(
  ordered: LessonItem[],
  unordered: LessonItem[],
  pendingMoves: PendingMove[]
) {
  return JSON.stringify({
    ordered: ordered.map((l) => ({ id: l.id, order: l.order })),
    unordered: unordered.map((l) => l.id),
    pendingMoves: pendingMoves.map((m) => ({
      id: m.id,
      target_category_id: m.target_category_id
    }))
  });
}

function DisplayLessonsSection({ data }: { data: { type: string; lessons: LessonItem[] } }) {
  if (data.type === 'uncategorized') {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {data.lessons.map((l) => (
          <Card key={l.id} className="p-0 transition-colors hover:bg-muted/60">
            <Link
              to="/lessons/edit/$id"
              params={{ id: String(l.id) }}
              className="block truncate p-2.5 font-medium"
            >
              {l.text}
            </Link>
          </Card>
        ))}
        {data.lessons.length === 0 && (
          <div className="col-span-full text-sm text-muted-foreground">No lessons.</div>
        )}
      </div>
    );
  }

  const { ordered, unordered } = splitLessons(data.lessons);

  return (
    <div className="flex flex-col gap-8">
      {unordered.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-muted-foreground">Unordered</h3>
            <span className="rounded-md border border-yellow-600/40 bg-yellow-500/15 px-1.5 py-0.5 text-xs font-medium text-yellow-700 dark:border-yellow-500/40 dark:text-yellow-400">
              unlisted
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {unordered.map((l) => (
              <Card key={l.id} className="p-0 transition-colors hover:bg-muted/60">
                <Link
                  to="/lessons/edit/$id"
                  params={{ id: String(l.id) }}
                  className="block truncate p-2.5 font-medium"
                >
                  {l.text}
                </Link>
              </Card>
            ))}
          </div>
        </section>
      )}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">Ordered</h3>
          <span className="rounded-md border border-green-600/40 bg-green-500/15 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:border-green-500/40 dark:text-green-400">
            listed
          </span>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="About listed lessons"
                />
              }
            >
              <CircleHelp />
            </PopoverTrigger>
            <PopoverContent className="w-64" side="top">
              <PopoverHeader>
                <PopoverTitle>Listed lessons</PopoverTitle>
                <PopoverDescription>
                  Only listed lessons will be visible to the user.
                </PopoverDescription>
              </PopoverHeader>
            </PopoverContent>
          </Popover>
        </div>
        {ordered.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {ordered.map((l) => (
              <Card key={l.id} className="p-0 transition-colors hover:bg-muted/60">
                <Link
                  to="/lessons/edit/$id"
                  params={{ id: String(l.id) }}
                  className="flex items-center gap-2 p-2"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                    {l.order}
                  </span>
                  <span className="truncate font-medium">{l.text}</span>
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No ordered lessons.</div>
        )}
      </section>
    </div>
  );
}

function EditCategoryLessonsDialog({
  open,
  onOpenChange,
  category_id,
  categoryName,
  lessons,
  type,
  categories
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  category_id: number;
  categoryName: string;
  lessons: LessonItem[];
  type: 'categorized' | 'uncategorized';
  categories: CategoryModel[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const langId = useAtomValue(lang_id_atom);

  const [ordered, setOrdered] = useState<LessonItem[]>([]);
  const [unordered, setUnordered] = useState<LessonItem[]>([]);
  const [pendingMoves, setPendingMoves] = useState<PendingMove[]>([]);
  const [baselineSig, setBaselineSig] = useState('');
  const [baselineOrdered, setBaselineOrdered] = useState<LessonItem[]>([]);
  const [baselineUnordered, setBaselineUnordered] = useState<LessonItem[]>([]);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (type === 'uncategorized') {
      setOrdered([]);
      setUnordered(lessons.map((l) => ({ ...l })));
      setBaselineOrdered([]);
      setBaselineUnordered(lessons.map((l) => ({ ...l })));
      setPendingMoves([]);
      setBaselineSig(draftSignature([], lessons, []));
    } else {
      const split = splitLessons(lessons);
      const o = split.ordered.map((l) => ({ ...l }));
      const u = split.unordered.map((l) => ({ ...l }));
      setOrdered(o);
      setUnordered(u);
      setBaselineOrdered(o.map((l) => ({ ...l })));
      setBaselineUnordered(u.map((l) => ({ ...l })));
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
    setOrdered(baselineOrdered.map((l) => ({ ...l })));
    setUnordered(baselineUnordered.map((l) => ({ ...l })));
    setPendingMoves([]);
  }

  function removeFromLists(id: number) {
    setOrdered((prev) => prev.filter((x) => x.id !== id).map((x, i) => ({ ...x, order: i + 1 })));
    setUnordered((prev) => prev.filter((x) => x.id !== id));
  }

  function handleMoveToCategory(item: LessonItem, target_category_id: number | null) {
    removeFromLists(item.id);
    setPendingMoves((prev) => [
      ...prev.filter((m) => m.id !== item.id),
      {
        id: item.id,
        text: item.text,
        target_category_id
      }
    ]);
  }

  function undoPendingMove(move: PendingMove) {
    setPendingMoves((prev) => prev.filter((m) => m.id !== move.id));
    setUnordered((prev) => [{ id: move.id, text: move.text, order: null }, ...prev]);
  }

  const add_to_category_mut = useMutation(
    trpc.text_lessons.categories.add_update_lesson_category.mutationOptions()
  );
  const save_order_mut = useMutation(
    trpc.text_lessons.categories.update_text_lessons_order.mutationOptions()
  );

  async function runSave() {
    setSaving(true);
    try {
      for (const move of pendingMoves) {
        await add_to_category_mut.mutateAsync({
          category_id: move.target_category_id,
          prev_category_id: category_id > 0 ? category_id : undefined,
          lesson_id: move.id
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
              lessons: remaining.map((l) => ({ id: l.id, order: l.order }))
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
        trpc.text_lessons.categories.get_text_lessons.queryKey({
          category_id,
          lang_id: langId
        }),
        {
          type: category_id === 0 ? 'uncategorized' : 'categorized',
          lessons: remainingForCache
        }
      );

      await Promise.all(
        [...targetIds].map((id) =>
          queryClient.invalidateQueries(
            trpc.text_lessons.categories.get_text_lessons.queryFilter({ category_id: id })
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
              Reorder, unorder, or move lessons. Changes are draft until you save.
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
                <DraftUncatLessonsEditor
                  items={unordered}
                  onMove={handleMoveToCategory}
                  excludeCategoryId={0}
                />
              ) : (
                <DraftCategorizedLessonsEditor
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
    trpc.text_lessons.categories.get_categories.queryOptions({ lang_id: langId })
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
            <DialogDescription>Choose where this lesson should move.</DialogDescription>
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
                    id={`draft-cat-lesson-${itemId}-${cat.id}`}
                    value={String(cat.id)}
                  />
                  <Label
                    htmlFor={`draft-cat-lesson-${itemId}-${cat.id}`}
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

function DraftUncatLessonsEditor({
  items,
  onMove,
  excludeCategoryId
}: {
  items: LessonItem[];
  onMove: (item: LessonItem, target: number | null) => void;
  excludeCategoryId: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((l) => (
        <Card key={l.id} className="p-0">
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <span className="truncate font-medium">{l.text}</span>
            <DraftAssignCategoryDialog
              itemId={l.id}
              excludeCategoryId={excludeCategoryId}
              onSelect={(target) => onMove(l, target)}
            />
          </CardContent>
        </Card>
      ))}
      {items.length === 0 && (
        <div className="text-sm text-muted-foreground">No lessons in this list.</div>
      )}
    </div>
  );
}

function DraftCategorizedLessonsEditor({
  ordered,
  unordered,
  setOrdered,
  setUnordered,
  category_id,
  onMove
}: {
  ordered: LessonItem[];
  unordered: LessonItem[];
  setOrdered: React.Dispatch<React.SetStateAction<LessonItem[]>>;
  setUnordered: React.Dispatch<React.SetStateAction<LessonItem[]>>;
  category_id: number;
  onMove: (item: LessonItem, target: number | null) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((x) => x.id === Number(active.id));
    const newIndex = ordered.findIndex((x) => x.id === Number(over.id));
    const moved = arrayMove(ordered, oldIndex, newIndex).map((l, idx) => ({
      ...l,
      order: idx + 1
    }));
    setOrdered(moved);
  }

  function sendToTop(item: LessonItem) {
    setUnordered((prev) => prev.filter((x) => x.id !== item.id));
    setOrdered((prev) => [{ ...item, order: 1 }, ...prev.map((x, i) => ({ ...x, order: i + 2 }))]);
  }

  function sendToBottom(item: LessonItem) {
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
              {unordered.map((l) => (
                <Card key={l.id} className="p-0">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <span className="font-medium">{l.text}</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => sendToTop(l)}>
                        <ArrowUpFromLine data-icon="inline-start" /> To Top
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => sendToBottom(l)}>
                        <ArrowDownToLine data-icon="inline-start" /> To Bottom
                      </Button>
                      <DraftAssignCategoryDialog
                        itemId={l.id}
                        excludeCategoryId={category_id}
                        isMove
                        onSelect={(target) => onMove(l, target)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
              {unordered.length === 0 && (
                <div className="text-sm text-muted-foreground">No unordered lessons.</div>
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
                items={ordered.map((l) => String(l.id))}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-2">
                  {ordered.map((l) => (
                    <DraftOrderedLessonCard
                      key={l.id}
                      item={l}
                      category_id={category_id}
                      onUnorder={() => {
                        setOrdered((prev) =>
                          prev.filter((x) => x.id !== l.id).map((x, i) => ({ ...x, order: i + 1 }))
                        );
                        setUnordered((prev) => [{ ...l, order: null }, ...prev]);
                      }}
                      onMove={onMove}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No ordered lessons.</div>
        )}
      </div>
    </div>
  );
}

function DraftOrderedLessonCard({
  item,
  category_id,
  onUnorder,
  onMove
}: {
  item: LessonItem;
  category_id: number;
  onUnorder: () => void;
  onMove: (item: LessonItem, target: number | null) => void;
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
