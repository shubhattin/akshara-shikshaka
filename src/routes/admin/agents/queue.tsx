import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { QUEUE_TABS } from '~/agents/review_queue';
import { ReviewQueue } from '~/components/pages/agents/gesture_hub/ReviewQueue';

/** Filters live in the URL, so a reload or a shared link keeps them. */
const queue_search_schema = z.object({
  tab: z.enum(QUEUE_TABS).optional(),
  /** Script id, or `all`; Devanagari when absent */
  script: z.union([z.literal('all'), z.coerce.number().int()]).optional(),
  /** Lesson category id, `none` (uncategorized) or `all` (default) */
  category: z.union([z.literal('all'), z.literal('none'), z.coerce.number().int()]).optional()
});

export const Route = createFileRoute('/admin/agents/queue')({
  validateSearch: queue_search_schema,
  component: RouteComponent
});

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ReviewQueue
      search={search}
      setSearch={(next) =>
        void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
      }
    />
  );
}
