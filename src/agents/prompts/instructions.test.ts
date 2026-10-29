import { describe, expect, it } from 'vitest';
import { agentContextSections, agentInstructionSections } from './instructions';

describe('context dialog sections', () => {
  it('shows the style guides for the Gesture Creator, outside the system prompt', () => {
    const sections = agentContextSections('gesture_creator');
    const guides = sections.find((section) => section.id === 'style_guides');
    expect(guides?.content).toContain('<stroke_style_guide script="Telugu / Kannada">');
    expect(guides?.content).toContain('<stroke_style_guide script="Tamil / Tamil-Extended">');
    expect(guides?.content).toContain('<stroke_style_guide script="Devanagari">\nOrder');
    expect(agentInstructionSections('gesture_creator').map((section) => section.id)).not.toContain(
      'style_guides'
    );
  });

  it('adds no style guides for the general agent', () => {
    expect(agentContextSections('general')).toEqual(agentInstructionSections('general'));
  });
});
