/**
 * Font family names and defaults — no binary/font URL imports.
 * Safe for drizzle-kit and other Node tooling that load the DB schema.
 */
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

export const LANGUAGES_ADDED = ['Sanskrit'] as const;

/**
 * Scripts for which fonts have been specified and set up properly.
 */
export const FONT_SCRIPTS = ['Devanagari', 'Telugu', 'Kannada', 'Odia', 'Malayalam'] as const;

export const DEFAULT_FONT_FAMILY = 'Nirmala_UI' satisfies FontFamily;
export const DEFAULT_FONT_SIZE = 15 as const;
