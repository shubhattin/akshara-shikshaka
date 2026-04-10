import { CACHE } from '@/api/cache';
import { parseLearnPageCookie, SAVED_COOKIES_KEY } from '@/components/pages/learn/learn_page_state';
import { getCookieValue } from '@/lib/parse_cookie_header';
import { get_script_from_id, lang_list_obj, script_list_obj } from '@/state/lang_list';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import LearnPage from '~/components/pages/learn/LearnPage';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import { getCookie } from '@tanstack/react-start/server';
import { transliterate_node } from 'lipilekhika/node';

const loader$ = createServerFn({ method: 'GET' }).handler(async () => {
  const cookieHeader = getRequestHeader('cookie');
  const lang_id = lang_list_obj['Sanskrit'];
  const lesson_categories_prom = CACHE.lessons.category_list.get({ lang_id });

  const saved_category_id_ = parseLearnPageCookie(
    'category_id',
    getCookie(SAVED_COOKIES_KEY.category_id.key)
  );
  const saved_lesson_id_ = parseLearnPageCookie(
    'lesson_id',
    getCookieValue(cookieHeader, SAVED_COOKIES_KEY.lesson_id.key)
  );
  const saved_script_id = parseLearnPageCookie(
    'script_id',
    getCookieValue(cookieHeader, SAVED_COOKIES_KEY.script_id.key)
  );

  const lesson_categories = await lesson_categories_prom;

  const category_id = !saved_category_id_
    ? (lesson_categories[0]?.id ?? null)
    : (lesson_categories.find((c) => c.id === saved_category_id_)?.id ??
      lesson_categories[0]?.id ??
      null);

  const init_lessons_list = await CACHE.lessons.category_lesson_list.get({ category_id });
  const target_script = get_script_from_id(saved_script_id ?? script_list_obj['Devanagari']);
  const init_lessons_list_transliterated = await Promise.all(
    init_lessons_list.map(async (lesson) => ({
      ...lesson,
      text: await transliterate_node(lesson.text, 'Devanagari', target_script)
    }))
  );

  const lesson_id = !saved_lesson_id_
    ? (init_lessons_list[0]?.id ?? null)
    : (init_lessons_list.find((l) => l.id === saved_lesson_id_)?.id ??
      init_lessons_list[0]?.id ??
      null);

  return {
    init_lesson_categories: lesson_categories,
    init_lang_id: lang_id,
    init_script_id: saved_script_id,
    init_lessons_list,
    init_lessons_list_transliterated,
    saved_category_id: category_id,
    saved_lesson_id: lesson_id
  };
});

export const Route = createFileRoute('/(public)/learn')({
  loader: async () => await loader$(),
  head: () =>
    routeHeadFromPageMeta({
      title: 'Learn Scripts the Interactive way | Akshara Shikshaka',
      description:
        'Interactive Sanskrit and script learning with lessons, audio, and gesture practice.'
    }),
  component: LearnRoute
});

function LearnRoute() {
  const data = Route.useLoaderData();
  return (
    <div className="mt-4">
      <LearnPage
        init_lesson_categories={data.init_lesson_categories}
        init_lang_id={data.init_lang_id}
        init_script_id={data.init_script_id}
        init_lessons_list={data.init_lessons_list}
        init_lessons_list_transliterated={data.init_lessons_list_transliterated}
        saved_category_id={data.saved_category_id}
        saved_lesson_id={data.saved_lesson_id}
      />
    </div>
  );
}
