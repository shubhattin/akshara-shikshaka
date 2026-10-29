/**
 * Gujarati. No stroke-order animations or primer instructions were found for the letters; they
 * follow the script's descent from Devanagari forms without the headline (a weak default).
 * Vowel signs are sourced: KanoAI's hand-drawn barakhadi templates write the consonant first and
 * then the sign, even િ (33 of 34 rows), corroborated by t30apps records and LipiTk Devanagari
 * matra counts (as tallied by the coding-adventures script-ductus project).
 */
export const GUJARATI_GUIDE = `
Order (letters: weak default — no primer source found; the admin's corrections settle it)
- Gujarati has no headline. Write left to right:
  the rounded body first, then a vertical bar on the right (ખ ગ ણ શ …), top → bottom.
- A conjunct is written as its letters in reading order: the half letter on the left first.

Vowel signs (mātrā)
- The base comes first: the whole consonant or conjunct, then its vowel sign.
- This holds for every sign, even િ on the left: write the consonant, then go back for િ.
- ા િ ી ુ ૂ ે ૈ ો ૌ all come after the consonant; anusvāra (ં) and visarga (ઃ) last.
- So કેમકે is written ક, ે, મ, ક, ે.

Strokes
- Keep the body — its curls, loops and bowls — in one continuous stroke;
  lift only before the vertical bar.
- Like Devanagari, a curl at the start of a letter that the font fills in is a knot at a stroke end:
  start the stroke there with a small loop.
`;
