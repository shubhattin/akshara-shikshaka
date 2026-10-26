import { useQuery } from '@tanstack/react-query';
import { renderGlyphBackground } from '~/agents/gesture_creator/render_images';
import type { ProposedGesture } from '~/agents/gesture_creator/schemas';
import { useAgentChatContext } from '../chat/agent_chat_context';

/** The proposal's glyph, rendered like the editor, as a light background image for previews. */
export function useGlyphBackground(proposal: ProposedGesture | null) {
  const { harness } = useAgentChatContext();
  const q = useQuery({
    // The harness is one stable object per chat page; the glyph is identified by these values.
    // oxlint-disable-next-line query/exhaustive-deps
    queryKey: [
      'agent_glyph_background',
      proposal?.gesture_id,
      proposal?.font_family,
      proposal?.font_size,
      proposal?.text_center_offset.join(',')
    ],
    queryFn: async () => renderGlyphBackground(await harness!.glyphMask(proposal!.gesture_id)),
    enabled: !!harness && !!proposal,
    staleTime: Infinity
  });
  return q.data;
}
