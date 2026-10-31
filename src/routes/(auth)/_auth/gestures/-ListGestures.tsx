'use client';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTRPC } from '~/api/client';
import { useCategorySearchParam } from '~/hooks/useCategorySearchParam';
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
import { useQuery } from '@tanstack/react-query';
import { LESSON_LANG_ID_COOKIE_KEY, SCRIPT_ID_COOKIE_KEY } from '~/state/cookie';
import type { lesson_categories } from '~/db/schema';
import type { InferSelectModel } from 'drizzle-orm';
import { useHydrateAtoms } from 'jotai/react/utils';
import { atom, useAtom } from 'jotai';
import { ChevronsUpDown, TypeIcon } from 'lucide-react';
import { FontToolsDialog } from '~/components/pages/gesture_fonts/FontToolsDialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  const [fontsOpen, setFontsOpen] = useState(false);
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

      {selectedCategoryID !== null && fontsOpen ? (
        <FontToolsDialog
          open
          onOpenChange={setFontsOpen}
          categoryId={selectedCategoryID}
          categoryName={categoryName}
          scriptId={scriptId}
          langId={langId}
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
                  onClick={() => setFontsOpen(true)}
                  title="Inspect and change the glyph fonts of this category"
                >
                  <TypeIcon data-icon="inline-start" />
                  Fonts
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
  lesson_id: number | null;
  order: number | null;
  updated_at: Date;
  stroke_count: number;
};

function splitGestures(gestures: GestureItem[]) {
  const unordered = gestures.filter((g) => g.order === null);
  const ordered = gestures
    .filter((g) => g.order !== null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { ordered, unordered };
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
            { key: 'ordered', title: 'Ordered', items: ordered },
            { key: 'unordered', title: 'Unordered', items: unordered }
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
