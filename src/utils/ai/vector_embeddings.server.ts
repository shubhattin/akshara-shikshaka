import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { EMBEDDINGS_DIMENSIONS } from '~/db/schema';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * For simple image/audio description we use 512 dimensions and should be enough
 */

type embed_models = Parameters<typeof openai.textEmbeddingModel>[0];
async function getOpenAIVectorEmbeddings(
  value: embed_models,
  dimensions: number,
  model: embed_models
) {
  const { embedding } = await embed({
    model: openai.textEmbeddingModel(model),
    value: value,
    providerOptions: {
      openai: {
        dimensions: dimensions
      }
    }
  });
  return embedding;
}

export const getDescriptionEmbeddings = async (value: string) => {
  const model: embed_models = 'text-embedding-3-small';
  return {
    embeddings: await getOpenAIVectorEmbeddings(value, EMBEDDINGS_DIMENSIONS, model),
    dimensions: EMBEDDINGS_DIMENSIONS,
    model: model
  };
};
