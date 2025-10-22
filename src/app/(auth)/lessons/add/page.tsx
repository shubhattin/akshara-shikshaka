import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCachedSession } from '~/lib/cache_server_route_data';
import TextLessonAddEdit from '~/components/pages/lesson_add_edit/TextLessonAddEdit';
import { IoMdArrowRoundBack } from 'react-icons/io';
import Link from 'next/link';
import { Provider as JotaiProvider } from 'jotai';
import { lang_list_obj, script_list_obj } from '~/state/lang_list';

const List = async () => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin') redirect('/');

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
        <Link href="/lessons" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Text Lesson List
        </Link>
      </div>
      <JotaiProvider key={`add_lesson_page-${crypto.randomUUID()}`}>
        <TextLessonAddEdit
          location="add"
          gesture_ids={[]}
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
};
export default List;

export const metadata: Metadata = {
  title: 'Add Text Gesture'
};
