'use client';
import { useEffect, useState } from 'react';
import { useTRPC } from '~/api/client';
import { Skeleton } from '~/components/ui/skeleton';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import { LANG_LIST, lang_list_obj, type lang_list_type } from '~/state/lang_list';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '~/lib/utils';
import { TiEdit } from 'react-icons/ti';
import {
  Dialog,
  DialogContent,
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
  arrayMove,
  horizontalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '~/components/ui/accordion';
import { Label } from '~/components/ui/label';
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { useHydrateAtoms } from 'jotai/utils';
import { atom, useAtom, useAtomValue } from 'jotai';
import { toast } from 'sonner';

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

function ListLessons({ init_lesson_categories }: Props) {
  const trpc = useTRPC();
  const [langId, setLangId] = useAtom(lang_id_atom);
  const [manageOpen, setManageOpen] = useState(false);

  const langOptions = LANG_LIST.map((name) => ({
    name,
    id: lang_list_obj[name as lang_list_type]
  }));

  const [open, setOpen] = useState(false);
  // 0 will be for uncategorized
  const [selectedCategoryID, setSelectedCategoryID] = useState<number | null>(null);

  const categories_q = useQuery(
    trpc.text_lessons.categories.get_text_lesson_categories.queryOptions(
      { lang_id: langId! },
      { enabled: !!langId, placeholderData: init_lesson_categories }
    )
  );

  const categories = categories_q.data ?? [];

  const category_lessons_q = useQuery(
    trpc.text_lessons.categories.get_category_text_lessons.queryOptions(
      { category_id: selectedCategoryID!, lang_id: langId },
      { enabled: selectedCategoryID !== null }
    )
  );

  return (
    <div className="space-y-6">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-3">
        <Select
          value={langId?.toString()}
          onValueChange={(val) => {
            setLangId(Number(val));
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
      <div className="flex items-center justify-center space-x-4">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[200px] justify-between"
            >
              {selectedCategoryID !== null
                ? categories.find((category) => category.id === selectedCategoryID)?.name ||
                  (selectedCategoryID === 0 ? 'Uncategorized' : 'Select category...')
                : 'Select category...'}
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0">
            <Command>
              <CommandInput placeholder="Search category..." className="h-9" />
              <CommandList>
                <CommandEmpty>No category found.</CommandEmpty>
                <CommandGroup>
                  {categories.map((category) => (
                    <CommandItem
                      key={category.id}
                      value={category.id.toString()}
                      onSelect={(currentValue) => {
                        setSelectedCategoryID(
                          Number(currentValue) === selectedCategoryID ? null : Number(currentValue)
                        );
                        setOpen(false);
                      }}
                    >
                      {category.name}
                      <Check
                        className={cn(
                          'ml-auto',
                          selectedCategoryID === category.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  ))}
                  <CommandItem
                    value="0"
                    onSelect={() => {
                      setSelectedCategoryID(0);
                      setOpen(false);
                    }}
                  >
                    Uncategorized
                    <Check
                      className={cn(
                        'ml-auto',
                        selectedCategoryID === 0 ? 'opacity-100' : 'opacity-0'
                      )}
                    />
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

      {/* Category Lessons Rendering */}
      {selectedCategoryID !== null && (
        <div className="mx-auto w-full max-w-5xl">
          {category_lessons_q.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-md border p-3">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-5 w-1/5" />
                </div>
              ))}
            </div>
          ) : category_lessons_q.data ? (
            <CategoryLessonsSection
              category_id={selectedCategoryID!}
              data={category_lessons_q.data}
            />
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
    // on refetch reassign
  }, [categories]);

  const add_category_mut = useMutation(
    trpc.text_lessons.categories.add_text_lesson_category.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_text_lesson_categories.pathFilter()
        );
        setAddOpen(false);
        toast.success('Category added');
      },
      onError: (err) => {
        toast.error('Failed to add category' + (err?.message ? `: ${err.message}` : ''));
      }
    })
  );

  const delete_category_mut = useMutation(
    trpc.text_lessons.categories.delete_text_lesson_category.mutationOptions({
      onSuccess: async () => {
        setDeleteId(null);
        // reordering is done on server on delete
        queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_text_lesson_categories.queryFilter()
        );
        toast.success('Category deleted');
      },
      onError: (err) => {
        toast.error('Failed to delete category' + (err?.message ? `: ${err.message}` : ''));
      }
    })
  );

  const update_category_list_mut = useMutation(
    trpc.text_lessons.categories.update_text_lesson_category_list.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_text_lesson_categories.pathFilter()
        );
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
          <DialogTitle>Manage Categories</DialogTitle>
        </DialogHeader>

        <div className="mb-3 flex items-center justify-between">
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus className="mr-2 size-4" /> Add Category
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-md border p-2">
          {isLoading ? (
            <div className="space-y-2">
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
                <ul className="space-y-2">
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

        {/* Add Category Dialog */}
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

        {/* Delete Confirmation */}
        <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Category</AlertDialogTitle>
              <AlertDialogDescription>
                <span>Are you sure you want to delete this category?</span>
                <br />
                <span className="mt-2 text-muted-foreground">
                  Lessons within this category will become uncategorized.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (deleteId !== null) {
                    await delete_category_mut.mutateAsync({ lesson_id: deleteId, lang_id: langId });
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
    <div className="space-y-4">
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
        <GripVertical className="size-4" />
      </button>
      <Input value={item.name} onChange={(e) => onChangeName(e.target.value)} className="flex-1" />
      <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive">
        <Trash2 className="size-5" />
      </Button>
    </li>
  );
}

type LessonItem = { id: number; text: string; order: number | null };

function CategoryLessonsSection({
  data,
  category_id
}: {
  data: { type: string; lessons: LessonItem[] };
  category_id: number;
}) {
  if (data.type === 'uncategorized') {
    return <UncatLessonsList lessons={data.lessons} />;
  }
  return <CategorizedLessonsList lessons={data.lessons} category_id={category_id} />;
}

function UncatLessonsList({ lessons }: { lessons: LessonItem[] }) {
  return (
    <div className="grid grid-cols-3 gap-4 space-y-2 sm:grid-cols-4 md:grid-cols-6">
      {lessons.map((l) => (
        <UncatLessonCard key={l.id} lesson={l} />
      ))}
      {lessons.length === 0 && <div className="text-sm text-muted-foreground">No lessons.</div>}
    </div>
  );
}

function AddToCategoryDialog({
  lesson_id,
  prev_category_id,
  onAdded
}: {
  lesson_id: number;
  prev_category_id?: number;
  onAdded?: () => void;
}) {
  const trpc = useTRPC();
  const langId = useAtomValue(lang_id_atom);
  const categories_q = useQuery(
    trpc.text_lessons.categories.get_text_lesson_categories.queryOptions({ lang_id: langId })
  );
  const categories = categories_q.data
    ? categories_q.data.filter((c) => c.id !== prev_category_id)
    : [];
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  const add_to_category_mut = useMutation(
    trpc.text_lessons.categories.add_update_lesson_category.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_category_text_lessons.queryFilter({
            category_id: selectedCategory!
          })
        );
        await queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_category_text_lessons.queryFilter({
            category_id: prev_category_id ?? 0
          })
        );
        setOpen(false);
        setSelectedCategory(null);
        onAdded?.();
      }
    })
  );

  const canAdd = selectedCategory !== null && !add_to_category_mut.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Category</DialogTitle>
          </DialogHeader>
          {categories.length > 0 ? (
            <RadioGroup
              value={selectedCategory?.toString() ?? ''}
              onValueChange={(v) => setSelectedCategory(Number(v))}
              className="space-y-2"
            >
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-2">
                  <RadioGroupItem id={`cat-${lesson_id}-${cat.id}`} value={String(cat.id)} />
                  <Label htmlFor={`cat-${lesson_id}-${cat.id}`}>{cat.name}</Label>
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
              onClick={() =>
                selectedCategory !== null &&
                add_to_category_mut.mutate({
                  category_id: selectedCategory,
                  lesson_id: lesson_id,
                  prev_category_id
                })
              }
              disabled={!canAdd}
            >
              {add_to_category_mut.isPending ? 'Adding…' : 'Add to Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)} className="-p-2">
        <Plus className="size-4" />
      </Button>
    </>
  );
}

function UncatLessonCard({ lesson }: { lesson: LessonItem }) {
  return (
    <Card className="p-0">
      <CardContent className="flex items-center justify-between gap-2 p-3">
        <Link href={`/lessons/edit/${lesson.id}`} className="truncate font-medium hover:underline">
          {lesson.text}
        </Link>
        <AddToCategoryDialog lesson_id={lesson.id} prev_category_id={undefined} />
      </CardContent>
    </Card>
  );
}

function CategorizedLessonsList({
  lessons,
  category_id
}: {
  lessons: LessonItem[];
  category_id: number;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [unordered, setUnordered] = useState<LessonItem[]>([]);
  const [ordered, setOrdered] = useState<LessonItem[]>([]);

  useEffect(() => {
    const unorderedInit = (lessons ?? []).filter((l) => l.order === null);
    const orderedInit = (lessons ?? [])
      .filter((l) => l.order !== null)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) as LessonItem[];
    setUnordered(unorderedInit);
    setOrdered(orderedInit);
  }, [lessons]);

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

  const save_order_mut = useMutation(
    trpc.text_lessons.categories.update_text_lessons_order.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.text_lessons.categories.get_category_text_lessons.queryFilter({
            category_id: category_id
          })
        );
        toast.success('Order saved');
      },
      onError: (err) => {
        toast.error('Failed to save order' + (err?.message ? `: ${err.message}` : ''));
      }
    })
  );

  return (
    <div className="space-y-6">
      <Accordion type="single" collapsible defaultValue="unordered">
        <AccordionItem value="unordered">
          <AccordionTrigger className="text-base font-semibold">Unordered</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              {unordered.map((l) => (
                <Card key={l.id} className="p-0">
                  <CardContent className="flex items-center justify-between gap-3 p-3">
                    <Link href={`/lessons/edit/${l.id}`} className="font-medium hover:underline">
                      {l.text}
                    </Link>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => sendToTop(l)}>
                        <ArrowUpFromLine className="mr-1 size-4" /> To Top
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => sendToBottom(l)}>
                        <ArrowDownToLine className="mr-1 size-4" /> To Bottom
                      </Button>
                      <AddToCategoryDialog lesson_id={l.id} prev_category_id={category_id} />
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

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Ordered</h3>
          <Button
            size="sm"
            onClick={() => {
              const all_lessons = [...ordered, ...unordered];
              save_order_mut.mutate({
                category_id: category_id,
                lesson: all_lessons.map((l) => ({
                  id: l.id,
                  order: l.order!
                }))
              });
            }}
            disabled={save_order_mut.isPending}
          >
            {save_order_mut.isPending ? 'Saving…' : 'Save Current Order'}
          </Button>
        </div>
        {ordered.length > 0 ? (
          <div className="max-h-[50vh] overflow-y-auto pr-1">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={ordered.map((l) => String(l.id))}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-2">
                  {ordered.map((l) => (
                    <OrderedLessonCard
                      key={l.id}
                      item={l}
                      onUnorder={() => {
                        setOrdered((prev) =>
                          prev.filter((x) => x.id !== l.id).map((x, i) => ({ ...x, order: i + 1 }))
                        );
                        setUnordered((prev) => [{ ...l, order: null }, ...prev]);
                      }}
                      prev_category_id={category_id}
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

function OrderedLessonCard({
  item,
  onUnorder,
  prev_category_id
}: {
  item: LessonItem;
  onUnorder: () => void;
  prev_category_id: number;
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
            <GripVertical className="size-4" />
          </button>
          <Link href={`/lessons/edit/${item.id}`} className="truncate hover:underline">
            {item.text}
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Button size="icon" variant="ghost" className="-p-2" onClick={onUnorder}>
              <Minus className="size-4" />
            </Button>
            <AddToCategoryDialog lesson_id={item.id} prev_category_id={prev_category_id} />
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
