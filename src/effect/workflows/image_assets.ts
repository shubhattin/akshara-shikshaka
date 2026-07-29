import { Effect } from 'effect';
import { z } from 'zod';
import { and, asc, count, desc, eq, ilike } from 'drizzle-orm';
import { image_assets } from '~/db/schema';
import { get_lang_from_id, get_script_from_id } from '~/state/lang_list';
import { format_string_text } from '~/tools/kry';
import { PROJECT_S3_ALIAS } from '~/constants';
import { AiProvider } from '../ai';
import { ImageProcessor } from '../image';
import { ObjectStorage } from '../storage';
import { Database } from '../database';
import { BackgroundWork } from '../background';
import { CACHE } from '../cache';
import { appRuntime } from '../runtime';
import { BadRequestError } from '../errors';

const SYSTEM_PROMPT = `
You have to generate an image prompt, file name and description for the word provided. 
Keep the image prompt, file names and description in Indian context even if in English. Use Indian concepts and Visualizations for the Words provided for respective Indian Languages. 
Only include references to Hindu Dharma, lifestyle, cities, culture, traditions, kings, etc and Indian culture in the image prompt. 
There can be helping objects in the image alongside with the image describing the main word, But the focus should be only the main word's image 
The image should be in picture book style, image used for illustations in books. No text should be added to the image. 
So Generate an image prompt and a file name for the provided word which we can then feed into gpt-image-1 model to generate the image. 
As the model GPT-Image-1 can understand the details well, so also include the deatils provided here in the image prompt alongside the prompt generated. 
Generate the image prompt, file name and description for the word as per the details provided above. These are the word details
` as const;

const PROMPT = `
The word is "{word}" in the language {lang}, the word provided is written in script {word_script}. 
`;

const description_file_name_response_schema = z.object({
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

const description_file_name_image_prompt_response_schema =
  description_file_name_response_schema.extend({
    image_prompt: z.string().describe('Image prompt for the word in English')
  });

const IMAGE_DIMENSIONS = 256;

export const makeUploadImageAsset = Effect.fn('makeUploadImageAsset')(function* (input: {
  lang_id: number;
  word_script_id: number;
  word: string;
  existing_image_prompt?: string;
}) {
  const ai = yield* AiProvider;
  const images = yield* ImageProcessor;
  const storage = yield* ObjectStorage;
  const database = yield* Database;

  const start_time = Date.now();
  const lang = get_lang_from_id(input.lang_id);
  const word_script = get_script_from_id(input.word_script_id);

  const promptResult = input.existing_image_prompt
    ? yield* ai.generatePromptMetadata({
        system: 'Generate a file name and description for the image prompt provided',
        prompt: input.existing_image_prompt,
        schema: description_file_name_response_schema,
        existingImagePrompt: input.existing_image_prompt
      })
    : yield* ai.generatePromptMetadata({
        system: SYSTEM_PROMPT,
        prompt: format_string_text(PROMPT, {
          word: input.word,
          lang,
          word_script
        }),
        schema: description_file_name_image_prompt_response_schema
      });

  const image_prompt =
    ('image_prompt' in promptResult && promptResult.image_prompt) ||
    input.existing_image_prompt ||
    '';
  const { file_name, description } = promptResult;
  if (!image_prompt.trim()) {
    return yield* Effect.fail(
      BadRequestError.make({ message: 'Image prompt is empty; cannot generate image' })
    );
  }
  yield* Effect.logInfo('image prompt generated');

  const s3_image_key =
    `${PROJECT_S3_ALIAS}/image_assets/${file_name}_${crypto.randomUUID()}.webp` as const;

  const generated_image = yield* ai.generateImage({
    prompt: image_prompt,
    size: '1024x1024',
    aspectRatio: '1:1',
    quality: 'low'
  });
  yield* Effect.logInfo('image generated');

  const image_buffer = Buffer.from(generated_image.base64, 'base64');
  const resized_image_buffer = yield* images.resizeImage(
    image_buffer,
    IMAGE_DIMENSIONS,
    IMAGE_DIMENSIONS
  );
  yield* Effect.logInfo('image resized/compressed');

  const uploaded = yield* storage.uploadAssetFile(s3_image_key, resized_image_buffer).pipe(
    Effect.matchEffect({
      onFailure: () =>
        storage.deleteAssetFile(s3_image_key).pipe(
          Effect.catch(() => Effect.void),
          Effect.as({
            success: false as const,
            err_code: 'image_upload_failed' as const
          })
        ),
      onSuccess: () => Effect.succeed({ success: true as const })
    })
  );

  if (!uploaded.success) {
    return uploaded;
  }
  yield* Effect.logInfo('image uploaded');

  const result = yield* database
    .run('insert_image_asset', async (db) => {
      const [row] = await db
        .insert(image_assets)
        .values({
          description,
          width: IMAGE_DIMENSIONS,
          height: IMAGE_DIMENSIONS,
          s3_key: s3_image_key
        })
        .returning();
      return row;
    })
    .pipe(
      Effect.tapError(() =>
        storage.deleteAssetFile(s3_image_key).pipe(Effect.catch(() => Effect.void))
      )
    );

  return {
    success: true as const,
    time_ms: Date.now() - start_time,
    id: result.id,
    s3_key: s3_image_key,
    description,
    image_prompt
  };
});

export const deleteImageAsset = Effect.fn('deleteImageAsset')(function* (input: { id: number }) {
  const database = yield* Database;
  const storage = yield* ObjectStorage;
  const background = yield* BackgroundWork;

  const result = yield* database.run('find_image_asset', async (db) =>
    db.query.image_assets.findFirst({
      where: eq(image_assets.id, input.id),
      columns: {
        s3_key: true,
        id: true
      },
      with: {
        words: {
          columns: {
            id: true
          },
          with: {
            lesson: {
              columns: {
                id: true
              }
            }
          }
        }
      }
    })
  );

  if (!result) {
    return {
      deleted: false as const,
      err_code: 'image_asset_not_found' as const
    };
  }

  yield* database.run('delete_image_asset', async (db) => {
    await db.delete(image_assets).where(eq(image_assets.id, input.id));
  });

  yield* storage.deleteAssetFile(result.s3_key).pipe(
    Effect.tapError((error) =>
      Effect.logWarning('image S3 delete failed after DB delete', { error, key: result.s3_key })
    ),
    Effect.catch(() => Effect.void)
  );

  const lesson_ids = new Set<number>();
  result.words.forEach((word) => lesson_ids.add(word.lesson.id));

  if (lesson_ids.size > 0) {
    const refresh = Effect.forEach(
      Array.from(lesson_ids),
      (lesson_id) =>
        CACHE.lessons.text_lesson_info
          .refresh({ lesson_id })
          .pipe(
            Effect.catch((error) =>
              Effect.logWarning('lesson cache refresh failed', { lesson_id, error }).pipe(
                Effect.asVoid
              )
            )
          ),
      { concurrency: 4 }
    );
    yield* background.enqueue(() => appRuntime.runPromise(refresh));
  }

  return { deleted: true as const };
});

export const listImageAssets = Effect.fn('listImageAssets')(function* (input: {
  search_text?: string;
  sort_by?: 'created_at' | 'updated_at';
  order_by?: 'asc' | 'desc';
  page: number;
  limit: number;
}) {
  const database = yield* Database;
  const trimmed = input.search_text?.trim();
  const whereClause =
    trimmed && trimmed.length > 0 ? ilike(image_assets.description, `%${trimmed}%`) : undefined;
  const offset = (input.page - 1) * input.limit;

  const countEffect = database.run('count_image_assets', async (db) =>
    db
      .select({ count: count() })
      .from(image_assets)
      .where(whereClause ?? undefined)
  );
  const listEffect = database.run('list_image_assets', async (db) =>
    db
      .select({
        id: image_assets.id,
        description: image_assets.description,
        width: image_assets.width,
        height: image_assets.height,
        s3_key: image_assets.s3_key,
        created_at: image_assets.created_at,
        updated_at: image_assets.updated_at
      })
      .from(image_assets)
      .where(whereClause ?? undefined)
      .orderBy(() => {
        return [
          (input.order_by === 'asc' ? asc : desc)(
            (input.sort_by ?? 'created_at') === 'updated_at'
              ? image_assets.updated_at
              : image_assets.created_at
          )
        ];
      })
      .limit(input.limit)
      .offset(offset)
  );

  const [countResult, list] = yield* Effect.all([countEffect, listEffect], {
    concurrency: 2
  });

  const total = Number(countResult[0]?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / input.limit));
  return {
    list,
    total,
    page: input.page,
    pageCount,
    hasPrev: input.page > 1,
    hasNext: input.page < pageCount
  };
});

export const updateImageAsset = Effect.fn('updateImageAsset')(function* (input: {
  id: number;
  description: string;
}) {
  const database = yield* Database;
  yield* database.run('update_image_asset', async (db) => {
    await db
      .update(image_assets)
      .set({ description: input.description })
      .where(eq(image_assets.id, input.id));
  });
  return { updated: true as const };
});
