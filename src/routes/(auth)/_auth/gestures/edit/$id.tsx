import { createFileRoute, notFound } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import GestureEditClient from './-GestureEditClient';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { gesture_categories, gesture_text_key_category_join, text_gestures } from '@/db/schema';
import { db } from '@/db/db';
import { eq } from 'drizzle-orm';

const get_cached_text_data = async (id: number) => {
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
};

const loader$ = createServerFn({ method: 'GET' })
  .inputValidator((data: { rawId: string }) => data)
  .handler(async ({ data }) => {
    const id = z.coerce.number().int().parse(data.rawId);
    const text_data = await get_cached_text_data(id);

    return { text_data, id };
  });

export const Route = createFileRoute('/(auth)/_auth/gestures/edit/$id')({
  loader: async ({ params }) => {
    const { text_data, id } = await loader$({ data: { rawId: params.id } });
    if (!text_data) throw notFound();
    return { text_data, id };
  },
  head: ({ loaderData }) =>
    routeHeadFromPageMeta({
      title: loaderData?.text_data
        ? `${loaderData.text_data.text} - Edit Text Gesture`
        : 'Edit Text Gesture',
      description: loaderData?.text_data ? `${loaderData.text_data.text} - Edit Text Gesture` : null
    }),
  component: GesturesEditRoute
});

function GesturesEditRoute() {
  const { text_data, id } = Route.useLoaderData();

  return <GestureEditClient text_data={text_data} id={id} />;
}
