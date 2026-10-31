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

/** Free chats (not focused on a gesture), for the date-grouped list. */
export const freeChats = <T extends SidebarChat>(chats: T[]) =>
  chats.filter((chat) => chat.focus_gesture_id === null);
