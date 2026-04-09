import { createFileRoute, notFound } from '@tanstack/react-router';
import AdminEditAudio from '~/components/pages/admin/AdminEditAudio';
import { fetchAudioEditData } from '~/lib/server/route-data.functions';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';

export const Route = createFileRoute('/(auth)/_auth/audio_assets/edit/$id')({
  loader: async ({ params }) => {
    const { audio_data } = await fetchAudioEditData({ data: { rawId: params.id } });
    if (!audio_data) throw notFound();
    return { audio_data };
  },
  head: ({ loaderData }) =>
    routeHeadFromPageMeta({
      title: loaderData?.audio_data
        ? `${loaderData.audio_data.description} - Edit Audio Asset`
        : 'Edit Audio Asset',
      description: loaderData?.audio_data
        ? `${loaderData.audio_data.description} - Edit Audio Asset`
        : null
    }),
  component: AudioEditRoute
});

function AudioEditRoute() {
  const { audio_data } = Route.useLoaderData();
  return <AdminEditAudio audio_data={audio_data} />;
}
