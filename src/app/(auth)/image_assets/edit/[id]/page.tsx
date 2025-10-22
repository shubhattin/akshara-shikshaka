import { z } from 'zod';
import { type Metadata } from 'next';
import { cache } from 'react';
import { getMetadata } from '~/components/tags/getPageMetaTags';
import { db } from '~/db/db';
import { text_lesson_words, text_lessons } from '~/db/schema';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { getCachedSession } from '~/lib/cache_server_route_data';
import { notFound, redirect } from 'next/navigation';
import { Provider as JotaiProvider } from 'jotai';
import EditImage from './EditImage';

type Props = { params: Promise<{ id: string }> };

const get_cached_image_data = cache(async (id: number) => {
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
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [id_str] = decodeURIComponent((await params).id).split(':');
  const id = z.coerce.number().int().parse(id_str);

  const image_data = await get_cached_image_data(id);

  return {
    ...getMetadata({
      title: image_data ? image_data.description + ' - Edit Image Asset' : 'Not Found',
      description: image_data ? image_data.description + ' - Edit Image Asset' : null
    })
  };
}

const MainEdit = async ({ params }: Props) => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin') redirect('/');

  const [id_str] = decodeURIComponent((await params).id).split(':');
  const id = z.coerce.number().int().parse(id_str);

  const image_data = await get_cached_image_data(id);
  if (!image_data) {
    notFound();
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="my-2 mb-4">
        <Link
          href="/image_assets"
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
};

export default MainEdit;
