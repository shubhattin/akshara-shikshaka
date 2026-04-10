import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { db } from '@/db/db';
import EditAudio from './-EditAudio';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { Provider as JotaiProvider } from 'jotai';

const get_cached_audio_data = async (id: number) => {
  const audio_data = await db.query.audio_assets.findFirst({
    where: (table, { eq }) => eq(table.id, id),
    columns: {
      id: true,
      description: true,
      s3_key: true,
      type: true,
      lang_id: true,
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

  return audio_data;
};

const loader$ = createServerFn({ method: 'GET' })
  .inputValidator((data: { rawId: string }) => data)
  .handler(async ({ data }) => {
    const id = z.coerce.number().int().parse(data.rawId);
    const audio_data = await get_cached_audio_data(id);
    return { audio_data };
  });

export const Route = createFileRoute('/(auth)/_auth/audio_assets/edit/$id')({
  loader: async ({ params }) => {
    const { audio_data } = await loader$({ data: { rawId: params.id } });
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
  const id = audio_data.id;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="my-2 mb-4">
        <Link
          to="/audio_assets"
          className="flex items-center gap-1 text-lg font-semibold text-muted-foreground hover:text-foreground"
        >
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Audio List
        </Link>
      </div>

      <JotaiProvider key={`edit_audio_asset_page-${id}`}>
        <EditAudio audio_data={audio_data} />
      </JotaiProvider>
    </div>
  );
}
