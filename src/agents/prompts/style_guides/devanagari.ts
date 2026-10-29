/**
 * Devanagari (Hindi, Sanskrit, Marathi, Nepali).
 * Vowel signs: the consonant first, then the sign. Primers disagree on ि (some write it first);
 * Gujarati, which writes the same ि, puts the consonant first in 33 of 34 barakhadi rows (KanoAI
 * templates, via the script-ductus project). Sign shapes from HP Labs LipiTk Devanagari traces:
 * ु one stroke turning clockwise (79/83), े one stroke from upper left to lower right (162/165).
 */
export const DEVANAGARI_GUIDE = `
Order
- Write the akṣara part by part from left to right.
  Within a part: the body first, then its vertical bar (top → bottom).
- A conjunct is written as its letters in reading order:
  the half letter on the left first, then the next.
- The shirorekha (headline) goes left → right, once for the whole akṣara.
  By default it comes after the bodies, bars and vowel signs that hang from it,
  and before the marks that sit on top of it.
  If the admin wants it first, do that for the rest of the chat.

Vowel signs (mātrā)
- The base comes first: the whole consonant or conjunct, then its vowel sign.
- This holds even for ि, which stands on the left: write the consonant, then go back for ि.
  Some writers put ि first; if the admin does, follow that for the rest of the chat.
- ि / ी: the hook and its stem in one stroke:
  start at the free end of the hook, go round over the top, then straight down the stem.
- ा: a vertical bar on the right, top → bottom.
- ु ू ृ: below the letter, after its body. ु is one stroke turning clockwise.
- े ै: on top of the headline, drawn after it. े is one stroke, from upper left to lower right.
- ो ौ: the bar (ा) after the consonant, then the flag(s) on top after the headline.
- Last of all: reph (र्) on top, anusvāra, candrabindu, then visarga on the right.
  Halant (्) and nukta (़) come right after the letter they belong to.

Strokes
- The body of a letter is usually ONE continuous stroke, with every loop and curl in it.
  Lift only where a hand lifts: before the vertical bar and before the headline.
  A short connector between the body and the bar is part of the body stroke, not a stroke of its own.
- Many letters start with a small curl that the font fills in solid (म भ न स श ब व र ग ख …).
  It shows up as a knot (K…) at the end of a stroke.
  The stroke starts there with a small loop: put the knot first in the path ("K1", then the start node).
- A knot that a stroke passes through is a loop the font has filled in:
  draw it as a small closed loop ("K1" in that stroke's path).

Letters
- क: the vertical bar top → bottom,
  then the loop from where it meets the bar, round to the left and across into the tail,
  then the headline.
- क्ष: the body in one stroke:
  from where it meets the bar go left,
  cross the neck straight into the upper loop (up its left side, over the top, down its right side),
  cross the neck straight again, sweep down and round the belly,
  make the small anticlockwise loop in the lower knot, and finish with the tail.
  Then the vertical bar, then the headline.
`;
