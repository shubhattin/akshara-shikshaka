import { createFileRoute } from '@tanstack/react-router';
import AdminListGestures from '~/components/pages/admin/AdminListGestures';
import { fetchGesturesListData } from '~/lib/server/route-data.functions';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';

export const Route = createFileRoute('/(auth)/_auth/gestures/')({
  loader: async () => await fetchGesturesListData(),
  head: () => routeHeadFromPageMeta({ title: 'Text Gesture List' }),
  component: GesturesIndexRoute
});

function GesturesIndexRoute() {
  const { init_script_id, init_gesture_categories } = Route.useLoaderData();
  return (
    <AdminListGestures
      init_script_id={init_script_id}
      init_gesture_categories={init_gesture_categories}
    />
  );
}
