import { describe, expect, it } from 'vitest';
import type { AgentUIMessage } from '~/agents/ui_message';
import { chatGestureLinks } from './chat_gestures';

type Part = AgentUIMessage['parts'][number];

const user = (parts: Part[], id: string): AgentUIMessage => ({ id, role: 'user', parts });
const assistant = (parts: Part[], id: string): AgentUIMessage => ({
  id,
  role: 'assistant',
  parts
});

const ref = (id: number): Part => ({
  type: 'data-gesture_ref',
  data: { id, text: 'क', script_id: 1 }
});

const proposal = (gestureId: number, ok = true): Part => ({
  type: 'tool-propose_gesture',
  toolCallId: `p${gestureId}`,
  state: 'output-available',
  input: { trace_id: 't1', pace_ms: 600, anim_fn: 'linear', summary: 's' },
  output: ok
    ? {
        ok: true,
        proposal: {
          gesture_id: gestureId,
          uuid: '00000000-0000-0000-0000-000000000000',
          text: 'क',
          script_id: 1,
          font_family: 'Nirmala_UI',
          font_size: 200,
          text_center_offset: [0, 0],
          gestures: [],
          summary: 's'
        }
      }
    : { ok: false, error: 'nope' }
});

describe('chatGestureLinks', () => {
  it('collects mentioned gestures once each', () => {
    const links = chatGestureLinks([user([ref(3), ref(4)], 'u1'), user([ref(3)], 'u2')]);
    expect(links).toEqual([
      { gesture_id: 3, proposed: false },
      { gesture_id: 4, proposed: false }
    ]);
  });

  it('marks only proposals of the newest message as new', () => {
    const links = chatGestureLinks([
      user([ref(3)], 'u1'),
      assistant([proposal(3)], 'a1'),
      user([ref(5)], 'u2'),
      assistant([proposal(5)], 'a2')
    ]);
    expect(links).toEqual([
      { gesture_id: 3, proposed: false },
      { gesture_id: 5, proposed: true }
    ]);
  });

  it('skips failed proposals', () => {
    expect(chatGestureLinks([assistant([proposal(9, false)], 'a1')])).toEqual([]);
  });
});
