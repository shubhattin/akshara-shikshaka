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

const RESULT_LIMIT = 40;

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
  /** `@` position the menu was closed for (Esc or an outside click). */
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);
  const [used, setUsed] = useState(false);

  const refs = picked.filter((ref) => tokenPattern(mentionToken(ref)).test(text));
  const trigger = caret === null ? null : findMentionTrigger(text, caret);
  if (dismissedStart !== null && trigger?.start !== dismissedStart) setDismissedStart(null);
  // Right after a complete mention the menu stays shut; editing the token reopens it.
  const completed = trigger !== null && refs.some((ref) => mentionToken(ref) === `@${trigger.query}`);
  const active = trigger && trigger.start !== dismissedStart && !completed ? trigger : null;

  // Load the list the first time an `@` is typed.
  if (active && !used) setUsed(true);
  const list_q = useQuery(
    trpc.agents.list_mentionable_gestures.queryOptions(undefined, { enabled: used, staleTime: 5 * 60_000 })
  );
  const gestures: MentionableGesture[] | undefined = list_q.data;
  const index = useMemo(() => (gestures ? buildMentionIndex(gestures) : null), [gestures]);
  const loading = used && list_q.isPending;

  const search =
    active && index
      ? searchMentions(index, {
          query: active.query,
          script,
          category,
          exclude: new Set(refs.map((ref) => ref.id)),
          limit: RESULT_LIMIT
        })
      : { results: [], total: 0 };
  const open = active !== null;
  const navigable = open && !loading && search.results.length > 0;

  const resultKey = `${active?.query ?? ''}|${script}|${category}`;
  const activeIndex = highlight.key === resultKey ? highlight.index : 0;
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
    const ref: GestureRefData = { id: gesture.id, text: gesture.text, script_id: gesture.script_id };
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
    else if (action === 'next') setActiveIndex((activeIndex + 1) % count);
    else if (action === 'previous') setActiveIndex((activeIndex - 1 + count) % count);
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
    textareaAria: {
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': open,
      'aria-controls': open ? listId : undefined,
      'aria-activedescendant': navigable ? mentionOptionId(listId, activeIndex) : undefined
    } as const,
    menu: {
      open,
      onDismiss: () => {
        if (active) setDismissedStart(active.start);
      },
      listId,
      query: active?.query ?? '',
      gestures: gestures ?? [],
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
      loading,
      error: !!list_q.error,
      atLimit,
      activeIndex,
      onActiveIndexChange: setActiveIndex,
      onPick: pick
    }
  };
}
