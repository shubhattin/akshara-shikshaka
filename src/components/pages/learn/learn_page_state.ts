import { z } from 'zod';

export const SAVED_COOKIES_KEY = {
  category_id: { key: 'learn_category_id' },
  lesson_id: { key: 'learn_lesson_id' },
  script_id: { key: 'learn_script_id' }
} as const;

export function parseLearnPageCookie(
  _field: 'category_id' | 'lesson_id' | 'script_id',
  raw?: string
): number | null {
  if (raw === undefined || raw === '') return null;
  const parsed = z.coerce.number().int().safeParse(raw);
  return parsed.success ? parsed.data : null;
}
