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

const promptFileMetaSchema = z.object({
  file_name: z
    .string()
    .describe(
      'A 3-4 word max file name for the image, preferrable 2-3 words. It should not contain any spaces. Do not add any file extension. These files are only for debugging purposes and not actual file names displayed to users. ' +
        'Words should be in lowercase, separated by underscores and no extra special characters. Eg: good_apple_image, cute_cat_image, etc. '
    ),
  description: z
    .string()
    .describe(
      'A short description of the image in English in a few words (max 4-5 words, preferrable 3 words). This will be used for searching, so keep it short and concise.'
    )
});

const promptMetadataSchema = promptFileMetaSchema.extend({
  image_prompt: z.string().describe('Image prompt for the word in English')
});

export type PromptMetadata = z.infer<typeof promptMetadataSchema>;

const EXISTING_PROMPT_SYSTEM =
  'Generate a file name and description for the image prompt provided' as const;

const IMAGE_PROMPT_SYSTEM = `
You have to generate an image prompt, file name and description for the word provided. 
Keep the image prompt, file names and description in Indian context even if in English. Use Indian concepts and Visualizations for the Words provided for respective Indian Languages. 
Only include references to Hindu Dharma, lifestyle, cities, culture, traditions, kings, etc and Indian culture in the image prompt. 
There can be helping objects in the image alongside with the image describing the main word, But the focus should be only the main word's image 
The image should be in picture book style, image used for illustations in books. No text should be added to the image. 
So Generate an image prompt and a file name for the provided word which we can then feed into gpt-image-1 model to generate the image. 
As the model GPT-Image-2 can understand the details well, so also include the deatils provided here in the image prompt alongside the prompt generated. 
Generate the image prompt, file name and description for the word as per the details provided above. These are the word details
` as const;

const imagePromptUserMessage = (input: { word: string; lang: string; wordScript: string }) =>
  `The word is "${input.word}" in the language ${input.lang}, the word provided is written in script ${input.wordScript}.`;

export type GeneratePromptMetadataInput =
  | { readonly existingImagePrompt: string }
  | {
      readonly word: string;
      readonly lang: string;
      readonly wordScript: string;
    };

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
    readonly generatePromptMetadata: (
      input: GeneratePromptMetadataInput
    ) => Effect.Effect<PromptMetadata, AiProviderError>;
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
        apiKey: config.openrouterApiKey ? Redacted.value(config.openrouterApiKey) : openaiKey
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
            if ('existingImagePrompt' in input) {
              const response = await generateText({
                model: openrouter('openai/gpt-4.1'),
                output: Output.object({ schema: promptFileMetaSchema }),
                system: EXISTING_PROMPT_SYSTEM,
                prompt: input.existingImagePrompt
              });
              if (!response.output) {
                throw new Error('Empty prompt metadata response');
              }
              return {
                file_name: response.output.file_name,
                description: response.output.description,
                image_prompt: input.existingImagePrompt
              };
            }

            const response = await generateText({
              model: openrouter('openai/gpt-4.1'),
              output: Output.object({ schema: promptMetadataSchema }),
              system: IMAGE_PROMPT_SYSTEM,
              prompt: imagePromptUserMessage(input)
            });
            if (!response.output) {
              throw new Error('Empty prompt metadata response');
            }
            return response.output;
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
              model: openai.textEmbeddingModel(
                input.model as Parameters<typeof openai.textEmbeddingModel>[0]
              ),
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
