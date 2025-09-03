import { type script_list_type } from './lang_list';

export const FONT_FAMILIES = [
  'Nirmala UI',
  'Adobe Devanagari',
  'Adobe Telugu',
  'Noto Serif Telugu',
  'Noto Serif Kannada'
] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

type FontList = Partial<
  Record<
    script_list_type,
    {
      font_family: FontFamily;
      url: `/fonts/regular/woff2/${string}.woff2` | `/fonts/variable/woff2/${string}.woff2`;
    }[]
  >
>;

export const FONT_LIST: FontList = {
  Devanagari: [
    {
      font_family: 'Nirmala UI',
      url: '/fonts/regular/woff2/Nirmala.woff2'
    },
    {
      font_family: 'Adobe Devanagari',
      url: '/fonts/regular/woff2/AdobeDevanagari.woff2'
    }
  ],
  Telugu: [
    {
      font_family: 'Nirmala UI',
      url: '/fonts/regular/woff2/Nirmala.woff2'
    },
    {
      font_family: 'Adobe Telugu',
      url: '/fonts/regular/woff2/AdobeTelugu.woff2'
    },
    {
      font_family: 'Noto Serif Telugu',
      url: '/fonts/variable/woff2/NotoSerifTelugu.woff2'
    }
  ],
  Kannada: [
    {
      font_family: 'Nirmala UI',
      url: '/fonts/regular/woff2/Nirmala.woff2'
    },
    {
      font_family: 'Noto Serif Kannada',
      url: '/fonts/variable/woff2/NotoSerifKannada.woff2'
    }
  ]
};
