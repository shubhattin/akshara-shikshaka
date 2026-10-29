/**
 * Malayalam. From the Jayasree stroke data (one native writer, 57 basic letters, CC BY 4.0):
 * 46 are one stroke, 55 start on the left, 45 turn clockwise overall.
 * Vowel signs: written in the order they stand, left to right — the separate left signs before
 * the consonant, the two-part signs split around it. No Malayalam primer orders a sign against
 * its consonant; this follows Tamil, whose signs have the same layout and are written that way
 * (Aparna et al., IWFHR 2004; LipiTk Tamil traces).
 */
export const MALAYALAM_GUIDE = `
Order
- Write left to right, as the parts stand on the line.
- A conjunct is written as its letters in reading order: the left or upper letter first.

Vowel signs
- A sign that stands apart from the consonant is written where it stands:
  on the left before the consonant, on the right after it.
- െ േ ൈ stand apart on the left: write them first, then the consonant.
- ൊ ോ ൌ are two parts around the consonant:
  the left part (െ / േ), the consonant, then the right part (ാ, or ൗ for ൌ).
- ാ ി ീ on the right come after the consonant.
  ാ: from the top down round the hook.
- ു ൂ ൃ: after the consonant.
  ു / ൂ: the small curl below the letter, turning anticlockwise.
  In many letters they fuse with the consonant into one shape (കു രു ക്കു …):
  write that as one letter, the consonant's part first, running on into the curl
  where the ink is unbroken.
- Chandrakkala (്), anusvāra (ം) and visarga (ഃ) come last.

Strokes
- Most letters are ONE long continuous stroke: about 4 in 5 basic letters in a native writer's data.
  Lift the pen only where the letter is truly in separate pieces.
- Start on the left — usually at the bottom-left or middle-left end, or in the small loop there —
  and work to the right, ending at the right.
- Loops and bowls mostly run clockwise (up the left, over the top, down the right).
  Go all the way round each loop without lifting.
`;
