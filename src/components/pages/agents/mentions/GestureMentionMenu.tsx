import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { AtSignIcon } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';
import { get_script_from_id } from '~/state/lang_list';
import type {
  MentionableGesture,
  MentionCategoryFilter,
  MentionScriptFilter
} from './mention_search';
import { isCategoryId } from './mention_search';
import { mentionOptionId } from './use_gesture_mentions';

const scriptName = (id: number) => get_script_from_id(id) ?? `Script ${id}`;

/**
 * The `@` picker above the composer: search gestures by akṣara (as written or romanized), id or
 * category, filtered by script and category. Focus stays in the textarea — the composer drives
 * the highlighted row with the keyboard; the mouse picks directly.
 */
export function GestureMentionMenu({
  anchor,
  open,
  onDismiss,
  listId,
  query,
  gestures,
  script,
  onScriptChange,
  category,
  onCategoryChange,
  results,
  total,
  hasMore,
  onLoadMore,
  loading,
  error,
  atLimit,
  activeIndex,
  onActiveIndexChange,
  onPick
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onDismiss: () => void;
  listId: string;
  query: string;
  /** The whole list, for the filter options */
  gestures: MentionableGesture[];
  script: MentionScriptFilter;
  onScriptChange: (script: MentionScriptFilter) => void;
  category: MentionCategoryFilter;
  onCategoryChange: (category: MentionCategoryFilter) => void;
  results: MentionableGesture[];
  total: number;
  /** More matches than shown; `onLoadMore` adds the next page */
  hasMore: boolean;
  onLoadMore: () => void;
  loading: boolean;
  error: boolean;
  atLimit: boolean;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onPick: (gesture: MentionableGesture) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector(`#${CSS.escape(mentionOptionId(listId, activeIndex))}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  const scriptItems = useMemo(
    () => [
      { value: 'all', label: 'All scripts' },
      ...[...new Set(gestures.map((g) => g.script_id))].map((id) => ({
        value: String(id),
        label: scriptName(id)
      }))
    ],
    [gestures]
  );
  const categoryItems = useMemo(() => {
    const seen = new Map<number, string>();
    for (const g of gestures)
      if (g.category_id !== null && g.category) seen.set(g.category_id, g.category);
    return [
      { value: 'all', label: 'All categories' },
      ...[...seen].map(([id, name]) => ({ value: String(id), label: name })),
      { value: 'none', label: 'Uncategorised' }
    ];
  }, [gestures]);

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next, details) => {
        if (next) return;
        // Clicks in the composer move the caret; the composer decides whether to stay open.
        const target = details.event?.target;
        if (target instanceof Node && anchor.current?.contains(target)) return;
        onDismiss();
      }}
    >
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={anchor}
          side="top"
          align="start"
          sideOffset={8}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            initialFocus={false}
            finalFocus={false}
            className="z-50 flex w-[min(var(--anchor-width),34rem)] flex-col overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden"
          >
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 py-1.5 pr-1.5 pl-3">
              <AtSignIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                {query.trim() ? (
                  <>
                    Gestures matching <span className="text-foreground">“{query.trim()}”</span>
                  </>
                ) : (
                  'Mention a gesture'
                )}
              </p>
              <Select
                items={scriptItems}
                value={script === 'all' ? 'all' : String(script)}
                onValueChange={(value) => {
                  if (value) onScriptChange(value === 'all' ? 'all' : Number(value));
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Filter by script"
                  className="h-7 border-transparent bg-muted/60 text-xs hover:bg-muted"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="end">
                  {scriptItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                items={categoryItems}
                value={isCategoryId(category) ? String(category) : category}
                onValueChange={(value) => {
                  if (!value) return;
                  onCategoryChange(value === 'all' || value === 'none' ? value : Number(value));
                }}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Filter by category"
                  className="h-7 border-transparent bg-muted/60 text-xs hover:bg-muted"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="end">
                  {categoryItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label="Gestures"
              className="max-h-72 overflow-y-auto overscroll-contain p-1"
              onScroll={(event) => {
                const el = event.currentTarget;
                // near the bottom: the next page, before the admin reaches the end
                if (hasMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 64) onLoadMore();
              }}
            >
              {loading ? (
                <p className="flex items-center gap-2 px-2.5 py-3 text-sm text-muted-foreground">
                  <Spinner className="size-4" />
                  Loading gestures…
                </p>
              ) : error ? (
                <p className="px-2.5 py-3 text-sm text-destructive">Couldn’t load gestures.</p>
              ) : results.length === 0 ? (
                <p className="px-2.5 py-3 text-sm text-muted-foreground">
                  No gestures match{query.trim() ? ` “${query.trim()}”` : ''} with these filters.
                </p>
              ) : (
                results.map((gesture, index) => (
                  <div
                    key={gesture.id}
                    id={mentionOptionId(listId, index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    aria-disabled={atLimit || undefined}
                    // Keep focus (and the caret) in the textarea.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => {
                      if (index !== activeIndex) onActiveIndexChange(index);
                    }}
                    onClick={() => {
                      if (!atLimit) onPick(gesture);
                    }}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 select-none',
                      index === activeIndex && 'bg-accent text-accent-foreground',
                      atLimit && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background text-xl leading-none">
                      {gesture.text}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {gesture.text}
                        {gesture.roman && gesture.roman !== gesture.text ? (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {gesture.roman}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {scriptName(gesture.script_id)} · {gesture.category ?? 'Uncategorised'} · #
                        {gesture.id}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-md border px-1.5 py-px text-[10px] font-medium',
                        gesture.strokes > 0
                          ? 'border-border text-muted-foreground'
                          : 'border-amber-500/40 text-amber-600 dark:text-amber-400'
                      )}
                    >
                      {gesture.strokes > 0 ? `${gesture.strokes} strokes` : 'No strokes'}
                    </span>
                  </div>
                ))
              )}
              {!loading && !error && hasMore ? (
                <button
                  type="button"
                  // Keep focus (and the caret) in the textarea.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onLoadMore}
                  className="w-full rounded-lg px-2 py-1.5 text-center text-xs text-muted-foreground hover:bg-muted"
                >
                  Show more ({total - results.length} left)
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-3 border-t border-border/70 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
              {atLimit ? (
                <span className="text-destructive">Mention limit reached for this message.</span>
              ) : (
                <span className="hidden items-center gap-3 sm:flex">
                  <span>
                    <Kbd>↑</Kbd>
                    <Kbd>↓</Kbd> navigate
                  </span>
                  <span>
                    <Kbd>↵</Kbd> mention
                  </span>
                  <span>
                    <Kbd>esc</Kbd> close
                  </span>
                </span>
              )}
              {!loading && total > 0 ? (
                <span className="ml-auto tabular-nums">
                  {hasMore ? `${results.length} of ${total} — scroll for more` : `${total} found`}
                </span>
              ) : null}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="mr-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded border border-border bg-background px-1 font-sans text-[10px]">
      {children}
    </kbd>
  );
}
