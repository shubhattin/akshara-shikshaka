import { createFileRoute, Link } from '@tanstack/react-router';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import { IoMdAdd, IoMdArrowRoundBack } from 'react-icons/io';
import { Button } from '~/components/ui/button';
import { getCookie } from '@tanstack/react-start/server';
import { get_script_id_from_cookie, SCRIPT_ID_COOKIE_KEY } from '~/state/cookie';
import ListGestures from './-ListGestures';
import { createServerFn } from '@tanstack/react-start';
import { adminServerFnMiddleware } from '@/lib/adminServerFn';
import { Effect } from 'effect';
import { getGestureCategories } from '~/effect/workflows/text_gestures';
import { runLoaderEffect } from '~/effect/run';

const loadGesturesIndex = Effect.fn('loadGesturesIndex')(function* () {
  const script_id = get_script_id_from_cookie(getCookie(SCRIPT_ID_COOKIE_KEY));
  const gesture_categories = yield* getGestureCategories();
  return { init_script_id: script_id, init_gesture_categories: gesture_categories };
});

const loader$ = createServerFn({ method: 'GET' })
  .middleware([adminServerFnMiddleware])
  .handler(() => runLoaderEffect(loadGesturesIndex()));

export const Route = createFileRoute('/(auth)/_auth/gestures/')({
  loader: async () => await loader$(),
  head: () => routeHeadFromPageMeta({ title: 'Text Gesture List' }),
  component: GesturesIndexRoute
});

function GesturesIndexRoute() {
  const { init_script_id, init_gesture_categories } = Route.useLoaderData();

  return (
    <div className="container mx-auto p-4">
      <div className="my-2 mb-4 flex items-center justify-start space-x-4 px-2">
        <Link to="/" className="flex items-center gap-1 text-lg font-semibold">
          <IoMdArrowRoundBack className="inline-block text-xl" />
          Home Page
        </Link>
      </div>
      <div className="mt-2 mb-5 flex items-center justify-center gap-4 px-2">
        <Link to="/gestures/add">
          <Button variant={'outline'} className="gap-2 text-lg font-semibold">
            <IoMdAdd className="size-5.5" /> Add
            <span className="font-bold text-yellow-600 dark:text-yellow-400">Gesture</span>
          </Button>
        </Link>
      </div>
      <ListGestures
        init_script_id={init_script_id}
        init_gesture_categories={init_gesture_categories}
      />
    </div>
  );
}
