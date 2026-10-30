import { describe, expect, it } from 'vitest';
import { focusInstructions, focusedRefs, savedViewAllowed } from './focus';
import type { AgentUIMessage } from './ui_message';

const focus = { id: 12, text: 'क', script_id: 1, agent_notes: '' };

const userWithRef = (id: number): AgentUIMessage => ({
  id: 'u1',
  role: 'user',
  parts: [{ type: 'data-gesture_ref', data: { id, text: 'क', script_id: 1 } }]
});

describe('focusedRefs', () => {
  it('adds the focus gesture to the first message', () => {
    expect(focusedRefs([], [], focus)).toEqual({
      ok: true,
      refs: [{ id: 12, text: 'क', script_id: 1 }]
    });
  });

  it('does not repeat it once the chat carries it', () => {
    expect(focusedRefs([], [userWithRef(12)], focus)).toEqual({ ok: true, refs: [] });
  });

  it('refuses other gestures', () => {
    const result = focusedRefs([{ id: 13, text: 'ख', script_id: 1 }], [], focus);
    expect(result.ok).toBe(false);
  });
});

describe('savedViewAllowed', () => {
  const siblings = [{ id: 40 }];
  it('critiques only the focus gesture', () => {
    expect(savedViewAllowed({ gesture_id: 12, purpose: 'critique' }, focus, siblings)).toBeNull();
    expect(
      savedViewAllowed({ gesture_id: 40, purpose: 'critique' }, focus, siblings)
    ).not.toBeNull();
  });
  it('shows only siblings as siblings', () => {
    expect(savedViewAllowed({ gesture_id: 40, purpose: 'sibling' }, focus, siblings)).toBeNull();
    expect(
      savedViewAllowed({ gesture_id: 12, purpose: 'sibling' }, focus, siblings)
    ).not.toBeNull();
  });
});

describe('focusInstructions', () => {
  it('carries the notes and the sibling scripts', () => {
    const text = focusInstructions({
      gesture: { ...focus, agent_notes: 'Headline last.' },
      script: 'Devanagari',
      siblings: [{ id: 40, text: 'ক', script_id: 2, strokes: 0, script: 'Bengali' }]
    });
    expect(text).toContain('Headline last.');
    expect(text).toContain('ক in Bengali (#40): no strokes yet');
  });
});
