import { describe, expect, it } from 'vitest';
import { freeChats, groupChatsByGesture, type SidebarChat } from './gesture_groups';

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

describe('groupChatsByGesture', () => {
  it('groups focused chats by akṣara, then gesture, in order of activity', () => {
    const groups = groupChatsByGesture([
      chat('c1', [12, 'क', 1, 'ka']),
      chat('free', null),
      chat('c2', [40, 'ক', 2, 'ka']),
      chat('c3', [13, 'ख', 1, 'kha']),
      chat('c4', [12, 'क', 1, 'ka'])
    ]);
    expect(groups.map((g) => g.text_key)).toEqual(['ka', 'kha']);
    expect(groups[0]!.gestures.map((g) => [g.gesture_id, g.chats.map((c) => c.id)])).toEqual([
      [12, ['c1', 'c4']],
      [40, ['c2']]
    ]);
  });

  it('keeps free chats apart', () => {
    expect(freeChats([chat('a', null), chat('b', [1, 'a', 1, 'a'])]).map((c) => c.id)).toEqual([
      'a'
    ]);
  });
});
