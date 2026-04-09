import { createFileRoute, notFound } from '@tanstack/react-router';
import AdminEditImage from '~/components/pages/admin/AdminEditImage';
import { fetchImageEditData } from '~/lib/server/route-data.functions';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';

export const Route = createFileRoute('/(auth)/_auth/image_assets/edit/$id')({
  loader: async ({ params }) => {
    const { image_data } = await fetchImageEditData({ data: { rawId: params.id } });
    if (!image_data) throw notFound();
    return { image_data };
  },
  head: ({ loaderData }) =>
    routeHeadFromPageMeta({
      title: loaderData?.image_data
        ? `${loaderData.image_data.description} - Edit Image Asset`
        : 'Edit Image Asset',
      description: loaderData?.image_data
        ? `${loaderData.image_data.description} - Edit Image Asset`
        : null
    }),
  component: ImageEditRoute
});

function ImageEditRoute() {
  const { image_data } = Route.useLoaderData();
  return <AdminEditImage image_data={image_data} />;
}
