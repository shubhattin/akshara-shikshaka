import { describe, expect, it } from 'vitest';
import { agentContext, agentInstructionSections } from './instructions';
import { styleGuideMarkdown } from './style_guides';

describe('context dialog', () => {
  it('lists the Gesture Creator style guides apart from the system sections', () => {
    const { sections, style_guides } = agentContext('gesture_creator');
    expect(sections).toEqual(agentInstructionSections('gesture_creator'));
    expect(style_guides.map((guide) => guide.scripts.join(' / '))).toEqual([
      'Devanagari',
      'Telugu / Kannada',
      'Malayalam',
      'Odia',
      'Bengali',
      'Gujarati',
      'Tamil / Tamil-Extended'
    ]);
    expect(style_guides[0]!.markdown.startsWith('### Order\n- Write the akṣara')).toBe(true);
  });

  it('has no style guides for the general agent', () => {
    expect(agentContext('general').style_guides).toEqual([]);
  });

  it('turns section lines into headings and leaves bullets alone', () => {
    expect(styleGuideMarkdown('\nOrder\n- one\n  more\n\nStrokes\n- two\n')).toBe(
      '### Order\n- one\n  more\n\n### Strokes\n- two'
    );
  });
});
