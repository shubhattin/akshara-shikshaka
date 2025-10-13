import type { InferSelectModel } from 'drizzle-orm';
import type { text_lessons, text_lesson_words, image_assets, audio_assets } from '~/db/schema';
import { atom } from 'jotai';

export const lang_id_atom = atom<number>(0);
export const base_word_script_id_atom = atom<number>(0);
export const audio_id_optional_atom = atom<number | null | undefined>(undefined);
export const text_atom = atom<string>('');
export const gesture_ids_atom = atom<Set<number>>(new Set<number>([]));
export const words_atom = atom<text_lesson_word_type[]>([]);
export type text_lesson_info_type = Omit<
  InferSelectModel<typeof text_lessons>,
  'created_at' | 'updated_at'
> & {
  category?: {
    id: number;
    name: string;
  } | null;
};
export type text_lesson_word_type = Omit<
  InferSelectModel<typeof text_lesson_words>,
  'created_at' | 'updated_at' | 'text_lesson_id'
> & {
  id?: number;
};
export type image_type = Pick<
  InferSelectModel<typeof image_assets>,
  'id' | 'description' | 's3_key' | 'height' | 'width'
>;
export type audio_type = Pick<
  InferSelectModel<typeof audio_assets>,
  'id' | 'description' | 's3_key'
>;
