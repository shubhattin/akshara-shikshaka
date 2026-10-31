import { DEFAULT_FONT_FAMILY, FONT_LIST, type FontFamily } from './font_list';
import { get_script_from_id } from './lang_list';

/** Fonts set up for a script (the default first); just the default for scripts without a list. */
export function fontsForScript(scriptId: number): FontFamily[] {
  const entries = FONT_LIST[get_script_from_id(scriptId)];
  return entries ? entries.map((entry) => entry.font_family) : [DEFAULT_FONT_FAMILY];
}

/** Can a gesture of this script use this font (does it have the script's glyphs)? */
export const fontAllowedForScript = (font: FontFamily, scriptId: number) =>
  fontsForScript(scriptId).includes(font);

/** A font's display name: `Noto_Sans_Odia` → `Noto Sans Odia`. */
export const fontLabel = (font: string) => font.replaceAll('_', ' ');
