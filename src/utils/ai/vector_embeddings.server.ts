import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

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
