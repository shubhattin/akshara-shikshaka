import { createFileRoute } from '@tanstack/react-router';
import AdminListLessons from '~/components/pages/admin/AdminListLessons';
import { fetchLessonsListData } from '~/lib/server/route-data.functions';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';

export const Route = createFileRoute('/(auth)/_auth/lessons/')({
  loader: async () => await fetchLessonsListData(),
  head: () => routeHeadFromPageMeta({ title: 'Text Lessons' }),
  component: LessonsIndexRoute
});

function LessonsIndexRoute() {
  const { init_lang_id } = Route.useLoaderData();
  return <AdminListLessons init_lang_id={init_lang_id} />;
}
