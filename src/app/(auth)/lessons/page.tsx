import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { IoMdAdd, IoMdArrowRoundBack } from 'react-icons/io';
import { Button } from '~/components/ui/button';
import { getCachedSession } from '~/lib/cache_server_route_data';
import ListLessons from './ListLessons';
import { cookies } from 'next/headers';
import { get_lesson_lang_id_from_cookie, LESSON_LANG_ID_COOKIE_KEY } from '~/state/cookie';
import { get_text_lesson_categories_func } from '~/api/routers/lesson_categories';

const List = async () => {
  const session = await getCachedSession();
  if (!session || session.user.role !== 'admin') redirect(`/`);

  const cookie = await cookies();
  const lang_id = get_lesson_lang_id_from_cookie(cookie.get(LESSON_LANG_ID_COOKIE_KEY)?.value);

  const lesson_categories = await get_text_lesson_categories_func(lang_id);

  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 flex items-center justify-start space-x-4 px-2">
        <Link href="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>
      <div className="mt-2 mb-5 flex items-center justify-center gap-4 px-2">
        <Link href="/lessons/add">
          <Button variant={'outline'} className="gap-2 text-lg font-semibold">
            <IoMdAdd className="size-5.5" /> Add
            <span className="font-bold text-yellow-600 dark:text-yellow-400">Lesson</span>
          </Button>
        </Link>
      </div>
      <ListLessons init_lang_id={lang_id} init_lesson_categories={lesson_categories} />
    </div>
  );
};
export default List;

export const metadata: Metadata = {
  title: 'Text Lesson List'
};
