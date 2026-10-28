import { describe, expect, it } from 'vitest';
import type { AgentUIMessage } from '~/agents/ui_message';
import type { Gesture } from '~/tools/stroke_data/types';
import { guidedScripts, renderReferencedGesture, withoutSavedStrokes } from './gesture_refs';

const stroke: Gesture = {
  index: 0,
  width: 12,
  color: '#000',
  duration: 600,
  anim_fn: 'linear',
  simulate_pressure: false,
  points: [
    [100, 100],
    [200, 100]
  ]
};

const KSHA = {
  id: 71,
  text: 'क्ष',
  script_id: 1,
  font_family: 'Noto_Serif_Devanagari',
  font_size: 15,
  // SAFETY: literal pair matches the fixed 2-tuple shape of text_center_offset.
  text_center_offset: [0, 0] as [number, number],
  category: null,
  gestures: [stroke]
};

const mention = (context: string, script_id = 1): AgentUIMessage => ({
  id: 'u1',
  role: 'user',
  parts: [{ type: 'data-gesture_ref', data: { id: 71, text: 'क्ष', script_id, context } }]
});

describe('mentions in the Gesture Creator', () => {
  it('leaves out the saved strokes and adds the script style guide', () => {
    const text = renderReferencedGesture(KSHA, { savedStrokes: false, styleGuide: true });
    expect(text).not.toMatch(/saved strokes/);
    expect(text).toContain('<stroke_style_guide script="Devanagari">');
    expect(text).toContain('क्ष: the body in one stroke');
  });

  it('keeps the saved-stroke summary for the general agent', () => {
    const text = renderReferencedGesture(KSHA, { savedStrokes: true, styleGuide: false });
    expect(text).toContain('saved strokes (1)');
    expect(text).not.toContain('stroke_style_guide');
  });

  it('knows which scripts already had their guide', () => {
    const guided = renderReferencedGesture(KSHA, { savedStrokes: false, styleGuide: true });
    const plain = renderReferencedGesture(KSHA, { savedStrokes: false, styleGuide: false });
    expect([...guidedScripts([mention(guided)])]).toEqual([1]);
    expect([...guidedScripts([mention(plain, 2)])]).toEqual([]);
  });

  it('hides saved strokes in mentions stored before', () => {
    const old = renderReferencedGesture(KSHA, { savedStrokes: true, styleGuide: false });
    const [message] = withoutSavedStrokes([mention(old)]);
    const part = message!.parts[0]!;
    const context = part.type === 'data-gesture_ref' ? part.data.context! : '';
    expect(context).not.toMatch(/saved strokes|100,100/);
    expect(context).toContain('glyph: font Noto_Serif_Devanagari');
    expect(context.trim().endsWith('</referenced_gesture>')).toBe(true);
  });
});

describe('style guides', () => {
  // script_id → a phrase only that script's guide has
  const GUIDES: [number, string, string][] = [
    [1, 'Devanagari', 'shirorekha'],
    [2, 'Telugu', 'talakaṭṭu'],
    [5, 'Bengali', 'mātrā'],
    [6, 'Kannada', 'talakaṭṭu'],
    [7, 'Gujarati', 'no headline'],
    [8, 'Malayalam', 'Chandrakkala'],
    [9, 'Odia', 'the hood']
  ];

  it.each(GUIDES)(
    'sends the guide of script %i (%s) with its first mention',
    (script_id, name, phrase) => {
      const text = renderReferencedGesture(
        { ...KSHA, script_id },
        { savedStrokes: false, styleGuide: true }
      );
      expect(text).toContain(`<stroke_style_guide script="${name}">`);
      expect(text).toContain(phrase);
      expect(text).not.toContain('No style guide for this script yet');
    }
  );

  it('falls back to a note for scripts without a guide', () => {
    const text = renderReferencedGesture(
      { ...KSHA, script_id: 3 },
      { savedStrokes: false, styleGuide: true }
    );
    expect(text).toContain('<stroke_style_guide script="Tamil">');
    expect(text).toContain('No style guide for this script yet');
  });
});
