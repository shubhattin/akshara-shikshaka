import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { CACHE } from '~/api/cache';
import {
  get_lesson_lang_id_from_cookie,
  get_script_id_from_cookie,
  get_font_family_from_cookie,
  FONT_FAMILY_COOKIE_KEY,
  LESSON_LANG_ID_COOKIE_KEY,
  SCRIPT_ID_COOKIE_KEY
} from '~/state/cookie';
import { lang_list_obj, script_list_obj, get_script_from_id } from '~/state/lang_list';
import { transliterate } from 'lipilekhika';
import { DEFAULT_FONT_SIZE } from '~/state/font_list';
import {
  loadAudioAssetForEdit,
  loadImageAssetForEdit,
  loadTextGestureForEdit,
  loadTextLessonForEdit,
  parseEncodedNumericId
} from '~/lib/server/admin-loaders.server';

export const fetchLearnPageData = createServerFn({ method: 'GET' }).handler(async () => {
  const cookieHeader = getRequestHeader('cookie');
  const lang_id = lang_list_obj['Sanskrit'];
  const lesson_categories_prom = CACHE.lessons.category_list.get({ lang_id });

  const saved_category_id_ = parseLearnPageCookie(
    'category_id',
    getCookieValue(cookieHeader, SAVED_COOKIES_KEY.category_id.key)
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

  if (category_id === null) {
    return {
      init_lesson_categories: lesson_categories,
      init_lang_id: lang_id,
      init_script_id: null as number | null,
      init_lessons_list: [] as { id: number; text: string; order: number | null; uuid: string }[],
      init_lessons_list_transliterated: [] as {
        id: number;
        text: string;
        order: number | null;
        uuid: string;
      }[],
      saved_category_id: null as number | null,
      saved_lesson_id: null as number | null
    };
  }

  const init_lessons_list = await CACHE.lessons.category_lesson_list.get({ category_id });
  const target_script = get_script_from_id(saved_script_id ?? script_list_obj['Devanagari']);
  const init_lessons_list_transliterated = await Promise.all(
    init_lessons_list.map(async (lesson) => ({
      ...lesson,
      text: await transliterate(lesson.text, 'Devanagari', target_script)
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

export const fetchGestureAddDefaults = createServerFn({ method: 'GET' }).handler(async () => {
  const cookieHeader = getRequestHeader('cookie');
  const script_id = get_script_id_from_cookie(getCookieValue(cookieHeader, SCRIPT_ID_COOKIE_KEY));
  const font_family = get_font_family_from_cookie(
    getCookieValue(cookieHeader, FONT_FAMILY_COOKIE_KEY)
  );
  return {
    script_id,
    font_family,
    text_data: {
      text: '',
      gestures: [],
      font_size: DEFAULT_FONT_SIZE,
      text_center_offset: [0, 0] as [number, number],
      font_family,
      script_id,
      category_id: null,
      order: null,
      category: null
    }
  };
});

export const fetchLessonsListData = createServerFn({ method: 'GET' }).handler(async () => {
  const cookieHeader = getRequestHeader('cookie');
  const init_lang_id = get_lesson_lang_id_from_cookie(
    getCookieValue(cookieHeader, LESSON_LANG_ID_COOKIE_KEY)
  );
  return { init_lang_id };
});

export const fetchLessonEditData = createServerFn({ method: 'GET' })
  .inputValidator((data: { rawId: string }) => data)
  .handler(async ({ data }) => {
    const id = z.coerce.number().int().parse(data.rawId);
    const text_lesson_info = await loadTextLessonForEdit(id);
    return { text_lesson_info };
  });

export const fetchGestureEditData = createServerFn({ method: 'GET' })
  .inputValidator((data: { rawId: string }) => data)
  .handler(async ({ data }) => {
    const id = parseEncodedNumericId(data.rawId);
    const text_data = await loadTextGestureForEdit(id);
    return { text_data, id };
  });

export const fetchAudioEditData = createServerFn({ method: 'GET' })
  .inputValidator((data: { rawId: string }) => data)
  .handler(async ({ data }) => {
    const id = parseEncodedNumericId(data.rawId);
    const audio_data = await loadAudioAssetForEdit(id);
    return { audio_data };
  });

export const fetchImageEditData = createServerFn({ method: 'GET' })
  .inputValidator((data: { rawId: string }) => data)
  .handler(async ({ data }) => {
    const id = parseEncodedNumericId(data.rawId);
    const image_data = await loadImageAssetForEdit(id);
    return { image_data };
  });
