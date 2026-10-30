import { useEffect, useRef } from 'react';
import { z } from 'zod';

/** `?category=<id>` on the admin lesson/gesture lists; `0` is "Uncategorized" */
export const category_search_schema = z.object({
  category: z.coerce.number().int().min(0).optional().catch(undefined)
});

/**
 * Keeps the selected category and `?category=` in step, so a list can be linked to. The URL wins
 * when it changes (first load, a link to another category); a selection made on the page is
 * written back to it.
 */
export function useCategorySearchParam({
  selected,
  setSelected,
  searchCategory,
  setSearchCategory
}: {
  selected: number | null;
  setSelected: (id: number) => void;
  searchCategory: number | undefined;
  setSearchCategory: (id: number) => void;
}) {
  const lastSearch = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (searchCategory !== lastSearch.current) {
      lastSearch.current = searchCategory;
      if (searchCategory !== undefined && searchCategory !== selected) {
        setSelected(searchCategory);
        return;
      }
    }
    if (selected !== null && selected !== searchCategory) {
      lastSearch.current = selected;
      setSearchCategory(selected);
    }
  }, [searchCategory, selected, setSelected, setSearchCategory]);
}
