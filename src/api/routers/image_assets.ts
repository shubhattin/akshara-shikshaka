import { z } from 'zod';
import { Effect } from 'effect';
import { t, protectedAdminProcedure } from '../trpc_init';
import { runTrpcEffect } from '~/effect/run';
import { dev_delay } from '~/tools/delay';
import { asc, count, desc, eq, ilike } from 'drizzle-orm';
import { image_assets } from '~/db/schema';
import { get_lang_from_id, get_script_from_id } from '~/state/lang_list';
import { PROJECT_S3_ALIAS } from '~/constants';
import { AiProvider } from '~/effect/ai';
import { ImageProcessor } from '~/effect/image';
import { ObjectStorage } from '~/effect/storage';
import { Database } from '~/effect/database';
import { BackgroundWork } from '~/effect/background';
import { CACHE } from '~/effect/cache';
import { appRuntime } from '~/effect/runtime';
import { BadRequestError, DatabaseError } from '~/effect/errors';

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

  const { file_name, description, image_prompt } = input.existing_image_prompt
    ? yield* ai.generatePromptMetadata({
        existingImagePrompt: input.existing_image_prompt
      })
    : yield* ai.generatePromptMetadata({
        word: input.word,
        lang,
        wordScript: word_script
      });

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

  if (!result) {
    yield* storage.deleteAssetFile(s3_image_key).pipe(Effect.catch(() => Effect.void));
    return yield* Effect.fail(
      DatabaseError.make({
        operation: 'insert_image_asset',
        cause: new Error('Insert returned no row')
      })
    );
  }

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
      { concurrency: 8 }
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

const list_image_assets_route = protectedAdminProcedure
  .input(
    z.object({
      search_text: z.string().optional(),
      sort_by: z.enum(['created_at', 'updated_at']).optional(),
      order_by: z.enum(['asc', 'desc']).optional().prefault('desc'),
      page: z.int().min(1),
      limit: z.int().min(1)
    })
  )
  .query(async ({ input }) => {
    await dev_delay(500);
    return runTrpcEffect(listImageAssets(input));
  });

const make_upload_image_asset_route = protectedAdminProcedure
  .input(
    z.object({
      lang_id: z.int(),
      word_script_id: z.int(),
      word: z.string(),
      existing_image_prompt: z.string().optional()
    })
  )
  .output(
    z.discriminatedUnion('success', [
      z.object({
        success: z.literal(true),
        time_ms: z.int(),
        id: z.int(),
        s3_key: z.string(),
        description: z.string(),
        image_prompt: z.string()
      }),
      z.object({
        success: z.literal(false),
        err_code: z.enum(['image_upload_failed'])
      })
    ])
  )
  .mutation(async ({ input }) => runTrpcEffect(makeUploadImageAsset(input)));

const delete_image_asset_route = protectedAdminProcedure
  .input(z.object({ id: z.int() }))
  .mutation(async ({ input }) => runTrpcEffect(deleteImageAsset(input)));

const update_image_asset_route = protectedAdminProcedure
  .input(z.object({ id: z.int(), description: z.string() }))
  .mutation(async ({ input }) => runTrpcEffect(updateImageAsset(input)));

export const image_assets_router = t.router({
  list_image_assets: list_image_assets_route,
  make_upload_image_asset: make_upload_image_asset_route,
  delete_image_asset: delete_image_asset_route,
  update_image_asset: update_image_asset_route
});
