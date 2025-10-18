import type { Metadata } from 'next';
import LearnPage from './LearnPage';
import { get_text_lesson_categories_func } from '~/api/routers/lesson_categories';
import { lang_list_obj } from '~/state/lang_list';

export default async function page() {
  const lesson_categories = await get_text_lesson_categories_func(lang_list_obj['Sanskrit']);
  return (
    <div className="mt-4">
      <LearnPage init_lesson_categories={lesson_categories} />
    </div>
  );
}

export const metadata: Metadata = { title: 'Learn Scripts' };
