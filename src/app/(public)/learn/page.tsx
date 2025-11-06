import type { Metadata } from 'next';
import LearnPage from './LearnPage';
import { lang_list_obj } from '~/state/lang_list';
import { CACHE } from '~/api/cache';
import { parseLearnPageCookie, SAVED_COOKIES_KEY } from './learn_page_state';
import { cookies } from 'next/headers';

export default async function page() {
  const lang_id = lang_list_obj['Sanskrit'];
  const lesson_categories = await CACHE.lessons.category_list.get({ lang_id });

  const cookie = await cookies();
  const saved_category_id_ = parseLearnPageCookie(
    'category_id',
    cookie.get(SAVED_COOKIES_KEY.category_id.key)?.value
  );
  const saved_lesson_id_ = parseLearnPageCookie(
    'lesson_id',
    cookie.get(SAVED_COOKIES_KEY.lesson_id.key)?.value
  );
  const saved_script_id = parseLearnPageCookie(
    'script_id',
    cookie.get(SAVED_COOKIES_KEY.script_id.key)?.value
  );

  // choose the first category if no category is saved
  const category_id = !saved_category_id_ ? lesson_categories[0]?.id : saved_category_id_;
  const init_lessons_list = await CACHE.lessons.category_lesson_list.get({ category_id });

  const lesson_id =
    !saved_category_id_ || !saved_lesson_id_ ? init_lessons_list[0]?.id : saved_lesson_id_;

  return (
    <div className="mt-4">
      <LearnPage
        init_lesson_categories={lesson_categories}
        init_lang_id={lang_id}
        init_script_id={saved_script_id}
        init_lessons_list={init_lessons_list}
        saved_category_id={category_id}
        saved_lesson_id={lesson_id}
      />
    </div>
  );
}

export const metadata: Metadata = { title: 'Learn Scripts the Interactive way' };
