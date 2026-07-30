import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import z from 'zod';
import EditImage from './-EditImage';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { Provider as JotaiProvider } from 'jotai';
import { createServerFn } from '@tanstack/react-start';
import { adminServerFnMiddleware } from '@/lib/adminServerFn';
import { Effect } from 'effect';
import { dbRun } from '~/effect/database';
import { runLoaderEffect } from '~/effect/run';

const getImageAssetForEdit = Effect.fn('getImageAssetForEdit')(function* (id: number) {
  return yield* dbRun('get_image_asset_for_edit', async (db) =>
    db.query.image_assets.findFirst({
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
    })
  );
});

const loader$ = createServerFn({ method: 'GET' })
  .middleware([adminServerFnMiddleware])
  .inputValidator(z.object({ rawId: z.string().min(1) }))
  .handler(({ data }) =>
    runLoaderEffect(
      Effect.gen(function* () {
        const parsed = z.coerce.number().int().positive().safeParse(data.rawId);
        if (!parsed.success) {
          return { image_data: null };
        }
        const image_data = yield* getImageAssetForEdit(parsed.data);
        return { image_data };
      })
    )
  );

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
