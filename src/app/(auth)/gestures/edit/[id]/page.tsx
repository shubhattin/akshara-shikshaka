import { z } from 'zod';
import { type Metadata } from 'next';
import { cache } from 'react';
import { getMetadata } from '~/components/tags/getPageMetaTags';
import { db } from '~/db/db';
import { getCachedSession } from '~/lib/cache_server_route_data';
import { notFound, redirect } from 'next/navigation';
import GestureEditClient from './GestureEditClient';
import { gesture_categories, gesture_text_key_category_join, text_gestures } from '~/db/schema';
import { eq } from 'drizzle-orm';

type Props = { params: Promise<{ id: string }> };

const get_cached_text_data = cache(async (id: number) => {
  const [text_data_] = await db
    .select()
    .from(text_gestures)
    .leftJoin(
      gesture_text_key_category_join,
      eq(text_gestures.text_key, gesture_text_key_category_join.gesture_text_key)
    )
    .leftJoin(
      gesture_categories,
      eq(gesture_text_key_category_join.category_id, gesture_categories.id)
    )
    .where(eq(text_gestures.id, id))
    .limit(1);
  const text_data = {
    ...text_data_.text_gestures,
    category: text_data_.gesture_categories
      ? {
          name: text_data_.gesture_categories.name,
          id: text_data_.gesture_categories.id
        }
      : null
  };
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
  if (!text_data) {
    notFound();
  }
  return <GestureEditClient text_data={text_data} id={id} />;
};

export default MainEdit;
