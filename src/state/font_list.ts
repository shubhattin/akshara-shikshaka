import notoSansDevanagari from '@fontsource-variable/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-wght-normal.woff2?url';
import notoSerifDevanagari from '@fontsource-variable/noto-serif-devanagari/files/noto-serif-devanagari-devanagari-wght-normal.woff2?url';
import notoSansTelugu from '@fontsource-variable/noto-sans-telugu/files/noto-sans-telugu-telugu-wght-normal.woff2?url';
import notoSerifTelugu from '@fontsource-variable/noto-serif-telugu/files/noto-serif-telugu-telugu-wght-normal.woff2?url';
import notoSansKannada from '@fontsource-variable/noto-sans-kannada/files/noto-sans-kannada-kannada-wght-normal.woff2?url';
import notoSerifKannada from '@fontsource-variable/noto-serif-kannada/files/noto-serif-kannada-kannada-wght-normal.woff2?url';
import notoSansOdia from '@fontsource-variable/noto-sans-oriya/files/noto-sans-oriya-oriya-wght-normal.woff2?url';
import notoSerifOdia from '@fontsource-variable/noto-serif-oriya/files/noto-serif-oriya-oriya-wght-normal.woff2?url';
import notoSansMalayalam from '@fontsource-variable/noto-sans-malayalam/files/noto-sans-malayalam-malayalam-wght-normal.woff2?url';
import notoSerifMalayalam from '@fontsource-variable/noto-serif-malayalam/files/noto-serif-malayalam-malayalam-wght-normal.woff2?url';
//local fonts
import NirmalaUI from '~/fonts/regular/woff2/Nirmala_UI.woff2?url';
import AdobeDevanagari from '~/fonts/regular/woff2/Adobe_Devanagari.woff2?url';
import AdobeTelugu from '~/fonts/regular/woff2/Adobe_Telugu.woff2?url';

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

/** Bundled woff2 URLs from @fontsource-variable packages. */
const FONT_URLS = {
  Noto_Sans_Devanagari: notoSansDevanagari,
  Noto_Serif_Devanagari: notoSerifDevanagari,
  Noto_Sans_Telugu: notoSansTelugu,
  Noto_Serif_Telugu: notoSerifTelugu,
  Noto_Sans_Kannada: notoSansKannada,
  Noto_Serif_Kannada: notoSerifKannada,
  Noto_Sans_Odia: notoSansOdia,
  Noto_Serif_Odia: notoSerifOdia,
  Noto_Sans_Malayalam: notoSansMalayalam,
  Noto_Serif_Malayalam: notoSerifMalayalam,
  // local fonts
  Nirmala_UI: NirmalaUI,
  Adobe_Devanagari: AdobeDevanagari,
  Adobe_Telugu: AdobeTelugu
} satisfies Record<FontFamily, string>;

export const LANGUAGES_ADDED = ['Sanskrit'] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

/**
 * These are the scripts for which the fonts have been specified and setup properly
 */
export const FONT_SCRIPTS = ['Devanagari', 'Telugu', 'Kannada', 'Odia', 'Malayalam'] as const;
type FontEntry<F extends FontFamily> = {
  font_family: F;
  url: string;
};
type FontList = Partial<Record<script_list_type, FontEntry<FontFamily>[]>>;

const get_font_entry = (font_family: FontFamily, loc: 'regular' | 'variable') => {
  return {
    font_family,
    url: FONT_URLS[font_family as keyof typeof FONT_URLS]
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
