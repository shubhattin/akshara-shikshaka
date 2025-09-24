import { type script_list_type } from './lang_list';

export const FONT_FAMILIES = [
  // All
  'Nirmala_UI',
  // Devanagari
  'Adobe_Devanagari',
  'Noto_Serif_Devanagari',
  'Noto_Sans_Devanagari',
  // Telugu
  'Adobe_Telugu',
  'Noto_Serif_Telugu',
  'Noto_Sans_Telugu',
  // Kannada
  'Noto_Serif_Kannada',
  'Noto_Sans_Kannada',
  // Odia
  'Noto_Serif_Odia',
  'Noto_Sans_Odia',
  // Malayalam
  'Noto_Serif_Malayalam',
  'Noto_Sans_Malayalam'
] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

/**
 * These are the scripts for which the fonts have been specified and setup properly
 */
export const FONT_SCRIPTS = ['Devanagari', 'Telugu', 'Kannada', 'Odia', 'Malayalam'] as const;
type FontEntry<F extends FontFamily> = {
  font_family: F;
  url: `/fonts/regular/woff2/${F}.woff2` | `/fonts/variable/woff2/${F}.woff2`;
};
type FontList = Partial<Record<script_list_type, FontEntry<FontFamily>[]>>;

const get_font_entry = (font_family: FontFamily, loc: 'regular' | 'variable') => {
  return {
    font_family,
    url: `/fonts/${loc}/woff2/${font_family}.woff2`
  } satisfies FontEntry<FontFamily>;
};

export const FONT_LIST: FontList = {
  Devanagari: [
    get_font_entry('Nirmala_UI', 'regular'),
    get_font_entry('Adobe_Devanagari', 'regular'),
    get_font_entry('Noto_Serif_Devanagari', 'variable'),
    get_font_entry('Noto_Sans_Devanagari', 'variable')
  ],
  Telugu: [
    get_font_entry('Nirmala_UI', 'regular'),
    get_font_entry('Adobe_Telugu', 'regular'),
    get_font_entry('Noto_Serif_Telugu', 'variable'),
    get_font_entry('Noto_Sans_Telugu', 'variable')
  ],
  Kannada: [
    get_font_entry('Nirmala_UI', 'regular'),
    get_font_entry('Noto_Serif_Kannada', 'variable'),
    get_font_entry('Noto_Sans_Kannada', 'variable')
  ],
  Odia: [
    get_font_entry('Nirmala_UI', 'regular'),
    get_font_entry('Noto_Serif_Odia', 'variable'),
    get_font_entry('Noto_Sans_Odia', 'variable')
  ],
  Malayalam: [
    get_font_entry('Nirmala_UI', 'regular'),
    get_font_entry('Noto_Serif_Malayalam', 'variable'),
    get_font_entry('Noto_Sans_Malayalam', 'variable')
  ]
};

export const DEFAULT_FONT_FAMILY = 'Nirmala_UI' satisfies FontFamily;
export const DEFAULT_FONT_SIZE = 15 as const;
