import { describe, expect, it } from 'vitest';
import {
  buildMentionIndex,
  findMentionTrigger,
  searchMentions,
  type MentionableGesture
} from './mention_search';

const gesture = (over: Partial<MentionableGesture>): MentionableGesture => ({
  id: 1,
  text: 'क',
  script_id: 1,
  category_id: 2,
  category: 'Vyañjana',
  strokes: 3,
  roman: 'ka',
  ...over
});

const index = buildMentionIndex([
  gesture({ id: 1, text: 'क', roman: 'ka' }),
  gesture({ id: 2, text: 'ख', roman: 'kha' }),
  gesture({ id: 3, text: 'క', roman: 'ka', script_id: 2 }),
  gesture({ id: 4, text: 'अ', roman: 'a', category_id: 1, category: 'Svara' }),
  gesture({ id: 5, text: 'ॐ', roman: 'oM', category_id: null, category: null })
]);

const search = (query: string, extra: Partial<Parameters<typeof searchMentions>[1]> = {}) =>
  searchMentions(index, {
    query,
    script: 'all',
    category: 'all',
    exclude: new Set(),
    limit: 10,
    ...extra
  }).results.map((g) => g.id);

describe('searchMentions', () => {
  it('finds by akṣara, romanization and id', () => {
    expect(search('क')).toEqual([1]);
    expect(search('ka')).toEqual([1, 3]);
    expect(search('kh')).toEqual([2]);
    expect(search('#4')).toEqual([4]);
  });

  it('filters by script and category', () => {
    expect(search('ka', { script: 2 })).toEqual([3]);
    expect(search('', { category: 1 })).toEqual([4]);
    expect(search('', { category: 'none' })).toEqual([5]);
  });

  it('matches category names and skips mentioned gestures', () => {
    expect(search('svara')).toEqual([4]);
    expect(search('ka', { exclude: new Set([1]) })).toEqual([3]);
  });
});

describe('findMentionTrigger', () => {
  it('reads the query at the caret', () => {
    expect(findMentionTrigger('draw @क', 7)).toEqual({ start: 5, query: 'क' });
    expect(findMentionTrigger('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('needs @ to start a word and stops at whitespace', () => {
    expect(findMentionTrigger('mail@x', 6)).toBeNull();
    expect(findMentionTrigger('@ka now', 7)).toBeNull();
  });
});
