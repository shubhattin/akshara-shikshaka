import { Context, Effect, Layer, Redacted } from 'effect';
import OpenAI from 'openai';
import { createOpenAI, type OpenAIImageModelGenerationOptions } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { embed, generateImage, generateText, Output } from 'ai';
import { z } from 'zod';
import { AppConfig } from './config';
import { AiProviderError } from './errors';

const VOICE_TYPE_LIST = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer'
] as const;

export type VoiceType = (typeof VOICE_TYPE_LIST)[number];
export const VoiceTypeEnum = z.enum(VOICE_TYPE_LIST);

const tryAi = <A>(operation: string, provider: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => AiProviderError.make({ operation, provider, cause })
  }).pipe(Effect.annotateLogs({ category: 'ai', operation, provider }));

export class AiProvider extends Context.Service<
  AiProvider,
  {
    readonly generateSpeech: (input: {
      text: string;
      instructions: string;
      voice: VoiceType;
    }) => Effect.Effect<{ fileBuffer: Buffer; fileType: 'webm' }, AiProviderError>;
    readonly generatePromptMetadata: (input: {
      system: string;
      prompt: string;
      schema: z.ZodType;
      existingImagePrompt?: string;
    }) => Effect.Effect<
      { file_name: string; description: string; image_prompt?: string },
      AiProviderError
    >;
    readonly generateImage: (input: {
      prompt: string;
      size?: `${number}x${number}`;
      aspectRatio?: `${number}:${number}`;
      quality?: 'low' | 'medium' | 'high';
    }) => Effect.Effect<{ base64: string }, AiProviderError>;
    readonly embedText: (input: {
      value: string;
      model: string;
      dimensions: number;
    }) => Effect.Effect<number[], AiProviderError>;
  }
>()('AiProvider') {
  static readonly Live = Layer.effect(AiProvider)(
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const openaiKey = Redacted.value(config.openaiApiKey);
      const openaiSdk = new OpenAI({ apiKey: openaiKey });
      const openai = createOpenAI({ apiKey: openaiKey });
      const openrouter = createOpenRouter({
        apiKey: config.openrouterApiKey
          ? Redacted.value(config.openrouterApiKey)
          : openaiKey
      });

      return {
        generateSpeech: (input) =>
          tryAi('generateSpeech', 'openai', async () => {
            const audio = await openaiSdk.audio.speech.create({
              model: 'gpt-4o-mini-tts',
              voice: input.voice,
              input: input.text,
              instructions: input.instructions,
              response_format: 'opus'
            });
            const buffer = Buffer.from(await audio.arrayBuffer());
            return { fileBuffer: buffer, fileType: 'webm' as const };
          }),

        generatePromptMetadata: (input) =>
          tryAi('generatePromptMetadata', 'openrouter', async () => {
            if (input.existingImagePrompt) {
              const response = await generateText({
                model: openrouter('openai/gpt-4.1'),
                output: Output.object({ schema: input.schema }),
                system: 'Generate a file name and description for the image prompt provided',
                prompt: input.existingImagePrompt
              });
              const output = response.output;
              if (!output || typeof output !== 'object') {
                throw new Error('Empty prompt metadata response');
              }
              return {
                file_name: String(Reflect.get(output, 'file_name') ?? ''),
                description: String(Reflect.get(output, 'description') ?? ''),
                image_prompt: input.existingImagePrompt
              };
            }
            const response = await generateText({
              model: openrouter('openai/gpt-4.1'),
              output: Output.object({ schema: input.schema }),
              system: input.system,
              prompt: input.prompt
            });
            const output = response.output;
            if (!output || typeof output !== 'object') {
              throw new Error('Empty prompt metadata response');
            }
            const image_prompt = Reflect.get(output, 'image_prompt');
            return {
              file_name: String(Reflect.get(output, 'file_name') ?? ''),
              description: String(Reflect.get(output, 'description') ?? ''),
              image_prompt: typeof image_prompt === 'string' ? image_prompt : undefined
            };
          }),

        generateImage: (input) =>
          tryAi('generateImage', 'openai', async () => {
            const generated = await generateImage({
              model: openai.imageModel('gpt-image-2'),
              prompt: input.prompt,
              size: input.size ?? '1024x1024',
              aspectRatio: input.aspectRatio ?? '1:1',
              providerOptions: {
                openai: {
                  quality: input.quality ?? 'low'
                } satisfies OpenAIImageModelGenerationOptions
              }
            });
            return { base64: generated.image.base64 };
          }),

        embedText: (input) =>
          tryAi('embedText', 'openai', async () => {
            const { embedding } = await embed({
              model: openai.textEmbeddingModel(input.model as Parameters<typeof openai.textEmbeddingModel>[0]),
              value: input.value,
              providerOptions: {
                openai: {
                  dimensions: input.dimensions
                }
              }
            });
            return embedding;
          })
      };
    })
  );
}
