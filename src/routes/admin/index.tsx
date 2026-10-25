import { createFileRoute } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import AdminPage from './-AdminPage';

export const Route = createFileRoute('/admin/')({
  head: () =>
    routeHeadFromPageMeta({
      title: 'Admin | Akshara Shikshaka',
      description: 'Manage lessons, gestures, analytics, images, and audio.'
    }),
  component: AdminPage
});
