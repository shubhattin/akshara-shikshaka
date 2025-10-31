import type { Metadata } from 'next';
import LearnPage from './LearnPage';
import { lang_list_obj } from '~/state/lang_list';
import { CACHE } from '~/api/cache';

export default async function page() {
  const lang_id = lang_list_obj['Sanskrit'];
  const lesson_categories = await CACHE.lessons.category_list.get({ lang_id });
  return (
    <div className="mt-4">
      <LearnPage init_lesson_categories={lesson_categories} init_lang_id={lang_id} />
    </div>
  );
}

export const metadata: Metadata = { title: 'Learn Scripts the Interactive way' };
