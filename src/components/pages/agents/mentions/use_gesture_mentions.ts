import { useId, useMemo, useState, type KeyboardEvent, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '~/api/client';
import { MAX_GESTURE_REFS, mentionToken } from '~/agents/gesture_refs';
import type { GestureRefData } from '~/agents/ui_message';
import {
  buildMentionIndex,
  findMentionTrigger,
  searchMentions,
  type MentionableGesture,
  type MentionCategoryFilter,
  type MentionScriptFilter
} from './mention_search';

/** Results per page: the list grows by this much on scroll, ↓ at the end, or Show more. */
const PAGE_SIZE = 40;

export const mentionOptionId = (listId: string, index: number) => `${listId}-option-${index}`;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The mention token standing as its own word (trailing punctuation allowed). */
const tokenPattern = (token: string) =>
  new RegExp(`(^|\\s)${escapeRegExp(token)}(?=[\\s.,;:!?)\\]]|$)`, 'gu');

/** Replace the typed `@query` (from `start` to the caret) with the mention token. */
function insertMention(text: string, start: number, caret: number, token: string) {
  const after = text.slice(caret);
  const spaced = after.startsWith(' ') ? token : `${token} `;
  return { text: text.slice(0, start) + spaced + after, caret: start + token.length + 1 };
}

function menuKeyAction(event: KeyboardEvent, navigable: boolean, loading: boolean) {
  if (event.key === 'Escape') return 'close';
  // Still loading: Enter means "pick", so don't let it send the message meanwhile.
  if (loading && event.key === 'Enter') return 'wait';
  if (!navigable) return null;
  if (event.key === 'ArrowDown') return 'next';
  if (event.key === 'ArrowUp') return 'previous';
  if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) return 'pick';
  return null;
}

type MentionTrigger = { start: number; query: string };

/** The `@query` at the caret, if the caret sits in a trigger position. */
function triggerAtCaret(caret: number | null, text: string): MentionTrigger | null {
  return caret === null ? null : findMentionTrigger(text, caret);
}

/** A fully typed mention keeps the menu shut until the token is edited again. */
function isCompletedTrigger(trigger: MentionTrigger | null, refs: GestureRefData[]): boolean {
  return trigger !== null && refs.some((ref) => mentionToken(ref) === `@${trigger.query}`);
}

/** The trigger the menu answers to: positioned, not dismissed, not already complete. */
function resolveActiveTrigger(
  trigger: MentionTrigger | null,
  dismissedStart: number | null,
  completed: boolean
): MentionTrigger | null {
  return trigger && trigger.start !== dismissedStart && !completed ? trigger : null;
}

/** `@` position the menu stays shut for; a caret move elsewhere re-arms it. */
function useDismissedStart(trigger: MentionTrigger | null) {
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);
  if (dismissedStart !== null && trigger?.start !== dismissedStart) setDismissedStart(null);
  return [dismissedStart, setDismissedStart] as const;
}

/** The mention list loads once, the first time a trigger appears. */
function useMentionListEnabled(active: MentionTrigger | null) {
  const [used, setUsed] = useState(false);
  if (active && !used) setUsed(true);
  return used;
}

/** Search index of the mentionable gestures, if loaded. */
function useMentionIndex(gestures: MentionableGesture[] | undefined) {
  return useMemo(() => (gestures ? buildMentionIndex(gestures) : null), [gestures]);
}

/** Gestures matching the active trigger within the script/category filters. */
function searchMenuResults(
  active: MentionTrigger | null,
  index: ReturnType<typeof buildMentionIndex> | null,
  script: MentionScriptFilter,
  category: MentionCategoryFilter,
  refs: GestureRefData[],
  limit: number
) {
  return active && index
    ? searchMentions(index, {
        query: active.query,
        script,
        category,
        exclude: new Set(refs.map((ref) => ref.id)),
        limit
      })
    : { results: [], total: 0 };
}

function isMenuLoading(used: boolean, isPending: boolean) {
  return used && isPending;
}

function isMenuNavigable(open: boolean, loading: boolean, resultCount: number) {
  return open && !loading && resultCount > 0;
}

function menuResultKey(
  active: MentionTrigger | null,
  script: MentionScriptFilter,
  category: MentionCategoryFilter
) {
  return `${active?.query ?? ''}|${script}|${category}`;
}

/** Pages shown for this query and filters; a new query starts again at one page. */
function resolvePages(pages: { key: string; count: number }, resultKey: string) {
  return pages.key === resultKey ? pages.count : 1;
}

function resolveActiveIndex(highlight: { key: string; index: number }, resultKey: string) {
  return highlight.key === resultKey ? highlight.index : 0;
}

function menuQueryOf(active: MentionTrigger | null) {
  return active?.query ?? '';
}

function listOrEmpty(gestures: MentionableGesture[] | undefined) {
  return gestures ?? [];
}

function buildTextareaAria(open: boolean, listId: string, navigable: boolean, activeIndex: number) {
  return {
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-expanded': open,
    'aria-controls': open ? listId : undefined,
    'aria-activedescendant': navigable ? mentionOptionId(listId, activeIndex) : undefined
  } as const;
}

/**
 * `@` mentions of gestures for a textarea. The text is the source of truth: a picked gesture
 * stays referenced while its `@akṣara#id` is in the text, so deleting the word drops the mention
 * and the chip's × removes the word.
 */
export function useGestureMentions({
  text,
  setText,
  textareaRef
}: {
  text: string;
  setText: (text: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const trpc = useTRPC();
  const listId = useId();
  const [caret, setCaret] = useState<number | null>(null);
  const [picked, setPicked] = useState<GestureRefData[]>([]);
  const [script, setScript] = useState<MentionScriptFilter>('all');
  const [category, setCategory] = useState<MentionCategoryFilter>('all');
  const [highlight, setHighlight] = useState({ key: '', index: 0 });
  const [pages, setPages] = useState({ key: '', count: 1 });

  const refs = picked.filter((ref) => tokenPattern(mentionToken(ref)).test(text));
  const trigger = triggerAtCaret(caret, text);
  const [dismissedStart, setDismissedStart] = useDismissedStart(trigger);
  const completed = isCompletedTrigger(trigger, refs);
  const active = resolveActiveTrigger(trigger, dismissedStart, completed);

  // Load the list the first time an `@` is typed.
  const used = useMentionListEnabled(active);
  const list_q = useQuery(
    trpc.agents.list_mentionable_gestures.queryOptions(undefined, {
      enabled: used,
      staleTime: 5 * 60_000
    })
  );
  const gestures: MentionableGesture[] | undefined = list_q.data;
  const index = useMentionIndex(gestures);
  const loading = isMenuLoading(used, list_q.isPending);

  const resultKey = menuResultKey(active, script, category);
  const pageCount = resolvePages(pages, resultKey);
  const search = searchMenuResults(active, index, script, category, refs, pageCount * PAGE_SIZE);
  const hasMore = search.total > search.results.length;
  const loadMore = () => {
    if (hasMore) setPages({ key: resultKey, count: pageCount + 1 });
  };
  const open = active !== null;
  const navigable = isMenuNavigable(open, loading, search.results.length);

  const activeIndex = resolveActiveIndex(highlight, resultKey);
  const setActiveIndex = (next: number) => setHighlight({ key: resultKey, index: next });
  const atLimit = refs.length >= MAX_GESTURE_REFS;

  const placeCaret = (position: number) => {
    setCaret(position);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(position, position);
    });
  };

  const pick = (gesture: MentionableGesture) => {
    if (!active || caret === null || atLimit) return;
    const ref: GestureRefData = {
      id: gesture.id,
      text: gesture.text,
      script_id: gesture.script_id
    };
    const next = insertMention(text, active.start, caret, mentionToken(ref));
    setText(next.text);
    setPicked((prev) => [...prev.filter((entry) => entry.id !== ref.id), ref]);
    placeCaret(next.caret);
  };

  const removeRef = (ref: GestureRefData) => {
    setPicked((prev) => prev.filter((entry) => entry.id !== ref.id));
    const token = escapeRegExp(mentionToken(ref));
    setText(
      text
        .replace(new RegExp(`(^|\\s)${token} (?=\\S)`, 'gu'), '$1')
        .replace(tokenPattern(mentionToken(ref)), '$1')
    );
  };

  /** Type an `@` at the caret (the toolbar button), opening the menu. */
  const startMention = () => {
    const textarea = textareaRef.current;
    const position = textarea?.selectionStart ?? text.length;
    const lead = position > 0 && !/\s/.test(text[position - 1]!) ? ' ' : '';
    setText(text.slice(0, position) + lead + '@' + text.slice(position));
    setDismissedStart(null);
    placeCaret(position + lead.length + 1);
  };

  /** Returns true when the key was used by the menu. */
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || !active || event.nativeEvent.isComposing) return false;
    const action = menuKeyAction(event, navigable, loading);
    if (!action) return false;
    event.preventDefault();
    const count = search.results.length;
    if (action === 'close') setDismissedStart(active.start);
    else if (action === 'next') {
      // past the last loaded row: load the next page and step into it
      if (activeIndex + 1 >= count && hasMore) loadMore();
      setActiveIndex(activeIndex + 1 >= count && !hasMore ? 0 : activeIndex + 1);
    } else if (action === 'previous') setActiveIndex((activeIndex - 1 + count) % count);
    else if (action === 'pick') {
      const gesture = search.results[activeIndex];
      if (gesture) pick(gesture);
    }
    return true;
  };

  const syncCaret = (textarea: HTMLTextAreaElement) =>
    setCaret(textarea.selectionStart === textarea.selectionEnd ? textarea.selectionStart : null);

  /** Filters change from their own popups: keep the menu (and caret) where it was. */
  const keepOpen = () => {
    setDismissedStart(null);
    if (caret !== null) placeCaret(caret);
  };

  return {
    refs,
    /** Seed mentions (a pending first message restored from the new-chat screen). */
    setRefs: setPicked,
    clear: () => setPicked([]),
    removeRef,
    startMention,
    handleKeyDown,
    syncCaret,
    textareaAria: buildTextareaAria(open, listId, navigable, activeIndex),
    menu: {
      open,
      onDismiss: () => {
        if (active) setDismissedStart(active.start);
      },
      listId,
      query: menuQueryOf(active),
      gestures: listOrEmpty(gestures),
      script,
      onScriptChange: (next: MentionScriptFilter) => {
        setScript(next);
        keepOpen();
      },
      category,
      onCategoryChange: (next: MentionCategoryFilter) => {
        setCategory(next);
        keepOpen();
      },
      results: search.results,
      total: search.total,
      hasMore,
      onLoadMore: loadMore,
      loading,
      error: !!list_q.error,
      atLimit,
      activeIndex,
      onActiveIndexChange: setActiveIndex,
      onPick: pick
    }
  };
}
