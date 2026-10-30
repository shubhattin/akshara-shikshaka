import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { useTRPCClient } from '~/api/client';
import type { AppRouter } from '~/api/trpc_router';

export type GesturePreviewRow =
  inferRouterOutputs<AppRouter>['text_gestures']['get_gesture_previews'][number];

type TRPCClient = ReturnType<typeof useTRPCClient>;
type Waiter = { resolve: (row: GesturePreviewRow | null) => void; reject: (err: Error) => void };

/** Max ids per request, as allowed by `get_gesture_previews` */
const BATCH_SIZE = 50;
/** Cards scrolled into view within this window share one request */
const BATCH_WINDOW_MS = 30;

/**
 * Collects preview requests for single ids and loads them in batches: a grid of cards each asking
 * for its own gesture makes one database query instead of one per card.
 */
function createPreviewBatcher(client: TRPCClient) {
  let pending = new Map<number, Waiter[]>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    const batch = pending;
    pending = new Map();
    timer = null;
    const ids = [...batch.keys()];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      client.text_gestures.get_gesture_previews.query({ ids: chunk }).then(
        (rows) => {
          const byId = new Map(rows.map((row) => [row.id, row]));
          for (const id of chunk)
            for (const w of batch.get(id) ?? []) w.resolve(byId.get(id) ?? null);
        },
        (err: Error) => {
          for (const id of chunk) for (const w of batch.get(id) ?? []) w.reject(err);
        }
      );
    }
  };

  return (id: number) =>
    new Promise<GesturePreviewRow | null>((resolve, reject) => {
      pending.set(id, [...(pending.get(id) ?? []), { resolve, reject }]);
      timer ??= setTimeout(flush, BATCH_WINDOW_MS);
    });
}

const batchers = new WeakMap<TRPCClient, ReturnType<typeof createPreviewBatcher>>();

/**
 * Strokes of one gesture for `GesturePreview`, loaded only once `enabled` (e.g. scrolled into
 * view). `version` (the gesture's `updated_at`) is part of the key, so an edited gesture is
 * refetched while unchanged ones stay cached.
 */
export function useGesturePreviewById(id: number, version: Date | string, enabled: boolean) {
  const client = useTRPCClient();
  let load = batchers.get(client);
  if (!load) batchers.set(client, (load = createPreviewBatcher(client)));
  const fetchOne = load;
  return useQuery({
    queryKey: ['gesture_preview', id, new Date(version).getTime()],
    queryFn: () => fetchOne(id),
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60_000
  });
}

/** True once the element has come near the viewport (stays true, so data is fetched once). */
export function useInViewOnce<T extends Element>(rootMargin = '200px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView] as const;
}
