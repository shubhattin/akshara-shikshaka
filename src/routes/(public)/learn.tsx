import { createFileRoute } from '@tanstack/react-router';
import LearnPage from '~/components/pages/learn/LearnPage';
import { fetchLearnPageData } from '~/lib/server/route-data.functions';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';

export const Route = createFileRoute('/(public)/learn')({
  loader: async () => await fetchLearnPageData(),
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
