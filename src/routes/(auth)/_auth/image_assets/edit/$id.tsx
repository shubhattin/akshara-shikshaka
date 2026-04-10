import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import { db } from '@/db/db';
import { createAdminServerFn } from '@/lib/adminServerFn';
import z from 'zod';
import EditImage from './-EditImage';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { Provider as JotaiProvider } from 'jotai';

const get_cached_image_data = async (id: number) => {
  const image_data = await db.query.image_assets.findFirst({
    where: (table, { eq }) => eq(table.id, id),
    columns: {
      id: true,
      description: true,
      s3_key: true,
      height: true,
      width: true,
      created_at: true,
      updated_at: true
    },
    with: {
      words: {
        columns: {
          id: true,
          word: true,
          text_lesson_id: true,
          order: true
        },
        with: {
          lesson: {
            columns: {
              text: true
            }
          }
        },
        orderBy: (tbl, { asc }) => [asc(tbl.text_lesson_id), asc(tbl.order)]
      }
    }
  });

  return image_data;
};

const loader$ = createAdminServerFn({ method: 'GET' })
  .inputValidator((data: { rawId: string }) => data)
  .handler(async ({ data }) => {
    const id = z.coerce.number().int().parse(data.rawId);
    const image_data = await get_cached_image_data(id);
    return { image_data };
  });

export const Route = createFileRoute('/(auth)/_auth/image_assets/edit/$id')({
  loader: async ({ params }) => {
    const { image_data } = await loader$({ data: { rawId: params.id } });
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
  const id = image_data.id;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="my-2 mb-4">
        <Link
          to="/image_assets"
          className="flex items-center gap-1 text-lg font-semibold text-muted-foreground hover:text-foreground"
        >
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Image List
        </Link>
      </div>

      <JotaiProvider key={`edit_image_asset_page-${id}`}>
        <EditImage image_data={image_data} />
      </JotaiProvider>
    </div>
  );
}
