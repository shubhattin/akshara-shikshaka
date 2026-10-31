import { useQuery } from '@tanstack/react-query';
import { browserCanvasEnv } from '~/agents/gesture_creator/browser_canvas';
import { context2d } from '~/agents/gesture_creator/canvas_env';
import { rasterizeGlyph, type GlyphSource } from '~/agents/gesture_creator/glyph_raster';

/** RGBA, 0–255 each. */
export type GlyphColor = readonly [number, number, number, number];

/**
 * A gesture's glyph drawn exactly where the editor puts it (same rasteriser as the Gesture
 * Creator), in one colour on a transparent 800×800 image. Cached per glyph and colour.
 */
export function useGlyphImage(source: GlyphSource | null, color: GlyphColor, enabled = true) {
  const q = useQuery({
    queryKey: ['font_tools_glyph', source, color],
    queryFn: async () => {
      const mask = await rasterizeGlyph(source!, browserCanvasEnv);
      const canvas = browserCanvasEnv.createCanvas(mask.width, mask.height);
      const ctx = context2d(canvas);
      const image = ctx.createImageData(mask.width, mask.height);
      for (let i = 0; i < mask.data.length; i++) {
        if (!mask.data[i]) continue;
        image.data.set(color, i * 4);
      }
      ctx.putImageData(image, 0, 0);
      return canvas.toDataURL('image/png');
    },
    enabled: enabled && !!source,
    staleTime: Infinity,
    gcTime: 10 * 60_000
  });
  return q.data;
}
