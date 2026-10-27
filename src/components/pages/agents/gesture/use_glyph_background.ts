import { useQuery } from '@tanstack/react-query';
import { browserCanvasEnv } from '~/agents/gesture_creator/browser_canvas';
import { rasterizeGlyph, type GlyphSource } from '~/agents/gesture_creator/glyph_raster';
import { renderGlyphBackground } from '~/agents/gesture_creator/render_images';

/** A glyph (a proposal's, a draft's), rendered like the editor, as a light background image. */
export function useGlyphBackground(glyph: GlyphSource | null) {
  const source: GlyphSource | null = glyph && {
    text: glyph.text,
    font_family: glyph.font_family,
    font_size: glyph.font_size,
    text_center_offset: glyph.text_center_offset
  };
  const q = useQuery({
    queryKey: ['agent_glyph_background', source],
    queryFn: async () =>
      renderGlyphBackground(browserCanvasEnv, await rasterizeGlyph(source!, browserCanvasEnv)),
    enabled: !!source,
    staleTime: Infinity
  });
  return q.data;
}
