import { type script_list_type } from './lang_list';

export const FONT_FAMILIES = [
  'Nirmala_UI',
  'Adobe_Devanagari',
  'Adobe_Telugu',
  'Noto_Serif_Telugu',
  'Noto_Serif_Kannada'
] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

export const FONT_SCRIPTS = ['Devanagari', 'Telugu', 'Kannada'] as const;
type FontEntry<F extends FontFamily> = {
  font_family: F;
  url: `/fonts/regular/woff2/${F}.woff2` | `/fonts/variable/woff2/${F}.woff2`;
};
type FontList = Partial<Record<script_list_type, FontEntry<FontFamily>[]>>;

const get_font_entry = (font_family: FontFamily) => {
  return {
    font_family,
    url: `/fonts/regular/woff2/${font_family}.woff2`
  } satisfies FontEntry<FontFamily>;
};

export const FONT_LIST: FontList = {
  Devanagari: [get_font_entry('Nirmala_UI'), get_font_entry('Adobe_Devanagari')],
  Telugu: [
    get_font_entry('Nirmala_UI'),
    get_font_entry('Adobe_Telugu'),
    get_font_entry('Noto_Serif_Telugu')
  ],
  Kannada: [get_font_entry('Nirmala_UI'), get_font_entry('Noto_Serif_Kannada')]
};

export const DEFAULT_FONT_FAMILY = 'Nirmala_UI' satisfies FontFamily;
export const DEFAULT_FONT_SIZE = 15 as const;
