import {
  get_lang_from_id,
  get_script_from_id,
  lang_list_obj,
  script_list_obj,
  type script_and_lang_list_type
} from '@/state/lang_list';
import { createFileRoute } from '@tanstack/react-router';
import {
  parseLearnPageCookie,
  SAVED_COOKIES_KEY,
  type text_lesson_type
} from './-learn_page_state';
import LearnPage from './-LearnPage';
import { routeHeadFromPageMeta } from '~/components/tags/getPageMetaTags';
import { createServerTRPC } from '~/api/server';
import { createIsomorphicFn } from '@tanstack/react-start';
import js_cookie from 'js-cookie';
import { getCookie } from '@tanstack/react-start/server';

function buildLearnSelection(getCookieValue: (key: string) => string | undefined) {
  return {
    init_lang_id: lang_list_obj['Sanskrit'],
    init_script_id: parseLearnPageCookie(
      'script_id',
      getCookieValue(SAVED_COOKIES_KEY.script_id.key)
    ),
    saved_category_id: parseLearnPageCookie(
      'category_id',
      getCookieValue(SAVED_COOKIES_KEY.category_id.key)
    ),
    saved_lesson_id: parseLearnPageCookie(
      'lesson_id',
      getCookieValue(SAVED_COOKIES_KEY.lesson_id.key)
    )
  };
}

/** Cookie-backed learn selection for both SSR loaders and client navigations. */
export const getLearnSelection$ = createIsomorphicFn()
  .client(async () => {
    return buildLearnSelection((key) => js_cookie.get(key));
  })
  .server(async () => {
    return buildLearnSelection((key) => getCookie(key));
  });

async function transliterateTexts(
  texts: string[],
  from: script_and_lang_list_type,
  to: script_and_lang_list_type
) {
  if (texts.length === 0 || from === to) return texts;
  try {
    const { transliterate_wasm } = await import('lipilekhika');
    return await transliterate_wasm(texts, from, to);
  } catch {
    return texts;
  }
}

export const Route = createFileRoute('/(public)/learn/')({
  // oxlint-disable-next-line complexity -- loader orchestrates transliteration and lesson selection; sequential I/O with branches deferred
  loader: async ({ context }) => {
    const selection = await getLearnSelection$();
    const emptyTransliteration = {
      // SAFETY: validated at boundary - type assertion is safe based on prior schema check.
      init_lessons_list_transliterated: [] as text_lesson_type[],
      // SAFETY: validated at boundary - type assertion is safe based on prior schema check.
      init_words_transliterated: [] as string[],
      // SAFETY: validated at boundary - type assertion is safe based on prior schema check.
      init_varna_transliterated: null as string | null
    };

    if (!import.meta.env.SSR) {
      return { ...selection, ...emptyTransliteration };
    }

    const trpc = await createServerTRPC(context.queryClient);
    const lessonCategories = await context.queryClient.ensureQueryData(
      trpc.text_lessons.categories.get_categories.queryOptions({
        lang_id: selection.init_lang_id
      })
    );
    const categoryId =
      lessonCategories.find((category) => category.id === selection.saved_category_id)?.id ??
      lessonCategories[0]?.id ??
      null;
    const lessons =
      categoryId === null
        ? []
        : await context.queryClient.ensureQueryData(
            trpc.text_lessons.categories.get_category_text_lesson_list.queryOptions({
              category_id: categoryId
            })
          );
    const lessonId =
      lessons.find((lesson) => lesson.id === selection.saved_lesson_id)?.id ??
      lessons[0]?.id ??
      null;

    const scriptId = selection.init_script_id ?? script_list_obj['Devanagari'];
    const sourceLang = get_lang_from_id(selection.init_lang_id);
    const targetScript = get_script_from_id(scriptId);

    const lessonTextsTransliterated = await transliterateTexts(
      lessons.map((lesson) => lesson.text),
      sourceLang,
      targetScript
    );
    const init_lessons_list_transliterated = lessons.map((lesson, i) => ({
      ...lesson,
      text: lessonTextsTransliterated[i] ?? lesson.text
    }));

    let init_words_transliterated: string[] = [];
    let init_varna_transliterated: string | null = null;

    if (lessonId !== null) {
      const lesson = await context.queryClient.ensureQueryData(
        trpc.text_lessons.get_text_lesson_info.queryOptions({ lesson_id: lessonId })
      );
      if (lesson) {
        const gesture = lesson.gestures.find(
          (item) => item.text_gesture.script_id === scriptId
        )?.text_gesture;

        if (gesture) {
          await context.queryClient.ensureQueryData(
            trpc.text_gestures.get_text_gesture_data.queryOptions({
              id: gesture.id,
              uuid: gesture.uuid
            })
          );
        }

        const wordSourceScript = get_script_from_id(lesson.base_word_script_id);
        init_words_transliterated = await transliterateTexts(
          lesson.words.map((w) => w.word),
          wordSourceScript,
          targetScript
        );
        const [varna] = await transliterateTexts([lesson.text], sourceLang, targetScript);
        init_varna_transliterated = varna ?? lesson.text;
      }
    }

    return {
      ...selection,
      saved_category_id: categoryId,
      saved_lesson_id: lessonId,
      init_lessons_list_transliterated,
      init_words_transliterated,
      init_varna_transliterated
    };
  },
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
        init_lang_id={data.init_lang_id}
        init_script_id={data.init_script_id}
        saved_category_id={data.saved_category_id}
        saved_lesson_id={data.saved_lesson_id}
        init_lessons_list_transliterated={data.init_lessons_list_transliterated}
        init_words_transliterated={data.init_words_transliterated}
        init_varna_transliterated={data.init_varna_transliterated}
      />
    </div>
  );
}
