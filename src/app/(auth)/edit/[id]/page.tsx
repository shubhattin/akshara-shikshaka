import { z } from 'zod';
import { type Metadata } from 'next';
import { cache } from 'react';
import { getMetadata } from '~/components/tags/getPageMetaTags';
import { db } from '~/db/db';
import Link from 'next/link';
import AddEditTextDataWrapper from '~/components/pages/add_edit/AddEditTextData';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { getCachedSession } from '~/lib/cache_server_route_data';
import { redirect } from 'next/navigation';
import { Provider as JotaiProvider } from 'jotai';
import { FontFamily } from '~/state/font_list';

type Props = { params: Promise<{ id: string }> };

const get_cached_text_data = cache(async (id: number) => {
  const text_data = await db.query.text_data.findFirst({
    where: (table, { eq }) => eq(table.id, id),
    columns: {
      id: true,
      uuid: true,
      text: true,
      gestures: true,
      font_family: true,
      font_size: true,
      text_center_offset: true,
      script_id: true
    }
  });
  const data = {
    id: text_data!.id,
    uuid: text_data!.uuid,
    text: text_data!.text,
    gestures: text_data!.gestures,
    fontFamily: text_data!.font_family as FontFamily,
    fontSize: text_data!.font_size,
    textCenterOffset: text_data!.text_center_offset,
    scriptID: text_data!.script_id
  };
  return data as typeof data | undefined;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [id_str] = decodeURIComponent((await params).id).split(':');
  const id = z.coerce.number().int().parse(id_str);

  const text_data = await get_cached_text_data(id);

  return {
    ...getMetadata({
      title: text_data ? text_data.text + ' - Edit' : 'Not Found',
      description: text_data ? text_data.text + ' - Edit' : null
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
        <Link href="/list" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          सूची
        </Link>
      </div>
      {text_data ? (
        <JotaiProvider key={`edit_akdhara_page-${id}`}>
          <AddEditTextDataWrapper
            location="edit"
            text_data={{ ...text_data, fontFamily: text_data.fontFamily as FontFamily }}
          />
        </JotaiProvider>
      ) : (
        <div>Text data not found</div>
      )}
    </div>
  );
};

export default MainEdit;
