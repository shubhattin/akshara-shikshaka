import { describe, expect, it } from 'vitest';
import { withNote } from './gesture_review';

describe('withNote', () => {
  it('starts a list', () => {
    expect(withNote('', 'Headline last')).toBe('- Headline last');
  });
  it('adds a line once', () => {
    const notes = withNote('- Loop turns clockwise', 'Headline last');
    expect(notes).toBe('- Loop turns clockwise\n- Headline last');
    expect(withNote(notes, ' Headline last ')).toBe(notes);
  });
});
