import { createFileRoute, notFound } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import GestureEditClient from './-GestureEditClient';
import { z } from 'zod';
import { gesture_categories, gesture_text_key_category_join, text_gestures } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createServerFn } from '@tanstack/react-start';
import { adminServerFnMiddleware } from '@/lib/adminServerFn';
import { Effect } from 'effect';
import { dbRun } from '~/effect/database';
import { runLoaderEffect } from '~/effect/run';

const getTextGestureForEdit = Effect.fn('getTextGestureForEdit')(function* (id: number) {
  return yield* dbRun('get_text_gesture_for_edit', async (db) => {
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
    if (!text_data_) return null;

    return {
      ...text_data_.text_gestures,
      category: text_data_.gesture_categories
        ? {
            name: text_data_.gesture_categories.name,
            id: text_data_.gesture_categories.id
          }
        : null
    };
  });
});

const loader$ = createServerFn({ method: 'GET' })
  .middleware([adminServerFnMiddleware])
  .inputValidator(z.object({ rawId: z.string().min(1) }))
  .handler(({ data }) =>
    runLoaderEffect(
      Effect.gen(function* () {
        const parsed = z.coerce.number().int().positive().safeParse(data.rawId);
        if (!parsed.success) {
          return { text_data: null, id: null };
        }
        const id = parsed.data;
        const text_data = yield* getTextGestureForEdit(id);
        return { text_data, id };
      })
    )
  );

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
