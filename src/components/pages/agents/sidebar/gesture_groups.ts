import type { ReviewStatus } from '~/agents/gesture_review';

/** A sidebar chat row as `agents.list_chats` returns it. */
export type SidebarChat = {
  id: string;
  title: string;
  updated_at: Date | string;
  streaming: boolean;
  focus_gesture_id: number | null;
  focus_text: string | null;
  focus_text_key: string | null;
  focus_script_id: number | null;
  focus_review_status: ReviewStatus | null;
  focus_strokes: number | null;
};

export type FocusedGestureGroup<T extends SidebarChat> = {
  gesture_id: number;
  text: string;
  script_id: number;
  review_status: ReviewStatus | null;
  strokes: number;
  /** Its chats, newest first */
  chats: T[];
  streaming: boolean;
};

export type AksharaGroup<T extends SidebarChat> = {
  text_key: string;
  /** The same akṣara in each script that has focused chats, most recently active first */
  gestures: FocusedGestureGroup<T>[];
};

/**
 * Focused chats grouped by akṣara (`text_key`), then by gesture (one per script). Input is
 * newest first, so groups come out in order of their latest activity.
 */
export function groupChatsByGesture<T extends SidebarChat>(chats: T[]): AksharaGroup<T>[] {
  const keys = new Map<string, Map<number, FocusedGestureGroup<T>>>();
  for (const chat of chats) {
    if (chat.focus_gesture_id === null) continue;
    const key = chat.focus_text_key ?? chat.focus_text ?? String(chat.focus_gesture_id);
    let gestures = keys.get(key);
    if (!gestures) keys.set(key, (gestures = new Map()));
    let group = gestures.get(chat.focus_gesture_id);
    if (!group) {
      group = {
        gesture_id: chat.focus_gesture_id,
        text: chat.focus_text ?? '?',
        script_id: chat.focus_script_id ?? 0,
        review_status: chat.focus_review_status,
        strokes: chat.focus_strokes ?? 0,
        chats: [],
        streaming: false
      };
      gestures.set(chat.focus_gesture_id, group);
    }
    group.chats.push(chat);
    group.streaming ||= chat.streaming;
  }
  return [...keys].map(([text_key, gestures]) => ({ text_key, gestures: [...gestures.values()] }));
}

/** Free chats (not focused on a gesture), for the date-grouped list. */
export const freeChats = <T extends SidebarChat>(chats: T[]) =>
  chats.filter((chat) => chat.focus_gesture_id === null);
