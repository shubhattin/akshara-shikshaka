import { createFileRoute, redirect } from '@tanstack/react-router';
import { getUserSession$ } from '~/lib/get_auth_from_cookie';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import DashboardPage from './-DashboardPage';

export const Route = createFileRoute('/(public)/dashboard')({
  beforeLoad: async () => {
    const session = await getUserSession$();
    if (!session?.user) {
      throw redirect({ to: '/' });
    }
    return { session };
  },
  head: () =>
    routeHeadFromPageMeta({
      title: 'Dashboard | Akshara Shikshaka',
      description: 'Your gesture practice stats, accuracy, and recent recordings.'
    }),
  component: DashboardPage
});
