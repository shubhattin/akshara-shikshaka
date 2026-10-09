import { createFileRoute, redirect } from '@tanstack/react-router';
import { getUserSession$ } from '~/lib/get_auth_from_cookie';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import AdminPage from './-AdminPage';

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const session = await getUserSession$();
    if (!session?.user || session.user.role !== 'admin') {
      throw redirect({ to: '/' });
    }
    return { session };
  },
  head: () =>
    routeHeadFromPageMeta({
      title: 'Admin | Akshara Shikshaka',
      description: 'Manage lessons, gestures, analytics, images, and audio.'
    }),
  component: AdminPage
});
