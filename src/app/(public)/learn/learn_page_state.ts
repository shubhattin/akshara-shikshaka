import { atom } from 'jotai';
import { lang_list_obj, script_list_obj } from '~/state/lang_list';
import type { lesson_categories } from '~/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

export type lesson_category_type = Omit<
  InferSelectModel<typeof lesson_categories>,
  'created_at' | 'updated_at' | 'lang_id'
>;

export const selected_language_id_atom = atom<number>(lang_list_obj['Sanskrit']);
export const selected_script_id_atom = atom<number>(script_list_obj['Devanagari']);

export const selected_category_id_atom = atom<number | null>(null);
export const selected_lesson_id_atom = atom<number | null>(null);
