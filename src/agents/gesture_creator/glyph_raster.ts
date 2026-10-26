import { FONT_LIST } from '~/state/font_list';
import { CANVAS_DIMS } from '~/tools/stroke_data/types';
import { GLYPH_FONT_SCALE, glyphTextPosition } from '~/tools/stroke_data/glyph_layout';
import type { GlyphMask } from './skeleton';

/** Raster pixels per canvas unit: an 800×800 raster for the 400×400 canvas. */
export const RASTER_SCALE = 2;

export type GlyphSource = {
  text: string;
  font_family: string;
  font_size: number;
  text_center_offset: readonly [number, number];
};

const fontLoads = new Map<string, Promise<void>>();

/** Load a gesture font as a FontFace under its family key, like the editor does. */
export function ensureGlyphFont(family: string): Promise<void> {
  let load = fontLoads.get(family);
  if (!load) {
    const entry = Object.values(FONT_LIST)
      .flat()
      .find((font) => font?.font_family === family);
    if (!entry) return Promise.reject(new Error(`Unknown font family ${family}`));
    load = new FontFace(family, `url(${entry.url})`).load().then((face) => {
      document.fonts.add(face);
    });
    load.catch(() => fontLoads.delete(family));
    fontLoads.set(family, load);
  }
  return load;
}

/**
 * Render the gesture's background glyph exactly as the editor places it (same Konva text,
 * same measurement and offset) into an ink mask at RASTER_SCALE.
 */
export async function rasterizeGlyph(source: GlyphSource): Promise<GlyphMask> {
  await ensureGlyphFont(source.font_family);
  const { default: Konva } = await import('konva');
  const container = document.createElement('div');
  const stage = new Konva.Stage({
    container,
    width: CANVAS_DIMS.width,
    height: CANVAS_DIMS.height
  });
  try {
    const layer = new Konva.Layer();
    stage.add(layer);
    const node = new Konva.Text({
      text: source.text,
      fontSize: source.font_size * GLYPH_FONT_SCALE,
      fontFamily: source.font_family,
      fill: 'black'
    });
    layer.add(node);
    const box = node.getClientRect({ skipShadow: true, skipStroke: true });
    const [x, y] = glyphTextPosition(box, source.text_center_offset);
    node.position({ x: Math.round(x), y: Math.round(y) });
    layer.draw();
    const canvas = layer.toCanvas({ pixelRatio: RASTER_SCALE });
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3]! >= 128 ? 1 : 0;
    return { data: mask, width, height, scale: RASTER_SCALE };
  } finally {
    stage.destroy();
  }
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
