// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { category_search_schema, useCategorySearchParam } from './useCategorySearchParam';

/** The hook wired to a fake URL and a selection, as on the admin list pages */
function setup(initial: { selected: number | null; search: number | undefined }) {
  return renderHook(() => {
    const [selected, setSelected] = useState(initial.selected);
    const [search, setSearch] = useState(initial.search);
    useCategorySearchParam({
      selected,
      setSelected,
      searchCategory: search,
      setSearchCategory: setSearch
    });
    return { selected, setSelected, search, setSearch };
  });
}

describe('useCategorySearchParam', () => {
  it('takes the category from the URL on load over the stored one', () => {
    const { result } = setup({ selected: 5, search: 3 });
    expect(result.current).toMatchObject({ selected: 3, search: 3 });
  });

  it('writes the stored category to the URL when it has none', () => {
    const { result } = setup({ selected: 5, search: undefined });
    expect(result.current).toMatchObject({ selected: 5, search: 5 });
  });

  it('writes a selection made on the page to the URL', () => {
    const { result } = setup({ selected: 5, search: 5 });
    act(() => result.current.setSelected(7));
    expect(result.current).toMatchObject({ selected: 7, search: 7 });
  });

  it('follows a link to another category while on the page', () => {
    const { result } = setup({ selected: 5, search: 5 });
    act(() => result.current.setSearch(2));
    expect(result.current).toMatchObject({ selected: 2, search: 2 });
  });

  it('keeps Uncategorized (0)', () => {
    const { result } = setup({ selected: null, search: 0 });
    expect(result.current).toMatchObject({ selected: 0, search: 0 });
  });
});

describe('category_search_schema', () => {
  it('parses ids and drops invalid values', () => {
    expect(category_search_schema.parse({ category: '4' })).toEqual({ category: 4 });
    expect(category_search_schema.parse({ category: 'x' })).toEqual({ category: undefined });
    expect(category_search_schema.parse({})).toEqual({ category: undefined });
  });
});
