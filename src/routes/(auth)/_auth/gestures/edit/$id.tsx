import { createFileRoute, notFound } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import GestureEditClient from './-GestureEditClient';
import type { AgentPanelView } from '~/components/pages/agents/gesture_hub/GestureAgentPanel';
import { z } from 'zod';
import { gesture_text_key_lesson_category_join, lesson_categories } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createServerFn } from '@tanstack/react-start';
import { adminServerFnMiddleware } from '@/lib/adminServerFn';
import { Effect } from 'effect';
import { dbRunHttp } from '~/effect/database';
import { runLoaderEffect } from '~/effect/run';

const getTextGestureForEdit = Effect.fn('getTextGestureForEdit')(function* (id: number) {
  return yield* dbRunHttp('get_text_gesture_for_edit', async (db) => {
    const text_data = await db.query.text_gestures.findFirst({
      where: (tbl, { eq }) => eq(tbl.id, id)
    });
    if (!text_data) return null;

    // one lesson category per language, matched by text_key
    const categories = await db
      .select({
        id: lesson_categories.id,
        name: lesson_categories.name,
        lang_id: lesson_categories.lang_id
      })
      .from(gesture_text_key_lesson_category_join)
      .innerJoin(
        lesson_categories,
        eq(gesture_text_key_lesson_category_join.lesson_category_id, lesson_categories.id)
      )
      .where(eq(gesture_text_key_lesson_category_join.gesture_text_key, text_data.text_key));

    return { ...text_data, categories };
  });
});

const loader$ = createServerFn({ method: 'GET' })
  .middleware([adminServerFnMiddleware])
  .validator(z.object({ rawId: z.string().min(1) }))
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

const AGENT_VIEW = /^(list|history|review|chat:[\w-]{1,64})$/;

const isAgentView = (value: string): value is AgentPanelView => AGENT_VIEW.test(value);

const edit_search_schema = z.object({
  /** The agent panel beside the editor: list | history | review | chat:<id> */
  agent: z
    .string()
    .optional()
    .catch(undefined)
    .transform((value): AgentPanelView | undefined =>
      value !== undefined && isAgentView(value) ? value : undefined
    )
});

export const Route = createFileRoute('/(auth)/_auth/gestures/edit/$id')({
  validateSearch: edit_search_schema,
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
  const { agent } = Route.useSearch();

  return <GestureEditClient text_data={text_data} id={id} agent={agent} />;
}
