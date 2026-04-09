import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { Provider as JotaiProvider } from 'jotai';
import { IoMdArrowRoundBack } from 'react-icons/io';
import TextLessonAddEdit from '~/components/pages/lesson_add_edit/TextLessonAddEdit';
import { fetchLessonEditData } from '~/lib/server/route-data.functions';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';

export const Route = createFileRoute('/(auth)/_auth/lessons/edit/$id')({
  loader: async ({ params }) => {
    const { text_lesson_info } = await fetchLessonEditData({ data: { rawId: params.id } });
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
