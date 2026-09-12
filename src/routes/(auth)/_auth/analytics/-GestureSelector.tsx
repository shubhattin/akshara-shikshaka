'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import { useTRPC } from '~/api/client';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Skeleton } from '~/components/ui/skeleton';
import { cn } from '~/lib/utils';
import { get_script_from_id } from '~/state/lang_list';

export type SelectedGesture = {
  text: string;
  script_id: number;
};

type GestureSelectorProps = {
  selectedGestures: SelectedGesture[];
  onSelectedGesturesChange: (gestures: SelectedGesture[]) => void;
  /** Active script scope — narrows picker search results. */
  scriptIdFilter?: number;
  locked?: boolean;
};

function gestureKey(g: SelectedGesture): string {
  return `${g.script_id}::${g.text}`;
}

function scriptLabel(script_id: number): string {
  return get_script_from_id(script_id) ?? `Script ${script_id}`;
}

/** Debounced mirror of the search box. */
function useDebouncedSearch(search: string, delayMs = 400): string {
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timeoutId = setTimeout(() => setDebounced(search), delayMs);
    return () => clearTimeout(timeoutId);
  }, [search, delayMs]);
  return debounced;
}

const SelectedGestureChips = ({
  selectedGestures,
  locked,
  onRemove
}: {
  selectedGestures: SelectedGesture[];
  locked: boolean;
  onRemove: (gesture: SelectedGesture) => void;
}) =>
  selectedGestures.length === 0 ? (
    <span className="px-1 text-sm text-muted-foreground">All gestures (combined)</span>
  ) : (
    selectedGestures.map((gesture) => (
      <span
        key={gestureKey(gesture)}
        className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-100 px-2.5 py-0.5 text-sm dark:border-slate-600/60 dark:bg-slate-700/60"
      >
        <span className="max-w-48 truncate">
          {gesture.text}
          <span className="ml-1 text-xs text-muted-foreground">
            {scriptLabel(gesture.script_id)}
          </span>
        </span>
        {!locked && (
          <button
            type="button"
            onClick={() => onRemove(gesture)}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-slate-200 hover:text-foreground dark:hover:bg-slate-600"
            aria-label={`Remove ${gesture.text}`}
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </span>
    ))
  );

const GesturePickerPopover = ({
  open,
  onOpenChange,
  selectedKeys,
  scriptIdFilter,
  onAdd
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedKeys: Set<string>;
  scriptIdFilter?: number;
  onAdd: (gesture: SelectedGesture) => void;
}) => {
  const trpc = useTRPC();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedSearch(search);

  const searchQ = useQuery(
    trpc.gesture_stats.search_recorded_texts.queryOptions(
      {
        search: debouncedSearch !== '' ? debouncedSearch : undefined,
        script_id: scriptIdFilter,
        limit: 8
      },
      { enabled: open, refetchOnWindowFocus: false, placeholderData: (prev) => prev }
    )
  );

  const results = searchQ.data?.gestures ?? [];

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" />
        }
      >
        <ChevronDownIcon className="size-3.5" />
        Add gesture
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 sm:w-96" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-input bg-transparent px-2.5">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <Input
              className="border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="Search recorded text"
            />
          </div>

          <div className="max-h-52 space-y-1 overflow-y-auto">
            {searchQ.isLoading && (
              <div className="space-y-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            )}
            {searchQ.isSuccess &&
              results.map((item) => {
                const key = `${item.script_id}::${item.text}`;
                const isSelected = selectedKeys.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={isSelected}
                    onClick={() => onAdd({ text: item.text, script_id: item.script_id })}
                    className={cn(
                      'flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      isSelected
                        ? 'cursor-not-allowed bg-muted/60 text-muted-foreground'
                        : 'hover:bg-accent'
                    )}
                  >
                    <span className="truncate text-base font-medium">{item.text}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {scriptLabel(item.script_id)} · {item.recordings_count} submission
                      {item.recordings_count === 1 ? '' : 's'}
                    </span>
                  </button>
                );
              })}
            {searchQ.isSuccess && results.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No recorded gestures found
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const GestureSelector = ({
  selectedGestures,
  onSelectedGesturesChange,
  scriptIdFilter,
  locked = false
}: GestureSelectorProps) => {
  const [open, setOpen] = useState(false);

  const selectedKeys = new Set(selectedGestures.map(gestureKey));

  function addGesture(gesture: SelectedGesture) {
    if (selectedKeys.has(gestureKey(gesture))) return;
    onSelectedGesturesChange([...selectedGestures, gesture]);
  }

  function removeGesture(gesture: SelectedGesture) {
    onSelectedGesturesChange(selectedGestures.filter((g) => gestureKey(g) !== gestureKey(gesture)));
  }

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-2 rounded-lg border border-slate-200/60 bg-white/50 px-2 py-1.5 dark:border-slate-700/40 dark:bg-slate-800/30">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">Gestures</span>
      <SelectedGestureChips
        selectedGestures={selectedGestures}
        locked={locked}
        onRemove={removeGesture}
      />
      {!locked && (
        <GesturePickerPopover
          open={open}
          onOpenChange={setOpen}
          selectedKeys={selectedKeys}
          scriptIdFilter={scriptIdFilter}
          onAdd={addGesture}
        />
      )}
      {!locked && selectedGestures.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => onSelectedGesturesChange([])}
        >
          Clear all
        </Button>
      )}
    </div>
  );
};

export default GestureSelector;
