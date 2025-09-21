import { z } from 'zod';
import { type Metadata } from 'next';
import { cache } from 'react';
import { getMetadata } from '~/components/tags/getPageMetaTags';
import { db } from '~/db/db';
import Link from 'next/link';
import AddEditTextDataWrapper from '~/components/pages/gesture_add_edit/AddEditTextGesture';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { getCachedSession } from '~/lib/cache_server_route_data';
import { redirect } from 'next/navigation';
import { Provider as JotaiProvider } from 'jotai';

type Props = { params: Promise<{ id: string }> };

const get_cached_text_data = cache(async (id: number) => {
  const text_data = await db.query.text_gestures.findFirst({
    where: (table, { eq }) => eq(table.id, id),
    columns: {
      id: true,
      uuid: true,
      text: true,
      gestures: true,
      font_family: true,
      font_size: true,
      text_center_offset: true,
      script_id: true,
      text_key: true
    }
  });
  return text_data;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [id_str] = decodeURIComponent((await params).id).split(':');
  const id = z.coerce.number().int().parse(id_str);

  const text_data = await get_cached_text_data(id);

  return {
    ...getMetadata({
      title: text_data ? text_data.text + ' - Edit Text Gesture' : 'Not Found',
      description: text_data ? text_data.text + ' - Edit Text Gesture' : null
    })
  };
}

const MainEdit = async ({ params }: Props) => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin') redirect('/');

  const [id_str] = decodeURIComponent((await params).id).split(':');
  const id = z.coerce.number().int().parse(id_str);

  const text_data = await get_cached_text_data(id);

  return (
    <div>
      <div className="my-2 mb-4 px-2">
        <Link href="/gestures/list" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Text Gesture List
        </Link>
      </div>
      {text_data ? (
        <JotaiProvider key={`edit_akdhara_page-${id}`}>
          <AddEditTextDataWrapper location="edit" text_data={text_data} />
        </JotaiProvider>
      ) : (
        <div>Text data not found</div>
      )}
    </div>
  );
};

export default MainEdit;
