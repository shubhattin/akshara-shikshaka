import { atom } from 'jotai';
import { lang_list_obj, script_list_obj } from '~/state/lang_list';
import type { lesson_categories, text_lessons } from '~/db/schema';
import type { InferSelectModel } from 'drizzle-orm';
import z from 'zod';
import { SCRIPT_LIST_IDS } from '~/state/lang_list';

export type lesson_category_type = Omit<
  InferSelectModel<typeof lesson_categories>,
  'created_at' | 'updated_at' | 'lang_id'
>;
export type text_lesson_type = Pick<
  InferSelectModel<typeof text_lessons>,
  'id' | 'text' | 'order' | 'uuid'
>;

export const selected_language_id_atom = atom<number>(lang_list_obj['Sanskrit']);
export const selected_script_id_atom = atom<number>(script_list_obj['Devanagari']);

export const selected_category_id_atom = atom<number | null>(null);
export const selected_lesson_id_atom = atom<number | null>(null);

export const SAVED_COOKIES_KEY = {
  script_id: {
    key: 'saved_script_id',
    schema: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .nullable()
      .transform((v) => {
        if (v === null || v === undefined) return null;
        if (!SCRIPT_LIST_IDS.includes(v)) return script_list_obj['Devanagari'];
        return v;
      })
  },
  category_id: {
    key: 'saved_category_id',
    schema: z.coerce.number().int().positive().optional().nullable()
  },
  lesson_id: {
    key: 'saved_lesson_id',
    schema: z.coerce.number().int().positive().optional().nullable()
  }
} as const;

export async function saveLearnPageCookies(key: keyof typeof SAVED_COOKIES_KEY, value: any) {
  const cookie = (await import('js-cookie')).default;
  cookie.set(SAVED_COOKIES_KEY[key].key, JSON.stringify(value));
}

export function parseLearnPageCookie<K extends keyof typeof SAVED_COOKIES_KEY>(
  key: K,
  cookieValue: string | undefined
): z.infer<(typeof SAVED_COOKIES_KEY)[K]['schema']> {
  try {
    const parsedValue = cookieValue ? JSON.parse(cookieValue) : null;
    return SAVED_COOKIES_KEY[key].schema.parse(parsedValue) as any;
    // the return type takes care of this so we dont have to manually cast the type
  } catch (error) {
    return null as any;
  }
}
