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
  const saved_category_id = parseLearnPageCookie(
    'category_id',
    cookie.get(SAVED_COOKIES_KEY.category_id.key)?.value
  );
  const saved_lesson_id = parseLearnPageCookie(
    'lesson_id',
    cookie.get(SAVED_COOKIES_KEY.lesson_id.key)?.value
  );
  const saved_script_id = parseLearnPageCookie(
    'script_id',
    cookie.get(SAVED_COOKIES_KEY.script_id.key)?.value
  );

  return (
    <div className="mt-4">
      <LearnPage
        init_lesson_categories={lesson_categories}
        init_lang_id={lang_id}
        init_script_id={saved_script_id}
        saved_category_id={saved_category_id}
        saved_lesson_id={saved_lesson_id}
      />
    </div>
  );
}

export const metadata: Metadata = { title: 'Learn Scripts the Interactive way' };
