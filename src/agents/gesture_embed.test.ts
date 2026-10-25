import { describe, expect, it } from 'vitest';
import { parseGestureEmbedIds } from './gesture_embed';

describe('parseGestureEmbedIds', () => {
  it('reads ids separated by commas, spaces and lines', () => {
    expect(parseGestureEmbedIds('12, 15\n#18  3')).toEqual([12, 15, 18, 3]);
  });

  it('drops duplicates and anything that is not a positive integer id', () => {
    expect(parseGestureEmbedIds('4, 4, -1, 0, 2.5, abc, 9')).toEqual([4, 9]);
  });
});
