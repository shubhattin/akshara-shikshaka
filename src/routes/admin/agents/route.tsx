import { createFileRoute } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import { AgentsLayout } from '~/components/pages/agents/AgentsLayout';

export const Route = createFileRoute('/admin/agents')({
  head: () =>
    routeHeadFromPageMeta({
      title: 'Agent | Akshara Shikshaka Admin',
      description: 'Internal AI agent for querying gestures, lessons and practice data.'
    }),
  component: AgentsLayout
});
