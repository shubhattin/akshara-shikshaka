import type { script_list_type } from '~/state/lang_list';
import { BENGALI_GUIDE } from './bengali';
import { DEVANAGARI_GUIDE } from './devanagari';
import { GUJARATI_GUIDE } from './gujarati';
import { MALAYALAM_GUIDE } from './malayalam';
import { ODIA_GUIDE } from './odia';
import { TELUGU_KANNADA_GUIDE } from './telugu_kannada';

/**
 * How each script is handwritten: the defaults the Gesture Creator follows unless the admin says
 * otherwise. Sent once per chat with the first mention of a gesture in that script. Add a script
 * (or a letter) here when an admin's corrections settle how it is written.
 */
const STYLE_GUIDES = new Map<script_list_type, string>([
  ['Devanagari', DEVANAGARI_GUIDE],
  ['Telugu', TELUGU_KANNADA_GUIDE],
  ['Kannada', TELUGU_KANNADA_GUIDE],
  ['Malayalam', MALAYALAM_GUIDE],
  ['Odia', ODIA_GUIDE],
  ['Bengali', BENGALI_GUIDE],
  ['Gujarati', GUJARATI_GUIDE]
]);

const NO_GUIDE = `No style guide for this script yet. Rely on your knowledge of how it is handwritten; web_search a stroke-order reference only when you really don't know (an uncommon conjunct, a regional form).`;

export const STYLE_GUIDE_TAG = 'stroke_style_guide';

/** The style guide block for a script, as the model reads it. */
export function styleGuideBlock(script: script_list_type): string {
  return `<${STYLE_GUIDE_TAG} script="${script}">\n${STYLE_GUIDES.get(script) ?? NO_GUIDE}\n</${STYLE_GUIDE_TAG}>`;
}
