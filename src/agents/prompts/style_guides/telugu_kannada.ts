/**
 * Telugu and Kannada: round letters built from loops and bowls, with a tick on top.
 * Vowel signs: the consonant or conjunct first, then the sign. Telugu sign shapes from HP Labs
 * LipiTk Telugu native-writer traces (as tallied by the coding-adventures script-ductus project):
 * ి one stroke from the lower left, anticlockwise (201/205); ు one stroke from the left (403/405);
 * ే two strokes, the ె part first (159/163); ొ / ో one stroke with a clockwise loop.
 */
export const TELUGU_KANNADA_GUIDE = `
Order
- Round letters start at their small inner loop:
  go round it and carry on into the big bowl in one stroke;
  lift the pen at the top of a lobe and start the next stroke there.
- ಅ / అ: stroke 1 the small loop clockwise into the bowl, up to the top of the right lobe;
  stroke 2 from that top down the hook into the bar.
- The tick on top (talakaṭṭu) comes after the body.

Vowel signs (guṇintam / kāgunita)
- The base comes first: the whole consonant or conjunct, with the letters below it
  (vattu / ottu), then its vowel sign.
- Many signs take the place of the talakaṭṭu (కి కె కొ, ಕಿ ಕೆ ಕೊ …):
  draw no tick then; the sign is drawn in its place, after the body.
- Then the parts on the right (ా ు ూ, ಾ ು ೂ, the ೕ of ಕೇ), then the parts below (ృ, the ౖ of ై).
- Anusvāra (ం / ಂ) and visarga (ః / ಃ) last, on the right.
- Telugu signs, as native writers make them:
  ి one stroke, starting at its lower left and turning anticlockwise;
  ు one stroke, starting at the left;
  ే two strokes: the ె part first, then the hook;
  ొ / ో one stroke with a clockwise loop.

Strokes
- Keep each loop and the bowl it runs into in one stroke; never lift inside a loop.
- Fonts end many strokes in a round ball.
  Those knots (K…) at a stroke's end are ball ends, not loops:
  start or end the stroke there and add no loop, unless the admin asks for one.
`;
