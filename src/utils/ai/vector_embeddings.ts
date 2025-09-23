import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * For simple image/audio description we use 512 dimensions and should be enough
 */
export const DEFAULT_DESCRIPTION_EMBEDDINGS_DIMENSIONS = 512 as const;

export async function getVectorEmbeddings(value: string, dimensions: number) {
  const { embedding } = await embed({
    model: openai.textEmbeddingModel('text-embedding-3-small'),
    value: value,
    providerOptions: {
      openai: {
        dimensions: dimensions
      }
    }
  });
  return embedding;
}
