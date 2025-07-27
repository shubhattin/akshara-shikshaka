import { z } from 'zod';
import { type Metadata } from 'next';
import { cache } from 'react';
import { getMetadata } from '~/components/tags/getPageMetaTags';
import { db } from '~/db/db';
import CanvasComponent from '~/components/pages/practice/PracticeCanvasComponent';
import Link from 'next/link';
import AddEditTextData from '~/components/pages/add_edit/AddEditTextData';
import { IoMdArrowRoundBack } from 'react-icons/io';

type Props = { params: Promise<{ id: string }> };

const get_cached_text_data = cache(async (id: number) => {
  const text_data = await db.query.text_data.findFirst({
    where: (table, { eq }) => eq(table.id, id),
    columns: {
      id: true,
      uuid: true,
      svg: true,
      text: true
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
      title: text_data ? text_data.text + ' - Edit' : 'Not Found',
      description: text_data ? text_data.text + ' - Edit' : null
    })
  };
}

const MainEdit = async ({ params }: Props) => {
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
      <AddEditTextData location="add" text_data={text_data!} />
    </div>
  );
};

export default MainEdit;
