/**
 * Odia. From the step-by-step letter instructions of an Odia calligraphy primer (Minz,
 * Typography Day 2015, built from school primers and teachers' handwriting): ଅ ଆ ଇ ଈ କ ଖ ଗ ଘ ଙ.
 * Vowel signs: no source gives their order against the consonant; the default follows the rule
 * of the other Brahmic scripts: a sign joined to the letter after it, one apart on the left before.
 */
export const ODIA_GUIDE = `
Order
- The body first, then the vertical bar on the right (in ଆ ଖ ଗ ଘ and the like), top → bottom, last.
- A conjunct is written as its letters: the main letter first, then the part below or beside it.

Vowel signs — default, no primer source; the admin's corrections settle it
- Signs joined to the letter come after the whole consonant or conjunct:
  ି (the curl at the top right), ା ୀ on the right, ୁ ୂ ୃ below.
- େ and ୈ stand apart on the left: write them first, then the consonant.
- ୋ ୌ are two parts around the consonant:
  the left part (େ), the consonant, then the right part (ା, or ୗ for ୌ).
- Candrabindu (ଁ), anusvāra (ଂ) and visarga (ଃ) last.

Strokes
- Odia has no headline; the round top arc (the hood) is part of the body,
  drawn as the body's last movement.
- The body starts at the bottom: at its small inner loop
  (the small loop in କ ଗ, which fonts often fill in — a knot: draw it as a small loop with K…).
  From there it goes up the left side and over the top arc clockwise, then down the right.
- ଇ: from the bottom-left through the small loops at the bottom,
  then up the left side and over the big top arc, clockwise, down to the tail.
- Keep the loops, the left side and the arc in one stroke; lift only before the vertical bar.
`;
