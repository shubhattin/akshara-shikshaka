import { useQuery } from '@tanstack/react-query';
import { browserCanvasEnv } from '~/agents/gesture_creator/browser_canvas';
import { rasterizeGlyph, type GlyphSource } from '~/agents/gesture_creator/glyph_raster';
import { renderGlyphBackground } from '~/agents/gesture_creator/render_images';
import type { ProposedGesture } from '~/agents/gesture_creator/schemas';

/** The proposal's glyph, rendered like the editor, as a light background image for previews. */
export function useGlyphBackground(proposal: ProposedGesture | null) {
  const source: GlyphSource | null = proposal && {
    text: proposal.text,
    font_family: proposal.font_family,
    font_size: proposal.font_size,
    text_center_offset: proposal.text_center_offset
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
