/** Devanagari (Hindi, Sanskrit, Marathi, Nepali). */
export const DEVANAGARI_GUIDE = `Order
- Write the akṣara part by part from left to right. Within a part: the body first, then its vertical bar (top → bottom), then the shirorekha (headline) left → right. By default the headline comes last, once for the whole akṣara; if the admin wants it first, do that for the rest of the chat.
- A conjunct is written as its letters in reading order: the half letter on the left first, then the next.
- Dots and marks above or below (anusvāra, candrabindu, nukta, visarga) come after the letter they belong to.

Strokes
- The body of a letter is usually ONE continuous stroke, with every loop and curl in it. Lift only where a hand lifts: before the vertical bar and before the headline. A short connector between the body and the bar is part of the body stroke, not a stroke of its own.
- Many letters start with a small curl that the font fills in solid (म भ न स श ब व र ग ख …). It shows up as a knot (K…) at the end of a stroke. The stroke starts there with a small loop: put the knot first in the path ("K1", then the start node).
- A knot that a stroke passes through is a loop the font has filled in: draw it as a small closed loop ("K1" in that stroke's path).

Letters
- क: the vertical bar top → bottom, then the loop from where it meets the bar, round to the left and across into the tail, then the headline.
- क्ष: the body in one stroke: from where it meets the bar go left, cross the neck straight into the upper loop (up its left side, over the top, down its right side), cross the neck straight again, sweep down and round the belly, make the small anticlockwise loop in the lower knot, and finish with the tail. Then the vertical bar, then the headline.`;
