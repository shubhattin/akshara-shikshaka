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

type FontList = Partial<
  Record<
    script_list_type,
    {
      font_family: FontFamily;
      url: `/fonts/regular/woff2/${FontFamily}.woff2` | `/fonts/variable/woff2/${FontFamily}.woff2`;
    }[]
  >
>;

export const FONT_LIST: FontList = {
  Devanagari: [
    {
      font_family: 'Nirmala_UI',
      url: '/fonts/regular/woff2/Nirmala_UI.woff2'
    },
    {
      font_family: 'Adobe_Devanagari',
      url: '/fonts/regular/woff2/Adobe_Devanagari.woff2'
    }
  ],
  Telugu: [
    {
      font_family: 'Nirmala_UI',
      url: '/fonts/regular/woff2/Nirmala_UI.woff2'
    },
    {
      font_family: 'Adobe_Telugu',
      url: '/fonts/regular/woff2/Adobe_Telugu.woff2'
    },
    {
      font_family: 'Noto_Serif_Telugu',
      url: '/fonts/variable/woff2/Noto_Serif_Telugu.woff2'
    }
  ],
  Kannada: [
    {
      font_family: 'Nirmala_UI',
      url: '/fonts/regular/woff2/Nirmala_UI.woff2'
    },
    {
      font_family: 'Noto_Serif_Kannada',
      url: '/fonts/variable/woff2/Noto_Serif_Kannada.woff2'
    }
  ]
};
