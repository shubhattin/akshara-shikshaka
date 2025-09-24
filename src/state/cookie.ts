import { script_list_obj, SCRIPT_LIST_IDS } from './lang_list';
import { DEFAULT_FONT_FAMILY, FONT_FAMILIES, type FontFamily } from '~/state/font_list';

export const get_script_id_from_cookie = (value?: string) => {
  if (value && SCRIPT_LIST_IDS.includes(parseInt(value))) {
    return parseInt(value);
  } else {
    return script_list_obj['Devanagari']!;
  }
};

export const get_font_family_from_cookie = (value?: string) => {
  if (value && FONT_FAMILIES.includes(value as FontFamily)) {
    return value as FontFamily;
  } else {
    return DEFAULT_FONT_FAMILY as FontFamily;
  }
};

export const SCRIPT_ID_COOKIE_KEY = 'script_id';
export const FONT_FAMILY_COOKIE_KEY = 'font_family';
