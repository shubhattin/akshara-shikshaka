import { generateText, tool, type LanguageModel } from 'ai';
import { z } from 'zod';
import { openrouterCost } from '~/agents/server/cost';
import type { WebSearchInput, WebSearchOutput } from '~/agents/ui_message';

/** OpenRouter's web plugin, as sent with the search call. */
type WebPlugin = { id: 'web'; max_results: number; engine?: 'exa' };

export type WebSearchOptions = {
  /**
   * OpenRouter's search engine: unset = the provider's native search for OpenAI models (it may
   * search several times per call, ~$0.02–0.03), "exa" = one fixed-price lookup (~$0.007 at 3
   * results).
   */
  engine?: 'exa';
  maxResults?: number;
  /** Searches allowed per reply; later calls are refused without cost. */
  maxCalls?: number;
};

/**
 * Web search for every agent, whatever its model: the utility model searches through OpenRouter's
 * web plugin and returns a summary with sources, plus what the search call cost so the chat total
 * includes it. One tool per request, so `maxCalls` counts the searches of one reply.
 */
export function createWebSearchTool(searchModel: LanguageModel, options: WebSearchOptions = {}) {
  const { engine, maxResults = 6, maxCalls } = options;
  let calls = 0;
  return tool<WebSearchInput, WebSearchOutput>({
    description:
      'Search the web. Returns a factual summary of what was found, with source URLs. Ask a specific question.',
    inputSchema: z.object({
      query: z.string().describe('What to look up, as a specific question or search query')
    }),
    execute: async ({ query }, { abortSignal }) => {
      if (maxCalls !== undefined && calls >= maxCalls) {
        return {
          summary: `Not searched: only ${maxCalls} web search per reply. Work from what you already found and the style guide.`,
          sources: []
        };
      }
      calls++;
      const plugin: WebPlugin = {
        id: 'web',
        max_results: maxResults
      };
      if (engine) plugin.engine = engine;
      const result = await generateText({
        model: searchModel,
        system:
          'Search the web and report what you find: key facts, names and dates, concisely, in Markdown. Note disagreements between sources. Do not speculate beyond the sources.',
        prompt: query,
        providerOptions: {
          openrouter: {
            plugins: [plugin],
            reasoning: { effort: 'low' }
          }
        },
        abortSignal
      });
      const seen = new Set<string>();
      const sources: WebSearchOutput['sources'] = [];
      for (const source of result.sources) {
        if (source.sourceType !== 'url' || seen.has(source.url)) continue;
        seen.add(source.url);
        sources.push(source.title ? { url: source.url, title: source.title } : { url: source.url });
      }
      return { summary: result.text, sources, cost: openrouterCost(result.providerMetadata) };
    }
  });
}
