import { dehydrate, hydrate } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { makeQueryClient, STALE_TIME } from './queryClient';

describe('query client', () => {
  it('creates isolated clients and hydrates prefetched data', () => {
    const serverQueryClient = makeQueryClient();
    const browserQueryClient = makeQueryClient();
    const queryKey = ['learn', 'categories', { lang_id: 1 }] as const;
    const categories = [{ id: 1, name: 'Basics' }];

    serverQueryClient.setQueryData(queryKey, categories);
    hydrate(browserQueryClient, dehydrate(serverQueryClient));

    expect(browserQueryClient).not.toBe(serverQueryClient);
    expect(browserQueryClient.getQueryData(queryKey)).toEqual(categories);
    expect(browserQueryClient.getDefaultOptions().queries?.staleTime).toBe(STALE_TIME);
  });
});
