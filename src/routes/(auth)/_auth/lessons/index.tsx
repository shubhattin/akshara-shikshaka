import { createFileRoute } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import { Link } from '@tanstack/react-router';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { Button } from '~/components/ui/button';
import { IoMdAdd } from 'react-icons/io';
import ListLessons from './-ListLessons';
import { getCookie } from '@tanstack/react-start/server';
import { get_lesson_lang_id_from_cookie, LESSON_LANG_ID_COOKIE_KEY } from '@/state/cookie';
import { CACHE } from '@/api/cache';
import { createServerFn } from '@tanstack/react-start';

const loader$ = createServerFn({ method: 'GET' }).handler(async () => {
  const lang_id = get_lesson_lang_id_from_cookie(getCookie(LESSON_LANG_ID_COOKIE_KEY));

  const lesson_categories = await CACHE.lessons.category_list.get({ lang_id });
  return { init_lang_id: lang_id, init_lesson_categories: lesson_categories };
});

export const Route = createFileRoute('/(auth)/_auth/lessons/')({
  loader: async () => await loader$(),
  head: () => routeHeadFromPageMeta({ title: 'Text Lessons' }),
  component: LessonsIndexRoute
});

function LessonsIndexRoute() {
  const { init_lang_id, init_lesson_categories } = Route.useLoaderData();

  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 flex items-center justify-start space-x-4 px-2">
        <Link to="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>
      <div className="mt-2 mb-5 flex items-center justify-center gap-4 px-2">
        <Link to="/lessons/add">
          <Button variant={'outline'} className="gap-2 text-lg font-semibold">
            <IoMdAdd className="size-5.5" /> Add
            <span className="font-bold text-yellow-600 dark:text-yellow-400">Lesson</span>
          </Button>
        </Link>
      </div>
      <ListLessons init_lang_id={init_lang_id} init_lesson_categories={init_lesson_categories} />
    </div>
  );
}
