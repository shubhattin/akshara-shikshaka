import { transliterate_node } from 'lipilekhika/node';
import type { script_and_lang_list_type } from '@/state/lang_list';

/** Native-binding transliteration — server/SSR only, not for the browser bundle. */
export async function transliterateTexts(
  texts: string[],
  from: script_and_lang_list_type,
  to: script_and_lang_list_type
) {
  if (texts.length === 0 || from === to) return texts;
  try {
    return await transliterate_node(texts, from, to);
  } catch {
    return texts;
  }
}
