import { CANVAS_DIMS } from '~/tools/stroke_data/types';
import { GLYPH_FONT_SCALE, glyphTextPosition } from '~/tools/stroke_data/glyph_layout';
import { context2d, type CanvasEnv } from './canvas_env';
import { distanceTransform, type GlyphMask } from './skeleton';

/** Raster pixels per canvas unit: an 800×800 raster for the 400×400 canvas. */
export const RASTER_SCALE = 2;

export type GlyphSource = {
  text: string;
  font_family: string;
  font_size: number;
  text_center_offset: readonly [number, number];
};

/**
 * Draw the background glyph where the editor's Konva text puts it: box = text width × font size
 * (Konva's single-line client rect), positioned by `glyphTextPosition` and rounded, drawn on the
 * alphabetic baseline at Konva's offset of (ascent − descent) / 2 + lineHeight / 2 with the
 * font-box metrics of "M".
 */
function drawGlyphText(ctx: CanvasRenderingContext2D, source: GlyphSource) {
  const fontSize = source.font_size * GLYPH_FONT_SCALE;
  ctx.font = `normal normal ${fontSize}px ${source.font_family}`;
  const box = { width: ctx.measureText(source.text).width, height: fontSize };
  const [x, y] = glyphTextPosition(box, source.text_center_offset);
  const m = ctx.measureText('M');
  const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'black';
  ctx.fillText(source.text, Math.round(x), Math.round(y) + (ascent - descent) / 2 + fontSize / 2);
}

/** Render the gesture's background glyph, placed exactly like the editor, into an ink mask. */
export async function rasterizeGlyph(source: GlyphSource, env: CanvasEnv): Promise<GlyphMask> {
  await env.loadGlyphFont(source.font_family);
  const canvas = env.createCanvas(
    CANVAS_DIMS.width * RASTER_SCALE,
    CANVAS_DIMS.height * RASTER_SCALE
  );
  const ctx = context2d(canvas);
  ctx.scale(RASTER_SCALE, RASTER_SCALE);
  drawGlyphText(ctx, source);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3]! >= 128 ? 1 : 0;
  return { data: mask, width, height, scale: RASTER_SCALE };
}

/** Is a canvas point on (or within `slack` units of) the glyph ink? */
export function inkLookup(mask: GlyphMask, slack = 0) {
  const { data, width, height, scale } = mask;
  const r = Math.round(slack * scale);
  return ([x, y]: readonly [number, number]) => {
    const cx = Math.round(x * scale);
    const cy = Math.round(y * scale);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = cx + dx;
        const py = cy + dy;
        if (px >= 0 && py >= 0 && px < width && py < height && data[py * width + px]) return true;
      }
    }
    return false;
  };
}

/** Distance from a canvas point to the nearest non-ink pixel, in canvas units (0 off the ink). */
export function inkClearance(mask: GlyphMask) {
  const { data, width, height, scale } = mask;
  const dt = distanceTransform(data, width, height);
  return ([x, y]: readonly [number, number]) => {
    const px = Math.round(x * scale);
    const py = Math.round(y * scale);
    if (px < 0 || py < 0 || px >= width || py >= height) return 0;
    return dt[py * width + px]! / scale;
  };
}
