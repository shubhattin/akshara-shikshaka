import { z } from 'zod';
import { type Metadata } from 'next';
import { cache } from 'react';
import { getMetadata } from '~/components/tags/getPageMetaTags';
import { db } from '~/db/db';
import Practice from '~/components/pages/practice/Practice';

type Props = { params: Promise<{ id: string }> };

const get_cached_text_data = cache(async (id: number) => {
  const text_data = await db.query.text_data.findFirst({
    where: (table, { eq }) => eq(table.id, id),
    columns: {
      id: true,
      uuid: true,
      text: true,
      gestures: true
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
      title: text_data ? text_data.text + ' - Aksara' : 'Not Found',
      description: text_data ? text_data.text + ' - Practice' : null
    })
  };
}

const MainEdit = async ({ params }: Props) => {
  const [id_str] = decodeURIComponent((await params).id).split(':');
  const id = z.coerce.number().int().parse(id_str);

  const text_data = await get_cached_text_data(id);

  if (!text_data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <div className="text-center text-muted-foreground">Text data not found.</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <Practice
        text_data={{
          ...text_data,
          gestures: text_data.gestures
        }}
      />
    </div>
  );
};

export default MainEdit;
