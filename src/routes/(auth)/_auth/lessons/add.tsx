import { createFileRoute, Link } from '@tanstack/react-router';
import { Provider as JotaiProvider } from 'jotai';
import { IoMdArrowRoundBack } from 'react-icons/io';
import TextLessonAddEdit from '~/components/pages/lesson_add_edit/TextLessonAddEdit';
import { lang_list_obj, script_list_obj } from '~/state/lang_list';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';

export const Route = createFileRoute('/(auth)/_auth/lessons/add')({
  head: () => routeHeadFromPageMeta({ title: 'Add Text Lesson' }),
  component: LessonsAddRoute
});

function LessonsAddRoute() {
  const text_lesson_info = {
    id: undefined as number | undefined,
    uuid: undefined as string | undefined,
    text: '',
    text_key: '',
    lang_id: lang_list_obj['Sanskrit'],
    base_word_script_id: script_list_obj['Devanagari'],
    order: null,
    category_id: null,
    audio_id: null,
    category: undefined
  };

  return (
    <div>
      <div className="my-2 mb-4 px-2">
        <Link to="/lessons" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Text Lesson List
        </Link>
      </div>
      <JotaiProvider key={`add_lesson_page-${crypto.randomUUID()}`}>
        <TextLessonAddEdit
          location="add"
          gestures_list={[]}
          words={[]}
          text_lesson_info={{
            ...text_lesson_info,
            id: text_lesson_info.id!,
            uuid: text_lesson_info.uuid!
          }}
        />
      </JotaiProvider>
    </div>
  );
}
