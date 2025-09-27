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
import EditAudio from './EditAudio';

type Props = { params: Promise<{ id: string }> };

const get_cached_audio_data = cache(async (id: number) => {
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
    }
  });

  // Get associated words separately for better structure
  const associated_words = await db.query.text_lesson_words.findMany({
    where: (table, { eq }) => eq(table.audio_id, id),
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
  });

  return { audio_data, associated_words };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [id_str] = decodeURIComponent((await params).id).split(':');
  const id = z.coerce.number().int().parse(id_str);

  const { audio_data } = await get_cached_audio_data(id);

  return {
    ...getMetadata({
      title: audio_data ? audio_data.description + ' - Edit Audio Asset' : 'Not Found',
      description: audio_data ? audio_data.description + ' - Edit Audio Asset' : null
    })
  };
}

const MainEdit = async ({ params }: Props) => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin') redirect('/');

  const [id_str] = decodeURIComponent((await params).id).split(':');
  const id = z.coerce.number().int().parse(id_str);

  const { audio_data, associated_words } = await get_cached_audio_data(id);
  if (!audio_data) {
    notFound();
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <div className="my-2 mb-4">
        <Link
          href="/audio_assets"
          className="flex items-center gap-1 text-lg font-semibold text-muted-foreground hover:text-foreground"
        >
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Audio List
        </Link>
      </div>

      <JotaiProvider key={`edit_audio_asset_page-${id}`}>
        <EditAudio audio_data={audio_data} words={associated_words} />
      </JotaiProvider>
    </div>
  );
};

export default MainEdit;
