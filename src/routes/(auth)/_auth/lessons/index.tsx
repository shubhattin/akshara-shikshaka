import { createFileRoute } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import { Link } from '@tanstack/react-router';
import { IoMdArrowRoundBack } from 'react-icons/io';
import { Button } from '~/components/ui/button';
import { IoMdAdd } from 'react-icons/io';
import ListLessons from './-ListLessons';
import AddLessonDialog from './-AddLessonDialog';
import { getCookie } from '@tanstack/react-start/server';
import { get_lesson_lang_id_from_cookie, LESSON_LANG_ID_COOKIE_KEY } from '@/state/cookie';
import { createServerFn } from '@tanstack/react-start';
import { adminServerFnMiddleware } from '@/lib/adminServerFn';
import { Effect } from 'effect';
import { getLessonCategories } from '~/api/routers/lesson_categories';
import { runLoaderEffect } from '~/effect/run';
import { useState } from 'react';

const loadLessonsIndex = Effect.fn('loadLessonsIndex')(function* () {
  const lang_id = get_lesson_lang_id_from_cookie(getCookie(LESSON_LANG_ID_COOKIE_KEY));
  const lesson_categories = yield* getLessonCategories({ lang_id });
  return { init_lang_id: lang_id, init_lesson_categories: lesson_categories };
});

const loader$ = createServerFn({ method: 'GET' })
  .middleware([adminServerFnMiddleware])
  .handler(() => runLoaderEffect(loadLessonsIndex()));

export const Route = createFileRoute('/(auth)/_auth/lessons/')({
  loader: async () => await loader$(),
  head: () => routeHeadFromPageMeta({ title: 'Text Lessons' }),
  component: LessonsIndexRoute
});

function LessonsIndexRoute() {
  const { init_lang_id, init_lesson_categories } = Route.useLoaderData();
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 flex items-center justify-start gap-4 px-2">
        <Link to="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>
      <div className="mt-2 mb-5 flex items-center justify-center gap-4 px-2">
        <Button
          variant={'outline'}
          className="gap-2 text-lg font-semibold"
          onClick={() => setAddOpen(true)}
        >
          <IoMdAdd className="size-5.5" /> Add
          <span className="font-bold text-yellow-600 dark:text-yellow-400">Lesson</span>
        </Button>
      </div>
      <AddLessonDialog open={addOpen} onOpenChange={setAddOpen} init_lang_id={init_lang_id} />
      <ListLessons init_lang_id={init_lang_id} init_lesson_categories={init_lesson_categories} />
    </div>
  );
}
