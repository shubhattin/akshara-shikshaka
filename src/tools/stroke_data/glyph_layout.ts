import { CANVAS_DIMS } from './types';

/** Konva font size of the background glyph is the stored `font_size` times this. */
export const GLYPH_FONT_SCALE = 15;

/**
 * Top-left of the background glyph on the gesture canvas: centred on its measured text box,
 * nudged down 6% of its height, then moved by the stored `text_center_offset`. Shared by the
 * editor and the Gesture Creator so a traced glyph sits exactly where it is recorded.
 */
export function glyphTextPosition(
  box: { width: number; height: number },
  offset: readonly [number, number] = [0, 0]
): [number, number] {
  return [
    CANVAS_DIMS.width / 2 - box.width / 2 + offset[0],
    CANVAS_DIMS.height / 2 - box.height / 2 + box.height * 0.06 + offset[1]
  ];
}
