import { describe, expect, it } from 'vitest';
import { freeChats, type SidebarChat } from './gesture_groups';

const chat = (id: string, focus: [number, string, number, string] | null): SidebarChat => ({
  id,
  title: id,
  updated_at: new Date(0),
  streaming: false,
  focus_gesture_id: focus?.[0] ?? null,
  focus_text: focus?.[1] ?? null,
  focus_script_id: focus?.[2] ?? null,
  focus_text_key: focus?.[3] ?? null,
  focus_review_status: focus ? 'unreviewed' : null,
  focus_strokes: focus ? 2 : null
});

describe('freeChats', () => {
  it('keeps free chats apart', () => {
    expect(freeChats([chat('a', null), chat('b', [1, 'a', 1, 'a'])]).map((c) => c.id)).toEqual([
      'a'
    ]);
  });
});
