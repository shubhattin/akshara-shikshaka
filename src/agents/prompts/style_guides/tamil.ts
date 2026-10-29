/**
 * Tamil (and Tamil-Extended). Vowel-sign order from the online-handwriting study of Aparna et
 * al. (IIT Madras / HP Labs, IWFHR 2004), whose automaton reads strokes in written order:
 * ெ / ே / ை, then the consonant, then ா or ள for ொ ோ ௌ; and C+i, C+ī, C+u, C+ū and C+puḷḷi
 * are one block with the consonant. HP Labs LipiTk Tamil traces (as tallied by the
 * coding-adventures script-ductus project) agree: ெ ே ை before the consonant, ா ி ீ ் after.
 * Fused forms (டி டீ லீ …): The Unicode Standard 17.0, §12.6.3.
 */
export const TAMIL_GUIDE = `
Order
- Tamil has no headline. Write left to right, as the parts stand on the line.
- Puḷḷi (்), the dot on top, comes right after its consonant.

Vowel signs
- A sign that stands apart from the consonant is written where it stands:
  on the left before the consonant, on the right after it.
- ெ ே ை stand apart on the left: write them first, then the consonant.
- ா stands apart on the right: after the consonant.
- ொ ோ ௌ are two parts around the consonant:
  the left part (ெ / ே), the consonant, then the right part (ா, or ௗ for ௌ).
  So கொ is ெ, க, ா.
- ி ீ join the top of the consonant on its right: write the consonant, then the sign.
- ு ூ fuse with the consonant into a shape of its own (கு ரு மு கூ ரூ …),
  and ி ீ do in டி டீ லீ: write these as one letter, not consonant plus sign.
  The consonant's part comes first and runs on into the vowel's part where the ink is unbroken.

Strokes
- Most letters are one continuous stroke; even க is one stroke in native writers' traces.
  Lift the pen only where the letter is truly in separate pieces.
`;
