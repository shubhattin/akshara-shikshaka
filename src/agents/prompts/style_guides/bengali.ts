/**
 * Bengali. From Wikimedia Commons stroke-order animations (অ আ ই উ এ ও …) and counts of native
 * writers' pen traces in the HP Labs / LipiTk Bangla data (as tallied by the coding-adventures
 * script-ductus project): most letters are one body stroke; the headline's place is not settled.
 * Vowel signs: no source gives their order against the consonant (online Bangla recognisers
 * reorder strokes because writers vary). The default follows the rule of the other Brahmic
 * scripts: a sign joined to the letter after it, a sign standing apart on the left before it.
 */
export const BENGALI_GUIDE = `
Order
- Headline (mātrā): native writers differ — many draw it separately last, many first,
  some not separately at all.
  Default: the body first, the headline last, left → right, once for the akṣara;
  when the admin prefers it first, do that for the rest of the chat.
  (In the Commons animations অ draws it first, ই last.)
- A vertical bar on the right (আ, the stem of অ) comes after the body, top → bottom.
- A conjunct is written as its letters in reading order: the left or upper letter first.

Vowel signs (kār) — default, no primer source; the admin's corrections settle it
- Signs joined to the letter come after the whole consonant or conjunct:
  া ী on the right, ি on the left (write the consonant, then go back for ি),
  ু ূ ৃ below.
- ে and ৈ stand apart on the left: write them first, then the consonant.
- ো ৌ are two parts around the consonant:
  the left part (ে), the consonant, then the right part (া, or ৗ for ৌ).
- Hooks above and dots (ঁ ং ঃ) last.

Strokes
- Most letters are ONE body stroke (ত, ন, ভ, ম, ল, হ …: about 85–95% of native samples).
  ই and জ are two.
- The body usually starts in its inner curl — the small hook or loop inside the letter (অ, এ, ন) —
  and winds outward from it.
  A knot at a stroke's end is that curl: start the stroke there with a small loop.
- Curves mostly turn clockwise (ত, ড, ভ, হ, অ, এ); চ turns anticlockwise.
`;
