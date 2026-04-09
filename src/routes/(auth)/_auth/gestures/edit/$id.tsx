import { createFileRoute, notFound } from '@tanstack/react-router';
import GestureEditClient from '~/components/pages/gesture_add_edit/GestureEditClient';
import { fetchGestureEditData } from '~/lib/server/route-data.functions';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';

export const Route = createFileRoute('/(auth)/_auth/gestures/edit/$id')({
  loader: async ({ params }) => {
    const { text_data, id } = await fetchGestureEditData({ data: { rawId: params.id } });
    if (!text_data) throw notFound();
    return { text_data, id };
  },
  head: ({ loaderData }) =>
    routeHeadFromPageMeta({
      title: loaderData?.text_data
        ? `${loaderData.text_data.text} - Edit Text Gesture`
        : 'Edit Text Gesture',
      description: loaderData?.text_data ? `${loaderData.text_data.text} - Edit Text Gesture` : null
    }),
  component: GesturesEditRoute
});

function GesturesEditRoute() {
  const { text_data, id } = Route.useLoaderData();
  return (
    <GestureEditClient
      id={id}
      text_data={
        text_data as typeof text_data & {
          id: number;
          uuid: string;
        }
      }
    />
  );
}
