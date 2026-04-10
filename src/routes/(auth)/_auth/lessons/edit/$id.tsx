import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { Provider as JotaiProvider } from 'jotai';
import { IoMdArrowRoundBack } from 'react-icons/io';
import TextLessonAddEdit from '~/components/pages/lesson_add_edit/TextLessonAddEdit';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import { db } from '@/db/db';
import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';

const get_cached_text_lesson_info = async (id: number) => {
  const text_lesson_info = await db.query.text_lessons.findFirst({
    where: (tbl, { eq }) => eq(tbl.id, id),
    columns: {
      id: true,
      uuid: true,
      lang_id: true,
      text: true,
      text_key: true,
      base_word_script_id: true,
      order: true,
      category_id: true,
      audio_id: true
    },
    orderBy: (tbl, { asc }) => [asc(tbl.text)],
    with: {
      category: {
        columns: {
          id: true,
          name: true
        }
      },
      gestures: {
        columns: {
          text_gesture_id: true
        },
        with: {
          text_gesture: {
            columns: {
              id: true,
              text: true,
              script_id: true
            }
          }
        }
      },
      words: {
        columns: {
          id: true,
          word: true,
          image_id: true,
          audio_id: true,
          order: true
        },
        orderBy: (tbl, { asc }) => [asc(tbl.order)]
      }
    }
  });
  return text_lesson_info;
};

const loader$ = createServerFn({ method: 'GET' })
  .inputValidator((data: { rawId: string }) => data)
  .handler(async ({ data }) => {
    const id = z.coerce.number().int().parse(data.rawId);
    const text_lesson_info = await get_cached_text_lesson_info(id);
    return { text_lesson_info };
  });

export const Route = createFileRoute('/(auth)/_auth/lessons/edit/$id')({
  loader: async ({ params }) => {
    const { text_lesson_info } = await loader$({ data: { rawId: params.id } });
    if (!text_lesson_info) throw notFound();
    return { text_lesson_info };
  },
  head: ({ loaderData }) =>
    routeHeadFromPageMeta({
      title: loaderData?.text_lesson_info
        ? `${loaderData.text_lesson_info.text} - Edit Text Lesson`
        : 'Edit Text Lesson',
      description: loaderData?.text_lesson_info
        ? `${loaderData.text_lesson_info.text} - Edit Text Lesson`
        : null
    }),
  component: LessonsEditRoute
});

function LessonsEditRoute() {
  const { text_lesson_info } = Route.useLoaderData();
  const id = text_lesson_info.id;

  return (
    <div>
      <div className="my-2 mb-4 px-2">
        <Link to="/lessons" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Text Lesson List
        </Link>
      </div>
      <JotaiProvider key={`edit-lesson-${id}`}>
        <TextLessonAddEdit
          location="edit"
          gestures_list={text_lesson_info.gestures.map((g) => g.text_gesture)}
          words={text_lesson_info.words}
          text_lesson_info={{
            text_key: text_lesson_info.text_key,
            base_word_script_id: text_lesson_info.base_word_script_id,
            lang_id: text_lesson_info.lang_id,
            text: text_lesson_info.text,
            id: text_lesson_info.id,
            uuid: text_lesson_info.uuid,
            order: text_lesson_info.order,
            category_id: text_lesson_info.category_id,
            audio_id: text_lesson_info.audio_id,
            category: text_lesson_info.category
          }}
        />
      </JotaiProvider>
    </div>
  );
}
